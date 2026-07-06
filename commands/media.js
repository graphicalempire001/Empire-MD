const axios = require('axios');
const fs = require('fs');
const path = require('fs');

// Public search instances for YouTube/Piped
const SEARCH_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.colbyland.xyz",
  "https://pipedapi.us.to",
  "https://api.piped.yt",
  "https://piped-api.garudalinux.org"
];

async function searchYouTube(query) {
  if (query.startsWith("http://") || query.startsWith("https://")) return query;

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
        if (first.url.includes("watch?v=")) {
          id = first.url.split("watch?v=")[1].split("&")[0];
        } else if (first.url.includes("embed/")) {
          id = first.url.split("embed/")[1].split("?")[0];
        } else if (first.url.includes("youtu.be/")) {
          id = first.url.split("youtu.be/")[1].split("?")[0];
        } else {
          const match = first.url.match(/([a-zA-Z0-9_-]{11})/);
          id = match ? match[1] : null;
        }
      }
      if (id) return `https://www.youtube.com/watch?v=${id}`;
    } catch (e) {
      console.error(`Search instance ${base} failed:`, e.message);
    }
  }
  return null;
}

const COBALT_ENDPOINTS = [
  process.env.COBALT_API,
  "https://cobalt-api.kwiatekmiki.com",
  "https://co.eepy.today",
  "https://cobaltapi.squair.xyz"
].filter(Boolean);

async function downloadWithCobalt(url, options = {}) {
  let lastErr = null;
  for (const endpoint of COBALT_ENDPOINTS) {
    try {
      const res = await axios.post(endpoint, { url, ...options }, {
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        timeout: 20000
      });
      if (res.data && (res.data.url || res.data.picker)) {
        return res.data;
      }
    } catch (e) {
      lastErr = e.message;
    }
  }
  throw new Error(lastErr || "All Cobalt endpoints failed.");
}

module.exports = {
  play: async ({ sock, chatJid, mek, text, isOwner }) => {
    if (!text) return sock.sendMessage(chatJid, { text: "❌ Please provide a song name or YouTube link!" }, { quoted: mek });
    const videoUrl = await searchYouTube(text);
    if (!videoUrl) return sock.sendMessage(chatJid, { text: "❌ No results found on YouTube." }, { quoted: mek });

    await sock.sendMessage(chatJid, { text: "📥 Fetching audio... Please wait." }, { quoted: mek });

    try {
      const data = await downloadWithCobalt(videoUrl, { downloadMode: "audio", audioFormat: "mp3" });
      if (data.url) {
        await sock.sendMessage(chatJid, {
          audio: { url: data.url },
          mimetype: "audio/mpeg",
          ptt: false,
          fileName: `${text}.mp3`
        }, { quoted: mek });
      } else {
        throw new Error("Invalid response structure from Cobalt");
      }
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Failed to download: ${e.message}` }, { quoted: mek });
    }
  },

  ytmp3: async ({ sock, chatJid, mek, text }) => {
    if (!text) return sock.sendMessage(chatJid, { text: "❌ Please provide a YouTube link!" }, { quoted: mek });
    await sock.sendMessage(chatJid, { text: "📥 Fetching MP3... Please wait." }, { quoted: mek });
    try {
      const data = await downloadWithCobalt(text, { downloadMode: "audio", audioFormat: "mp3" });
      if (data.url) {
        await sock.sendMessage(chatJid, {
          audio: { url: data.url },
          mimetype: "audio/mpeg",
          ptt: false
        }, { quoted: mek });
      } else {
        throw new Error("No download URL returned.");
      }
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Failed: ${e.message}` }, { quoted: mek });
    }
  },

  ytmp4: async ({ sock, chatJid, mek, text }) => {
    if (!text) return sock.sendMessage(chatJid, { text: "❌ Please provide a YouTube link!" }, { quoted: mek });
    await sock.sendMessage(chatJid, { text: "📥 Fetching MP4... Please wait." }, { quoted: mek });
    try {
      const data = await downloadWithCobalt(text, { videoQuality: "720" });
      if (data.url) {
        await sock.sendMessage(chatJid, {
          video: { url: data.url },
          mimetype: "video/mp4"
        }, { quoted: mek });
      } else {
        throw new Error("No download URL returned.");
      }
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Failed: ${e.message}` }, { quoted: mek });
    }
  },

  video: async (args) => {
    return module.exports.ytmp4(args);
  },

  ig: async ({ sock, chatJid, mek, text }) => {
    if (!text) return sock.sendMessage(chatJid, { text: "❌ Please provide an Instagram link!" }, { quoted: mek });
    await sock.sendMessage(chatJid, { text: "📥 Fetching Instagram post/reel... Please wait." }, { quoted: mek });
    try {
      const data = await downloadWithCobalt(text);
      if (data.url) {
        await sock.sendMessage(chatJid, {
          video: { url: data.url },
          mimetype: "video/mp4"
        }, { quoted: mek });
      } else {
        throw new Error("No download URL returned.");
      }
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Failed: ${e.message}` }, { quoted: mek });
    }
  },

  insta: async (args) => {
    return module.exports.ig(args);
  },

  tt: async ({ sock, chatJid, mek, text }) => {
    if (!text) return sock.sendMessage(chatJid, { text: "❌ Please provide a TikTok link!" }, { quoted: mek });
    await sock.sendMessage(chatJid, { text: "📥 Fetching TikTok... Please wait." }, { quoted: mek });
    try {
      const data = await downloadWithCobalt(text);
      if (data.url) {
        await sock.sendMessage(chatJid, {
          video: { url: data.url },
          mimetype: "video/mp4"
        }, { quoted: mek });
      } else {
        throw new Error("No download URL returned.");
      }
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Failed: ${e.message}` }, { quoted: mek });
    }
  },

  tiktok: async (args) => {
    return module.exports.tt(args);
  },

  fb: async ({ sock, chatJid, mek, text }) => {
    if (!text) return sock.sendMessage(chatJid, { text: "❌ Please provide a Facebook video link!" }, { quoted: mek });
    await sock.sendMessage(chatJid, { text: "📥 Fetching Facebook video... Please wait." }, { quoted: mek });
    try {
      const data = await downloadWithCobalt(text);
      if (data.url) {
        await sock.sendMessage(chatJid, {
          video: { url: data.url },
          mimetype: "video/mp4"
        }, { quoted: mek });
      } else {
        throw new Error("No download URL returned.");
      }
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Failed: ${e.message}` }, { quoted: mek });
    }
  },

  fbdl: async (args) => {
    return module.exports.fb(args);
  }
};
