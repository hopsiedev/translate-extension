// ─── State ────────────────────────────────────────────────────────────────────
let settings = {
  enabled: false,
  engine: 'free',
  translationEngine: 'mymemory',
  ttsEngine: 'webspeech',
  targetLanguage: 'es',
  openaiKey: '',
  elevenlabsKey: '',
  elevenlabsVoiceId: '21m00Tcm4TlvDq8ikWAM',
  openaiVoice: 'alloy',
  webSpeechVoice: '',
  duckVolumePercent: 20,
  ttsVolume: 100,
  ttsRate: 1.0,
  ttsPitch: 1.0,
  smartPause: true
};

let activeAudio      = null;
let activeUtterance  = null;
let isDucked         = false;
let lastUserVolume   = 1.0;
let lastSpokenText   = '';          // Debounce — avoid re-speaking same line
let captionDebounce  = null;        // Debounce timer for caption observer
let isSpeaking       = false;       // Guard against overlapping speech
let captionObserver  = null;
let playerObserver   = null;

// ─── Bootstrap ────────────────────────────────────────────────────────────────
chrome.storage.local.get(null, stored => {
  settings = { ...settings, ...(stored || {}) };
  init();
});

chrome.storage.onChanged.addListener(changes => {
  for (const key in changes) settings[key] = changes[key].newValue;
  updateBtnUI();
  if (!settings.enabled) {
    stopSpeech();
    stopCaptionObserver();
  } else {
    startCaptionObserver();
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────────
function init() {
  injectStyles();
  setupVoiceGathering();
  watchForPlayer();        // Injects button + starts observer when player is ready
}

// ─── CSS injection ────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('yt-translate-styles')) return;
  const s = document.createElement('style');
  s.id = 'yt-translate-styles';
  s.textContent = `
    #yt-translate-floating-btn {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      transition: all 0.25s cubic-bezier(0.25,0.1,0.25,1);
    }
    #yt-translate-floating-btn:hover {
      transform: scale(1.05);
      background-color: rgba(15,11,33,0.92) !important;
      border-color: rgba(168,85,247,0.7) !important;
      box-shadow: 0 4px 28px rgba(168,85,247,0.35) !important;
    }
    #yt-translate-floating-btn.active {
      background-color: rgba(168,85,247,0.18) !important;
      border-color: #a855f7 !important;
      box-shadow: 0 0 18px rgba(168,85,247,0.45) !important;
    }
    #yt-translate-floating-btn.active .yt-tr-icon {
      color: #d8b4fe;
      animation: yt-tr-pulse 2s infinite alternate;
    }
    @keyframes yt-tr-pulse {
      0%   { transform:scale(1);    filter:drop-shadow(0 0 1px rgba(168,85,247,.4)); }
      100% { transform:scale(1.12); filter:drop-shadow(0 0 6px rgba(168,85,247,.8)); }
    }
    /* Auto-hide with player controls */
    .html5-video-player.ytp-autohide #yt-translate-floating-btn {
      opacity: 0 !important;
      pointer-events: none !important;
    }
  `;
  document.head.appendChild(s);
}

// ─── Voice gathering (shares voices list with popup) ─────────────────────────
function setupVoiceGathering() {
  if (typeof speechSynthesis === 'undefined') return;
  const gather = () => {
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0)
      chrome.storage.local.set({ availableVoices: voices.map(v => ({ name: v.name, lang: v.lang })) });
  };
  speechSynthesis.onvoiceschanged = gather;
  gather();
  setTimeout(gather, 1200);
}

// ─── Player & button injection ────────────────────────────────────────────────
function watchForPlayer() {
  // Use MutationObserver to wait for .html5-video-player to appear in DOM
  playerObserver = new MutationObserver(() => {
    const player = document.querySelector('.html5-video-player');
    if (player && !document.getElementById('yt-translate-floating-btn')) {
      injectButton(player);
      if (settings.enabled) startCaptionObserver();
    }
  });
  playerObserver.observe(document.body, { childList: true, subtree: true });

  // Immediate attempt
  const player = document.querySelector('.html5-video-player');
  if (player) injectButton(player);
}

function injectButton(player) {
  if (document.getElementById('yt-translate-floating-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'yt-translate-floating-btn';
  Object.assign(btn.style, {
    position:        'absolute',
    top:             '20px',
    right:           '20px',
    zIndex:          '2147483647',
    display:         'flex',
    alignItems:      'center',
    gap:             '7px',
    padding:         '7px 15px',
    borderRadius:    '50px',
    border:          '1px solid rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(12,8,28,0.82)',
    backdropFilter:  'blur(12px)',
    webkitBackdropFilter: 'blur(12px)',
    color:           '#fff',
    fontSize:        '12px',
    fontWeight:      '600',
    cursor:          'pointer',
    boxShadow:       '0 6px 22px rgba(0,0,0,0.55)',
    userSelect:      'none',
  });

  btn.innerHTML = `
    <svg class="yt-tr-icon" viewBox="0 0 24 24" width="15" height="15"
         fill="none" stroke="currentColor" stroke-width="2.5"
         stroke-linecap="round" stroke-linejoin="round" style="transition:transform .3s">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" fill="currentColor"/>
      <path d="M19 10v1a7 7 0 0 1-14 0v-1"/>
      <line x1="12" x2="12" y1="19" y2="22"/>
    </svg>
    <span class="yt-tr-label">Translate to Spanish</span>
  `;

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const next = !settings.enabled;
    chrome.storage.local.set({ enabled: next }, () => {
      if (next) {
        // Enable captions in YouTube automatically so subtitles appear
        enableYouTubeCaptions();
        startCaptionObserver();
        const video = getVideo();
        if (video && video.paused) video.play();
      } else {
        stopSpeech();
        stopCaptionObserver();
      }
    });
  });

  player.appendChild(btn);
  updateBtnUI();
}

// ─── Auto-enable YouTube's own CC subtitles ───────────────────────────────────
function enableYouTubeCaptions() {
  // Click the CC button if subtitles are off
  const ccBtn = document.querySelector('.ytp-subtitles-button');
  if (ccBtn) {
    const isOn = ccBtn.getAttribute('aria-pressed') === 'true';
    if (!isOn) ccBtn.click();
  }
}

// ─── Caption DOM Observer (THE CORE ENGINE) ───────────────────────────────────
//  YouTube renders subtitles inside:
//    .ytp-caption-window-container > .caption-window > .ytp-caption-segment
//  We watch for text changes and translate + speak each unique line.

function startCaptionObserver() {
  if (captionObserver) return;                // Already running

  // The caption container may not exist yet — poll for it
  const container = document.querySelector('.html5-video-player')
                 || document.querySelector('#movie_player');

  if (!container) {
    setTimeout(startCaptionObserver, 800);
    return;
  }

  updateBtnLabel('Active (ES)', '#10B981');

  captionObserver = new MutationObserver(() => {
    if (!settings.enabled) return;

    // Collect the full visible caption text
    const segments = document.querySelectorAll('.ytp-caption-segment');
    if (!segments.length) return;
    const text = Array.from(segments).map(s => s.textContent).join(' ').trim();
    if (!text) return;

    // ── DEBOUNCE: wait 400 ms of silence before acting ──────────────────────
    // YouTube builds captions word-by-word; without this, TTS is interrupted
    // on every new word and you hear nothing but clicks.
    clearTimeout(captionDebounce);
    captionDebounce = setTimeout(() => {
      if (text === lastSpokenText) return;  // Exact same text, skip
      lastSpokenText = text;
      handleNewCaption(text);
    }, 400);
  });

  captionObserver.observe(container, { childList: true, subtree: true, characterData: true });
}

function stopCaptionObserver() {
  if (captionObserver) {
    captionObserver.disconnect();
    captionObserver = null;
  }
  lastSpokenText = '';
  updateBtnUI();
}

// ─── Handle each new caption line ─────────────────────────────────────────────
async function handleNewCaption(originalText) {
  isSpeaking = true;
  try {
    // 1. Translate
    const res = await sendMsg({
      action: 'translate',
      data: {
        text: originalText,
        engine: settings.translationEngine,
        apiKey: settings.openaiKey,
        targetLanguage: settings.targetLanguage
      }
    });
    if (!res.success) throw new Error(res.error);
    const translated = res.text;

    // 2. Speak
    if (settings.ttsEngine === 'webspeech') {
      speakWebSpeech(translated);
    } else {
      const ttsRes = await sendMsg({
        action: 'tts',
        data: { text: translated, engine: settings.ttsEngine, voiceSettings: settings }
      });
      if (!ttsRes.success) throw new Error(ttsRes.error);
      speakAudio(base64ToBlob(ttsRes.audio, 'audio/mpeg'));
    }
  } catch (err) {
    isSpeaking = false;
    console.warn('[YT-Translate] Caption error:', err.message);
    updateBtnLabel('Error: ' + err.message.substring(0, 22), '#EF4444');
  }
}

// ─── Web Speech playback ──────────────────────────────────────────────────────
function speakWebSpeech(text) {
  // Cancel any previous utterance
  if (speechSynthesis.speaking || speechSynthesis.pending) {
    speechSynthesis.cancel();
  }

  // Chrome bug: cancel() then immediately speak() in the same tick is silently dropped.
  // requestAnimationFrame gives the engine one frame to reset.
  requestAnimationFrame(() => {
    // Duck video volume — video keeps playing
    duckVideo();

    const utt = new SpeechSynthesisUtterance(text);
    utt.lang   = settings.targetLanguage === 'es' ? 'es-ES' : settings.targetLanguage;
    utt.rate   = Math.max(0.5, Math.min(2, settings.ttsRate  || 1.0));
    utt.pitch  = Math.max(0,   Math.min(2, settings.ttsPitch || 1.0));
    utt.volume = 1;

    // Pick voice
    if (settings.webSpeechVoice) {
      const voices = speechSynthesis.getVoices();
      const match  = voices.find(v => v.name === settings.webSpeechVoice)
                  || voices.find(v => v.lang.startsWith(settings.targetLanguage || 'es'));
      if (match) utt.voice = match;
    }

    const onDone = () => {
      isSpeaking = false;
      activeUtterance = null;
      unduckVideo();   // Restore video volume
    };
    utt.onend   = onDone;
    utt.onerror = (e) => {
      console.warn('[YT-Translate] Speech error:', e.error);
      onDone();
    };

    activeUtterance = utt;
    speechSynthesis.speak(utt);
  });
}

// ─── Premium audio playback ───────────────────────────────────────────────────
function speakAudio(blob) {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.src = '';
    activeAudio = null;
  }

  const url   = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.volume = Math.max(0.1, Math.min(1, (settings.ttsVolume || 100) / 100));

  // Duck video — keep it playing
  duckVideo();

  const cleanup = () => {
    isSpeaking = false;
    URL.revokeObjectURL(url);
    unduckVideo();
    activeAudio = null;
  };
  audio.onended = audio.onerror = cleanup;
  audio.play().catch(cleanup);
  activeAudio = audio;
}

