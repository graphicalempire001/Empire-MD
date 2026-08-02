const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
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

// Helper to send media with channel card (no raw URL spam) + verified badge
async function sendGroupMedia(sock, chatJid, mediaObj, caption = "", mek = null) {
  const isGroup = chatJid.endsWith('@g.us');
  let contextInfo = undefined;
  let formattedCaption = caption || '';
  if (isGroup) {
    try {
      const { buildChannelCard, resolveBotName, verifiedFooter } = require('../lib/channelCard');
      const botName = resolveBotName(sock, sock.botSettings);
      contextInfo = await buildChannelCard(sock, sock.botSettings, {
        title: `✅ ${botName} · Official Channel`,
        body: 'Tap to view channel'
      });
      formattedCaption = (caption || '') + verifiedFooter(botName);
    } catch (e) {
      console.error('channel card media:', e.message);
    }
  }
  const opts = { quoted: mek };
  if (mediaObj.video) {
    return sock.sendMessage(chatJid, {
      video: mediaObj.video,
      caption: formattedCaption,
      mimetype: 'video/mp4',
      ...(contextInfo ? { contextInfo } : {})
    }, opts);
  } else if (mediaObj.audio) {
    return sock.sendMessage(chatJid, {
      audio: mediaObj.audio,
      mimetype: 'audio/mp4',
      ptt: mediaObj.ptt || false,
      ...(contextInfo ? { contextInfo } : {})
    }, opts);
  } else if (mediaObj.image) {
    return sock.sendMessage(chatJid, {
      image: mediaObj.image,
      caption: formattedCaption,
      ...(contextInfo ? { contextInfo } : {})
    }, opts);
  }
}

// Resolve free-text into a YouTube watch URL (shared helper)
async function resolveYouTubeUrl(query) {
  if (query.startsWith("http")) return query;
  const searchRes = await axios.get(
    `https://html.duckduckgo.com/html/?q=site:youtube.com+${encodeURIComponent(query)}`,
    { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 15000 }
  );
  const match = searchRes.data.match(/\/watch\?v=[a-zA-Z0-9_-]+/);
  if (!match) return null;
  return `https://www.youtube.com` + match[0];
}

// List of working Cobalt API endpoints (failover array) — used for IG / TikTok / FB
const COBALT_ENDPOINTS = [
  "https://melon.clxxped.lol",
  "https://api.cobalt.blackcat.sweeux.org",
  "https://apicobalt.mgytr.top",
  "https://cobaltapi.squair.xyz"
];

async function downloadWithCobalt(url, options = {}) {
  for (const endpoint of COBALT_ENDPOINTS) {
    try {
      const res = await axios.post(endpoint, {
        url: url,
        ...options
      }, {
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        timeout: 15000
      });
      if (res.data && res.data.url) {
        return res.data;
      }
    } catch (e) {
      console.error(`Cobalt endpoint ${endpoint} failed:`, e.message);
    }
  }
  throw new Error("All public media download API servers are currently busy or offline. Please try again later.");
}

