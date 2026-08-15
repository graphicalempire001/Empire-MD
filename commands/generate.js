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

// ✅ ONLY verified Edge TTS voices (these actually exist)
const VOICES = {
  // Nigeria / Pidgin-friendly
  ng:      'en-NG-AbeoNeural',
  ngf:     'en-NG-EzinneNeural',
  pidgin:  'en-NG-AbeoNeural',
  pidginf: 'en-NG-EzinneNeural',

  // US
  male:    'en-US-GuyNeural',
  female:  'en-US-JennyNeural',
  guy:     'en-US-GuyNeural',
  jenny:   'en-US-JennyNeural',
  aria:    'en-US-AriaNeural',
  ana:     'en-US-AnaNeural',
  chris:   'en-US-ChristopherNeural',
  eric:    'en-US-EricNeural',
  michelle:'en-US-MichelleNeural',
  roger:   'en-US-RogerNeural',
  steffan: 'en-US-SteffanNeural',

  // UK
  uk:      'en-GB-RyanNeural',
  ukf:     'en-GB-SoniaNeural',
  ryan:    'en-GB-RyanNeural',
  sonia:   'en-GB-SoniaNeural',
  libby:   'en-GB-LibbyNeural',
  thomas:  'en-GB-ThomasNeural',

  // Other English
  au:      'en-AU-WilliamNeural',
  auf:     'en-AU-NatashaNeural',
  in:      'en-IN-PrabhatNeural',
  inf:     'en-IN-NeerjaNeural',
  za:      'en-ZA-LukeNeural',
  zaf:     'en-ZA-LeahNeural',
  ke:      'en-KE-ChilembaNeural',
  kef:     'en-KE-AsiliaNeural',
  ca:      'en-CA-LiamNeural',
  caf:     'en-CA-ClaraNeural',
};

const DEFAULT_VOICE = VOICES.ngf;

// lang is taken from the voice name itself (en-NG, en-US, …)
function langFromVoice(voice) {
  const m = voice.match(/^([a-z]{2}-[A-Z]{2})/);
  return m ? m[1] : 'en-US';
}

// ─────────────────────────────────────────────
// Bing public image search (real photos)
// ─────────────────────────────────────────────
async function searchBingImages(query, limit = 15) {
  const url = 'https://www.bing.com/images/async';
  const res = await axios.get(url, {
    params: {
      q: query,
      first: 1,
      count: 35,
      mmasync: 1,
      qft: '+filterui:photo-photo', // photos only, not clipart/AI-looking junk as much as possible
    },
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    timeout: 15000,
  });

  const html = String(res.data);
  const results = [];
  // Bing embeds JSON in m="..." attributes
  const re = /m="({[^"]+})"/g;
  let match;
  while ((match = re.exec(html)) !== null) {
    try {
      const raw = match[1]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&');
      const obj = JSON.parse(raw);
      const imageUrl = obj.murl || obj.imgurl || obj.turl;
      const w = parseInt(obj.w || obj.width || 0, 10);
      const h = parseInt(obj.h || obj.height || 0, 10);
      if (
        imageUrl &&
        /^https?:\/\//i.test(imageUrl) &&
        w >= 400 &&
        h >= 300
      ) {
        results.push({
          url: imageUrl,
          title: obj.t || obj.title || query,
          w,
          h,
        });
      }
    } catch (_) {}
  }

  // de-dupe
  const seen = new Set();
  const unique = [];
  for (const r of results) {
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    unique.push(r);
    if (unique.length >= limit) break;
  }
  if (!unique.length) throw new Error('No photos found');
  return unique;
}

async function downloadImage(url) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 20000,
    maxContentLength: 12 * 1024 * 1024,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      Referer: 'https://www.bing.com/',
    },
    validateStatus: (s) => s >= 200 && s < 400,
  });
  const buf = Buffer.from(res.data);
  if (buf.length < 5000) throw new Error('too small');
  return buf;
}

module.exports = {
  // 🔊 .tts <text>  OR  .tts <voice> | <text>
  tts: async ({ sock, chatJid, mek, text }) => {
    if (!text || !text.trim()) {
      return sock.sendMessage(
        chatJid,
        {
          text:
            `❌ Give me text to speak!\n\n` +
            `*Examples:*\n` +
            `.tts How far, wetin dey happen?\n` +
            `.tts pidgin | Abeg make we go market\n` +
            `.tts ngf | Good morning o\n` +
            `.tts male | Hello from America\n` +
            `.tts uk | British accent test\n\n` +
            `*Working voices:*\n${Object.keys(VOICES).join(', ')}`,
        },
        { quoted: mek }
      );
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
      await sock.sendMessage(
        chatJid,
        { audio: buf, mimetype: 'audio/ogg; codecs=opus', ptt: true },
        { quoted: mek }
      );
    } catch (err) {
      console.error('TTS error:', err.message);
      await sock.sendMessage(
        chatJid,
        { text: `❌ TTS failed (${voice}): ${err.message}` },
        { quoted: mek }
      );
    } finally {
      fs.unlink(tmpFile, () => {});
      fs.unlink(oggFile, () => {});
    }
  },

  // 🔍 .imagine / .img / .pics  — 3 real Bing photos
  imagine: async ({ sock, chatJid, mek, text }) => {
    if (!text || !text.trim()) {
      return sock.sendMessage(
        chatJid,
        {
          text:
            '❌ What should I search?\n\n' +
            'Example:\n*.imagine lagos skyline at night*\n*.img messi celebration*\n*.pics abuja mosque*',
        },
        { quoted: mek }
      );
    }

    const query = text.trim().slice(0, 180);
    const TARGET = 3;

    try {
      await sock.sendMessage(
        chatJid,
        { text: `🔍 Searching real photos for: *${query}*\nSending ${TARGET} images…` },
        { quoted: mek }
      );

      const candidates = await searchBingImages(query, 20);
      let sent = 0;

      for (const item of candidates) {
        if (sent >= TARGET) break;
        try {
          const buf = await downloadImage(item.url);
          await sock.sendMessage(
            chatJid,
            {
              image: buf,
              caption:
                sent === 0
                  ? `📷 *\( {item.title}*\n_ \){item.w}×${item.h} • \( {sent + 1}/ \){TARGET}_`
                  : `📷 \( {sent + 1}/ \){TARGET}`,
            },
            { quoted: mek }
          );
          sent++;
          await new Promise((r) => setTimeout(r, 700));
        } catch (e) {
          console.warn('Skip image:', e.message);
        }
      }

      if (sent === 0) {
        await sock.sendMessage(
          chatJid,
          { text: '❌ Found results but could not download any. Try another search.' },
          { quoted: mek }
        );
      } else if (sent < TARGET) {
        await sock.sendMessage(
          chatJid,
          { text: `⚠️ Only ${sent} working photo(s) for that search.` },
          { quoted: mek }
        );
      }
    } catch (err) {
      console.error('Image search error:', err.message);
      await sock.sendMessage(
        chatJid,
        { text: `❌ Image search failed: ${err.message}` },
        { quoted: mek }
      );
    }
  },

  img: (args) => module.exports.imagine(args),
  image: (args) => module.exports.imagine(args),
  pics: (args) => module.exports.imagine(args),
};
