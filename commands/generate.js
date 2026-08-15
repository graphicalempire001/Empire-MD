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

// Expanded voice list — short codes users can type
const VOICES = {
  // Nigerian (best for Pidgin / Naija English)
  ng:      'en-NG-AbeoNeural',      // male
  ngf:     'en-NG-EzinneNeural',    // female
  pidgin:  'en-NG-AbeoNeural',      // alias for Pidgin style
  pidginf: 'en-NG-EzinneNeural',

  // US
  male:    'en-US-GuyNeural',
  female:  'en-US-JennyNeural',
  aria:    'en-US-AriaNeural',
  guy:     'en-US-GuyNeural',
  jenny:   'en-US-JennyNeural',
  davis:   'en-US-DavisNeural',
  jane:    'en-US-JaneNeural',
  jason:   'en-US-JasonNeural',
  sara:    'en-US-SaraNeural',
  tony:    'en-US-TonyNeural',
  nancy:   'en-US-NancyNeural',

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

  // Popular non-English (bonus)
  yo:      'en-NG-AbeoNeural',      // fallback — no true Yoruba TTS on Edge
  ha:      'en-NG-AbeoNeural',      // same
  es:      'es-ES-AlvaroNeural',
  esf:     'es-ES-ElviraNeural',
  fr:      'fr-FR-HenriNeural',
  frf:     'fr-FR-DeniseNeural',
  ar:      'ar-SA-HamedNeural',
  arf:     'ar-SA-ZariyahNeural',
  hi:      'hi-IN-MadhurNeural',
  hif:     'hi-IN-SwaraNeural',
};

const DEFAULT_VOICE = VOICES.ngf; // default to Nigerian female

// ─────────────────────────────────────────────
// DuckDuckGo image search (real web photos)
// ─────────────────────────────────────────────
async function searchImages(query, limit = 5) {
  // Step 1: get vqd token
  const tokenRes = await axios.get('https://duckduckgo.com/', {
    params: { q: query },
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    timeout: 12000
  });

  const vqdMatch = tokenRes.data.match(/vqd=["']([^"']+)["']/);
  if (!vqdMatch) throw new Error('Could not get search token');

  const vqd = vqdMatch[1];

  // Step 2: image results
  const imgRes = await axios.get('https://duckduckgo.com/i.js', {
    params: {
      l: 'us-en',
      o: 'json',
      q: query,
      vqd,
      f: ',,,',
      p: '1'
    },
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://duckduckgo.com/'
    },
    timeout: 15000
  });

  const results = (imgRes.data?.results || [])
    .filter(r => r.image && r.image.startsWith('http'))
    .slice(0, limit);

  if (!results.length) throw new Error('No images found');
  return results;
}

