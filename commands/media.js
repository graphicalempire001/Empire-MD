const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const axios = require('axios'); axios = require('axios');
const fs = require('fs');
const path = require('path');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const ffmpeg = require('fluent-ffmpeg');
const { PassThrough } = require('stream');
const config = require('../config');

// Helper to download media message
async function downloadMedia(mek, type) {
  const message = mek.message?.[type];
  if (!message) {
    throw new Error(`Unsupported media type: ${type}`);
  }
  const stream = await downloadContentFromMessage(
    message,
    type.replace("Message", "")
  );
  let buffer = Buffer.from([]);
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);
  }
  return buffer;
}

// Convert any audio buffer to Opus/Ogg (most reliable for WhatsApp playback).
function convertAudio(inputBuffer, format = 'ogg') {
  return new Promise((resolve, reject) => {
    const input = new PassThrough();
    input.end(inputBuffer);
    const chunks = [];
    const output = new PassThrough();
    output.on('data', c => chunks.push(c));
    output.on('end', () => resolve(Buffer.concat(chunks)));
    output.on('error', reject);

    const cmd = ffmpeg(input).noVideo();
    if (format === 'ogg') {
      cmd.audioCodec('libopus').format('ogg').audioBitrate('128k');
    } else {
      cmd.audioCodec('aac').format('ipod').audioBitrate('128k'); // m4a
    }
    cmd.on('error', reject).pipe(output, { end: true });
  });
}

// Download a Cobalt tunnel URL into a Buffer (follows redirects, treats as binary).
async function fetchBuffer(url, timeout = 60000) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout,
    maxRedirects: 5,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  return Buffer.from(res.data);
}

// Helper to send media with "leads to channel" button/link
async function sendGroupMedia(sock, chatJid, mediaObj, caption = "", mek = null) {
  const isGroup = chatJid.endsWith('@g.us');
  const channelUrl = config.channelUrl || "https://whatsapp.com/channel/0029VaI3OXiF6smuq5LxxN15";
  const formattedCaption = isGroup
    ? `${caption}
━━━━━━━━━━━━━━━━━━━━
📢 *Join Our Official BOT-WAN Channel:*
👉 ${channelUrl}
━━━━━━━━━━━━━━━━━━━━`
    : caption;
  if (mediaObj.video) {
    return sock.sendMessage(chatJid, {
      video: mediaObj.video,
      caption: formattedCaption,
      mimetype: 'video/mp4'
    }, { quoted: mek });
  } else if (mediaObj.audio) {
    return sock.sendMessage(chatJid, {
      audio: mediaObj.audio,
      mimetype: mediaObj.mimetype || 'audio/ogg; codecs=opus',
      ptt: mediaObj.ptt || false
    }, { quoted: mek });
  } else if (mediaObj.image) {
    return sock.sendMessage(chatJid, {
      image: mediaObj.image,
      caption: formattedCaption
    }, { quoted: mek });
  }
}

// Robust audio sender: convert -> send as audio; on failure, fall back to document.
async function sendAudioSafe(sock, chatJid, rawBuffer, filename, mek) {
  if (!rawBuffer || !rawBuffer.length) {
    return sock.sendMessage(chatJid, { text: "❌ Downloaded empty audio file." }, { quoted: mek });
  }
  const cleanName = (filename || "audio").replace(/[^\w\-.\s]/g, "").trim() || "audio";
  try {
    const ogg = await convertAudio(rawBuffer, 'ogg');
    return await sendGroupMedia(
      sock, chatJid,
      { audio: ogg, mimetype: 'audio/ogg; codecs=opus', ptt: false },
      cleanName, mek
    );
  } catch (convErr) {
    console.error("Audio convert failed, sending as document:", convErr.message);
    // Fallback: deliver the raw file as a document so it always lands.
    return sock.sendMessage(chatJid, {
      document: rawBuffer,
      mimetype: 'audio/mpeg',
      fileName: `${cleanName}.mp3`
    }, { quoted: mek });
  }
}

// ─────────────────────────────────────────────────────────────
// 🔎 STABLE SEARCH — Piped/Invidious JSON APIs (no HTML scraping)
// ─────────────────────────────────────────────────────────────
const SEARCH_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://api.piped.private.coffee",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.leptons.xyz"
];

