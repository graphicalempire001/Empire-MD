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

// Helper to send media with "leads to channel" button/link
async function sendGroupMedia(sock, chatJid, mediaObj, caption = "", mek = null) {
    const isGroup = chatJid.endsWith('@g.us');
    const channelUrl = config.channelUrl || "https://whatsapp.com/channel/0029VaI3OXiF6smuq5LxxN15";
    
    // Format caption with interactive "button" leading to channel
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
            mimetype: 'audio/mp4',
            ptt: mediaObj.ptt || false
        }, { quoted: mek });
    } else if (mediaObj.image) {
        return sock.sendMessage(chatJid, {
            image: mediaObj.image,
            caption: formattedCaption
        }, { quoted: mek });
    }
}

// List of working Cobalt API endpoints (failover array)
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
            await sock.sendMessage(chatJid, { text: "🎨 *Sticker Maker:* Downloading and processing your media..." }, { quoted: mek });
            
          // Use the universal parser from msgHandler
let mediaMek = mek;
let type = Object.keys(mek.message)[0];

if (type === "ephemeralMessage") {
    type = Object.keys(mek.message.ephemeralMessage.message)[0];
    mediaMek = {
        message: mek.message.ephemeralMessage.message
    };
}
// If replying, use the replied media.
if (mek.quoted) {
    mediaMek = {
        message: mek.quoted.message
    };

    type = mek.quoted.type;
}
            const allowedTypes = [
    "imageMessage",
    "videoMessage"
];

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

    // 🎵 YouTube Song / MP3 Downloader
    play: async ({ sock, chatJid, mek, text }) => {
        if (!text) return sock.sendMessage(chatJid, { text: "❌ Provide song name or YouTube URL!" }, { quoted: mek });
        try {
            await sock.sendMessage(chatJid, { text: `🎵 *Searching/Downloading:* Searching for "${text}" via keyless API...` }, { quoted: mek });
            
            let url = text;
            if (!text.startsWith("http")) {
                const searchRes = await axios.get(`https://html.duckduckgo.com/html/?q=site:youtube.com+${encodeURIComponent(text)}`);
                const html = searchRes.data;
             const match = html.match(/\/watch\?v=[a-zA-Z0-9_-]+/);
                if (!match) {
                    return sock.sendMessage(chatJid, { text: "❌ Could not find any matching YouTube videos." }, { quoted: mek });
                }
                url = `https://www.youtube.com` + match[0];
            }

            const downloadData = await downloadWithCobalt(url, { downloadMode: "audio" });
            const mediaBufferRes = await axios.get(downloadData.url, { responseType: 'arraybuffer' });
            
            await sock.sendMessage(chatJid, { text: "🎵 Sending audio file... BOT-WAN links will be attached." }, { quoted: mek });
            await sendGroupMedia(sock, chatJid, { audio: Buffer.from(mediaBufferRes.data) }, downloadData.filename || "audio.mp3", mek);
        } catch (err) {
            console.error("Play error:", err);
            await sock.sendMessage(chatJid, { text: `❌ Failed to play song: ${err.message}` }, { quoted: mek });
        }
    },

    ytmp3: async ({ sock, chatJid, mek, text }) => {
        if (!text) return sock.sendMessage(chatJid, { text: "❌ Provide YouTube link!" }, { quoted: mek });
        try {
            await sock.sendMessage(chatJid, { text: "📥 Downloading YouTube MP3..." }, { quoted: mek });
            const downloadData = await downloadWithCobalt(text, { downloadMode: "audio" });
            const mediaBufferRes = await axios.get(downloadData.url, { responseType: 'arraybuffer' });
            await sendGroupMedia(sock, chatJid, { audio: Buffer.from(mediaBufferRes.data) }, downloadData.filename || "audio.mp3", mek);
        } catch (err) {
            await sock.sendMessage(chatJid, { text: `❌ Failed: ${err.message}` }, { quoted: mek });
        }
    },

    // 📥 YouTube MP4 Downloader
    ytmp4: async ({ sock, chatJid, mek, text }) => {
        if (!text) return sock.sendMessage(chatJid, { text: "❌ Provide YouTube link!" }, { quoted: mek });
        try {
            await sock.sendMessage(chatJid, { text: "📥 Downloading YouTube MP4..." }, { quoted: mek });
            const downloadData = await downloadWithCobalt(text, { videoQuality: "720" });
            const mediaBufferRes = await axios.get(downloadData.url, { responseType: 'arraybuffer' });
            await sendGroupMedia(sock, chatJid, { video: Buffer.from(mediaBufferRes.data) }, downloadData.filename || "video.mp4", mek);
        } catch (err) {
            await sock.sendMessage(chatJid, { text: `❌ Failed: ${err.message}` }, { quoted: mek });
        }
    },
    video: async (args) => module.exports.ytmp4(args),

    // 📸 Instagram Video Downloader
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

    // 🎵 TikTok Downloader
    tiktok: async ({ sock, chatJid, mek, text }) => {
        if (!text) return sock.sendMessage(chatJid, { text: "❌ Provide TikTok link!" }, { quoted: mek });
        try {
            await sock.sendMessage(chatJid, { text: "📥 Downloading TikTok Video without Watermark..." }, { quoted: mek });
            const downloadData = await downloadWithCobalt(text);
            const mediaBufferRes = await axios.get(downloadData.url, { responseType: 'arraybuffer' });
            await sendGroupMedia(sock, chatJid, { video: Buffer.from(mediaBufferRes.data) }, "TikTok Downloaded Successfully", mek);
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
