# Empire MD - High Performance Multi-Device WhatsApp Bot 🚀

Empire MD is a robust, lightweight, and highly optimized multi-device WhatsApp bot built on top of `@whiskeysockets/baileys`. It provides a clean, fully functional structure featuring high-speed keyless media downloading APIs, custom sticker generation, complete owner customization, and private onboarding/group management controls.

## ✨ Features

- **🔒 Private by Default**: The bot starts in strictly private mode out of the box, ensuring that only the owner can trigger commands. It can be easily toggled to public mode.
- **📥 Keyless Media Downloads**: Fully implemented downloader commands for YouTube (MP3/MP4), TikTok (no-watermark), Instagram Reels, and Facebook using public keyless APIs with automatic fallback routing.
- **🎨 Sticker Maker**: Fully functional image/video-to-sticker converter using the standard `wa-sticker-formatter` library.
- **📢 Follow Link Redirection**: 
  - Welcome message on onboarding contains a follow link button.
  - New group members receive an automated welcome card containing the follow channel link.
  - Group media shares (such as downloaded audios, videos, or broadcasts) automatically append a beautifully styled interactive link card leading directly to your official WhatsApp channel.
- **💻 Web Onboarding Portal**: Includes a stunning Tailwind CSS onboarding web page that lets users customize the bot's name, owner number, prefix, and default privacy mode during initial deployment.

---

## 🛠️ Commands List

Commands use short, abbreviated names for maximum convenience:

| Command | Category | Description |
| :--- | :--- | :--- |
| `.s` / `.sticker` | Media | Converts a replied image/video into a high-quality WhatsApp sticker. |
| `.play` | Media | Searches and downloads a YouTube song directly as MP3 audio. |
| `.ytmp3` | Media | Downloads a YouTube video URL as MP3 audio. |
| `.ytmp4` | `.video` | Downloads a YouTube video URL as MP4. |
| `.ig` / `.insta` | Media | Downloads an Instagram Reel or post video. |
| `.tt` / `.tiktok` | Media | Downloads a TikTok video without any watermark. |
| `.fb` / `.fbdl` | Media | Downloads Facebook high-definition videos. |
| `.sp` / `.setprefix` | Owner | Instantly updates the bot's command prefix. |
| `.mode` / `.setmode` | Owner | Toggles the bot visibility between `public` and `private`. |
| `.bc` / `.broadcast` | Owner | Broadcasts a custom message to all groups with automatic channel follow buttons. |
| `.p` / `.ping` | Utility | Measures the bot latency and active status. |
| `.system` / `.info` | Utility | Shows system diagnostics, memory usage, and runtime uptime. |
| `.help` / `.h` / `.menu` | Utility | Displays the interactive commands list. |
| `.meme` | Fun | Fetches a fresh internet meme via public keyless API. |
| `.joke` | Fun | Fetches a random setup-and-punchline joke. |
| `.fact` | Fun | Fetches an interesting useless fact. |
| `.lyrics` | Fun | Searches for song lyrics instantly. |

---

## 🚀 Setup & Installation

### Prerequisite
Ensure you have **Node.js v18+** and **git** installed on your system.

### Running Locally
1. Clone your new repository:
   ```bash
   git clone https://github.com/graphicalempire001/Empire-MD.git
   cd Empire-MD
   ```
2. Install the production-ready dependencies:
   ```bash
   npm install
   ```
3. Start the onboarding web server:
   ```bash
   npm start
   ```
4. Open `http://localhost:3000` in your web browser, complete the setup form (input your owner number, customize prefixes, choose public/private visibility, and set your WhatsApp channel follow URL), and click **Save Configuration**.
5. Scan the QR code displayed in your terminal with your WhatsApp linked devices option to connect.

---

## 📄 License
This project is licensed under the MIT License. Developed with ❤️ by Graphical Empire.