async function resolveYouTubeUrl(query) {
  if (/^https?:\/\//i.test(query)) return query;
  for (const base of SEARCH_INSTANCES) {
    try {
      const res = await axios.get(
        `${base}/search?q=${encodeURIComponent(query)}&filter=videos`,
        { timeout: 12000, headers: { "User-Agent": "Mozilla/5.0" } }
      );
      const items = res.data?.items || res.data;
      if (!Array.isArray(items)) continue;
      const first = items.find(i => i.url || i.videoId || i.id);
      if (!first) continue;
      let id = first.videoId || first.id || null;
      if (!id && first.url) {
        const m = first.url.match(/[?&]v=([a-zA-Z0-9_-]+)/) || first.url.match(/\/([a-zA-Z0-9_-]{11})$/);
        id = m ? m[1] : null;
      }
      if (id) return `https://www.youtube.com/watch?v=${id}`;
    } catch (e) {
      console.error(`Search instance ${base} failed:`, e.message);
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// ⬇️ DOWNLOAD — YOUR self-hosted Cobalt instance (v11).
// ─────────────────────────────────────────────────────────────
const COBALT_ENDPOINTS = [
  process.env.COBALT_API_URL ||
  "https://imputcobalt-api-production-f1ce.up.railway.app/"
];
const COBALT_API_KEY = process.env.COBALT_API_KEY || null;

async function downloadWithCobalt(url, options = {}) {
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error(`bad input url: "${url}"`);
  }
  const headers = {
    "Accept": "application/json",
    "Content-Type": "application/json"
  };
  if (COBALT_API_KEY) headers["Authorization"] = `Api-Key ${COBALT_API_KEY}`;

  let lastErr = null;
  for (const endpoint of COBALT_ENDPOINTS) {
    try {
      const res = await axios.post(endpoint, { url, ...options }, { headers, timeout: 20000 });
      const data = res.data;
      switch (data?.status) {
        case "tunnel":
        case "redirect":
          return { url: data.url, filename: data.filename };
        case "picker": {
          const first = Array.isArray(data.picker) && data.picker[0];
          if (first?.url) return { url: first.url, filename: data.filename };
          lastErr = "picker returned but empty";
          break;
        }
        case "local-processing": {
          const direct = data.url || (Array.isArray(data.tunnel) && data.tunnel[0]) || null;
          if (direct) return { url: direct, filename: data?.output?.filename };
          lastErr = "audio needs local processing (try audioFormat:'best')";
          break;
        }
        case "error":
          lastErr = data?.error?.code || "cobalt error";
          break;
        default: {
          const link =
            data?.url ||
            data?.tunnel ||
            (Array.isArray(data?.picker) && data.picker[0]?.url) ||
            null;
          if (link) return { url: link, filename: data.filename };
          lastErr = data?.status || "no download link returned";
        }
      }
    } catch (e) {
      lastErr = e.response?.status
        ? `HTTP ${e.response.status} ${JSON.stringify(e.response.data || "")}`
        : e.message;
      console.error(`Cobalt endpoint ${endpoint} failed:`, lastErr);
    }
  }
  throw new Error(`Cobalt instance error: ${lastErr}`);
}

module.exports = {
  // 🎨 Sticker Maker Command (Alias: s, sticker)
  s: async ({ sock, chatJid, mek }) => {
    try {
      await sock.sendMessage(chatJid, { text: "🎨 *Sticker Maker:* Downloading and processing your media..." }, { quoted: mek });
      let mediaMek = mek;
      let type = Object.keys(mek.message)[0];
      let inner = mek.message[type];
      while (
        inner?.ephemeralMessage ||
        inner?.viewOnceMessage ||
        inner?.viewOnceMessageV2 ||
        inner?.viewOnceMessageV2Extension ||
        type === "ephemeralMessage" ||
        type === "viewOnceMessage" ||
        type === "viewOnceMessageV2" ||
        type === "viewOnceMessageV2Extension"
      ) {
        const unwrapped =
          mek.message[type]?.message ||
          inner?.ephemeralMessage?.message ||
          inner?.viewOnceMessage?.message ||
          inner?.viewOnceMessageV2?.message ||
          inner?.viewOnceMessageV2Extension?.message;
        if (!unwrapped) break;
        mediaMek = { message: unwrapped };
        type = Object.keys(unwrapped)[0];
        inner = unwrapped[type];
      }
      if (mek.quoted) {
        mediaMek = { message: mek.quoted.message };
        type = mek.quoted.type;
      }
      const allowedTypes = ["imageMessage", "videoMessage"];
      if (!allowedTypes.includes(type)) {
        return sock.sendMessage(chatJid, { text: "❌ Please send or reply to an *Image* or *Video* to make a sticker!" }, { quoted: mek });
      }
      const buffer = await downloadMedia(mediaMek, type);
      if (!buffer) return sock.sendMessage(chatJid, { text: "❌ Failed to download media!" }, { quoted: mek });
      const sticker = new Sticker(buffer, {
        pack: config.botName || "Empire MD",
        author: config.ownerName || "BOT-WAN",
        type: StickerTypes.FULL,
        categories: ['🤩', '🎉'],
        id: '12345',
        quality: 70
      });
      const stickerBuffer = await sticker.toBuffer();
      await sock.sendMessage(chatJid, { sticker: stickerBuffer }, { quoted: mek });
    } catch (err) {
      console.error("Sticker error:", err);
      await sock.sendMessage(chatJid, { text: `❌ Sticker generation failed: ${err.message}` }, { quoted: mek });
    }
  },
  sticker: async (args) => module.exports.s(args),

  // 🎵 YouTube Song / MP3 Downloader (search by text OR url)
  play: async ({ sock, chatJid, mek, text }) => {
    if (!text) return sock.sendMessage(chatJid, { text: "❌ Provide song name or YouTube URL!" }, { quoted: mek });
    try {
      await sock.sendMessage(chatJid, { text: `🎵 *Searching/Downloading:* BOT-WAN is Searching for "${text}" ...` }, { quoted: mek });
      const url = await resolveYouTubeUrl(text);
      if (!url) return sock.sendMessage(chatJid, { text: "❌ Could not find any matching YouTube videos." }, { quoted: mek });
      const downloadData = await downloadWithCobalt(url, { downloadMode: "audio", audioFormat: "best" });
      const audioBuf = await fetchBuffer(downloadData.url, 60000);
      console.log("audio bytes:", audioBuf.length);
      await sock.sendMessage(chatJid, { text: "🎵 Sending audio file... BOT-WAN links will be attached." }, { quoted: mek });
      await sendAudioSafe(sock, chatJid, audioBuf, downloadData.filename || "audio", mek);
    } catch (err) {
      console.error("Play error:", err);
      await sock.sendMessage(chatJid, { text: `❌ Failed to play song: ${err.message}` }, { quoted: mek });
    }
  },

  // 🎬 Video Downloader (search by text OR url) — delivers MP4
  video: async ({ sock, chatJid, mek, text }) => {
    if (!text) return sock.sendMessage(chatJid, { text: "❌ Provide a video/movie name or YouTube URL! e.g. *.video lion king trailer*" }, { quoted: mek });
    try {
      await sock.sendMessage(chatJid, { text: `🎬 *Searching/Downloading:* BOT-WAN is Looking for "${text}" ...` }, { quoted: mek });
      const url = await resolveYouTubeUrl(text);
      if (!url) return sock.sendMessage(chatJid, { text: "❌ Could not find any matching videos." }, { quoted: mek });
      let downloadData;
      try {
        downloadData = await downloadWithCobalt(url, { videoQuality: "720" });
      } catch (_) {
        downloadData = await downloadWithCobalt(url, { videoQuality: "480" });
      }
      const videoBuf = await fetchBuffer(downloadData.url, 120000);
      await sock.sendMessage(chatJid, { text: "🎬 Sending video file... BOT-WAN links will be attached." }, { quoted: mek });
      await sendGroupMedia(sock, chatJid, { video: videoBuf }, downloadData.filename || `${text}.mp4`, mek);
    } catch (err) {
      console.error("Video error:", err);
      await sock.sendMessage(chatJid, { text: `❌ Failed to download video: ${err.message}` }, { quoted: mek });
    }
  },
  vid: async (args) => module.exports.video(args),

  ytmp3: async ({ sock, chatJid, mek, text }) => {
    if (!text) return sock.sendMessage(chatJid, { text: "❌ Provide YouTube link!" }, { quoted: mek });
    try {
      await sock.sendMessage(chatJid, { text: "📥 Downloading YouTube MP3..." }, { quoted: mek });
      const downloadData = await downloadWithCobalt(text, { downloadMode: "audio", audioFormat: "best" });
      const audioBuf = await fetchBuffer(downloadData.url, 60000);
      console.log("audio bytes:", audioBuf.length);
      await sendAudioSafe(sock, chatJid, audioBuf, downloadData.filename || "audio", mek);
    } catch (err) {
      await sock.sendMessage(chatJid, { text: `❌ Failed: ${err.message}` }, { quoted: mek });
    }
  },

  // 📥 YouTube MP4 Downloader (direct URL)
  ytmp4: async ({ sock, chatJid, mek, text }) => {
    if (!text) return sock.sendMessage(chatJid, { text: "❌ Provide YouTube link!" }, { quoted: mek });
    try {
      await sock.sendMessage(chatJid, { text: "📥 Downloading YouTube MP4..." }, { quoted: mek });
      const downloadData = await downloadWithCobalt(text, { videoQuality: "720" });
      const videoBuf = await fetchBuffer(downloadData.url, 120000);
      await sendGroupMedia(sock, chatJid, { video: videoBuf }, downloadData.filename || "video.mp4", mek);
    } catch (err) {
      await sock.sendMessage(chatJid, { text: `❌ Failed: ${err.message}` }, { quoted: mek });
    }
  },

  // 📸 Instagram Video Downloader
  insta: async ({ sock, chatJid, mek, text }) => {
    if (!text) return sock.sendMessage(chatJid, { text: "❌ Provide Instagram link!" }, { quoted: mek });
    try {
      await sock.sendMessage(chatJid, { text: "📥 Downloading Instagram Reel..." }, { quoted: mek });
      const downloadData = await downloadWithCobalt(text);
      const videoBuf = await fetchBuffer(downloadData.url, 60000);
      await sendGroupMedia(sock, chatJid, { video: videoBuf }, "Instagram Reel Downloaded", mek);
    } catch (err) {
      await sock.sendMessage(chatJid, { text: `❌ Failed: ${err.message}` }, { quoted: mek });
    }
  },
  ig: async (args) => module.exports.insta(args),

  // 🎵 TikTok Downloader
  tiktok: async ({ sock, chatJid, mek, text }) => {
    if (!text) return sock.sendMessage(chatJid, { text: "❌ Provide TikTok link!" }, { quoted: mek });
    try {
      await sock.sendMessage(chatJid, { text: "📥 BOT-WAN is Downloading TikTok Video..." }, { quoted: mek });
      const downloadData = await downloadWithCobalt(text);
      const videoBuf = await fetchBuffer(downloadData.url, 60000);
      await sendGroupMedia(sock, chatJid, { video: videoBuf }, "TikTok Downloaded Successfully", mek);
    } catch (err) {
      await sock.sendMessage(chatJid, { text: `❌ Failed: ${err.message}` }, { quoted: mek });
    }
  },
  tt: async (args) => module.exports.tiktok(args),

  // 📘 Facebook Downloader
  fb: async ({ sock, chatJid, mek, text }) => {
    if (!text) return sock.sendMessage(chatJid, { text: "❌ Provide Facebook video link!" }, { quoted: mek });
    try {
      await sock.sendMessage(chatJid, { text: "📥 Downloading Facebook Video..." }, { quoted: mek });
      const downloadData = await downloadWithCobalt(text);
      const videoBuf = await fetchBuffer(downloadData.url, 60000);
      await sendGroupMedia(sock, chatJid, { video: videoBuf }, "Facebook Video Downloaded", mek);
    } catch (err) {
      await sock.sendMessage(chatJid, { text: `❌ Failed: ${err.message}` }, { quoted: mek });
    }
  },
  fbdl: async (args) => module.exports.fb(args),

  // 🎭 Random Meme Generator
  meme: async ({ sock, chatJid, mek }) => {
    try {
      await sock.sendMessage(chatJid, { text: "⏳ Fetching a fresh meme..." }, { quoted: mek });
      const res = await axios.get("https://meme-api.com/gimme");
      const { title, url, postLink, subreddit } = res.data;
      const caption = `🎭 *${title}*
Subreddit: r/${subreddit}
Source: ${postLink}`;
      const imgRes = await axios.get(url, { responseType: 'arraybuffer' });
      await sendGroupMedia(sock, chatJid, { image: Buffer.from(imgRes.data) }, caption, mek);
    } catch (err) {
      console.error("Meme error:", err);
      await sock.sendMessage(chatJid, { text: "❌ Failed to fetch meme. Here is a joke instead: Why did the keyboard go to court? It lost its case! 😂" }, { quoted: mek });
    }
  }
};
