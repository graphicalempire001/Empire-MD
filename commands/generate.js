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

  // 🔍 .imagine / .img  — real web image search (DuckDuckGo)
  imagine: async ({ sock, chatJid, mek, text }) => {
    if (!text || !text.trim()) {
      return sock.sendMessage(chatJid, {
        text: "❌ What should I search for?\n\nExample: *.imagine lagos skyline at night*\nOr: *.img messi celebration*"
      }, { quoted: mek });
    }

    const query = text.trim().slice(0, 200);
    try {
      await sock.sendMessage(chatJid, { text: `🔍 Searching images for: _${query}_…` }, { quoted: mek });

      const results = await searchImages(query, 4); // send up to 4 images

      for (const item of results) {
        try {
          const res = await axios.get(item.image, {
            responseType: 'arraybuffer',
            timeout: 20000,
            headers: { 'User-Agent': 'Mozilla/5.0' },
            maxContentLength: 8 * 1024 * 1024 // 8 MB max
          });
          await sock.sendMessage(chatJid, {
            image: Buffer.from(res.data),
            caption: `📷 *${item.title || query}*\n_Source search_`
          }, { quoted: mek });
        } catch (dlErr) {
          // skip broken image links
          console.warn('Skip image:', dlErr.message);
        }
      }
    } catch (err) {
      console.error('Image search error:', err.message);
      await sock.sendMessage(chatJid, {
        text: `❌ Image search failed: ${err.message}`
      }, { quoted: mek });
    }
  },

  // aliases
  img: (args) => module.exports.imagine(args),
  image: (args) => module.exports.imagine(args),
  pics: (args) => module.exports.imagine(args),
};
