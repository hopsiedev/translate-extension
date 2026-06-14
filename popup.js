// Elements cache
const el = {
  toggle: document.getElementById('extension-toggle'),
  tabFree: document.getElementById('tab-free'),
  tabPremium: document.getElementById('tab-premium'),
  panelFree: document.getElementById('panel-free'),
  panelPremium: document.getElementById('panel-premium'),
  sourceLang: document.getElementById('source-lang'),
  targetLang: document.getElementById('target-lang'),
  webSpeechVoice: document.getElementById('webspeech-voice'),
  webSpeechRate: document.getElementById('webspeech-rate'),
  webSpeechPitch: document.getElementById('webspeech-pitch'),
  ttsEngineSelect: document.getElementById('tts-engine-select'),
  openaiVoice: document.getElementById('openai-voice'),
  elevenlabsVoiceId: document.getElementById('elevenlabs-voice-id'),
  translationEngineSelect: document.getElementById('translation-engine-select'),
  premiumVolume: document.getElementById('premium-volume'),
  duckVolume: document.getElementById('duck-volume'),
  smartPause: document.getElementById('smart-pause'),
  openaiKey: document.getElementById('openai-key'),
  elevenlabsKey: document.getElementById('elevenlabs-key'),
  
  // Dynamic value text
  valRate: document.getElementById('val-rate'),
  valPitch: document.getElementById('val-pitch'),
  valPremiumVolume: document.getElementById('val-premium-volume'),
  valDuckVolume: document.getElementById('val-duck-volume'),
  
  // Collapsible keys
  apiKeysTrigger: document.getElementById('api-keys-trigger'),
  apiKeysContent: document.getElementById('api-keys-content'),
  
  // Voice panels
  openaiTtsOptions: document.getElementById('openai-tts-options'),
  elevenlabsOptions: document.getElementById('elevenlabs-options')
};

// Initial Config State
let currentEngine = 'free';

// Load stored settings on open
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  setupVoiceLoading();
  bindEvents();
});

// Load settings from storage
function loadSettings() {
  chrome.storage.local.get(null, (settings) => {
    if (Object.keys(settings).length === 0) return; // Use defaults defined in markup

    if (settings.enabled !== undefined) el.toggle.checked = settings.enabled;
    if (settings.engine !== undefined) {
      currentEngine = settings.engine;
      switchEngineTab(currentEngine);
    }
    if (settings.sourceLanguage !== undefined) el.sourceLang.value = settings.sourceLanguage;
    if (settings.targetLanguage !== undefined) el.targetLang.value = settings.targetLanguage;
    
    if (settings.ttsRate !== undefined) {
      el.webSpeechRate.value = settings.ttsRate;
      el.valRate.textContent = `${settings.ttsRate}x`;
    }
    if (settings.ttsPitch !== undefined) {
      el.webSpeechPitch.value = settings.ttsPitch;
      el.valPitch.textContent = settings.ttsPitch;
    }
    
    if (settings.ttsEngine !== undefined) {
      el.ttsEngineSelect.value = settings.ttsEngine;
      togglePremiumSuboptions(settings.ttsEngine);
    }
    if (settings.openaiVoice !== undefined) el.openaiVoice.value = settings.openaiVoice;
    if (settings.elevenlabsVoiceId !== undefined) el.elevenlabsVoiceId.value = settings.elevenlabsVoiceId;
    if (settings.translationEngine !== undefined) el.translationEngineSelect.value = settings.translationEngine;
    
    if (settings.ttsVolume !== undefined) {
      el.premiumVolume.value = settings.ttsVolume;
      el.valPremiumVolume.textContent = `${settings.ttsVolume}%`;
    }
    if (settings.duckVolumePercent !== undefined) {
      el.duckVolume.value = settings.duckVolumePercent;
      el.valDuckVolume.textContent = `${settings.duckVolumePercent}%`;
    }
    if (settings.smartPause !== undefined) el.smartPause.checked = settings.smartPause;
    
    if (settings.openaiKey !== undefined) el.openaiKey.value = settings.openaiKey;
    if (settings.elevenlabsKey !== undefined) el.elevenlabsKey.value = settings.elevenlabsKey;
    
    // Save current WebSpeech voice name to restore later
    if (settings.webSpeechVoice !== undefined) {
      el.webSpeechVoice.dataset.savedVoice = settings.webSpeechVoice;
    }
  });
}

// Save helper
function save(key, value) {
  chrome.storage.local.set({ [key]: value });
}

