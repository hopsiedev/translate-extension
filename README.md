# 🎙️ YouTube Voice Translator

> Real-time YouTube video translation with natural-sounding voices — built as a Chrome Extension.

**Author:** HOPSiEdev  
**Version:** 1.0.0  
**License:** MIT

---

## ✨ Features

- 🎯 **Real-time translation** — detects YouTube subtitles as they appear on screen and translates them instantly
- 🔊 **Natural voices** — uses Chrome's Web Speech API (free) or premium APIs (OpenAI TTS / ElevenLabs) for human-sounding speech
- 🔇 **Smart audio ducking** — lowers the original video volume to 15% while the translated voice speaks, then restores it automatically
- 🌐 **Multi-language support** — translate to Spanish, French, Portuguese, German, Italian, Japanese, Chinese, Korean, and more
- ⚡ **No video pausing** — translation plays simultaneously over the video in real time
- 🆓 **Free by default** — uses Google Translate's unofficial endpoint, no API key needed
- 💎 **Premium upgrade path** — connect OpenAI or ElevenLabs for higher quality voices

---

## 🚀 How It Works

```
YouTube renders CC subtitle → MutationObserver detects text → Translate → Speak (TTS)
```

The extension **observes YouTube's own caption DOM** (`.ytp-caption-segment`) instead of downloading subtitle files. This approach:
- Requires no subtitle file downloads
- Works with any video that has CC captions (auto-generated or manual)
- Is immune to YouTube API changes and authentication issues

---

## 📦 Installation (Developer Mode)

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the `translate-extension` folder
5. The extension icon will appear in your Chrome toolbar

---

## 🎬 Usage

1. Open any YouTube video that has **CC subtitles** (auto-generated or manual)
2. Click the 🎙️ **"Translate to Spanish"** floating button that appears in the top-right of the video player
3. YouTube's CC captions will be enabled automatically
4. The translated voice will speak over the video in real time

---

## ⚙️ Configuration (Popup)

Click the extension icon in the Chrome toolbar to open settings:

| Setting | Description |
|---------|-------------|
| **On/Off toggle** | Enable or disable translation globally |
| **Free mode** | Uses Google Translate + Chrome Web Speech API (no key needed) |
| **Premium mode** | Uses OpenAI TTS or ElevenLabs for more realistic voices |
| **Target language** | Choose your translation output language |
| **Voice** | Pick a specific Chrome system voice |
| **Speed / Pitch** | Adjust TTS playback rate and pitch |
| **Duck volume** | How much to lower the original video audio (default 15%) |
| **API Keys** | Enter your OpenAI or ElevenLabs keys for premium features |

---

## 🔑 API Keys (Optional — Premium Only)

The extension works **100% for free** without any API keys.

For better voice quality, you can optionally add:

| Service | Where to get it | What it unlocks |
|---------|----------------|-----------------|
| **OpenAI** | [platform.openai.com](https://platform.openai.com) | GPT-4o-mini translation + high-quality TTS voices |
| **ElevenLabs** | [elevenlabs.io](https://elevenlabs.io) | Ultra-realistic, emotionally expressive voice cloning |

Keys are stored locally in `chrome.storage.local` and never sent anywhere except the respective API.

---

## 🧱 Architecture

```
translate-extension/
├── manifest.json        # Extension config (MV3)
├── content.js           # Core engine: DOM observer, ducking, TTS orchestration
├── background.js        # Service worker: translation API + TTS API calls
├── inject.js            # MAIN world script: reads ytInitialPlayerResponse
├── popup.html           # Settings UI
├── popup.css            # Settings UI styles
├── popup.js             # Settings UI logic
├── icon16.png           # Toolbar icon (16×16)
├── icon48.png           # Extensions page icon (48×48)
└── icon128.png          # Chrome Web Store icon (128×128)
```

### Translation Engine Priority (Free Mode)
1. **Google Translate** (unofficial endpoint) — no key, generous limits
2. **MyMemory** (fallback) — 5,000 chars/day free tier

---

## 🛠️ Tech Stack

- **Manifest V3** Chrome Extension API
- **MutationObserver** for real-time caption detection
- **Web Speech API** (`SpeechSynthesis`) — free, built into Chrome
- **Google Translate** unofficial endpoint — free translation
- **OpenAI** `gpt-4o-mini` + `tts-1` — optional premium
- **ElevenLabs** `eleven_multilingual_v2` — optional premium

---

## ⚠️ Notes

- The extension only works on videos that have **CC captions enabled**. For best results, manually enable YouTube's CC subtitles before activating the extension, or click the translate button first (it auto-enables CC).
- Google Translate's unofficial endpoint has no documented rate limits but is not an official API — use responsibly.
- ElevenLabs and OpenAI TTS require paid plans for extensive use.

---

## 📄 License

MIT © 2024 HOPSiEdev
