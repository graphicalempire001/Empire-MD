const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const { EdgeTTS } = require('node-edge-tts');
const config = require('../config');

// Convert an mp3 file to Ogg/Opus mono 48kHz — the exact format WhatsApp
// requires for a voice-note (ptt) bubble to actually play. Sending raw MP3
// with ptt:true uploads fine but shows a broken/unplayable player on the
// receiving end, which is the bug this fixes.
function toWhatsappVoiceNote(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioCodec('libopus')
      .audioChannels(1)
      .audioFrequency(48000)
      .audioBitrate('64k')
      .format('ogg')
      .on('error', reject)
      .on('end', resolve)
      .save(outputPath);
  });
}

// A small, friendly set of voices users can pick with a short code.
// Full list: https://github.com/SchneeHertz/node-edge-tts (or `edge-tts --list-voices`)
const VOICES = {
  male: 'en-US-GuyNeural',
  female: 'en-US-JennyNeural',
  uk: 'en-GB-RyanNeural',
  ukf: 'en-GB-SoniaNeural',
  ng: 'en-NG-AbeoNeural',
  ngf: 'en-NG-EzinneNeural',
};
const DEFAULT_VOICE = VOICES.female;

module.exports = {
  // 🔊 .tts <text>  or  .tts <voice> | <text>
  // Free command — Microsoft Edge TTS, no API key, no cost.
  tts: async ({ sock, chatJid, mek, text }) => {
    if (!text || !text.trim()) {
      return sock.sendMessage(chatJid, {
        text: `❌ Give me some text to speak!\n\nExample: *.tts Hello there*\nOr pick a voice: *.tts ng | Bawo ni, how far?*\n\nVoices: ${Object.keys(VOICES).join(', ')}`
      }, { quoted: mek });
    }

    let voice = DEFAULT_VOICE;
    let spoken = text.trim();
    const pipeIdx = spoken.indexOf('|');
    if (pipeIdx > -1) {
      const maybeVoiceKey = spoken.slice(0, pipeIdx).trim().toLowerCase();
      if (VOICES[maybeVoiceKey]) {
        voice = VOICES[maybeVoiceKey];
        spoken = spoken.slice(pipeIdx + 1).trim();
      }
    }
    if (!spoken) {
      return sock.sendMessage(chatJid, { text: "❌ There's no text left to speak after the voice code." }, { quoted: mek });
    }
    if (spoken.length > 1200) {
      return sock.sendMessage(chatJid, { text: "❌ That's too long — keep it under 1200 characters." }, { quoted: mek });
    }

    const tmpFile = path.join(os.tmpdir(), `tts-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);
    const oggFile = tmpFile.replace(/\.mp3$/, '.ogg');
    try {
      const tts = new EdgeTTS({ voice, lang: 'en-US', outputFormat: 'audio-24khz-48kbitrate-mono-mp3', timeout: 15000 });
      await tts.ttsPromise(spoken, tmpFile);
      await toWhatsappVoiceNote(tmpFile, oggFile);
      const buf = fs.readFileSync(oggFile);
      await sock.sendMessage(chatJid, {
        audio: buf,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true
      }, { quoted: mek });
    } catch (err) {
      console.error('TTS error:', err.message);
      await sock.sendMessage(chatJid, { text: `❌ Text-to-speech failed: ${err.message}` }, { quoted: mek });
    } finally {
      fs.unlink(tmpFile, () => {});
      fs.unlink(oggFile, () => {});
    }
  },

  // 🎨 .imagine <prompt>
  // Free command — Pollinations.ai image generation, no API key, no cost.
  imagine: async ({ sock, chatJid, mek, text }) => {
    if (!text || !text.trim()) {
      return sock.sendMessage(chatJid, { text: "❌ Describe what you want to see!\n\nExample: *.imagine a neon lion in a cyberpunk city*" }, { quoted: mek });
    }
    const prompt = text.trim().slice(0, 600);
    const seed = Math.floor(Math.random() * 1_000_000);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&seed=${seed}&nologo=true`;

    try {
      await sock.sendMessage(chatJid, { text: `🎨 Generating: _${prompt}_ — give it a moment…` }, { quoted: mek });
      const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
      await sock.sendMessage(chatJid, {
        image: Buffer.from(res.data),
        caption: `🎨 *${prompt}*\n_Powered by ${config.botName}_`
      }, { quoted: mek });
    } catch (err) {
      console.error('Imagine error:', err.message);
      await sock.sendMessage(chatJid, { text: `❌ Image generation failed, try again in a moment: ${err.message}` }, { quoted: mek });
    }
  },
};