module.exports = {
  // 🎨 Sticker Maker Command (Alias: s, sticker)
  s: async ({ sock, chatJid, mek }) => {
    try {
      await sock.sendMessage(chatJid, { text: "..." }, { quoted: mek });
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

  // 🎵 Play — clean: just the audio file + one description, no status chatter
  play: async ({ sock, chatJid, mek, text }) => {
    if (!text) return sock.sendMessage(chatJid, { text: "❌ Provide song name or YouTube URL!" }, { quoted: mek });
    const yt = require('@vreden/youtube_scraper');
    try {
      let url = text;
      if (!text.startsWith("http")) {
        const search = await yt.search(text);
        const video = search?.results?.find(v => v.type === 'video') || search?.results?.[0];
        if (!video || !video.url) return sock.sendMessage(chatJid, { text: "❌ Could not find any matching YouTube videos." }, { quoted: mek });
        url = video.url;
      }
      const dl = await yt.ytmp3(url, 128);
      if (!dl?.status || !dl?.download?.url) {
        return sock.sendMessage(chatJid, { text: "❌ Failed to fetch the audio. Try again in a moment." }, { quoted: mek });
      }
      const meta = dl.metadata || {};
      const title = meta.title || text;
      const fileName = dl.download.filename || `${title}.mp3`;
      const buf = await axios.get(dl.download.url, { responseType: 'arraybuffer', timeout: 60000 });
      // 1) The audio file
      await sock.sendMessage(chatJid, {
        audio: Buffer.from(buf.data),
        mimetype: 'audio/mpeg',
        fileName: fileName,
        ptt: false
      }, { quoted: mek });
      // 2) One description, right after the audio
      await sock.sendMessage(chatJid, {
        text: `🎵 *${title}*
${meta.author?.name ? `👤 ${meta.author.name}
` : ""}⏱️ ${meta.timestamp || "N/A"} • 🎚️ ${dl.download.quality || "128kbps"}
📁 ${fileName}
_Powered by ${config.botName}_`
      }, { quoted: mek });
    } catch (err) {
      console.error("Play error:", err);
      await sock.sendMessage(chatJid, { text: `❌ Failed to play song: ${err.message}` }, { quoted: mek });
    }
  },

  // 📥 YouTube MP3 Downloader (direct URL) — via scraper, direct audio
  ytmp3: async ({ sock, chatJid, mek, text }) => {
    if (!text) return sock.sendMessage(chatJid, { text: "❌ Provide YouTube link!" }, { quoted: mek });
    const yt = require('@vreden/youtube_scraper');
    try {
      const dl = await yt.ytmp3(text, 128);
      if (!dl?.status || !dl?.download?.url) {
        return sock.sendMessage(chatJid, { text: "❌ Failed to fetch the audio. Try again in a moment." }, { quoted: mek });
      }
      const meta = dl.metadata || {};
      const fileName = dl.download.filename || `${meta.title || "audio"}.mp3`;
      const buf = await axios.get(dl.download.url, { responseType: 'arraybuffer', timeout: 60000 });
      await sock.sendMessage(chatJid, {
        audio: Buffer.from(buf.data),
        mimetype: 'audio/mpeg',
        fileName: fileName,
        ptt: false
      }, { quoted: mek });
    } catch (err) {
      await sock.sendMessage(chatJid, { text: `❌ Failed: ${err.message}` }, { quoted: mek });
    }
  },

  // 📥 YouTube MP4 Downloader (direct URL) — via scraper
  ytmp4: async ({ sock, chatJid, mek, text }) => {
    if (!text) return sock.sendMessage(chatJid, { text: "❌ Provide YouTube link!" }, { quoted: mek });
    const yt = require('@vreden/youtube_scraper');
    try {
      const dl = await yt.ytmp4(text, 720);
      if (!dl?.status || !dl?.download?.url) {
        return sock.sendMessage(chatJid, { text: "❌ Failed to fetch the video. Try again in a moment." }, { quoted: mek });
      }
      const meta = dl.metadata || {};
      const fileName = dl.download.filename || `${meta.title || "video"}.mp4`;
      const buf = await axios.get(dl.download.url, { responseType: 'arraybuffer', timeout: 120000 });
      await sendGroupMedia(sock, chatJid, { video: Buffer.from(buf.data) }, meta.title || fileName, mek);
    } catch (err) {
      await sock.sendMessage(chatJid, { text: `❌ Failed: ${err.message}` }, { quoted: mek });
    }
  },
  video: async (args) => module.exports.ytmp4(args),

  // 📸 Instagram Video Downloader (Cobalt)
  insta: async ({ sock, chatJid, mek, text }) => {
    if (!text) return sock.sendMessage(chatJid, { text: "❌ Provide Instagram link!" }, { quoted: mek });
    try {
      await sock.sendMessage(chatJid, { text: "📥 Downloading Instagram Reel..." }, { quoted: mek });
      const downloadData = await downloadWithCobalt(text);
      const mediaBufferRes = await axios.get(downloadData.url, { responseType: 'arraybuffer' });
      await sendGroupMedia(sock, chatJid, { video: Buffer.from(mediaBufferRes.data) }, "Instagram Reel Downloaded", mek);
    } catch (err) {
      await sock.sendMessage(chatJid, { text: `❌ Failed: ${err.message}` }, { quoted: mek });
    }
  },
  ig: async (args) => module.exports.insta(args),

  // 🎵 TikTok Downloader (Cobalt)
  tiktok: async ({ sock, chatJid, mek, text }) => {
    if (!text) return sock.sendMessage(chatJid, { text: "❌ Provide TikTok link!" }, { quoted: mek });
    try {
      await sock.sendMessage(chatJid, { text: "📥 BOT-WAN is Downloading TikTok Video..." }, { quoted: mek });
      const downloadData = await downloadWithCobalt(text);
      const mediaBufferRes = await axios.get(downloadData.url, { responseType: 'arraybuffer' });
      await sendGroupMedia(sock, chatJid, { video: Buffer.from(mediaBufferRes.data) }, "TikTok Downloaded Successfully", mek);
    } catch (err) {
      await sock.sendMessage(chatJid, { text: `❌ Failed: ${err.message}` }, { quoted: mek });
    }
  },
  tt: async (args) => module.exports.tiktok(args),

  // 📘 Facebook Downloader (Cobalt)
  fb: async ({ sock, chatJid, mek, text }) => {
    if (!text) return sock.sendMessage(chatJid, { text: "❌ Provide Facebook video link!" }, { quoted: mek });
    try {
      await sock.sendMessage(chatJid, { text: "📥 Downloading Facebook Video..." }, { quoted: mek });
      const downloadData = await downloadWithCobalt(text);
      const mediaBufferRes = await axios.get(downloadData.url, { responseType: 'arraybuffer' });
      await sendGroupMedia(sock, chatJid, { video: Buffer.from(mediaBufferRes.data) }, "Facebook Video Downloaded", mek);
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