// Populate WebSpeech voices list
function setupVoiceLoading() {
  const populateDropdown = (voices) => {
    if (!voices || voices.length === 0) return;

    el.webSpeechVoice.innerHTML = '';
    
    // Sort: target language voices first
    const targetLang = el.targetLang.value || 'es';
    const sorted = [...voices].sort((a, b) => {
      const aMatch = a.lang.startsWith(targetLang);
      const bMatch = b.lang.startsWith(targetLang);
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      return a.name.localeCompare(b.name);
    });

    sorted.forEach(voice => {
      const option = document.createElement('option');
      option.value = voice.name;
      option.textContent = `${voice.name} (${voice.lang})`;
      
      // Auto-select match or restore saved
      const savedVoice = el.webSpeechVoice.dataset.savedVoice;
      if (savedVoice && voice.name === savedVoice) {
        option.selected = true;
      } else if (!savedVoice && voice.lang.startsWith('es') && voice.name.includes('Google')) {
        // Intelligent default selection for Spanish
        option.selected = true;
      }
      
      el.webSpeechVoice.appendChild(option);
    });

    save('webSpeechVoice', el.webSpeechVoice.value);
  };

  // Try to load from storage first (which was collected in the active YouTube tab context!)
  chrome.storage.local.get('availableVoices', (res) => {
    if (res.availableVoices && res.availableVoices.length > 0) {
      populateDropdown(res.availableVoices);
    } else {
      // Fallback: load popup-local voices if available
      const localVoices = window.speechSynthesis.getVoices();
      if (localVoices.length > 0) {
        populateDropdown(localVoices.map(v => ({ name: v.name, lang: v.lang })));
      }
    }
  });

  // Listen to storage changes in case content script updates the list in real-time
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.availableVoices) {
      populateDropdown(changes.availableVoices.newValue);
    }
  });

  // Also listen for popup-local changes
  window.speechSynthesis.onvoiceschanged = () => {
    const localVoices = window.speechSynthesis.getVoices();
    if (localVoices.length > 0) {
      populateDropdown(localVoices.map(v => ({ name: v.name, lang: v.lang })));
    }
  };
}

// Bind UI events
function bindEvents() {
  // Main toggle
  el.toggle.addEventListener('change', (e) => {
    save('enabled', e.target.checked);
  });

  // Engine tabs switching
  el.tabFree.addEventListener('click', () => switchEngineTab('free'));
  el.tabPremium.addEventListener('click', () => switchEngineTab('premium'));

  // Language changes
  el.sourceLang.addEventListener('change', (e) => save('sourceLanguage', e.target.value));
  el.targetLang.addEventListener('change', (e) => {
    save('targetLanguage', e.target.value);
    setupVoiceLoading(); // Refresh voice order
  });

  // Free Engine inputs
  el.webSpeechVoice.addEventListener('change', (e) => save('webSpeechVoice', e.target.value));
  
  el.webSpeechRate.addEventListener('input', (e) => {
    el.valRate.textContent = `${e.target.value}x`;
    save('ttsRate', parseFloat(e.target.value));
  });
  
  el.webSpeechPitch.addEventListener('input', (e) => {
    el.valPitch.textContent = e.target.value;
    save('ttsPitch', parseFloat(e.target.value));
  });

  // Premium Engine inputs
  el.ttsEngineSelect.addEventListener('change', (e) => {
    save('ttsEngine', e.target.value);
    togglePremiumSuboptions(e.target.value);
  });
  
  el.openaiVoice.addEventListener('change', (e) => save('openaiVoice', e.target.value));
  el.elevenlabsVoiceId.addEventListener('change', (e) => save('elevenlabsVoiceId', e.target.value));
  el.translationEngineSelect.addEventListener('change', (e) => save('translationEngine', e.target.value));
  
  el.premiumVolume.addEventListener('input', (e) => {
    el.valPremiumVolume.textContent = `${e.target.value}%`;
    save('ttsVolume', parseInt(e.target.value));
  });

  // Tuning inputs
  el.duckVolume.addEventListener('input', (e) => {
    el.valDuckVolume.textContent = `${e.target.value}%`;
    save('duckVolumePercent', parseInt(e.target.value));
  });
  
  el.smartPause.addEventListener('change', (e) => {
    save('smartPause', e.target.checked);
  });

  // API Keys inputs
  el.openaiKey.addEventListener('change', (e) => save('openaiKey', e.target.value.trim()));
  el.elevenlabsKey.addEventListener('change', (e) => save('elevenlabsKey', e.target.value.trim()));

  // Collapsible trigger
  el.apiKeysTrigger.addEventListener('click', () => {
    const isHidden = el.apiKeysContent.classList.toggle('hidden');
    const chevron = el.apiKeysTrigger.querySelector('.chevron-icon');
    if (chevron) {
      chevron.classList.toggle('rotate', !isHidden);
    }
  });

  // Password hide/show toggle
  document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const input = btn.previousElementSibling;
      if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '🙈';
      } else {
        input.type = 'password';
        btn.textContent = '👁️';
      }
    });
  });
}

// Switch between Free and Premium view panel tabs
function switchEngineTab(engine) {
  currentEngine = engine;
  save('engine', engine);

  if (engine === 'free') {
    el.tabFree.classList.add('active');
    el.tabPremium.classList.remove('active');
    el.panelFree.classList.remove('hidden');
    el.panelPremium.classList.add('hidden');
    
    // Save general fallback TTS mode
    save('ttsEngine', 'webspeech');
  } else {
    el.tabFree.classList.remove('active');
    el.tabPremium.classList.add('active');
    el.panelFree.classList.add('hidden');
    el.panelPremium.classList.remove('hidden');
    
    // Save selected Premium TTS mode
    save('ttsEngine', el.ttsEngineSelect.value);
  }
}

// Switch between OpenAI and Elevenlabs sub-options
function togglePremiumSuboptions(ttsEngine) {
  if (ttsEngine === 'openai') {
    el.openaiTtsOptions.classList.remove('hidden');
    el.elevenlabsOptions.classList.add('hidden');
  } else {
    el.openaiTtsOptions.classList.add('hidden');
    el.elevenlabsOptions.classList.remove('hidden');
  }
}