module.exports = {
  // 🔊 .tts <text>   or   .tts <voice> | <text>
  tts: async ({ sock, chatJid, mek, text }) => {
    if (!text || !text.trim()) {
      return sock.sendMessage(chatJid, {
        text: `❌ Give me text to speak!\n\n*Examples:*\n.tts How far, wetin dey happen?\n.tts pidgin | Abeg make we go\n.tts ngf | Good morning o\n.tts male | Hello world\n\n*Voices:* ${Object.keys(VOICES).join(', ')}`
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
      return sock.sendMessage(chatJid, { text: "❌ No text left after the voice code." }, { quoted: mek });
    }
    if (spoken.length > 1200) {
      return sock.sendMessage(chatJid, { text: "❌ Keep it under 1200 characters." }, { quoted: mek });
    }

    // Use matching lang for Nigerian voices
    const lang = voice.startsWith('en-NG') ? 'en-NG' :
                 voice.startsWith('en-GB') ? 'en-GB' :
                 voice.startsWith('en-AU') ? 'en-AU' :
                 voice.startsWith('en-IN') ? 'en-IN' :
                 voice.startsWith('en-ZA') ? 'en-ZA' :
                 voice.startsWith('en-KE') ? 'en-KE' :
                 voice.startsWith('es-')   ? 'es-ES' :
                 voice.startsWith('fr-')   ? 'fr-FR' :
                 voice.startsWith('ar-')   ? 'ar-SA' :
                 voice.startsWith('hi-')   ? 'hi-IN' : 'en-US';

    const tmpFile = path.join(os.tmpdir(), `tts-\( {Date.now()}- \){Math.random().toString(36).slice(2)}.mp3`);
    const oggFile = tmpFile.replace(/\.mp3$/, '.ogg');

    try {
      const tts = new EdgeTTS({
        voice,
        lang,
        outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
        timeout: 20000
      });
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
      await sock.sendMessage(chatJid, { text: `❌ TTS failed: ${err.message}` }, { quoted: mek });
    } finally {
      fs.unlink(tmpFile, () => {});
      fs.unlink(oggFile, () => {});
    }
  },
// ─────────────────────────────────────────────
// Public image search (DuckDuckGo — real web photos)
// ─────────────────────────────────────────────
async function searchImages(query, limit = 8) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  // 1. Get vqd token
  const home = await axios.get('https://duckduckgo.com/', {
    params: { q: query },
    headers,
    timeout: 12000,
  });

  const vqdMatch = String(home.data).match(/vqd=["']([^"']+)["']/i);
  if (!vqdMatch) throw new Error('Search token failed — try again');

  const vqd = vqdMatch[1];

  // 2. Fetch image results
  const imgRes = await axios.get('https://duckduckgo.com/i.js', {
    params: {
      l: 'us-en',
      o: 'json',
      q: query,
      vqd,
      f: ',,,',
      p: '1',
    },
    headers: {
      ...headers,
      Referer: 'https://duckduckgo.com/',
    },
    timeout: 15000,
  });

  const results = (imgRes.data?.results || [])
    .filter(r => r?.image && /^https?:\/\//i.test(r.image))
    .map(r => ({
      url: r.image,
      title: r.title || query,
      source: r.url || '',
    }));

  if (!results.length) throw new Error('No images found for that search');
  return results.slice(0, limit);
}

async function downloadImage(url) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 18000,
    maxContentLength: 10 * 1024 * 1024, // 10 MB
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'image/*,*/*;q=0.8',
    },
    validateStatus: s => s >= 200 && s < 400,
  });
  const buf = Buffer.from(res.data);
  if (buf.length < 2000) throw new Error('Image too small / invalid');
  return buf;
}

// Inside module.exports — replace the imagine function with this:
imagine: async ({ sock, chatJid, mek, text }) => {
  if (!text || !text.trim()) {
    return sock.sendMessage(chatJid, {
      text: "❌ What should I search?\n\nExample:\n*.imagine lagos skyline*\n*.img messi celebration*\n*.pics dubai at night*"
    }, { quoted: mek });
  }

  const query = text.trim().slice(0, 180);
  const TARGET = 3; // always try to send 3 images

  try {
    await sock.sendMessage(chatJid, {
      text: `🔍 Searching public images for: *${query}*\nSending up to ${TARGET} photos…`
    }, { quoted: mek });

    // Fetch more candidates so we can skip broken ones
    const candidates = await searchImages(query, 12);
    let sent = 0;

    for (const item of candidates) {
      if (sent >= TARGET) break;
      try {
        const buf = await downloadImage(item.url);
        await sock.sendMessage(chatJid, {
          image: buf,
          caption: sent === 0
            ? `📷 *${item.title}*\n_Public web search • \( {sent + 1}/ \){TARGET}_`
            : `📷 \( {sent + 1}/ \){TARGET}`
        }, { quoted: mek });
        sent++;
        // small delay so WhatsApp doesn’t throttle
        await new Promise(r => setTimeout(r, 600));
      } catch (e) {
        // skip this broken / blocked image and try next
        console.warn('Skip image:', e.message);
      }
    }

    if (sent === 0) {
      await sock.sendMessage(chatJid, {
        text: '❌ Could not download any of the found images. Try a different search.'
      }, { quoted: mek });
    } else if (sent < TARGET) {
      await sock.sendMessage(chatJid, {
        text: `⚠️ Only got ${sent} working image(s) for that search.`
      }, { quoted: mek });
    }
  } catch (err) {
    console.error('Image search error:', err.message);
    await sock.sendMessage(chatJid, {
      text: `❌ Image search failed: ${err.message}`
    }, { quoted: mek });
  }
},

// keep aliases
img: (args) => module.exports.imagine(args),
image: (args) => module.exports.imagine(args),
pics: (args) => module.exports.imagine(args),
  
