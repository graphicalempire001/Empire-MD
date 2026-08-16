const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const { EdgeTTS } = require('node-edge-tts');
const config = require('../config');

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);

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

// ✅ Verified Edge TTS voices only
const VOICES = {
  ng: 'en-NG-AbeoNeural',
  ngf: 'en-NG-EzinneNeural',
  pidgin: 'en-NG-AbeoNeural',
  pidginf: 'en-NG-EzinneNeural',
  male: 'en-US-GuyNeural',
  female: 'en-US-JennyNeural',
  guy: 'en-US-GuyNeural',
  jenny: 'en-US-JennyNeural',
  aria: 'en-US-AriaNeural',
  ana: 'en-US-AnaNeural',
  chris: 'en-US-ChristopherNeural',
  eric: 'en-US-EricNeural',
  michelle: 'en-US-MichelleNeural',
  roger: 'en-US-RogerNeural',
  steffan: 'en-US-SteffanNeural',
  uk: 'en-GB-RyanNeural',
  ukf: 'en-GB-SoniaNeural',
  ryan: 'en-GB-RyanNeural',
  sonia: 'en-GB-SoniaNeural',
  libby: 'en-GB-LibbyNeural',
  thomas: 'en-GB-ThomasNeural',
  au: 'en-AU-WilliamNeural',
  auf: 'en-AU-NatashaNeural',
  in: 'en-IN-PrabhatNeural',
  inf: 'en-IN-NeerjaNeural',
  za: 'en-ZA-LukeNeural',
  zaf: 'en-ZA-LeahNeural',
  ke: 'en-KE-ChilembaNeural',
  kef: 'en-KE-AsiliaNeural',
  ca: 'en-CA-LiamNeural',
  caf: 'en-CA-ClaraNeural',
};
const DEFAULT_VOICE = VOICES.ngf;

function langFromVoice(voice) {
  const m = voice.match(/^([a-z]{2}-[A-Z]{2})/);
  return m ? m[1] : 'en-US';
}

// ─────────────────────────────────────────────
// Unsplash — real photography
// ─────────────────────────────────────────────
const UNSPLASH_KEY =
  process.env.UNSPLASH_ACCESS_KEY ||
  config.unsplashKey ||
  'JPvZUN-pFifioWJQcWb0kaR1VPLW9kxtTkbEs3DVgz4';

async function searchUnsplash(query, limit = 3) {
  if (!UNSPLASH_KEY) throw new Error('Unsplash Access Key missing');

  const res = await axios.get('https://api.unsplash.com/search/photos', {
    params: {
      query,
      per_page: limit,
      orientation: 'landscape',
      content_filter: 'high',
    },
    headers: {
      Authorization: `Client-ID ${UNSPLASH_KEY}`,
      'Accept-Version': 'v1',
    },
    timeout: 15000,
  });

  const results = (res.data?.results || [])
    .map((p) => ({
      url: p.urls?.regular || p.urls?.full || p.urls?.small,
      title: p.alt_description || p.description || query,
      photographer: p.user?.name || 'Unknown',
      profile: p.user?.links?.html || 'https://unsplash.com',
      w: p.width,
      h: p.height,
    }))
    .filter((p) => p.url);

  if (!results.length) throw new Error('No Unsplash photos found');
  return results;
}

async function downloadImage(url) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 20000,
    maxContentLength: 15 * 1024 * 1024,
    headers: {
      'User-Agent': 'Empire-MD/1.0',
      Accept: 'image/*,*/*;q=0.8',
    },
    validateStatus: (s) => s >= 200 && s < 400,
  });
  const buf = Buffer.from(res.data);
  if (buf.length < 3000) throw new Error('image too small');
  return buf;
}

module.exports = {
  // 🔊 .tts
  tts: async ({ sock, chatJid, mek, text }) => {
    if (!text || !text.trim()) {
      return sock.sendMessage(chatJid, {
        text:
          `❌ Give me text to speak!\n\n` +
          `*Examples:*\n` +
          `.tts How far, wetin dey happen?\n` +
          `.tts pidgin | Abeg make we go\n` +
          `.tts ngf | Good morning o\n` +
          `.tts male | Hello world\n\n` +
          `*Voices:* ${Object.keys(VOICES).join(', ')}`,
      }, { quoted: mek });
    }

    let voice = DEFAULT_VOICE;
    let spoken = text.trim();
    const pipeIdx = spoken.indexOf('|');
    if (pipeIdx > -1) {
      const key = spoken.slice(0, pipeIdx).trim().toLowerCase();
      if (VOICES[key]) {
        voice = VOICES[key];
        spoken = spoken.slice(pipeIdx + 1).trim();
      }
    }
    if (!spoken) {
      return sock.sendMessage(chatJid, { text: '❌ No text after voice code.' }, { quoted: mek });
    }
    if (spoken.length > 1200) {
      return sock.sendMessage(chatJid, { text: '❌ Max 1200 characters.' }, { quoted: mek });
    }

    const lang = langFromVoice(voice);
    const tmpFile = path.join(os.tmpdir(), `tts-${Date.now()}.mp3`);
    const oggFile = tmpFile.replace(/\.mp3$/, '.ogg');

    try {
      const tts = new EdgeTTS({
        voice,
        lang,
        outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
        timeout: 20000,
      });
      await tts.ttsPromise(spoken, tmpFile);
      await toWhatsappVoiceNote(tmpFile, oggFile);
      const buf = fs.readFileSync(oggFile);
      await sock.sendMessage(chatJid, {
        audio: buf,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true,
      }, { quoted: mek });
    } catch (err) {
      console.error('TTS error:', err.message);
      await sock.sendMessage(chatJid, {
        text: `❌ TTS failed (${voice}): ${err.message}`,
      }, { quoted: mek });
    } finally {
      fs.unlink(tmpFile, () => {});
      fs.unlink(oggFile, () => {});
    }
  },

  // 📷 .imagine / .img / .pics — 3 real Unsplash photos
  imagine: async ({ sock, chatJid, mek, text }) => {
    if (!text || !text.trim()) {
      return sock.sendMessage(chatJid, {
        text:
          '❌ Search real photos on Unsplash.\n\n' +
          'Example:\n*.imagine lagos nigeria*\n*.img football stadium*\n*.pics mountain lake*',
      }, { quoted: mek });
    }

    const query = text.trim().slice(0, 120);
    const TARGET = 3;

    try {
      await sock.sendMessage(chatJid, {
        text: `🔍 Searching Unsplash for: *${query}*\nSending ${TARGET} real photos…`,
      }, { quoted: mek });

      const photos = await searchUnsplash(query, TARGET);
      let sent = 0;

      for (const photo of photos) {
        try {
          const buf = await downloadImage(photo.url);
          await sock.sendMessage(chatJid, {
            image: buf,
            caption:
              `📷 *${photo.title}*\n` +
              `📸 Photo by ${photo.photographer} on Unsplash\n` +
              `_\( {photo.w}× \){photo.h} · \( {sent + 1}/ \){photos.length}_`,
          }, { quoted: mek });
          sent++;
          await new Promise((r) =>
