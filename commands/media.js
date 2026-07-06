const axios = require('axios');
const { tryEndpoints } = require('../lib/apiFallback');

function ytAudioEndpoints(url) {
  return [
    {
      url: "https://cobalt.clxxped.lol/api/json",
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      data: { url: url, downloadMode: "audio", audioFormat: "mp3", audioBitrate: "128" }
    },
    {
      url: "https://grapefruit.clxxped.lol/api/json",
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      data: { url: url, downloadMode: "audio", audioFormat: "mp3", audioBitrate: "128" }
    },
    {
      url: "https://api.vevioz.com/api/button/mp3?url=" + encodeURIComponent(url)
    }
  ];
}

function ytVideoEndpoints(url) {
  return [
    {
      url: "https://cobalt.clxxped.lol/api/json",
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      data: { url: url, downloadMode: "video", videoQuality: "720" }
    },
    {
      url: "https://grapefruit.clxxped.lol/api/json",
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      data: { url: url, downloadMode: "video", videoQuality: "720" }
    },
    {
      url: "https://api.vevioz.com/api/button/mp4?url=" + encodeURIComponent(url)
    }
  ];
}

function tiktokEndpoints(url) {
  return [
    {
      url: "https://cobalt.clxxped.lol/api/json",
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      data: { url: url }
    },
    { url: "https://tikwm.com/api/?url=" + encodeURIComponent(url) }
  ];
}

function igEndpoints(url) {
  return [
    {
      url: "https://cobalt.clxxped.lol/api/json",
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      data: { url: url }
    },
    { url: "https://api.vov-api.my.id/api/igdl?url=" + encodeURIComponent(url) }
  ];
}

function fbEndpoints(url) {
  return [
    {
      url: "https://cobalt.clxxped.lol/api/json",
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      data: { url: url }
    },
    { url: "https://api.fdownloader.net/v1/fbdl?url=" + encodeURIComponent(url) }
  ];
}

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.colbyland.xyz",
  "https://api.piped.yt"
];

async function searchYouTube(query) {
  if (query.startsWith("http://") || query.startsWith("https://")) return query;
  for (const base of PIPED_INSTANCES) {
    try {
      const res = await axios.get(base + "/search?q=" + encodeURIComponent(query) + "&filter=videos", { timeout: 10000 });
      const items = Array.isArray(res.data?.items) ? res.data.items : (Array.isArray(res.data) ? res.data : []);
      if (!items.length) continue;
      const first = items.find(i => i.url || i.videoId || i.id);
      if (!first) continue;
      let id = first.videoId || first.id || null;
      if (!id && first.url) {
        const parts = first.url.split("v=");
        if (parts.length > 1) id = parts[1].split("&")[0];
      }
      if (id) return "https://www.youtube.com/watch?v=" + id;
    } catch (_) {}
  }
  return null;
}

function extractDownloadUrl(data) {
  if (data?.url) return data.url;
  if (data?.data?.url) return data.data.url;
  if (data?.data?.play) return data.data.play;
  if (data?.data?.nowatermark) return data.data.nowatermark;
  if (data?.data?.hd) return data.data.hd;
  if (data?.data?.sd) return data.data.sd;
  if (data?.download_url) return data.download_url;
  return null;
}

function safeName(text) {
  return (text || "media").replace(/[^a-zA-Z0-9 _-]/g, "").trim().slice(0, 55) || "media";
}

module.exports = {
  play: async ({ sock, chatJid, mek, text }) => {
    if (!text) {
      return sock.sendMessage(chatJid, { text: "❌ Send a song name or YouTube link!\n*Usage:* .play Burna Boy Ye" }, { quoted: mek });
    }
    const videoUrl = await searchYouTube(text);
    if (!videoUrl) {
      return sock.sendMessage(chatJid, { text: "❌ No YouTube results found for that query." }, { quoted: mek });
    }
    await sock.sendMessage(chatJid, { text: "🎵 Found result — downloading as audio..." }, { quoted: mek });
    try {
      const audioUrl = await tryEndpoints(ytAudioEndpoints(videoUrl), { extract: extractDownloadUrl });
      await sock.sendMessage(chatJid, {
        audio: { url: audioUrl },
        mimetype: "audio/mpeg",
        ptt: false,
        fileName: safeName(text) + ".mp3"
      }, { quoted: mek });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: "❌ Audio download failed: " + e.message }, { quoted: mek });
    }
  },
  ytmp3: async (args) => module.exports.play(args),
  ytmp4: async ({ sock, chatJid, mek, text }) => {
    if (!text) {
      return sock.sendMessage(chatJid, { text: "❌ Please provide a YouTube link!\n*Usage:* .ytmp4 https://youtube.com/..." }, { quoted: mek });
    }
    await sock.sendMessage(chatJid, { text: "📥 Fetching YouTube MP4 video..." }, { quoted: mek });
    try {
      const videoUrl = await searchYouTube(text);
      if (!videoUrl) throw new Error("Could not resolve YouTube URL.");
      const dlUrl = await tryEndpoints(ytVideoEndpoints(videoUrl), { extract: extractDownloadUrl });
      await sock.sendMessage(chatJid, {
        video: { url: dlUrl },
        mimetype: "video/mp4",
        fileName: safeName(text) + ".mp4"
      }, { quoted: mek });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: "❌ Video download failed: " + e.message }, { quoted: mek });
    }
  },
  video: async (args) => module.exports.ytmp4(args),
  ig: async ({ sock, chatJid, mek, text }) => {
    if (!text) {
      return sock.sendMessage(chatJid, { text: "❌ Please provide an Instagram post/reel link!" }, { quoted: mek });
    }
    await sock.sendMessage(chatJid, { text: "📥 Downloading Instagram media..." }, { quoted: mek });
    try {
      const dlUrl = await tryEndpoints(igEndpoints(text), { extract: extractDownloadUrl });
      await sock.sendMessage(chatJid, { video: { url: dlUrl }, mimetype: "video/mp4" }, { quoted: mek });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: "❌ Instagram download failed: " + e.message }, { quoted: mek });
    }
  },
  insta: async (args) => module.exports.ig(args),
  tt: async ({ sock, chatJid, mek, text }) => {
    if (!text) {
      return sock.sendMessage(chatJid, { text: "❌ Please provide a TikTok link!" }, { quoted: mek });
    }
    await sock.sendMessage(chatJid, { text: "📥 Downloading TikTok (no watermark)..." }, { quoted: mek });
    try {
      const dlUrl = await tryEndpoints(tiktokEndpoints(text), { extract: extractDownloadUrl });
      await sock.sendMessage(chatJid, { video: { url: dlUrl }, mimetype: "video/mp4" }, { quoted: mek });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: "❌ TikTok download failed: " + e.message }, { quoted: mek });
    }
  },
  tiktok: async (args) => module.exports.tt(args),
  fb: async ({ sock, chatJid, mek, text }) => {
    if (!text) {
      return sock.sendMessage(chatJid, { text: "❌ Please provide a Facebook video link!" }, { quoted: mek });
    }
    await sock.sendMessage(chatJid, { text: "📥 Downloading Facebook HD video..." }, { quoted: mek });
    try {
      const dlUrl = await tryEndpoints(fbEndpoints(text), { extract: extractDownloadUrl });
      await sock.sendMessage(chatJid, { video: { url: dlUrl }, mimetype: "video/mp4" }, { quoted: mek });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: "❌ Facebook download failed: " + e.message }, { quoted: mek });
    }
  },
  fbdl: async (args) => module.exports.fb(args)
};