// ─── Stop all speech ──────────────────────────────────────────────────────────
function stopSpeech() {
  clearTimeout(captionDebounce);
  if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
  activeUtterance = null;
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.src = '';
    activeAudio = null;
  }
  unduckVideo();
  isSpeaking = false;
}

// ─── Volume ducking ──────────────────────────────────────────────────────────
function duckVideo() {
  const v = getVideo();
  if (!v || isDucked) return;
  lastUserVolume = v.volume;
  // Duck to 15% — audible enough to feel presence, quiet enough to hear TTS
  v.volume = Math.max(0, lastUserVolume * 0.15);
  isDucked = true;
}

function unduckVideo() {
  if (!isDucked) return;
  const v = getVideo();
  if (v) v.volume = lastUserVolume;
  isDucked = false;
}

function getVideo() {
  return document.querySelector('video.video-stream') || document.querySelector('video');
}

// ─── Text similarity helper (Jaccard on words) ────────────────────────────────
function similarity(a, b) {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  const inter = [...setA].filter(w => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 1 : inter / union;
}

// ─── Button UI helpers ────────────────────────────────────────────────────────
function updateBtnUI() {
  const btn   = document.getElementById('yt-translate-floating-btn');
  const label = btn?.querySelector('.yt-tr-label');
  if (!btn) return;

  if (settings.enabled) {
    btn.classList.add('active');
    if (label && (label.textContent === 'Translate to Spanish' || label.textContent === ''))
      label.textContent = 'Active (ES)';
  } else {
    btn.classList.remove('active');
    btn.style.borderColor = 'rgba(255,255,255,0.18)';
    if (label) label.textContent = 'Translate to Spanish';
  }
}

function updateBtnLabel(text, color) {
  const btn   = document.getElementById('yt-translate-floating-btn');
  const label = btn?.querySelector('.yt-tr-label');
  if (!label) return;
  label.textContent = text;
  if (btn && color) btn.style.borderColor = color;
}

// ─── Messaging ────────────────────────────────────────────────────────────────
function sendMsg(msg) {
  return new Promise(resolve =>
    chrome.runtime.sendMessage(msg, res =>
      resolve(res || { success: false, error: 'No response from background' })
    )
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function base64ToBlob(b64, mime) {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}
