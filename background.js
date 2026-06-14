// Helper: Convert ArrayBuffer to Base64 string
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Message router — handles requests from content.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'fetchSubtitles') {
    let url = message.data.url;
    if (url.startsWith('/')) url = 'https://www.youtube.com' + url;
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
        return res.json();
      })
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'translate') {
    handleTranslation(message.data)
      .then(text => sendResponse({ success: true, text }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'tts') {
    handleTTS(message.data)
      .then(audio => sendResponse({ success: true, audio }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// ── Translation ───────────────────────────────────────────────────────────────
async function handleTranslation({ text, engine, apiKey, targetLanguage }) {
  const targetLang = targetLanguage || 'es';

  // Premium: OpenAI GPT-4o-mini
  if (engine === 'openai') {
    if (!apiKey) throw new Error('OpenAI API key is required for translation.');
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an expert dubbing translator. Translate the subtitle segment into '${targetLang}' naturally and conversationally. Reply ONLY with the translation, no explanations.`
          },
          { role: 'user', content: text }
        ],
        temperature: 0.3
      })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `OpenAI HTTP ${response.status}`);
    }
    const result = await response.json();
    return result.choices[0].message.content.trim();
  }

  // Free tier 1: Google Translate (unofficial endpoint, no key required)
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // Response: [[[translatedChunk, original, ...], ...], ...]
    const translated = data[0].filter(i => i?.[0]).map(i => i[0]).join('');
    if (translated) return translated;
    throw new Error('Empty response');
  } catch (googleErr) {
    console.warn('[YT-Translate] Google Translate failed, trying MyMemory:', googleErr.message);
  }

  // Free tier 2: MyMemory fallback
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${targetLang}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.responseData?.translatedText) return data.responseData.translatedText;
    throw new Error('No translation received');
  } catch (mmErr) {
    throw new Error(`Translation failed: ${mmErr.message}`);
  }
}

// ── Text-to-Speech ────────────────────────────────────────────────────────────
async function handleTTS({ text, engine, apiKey, voiceSettings }) {
  if (engine === 'openai') {
    const key = apiKey || voiceSettings.openaiKey;
    if (!key) throw new Error('OpenAI API key is required for TTS.');
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: voiceSettings.openaiVoice || 'alloy'
      })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `OpenAI TTS HTTP ${response.status}`);
    }
    return arrayBufferToBase64(await response.arrayBuffer());
  }

  if (engine === 'elevenlabs') {
    const key = apiKey || voiceSettings.elevenlabsKey;
    const voiceId = voiceSettings.elevenlabsVoiceId || '21m00Tcm4TlvDq8ikWAM'; // Rachel (default)
    if (!key) throw new Error('ElevenLabs API key is required.');
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': key },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail?.status || `ElevenLabs HTTP ${response.status}`);
    }
    return arrayBufferToBase64(await response.arrayBuffer());
  }

  throw new Error(`Unsupported TTS engine: ${engine}`);
}
