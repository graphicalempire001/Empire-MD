const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const config = require('../config');

// Helper to download media message
async function downloadMedia(mek, type) {
    const message = mek.message[type];
    if (!message) return null;
    const stream = await downloadContentFromMessage(message, type.replace('Message', ''));
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
}

// Helper to send media with "leads to channel" button/link
async function sendGroupMedia(sock, chatJid, mediaObj, caption = "", mek = null) {
    const isGroup = chatJid.endsWith('@g.us');
    const channelUrl = config.channelUrl || "https://whatsapp.com/channel/0029VajW7P829759S4vJkM3e";
    
    // Format caption with interactive "button" leading to channel
    const formattedCaption = isGroup 
        ? `${caption}

━━━━━━━━━━━━━━━━━━━━
📢 *Join Our Official Channel:*
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
    // 🎨 Sticker Maker Command (Alias: s, sticker) - USES WA-STICKER-FORMATTER NPM LIBRARY
    s: async ({ sock, chatJid, mek }) => {
        try {
            await sock.sendMessage(chatJid, { text: "🎨 *Sticker Maker:* Downloading and processing your media..." }, { quoted: mek });
            
            const quotedMsg = mek.message.extendedTextMessage?.contextInfo?.quotedMessage;
            let mediaMek = mek;
            let type = Object.keys(mek.message)[0];
            
            if (quotedMsg) {
                type = Object.keys(quotedMsg)[0];
                mediaMek = { message: quotedMsg };
            }

            if (type !== 'imageMessage' && type !== 'videoMessage') {
                return sock.sendMessage(chatJid, { text: "❌ Please reply to an *Image* or *Video* to make a sticker!" }, { quoted: mek });
            }

            const buffer = await downloadMedia(mediaMek, type);
            if (!buffer) return sock.sendMessage(chatJid, { text: "❌ Failed to download media!" }, { quoted: mek });

            const sticker = new Sticker(buffer, {
                pack: config.botName || "Empire MD",
                author: config.ownerName || "Empire Owner",
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

    // 🎵 YouTube Song / MP3 Downloader (Alias: play, ytmp3) - USES KEYLESS COBALT/DUCKDUCKGO SEARCH APIS
    play: async ({ sock, chatJid, mek, text }) => {
        if (!text) return sock.sendMessage(chatJid, { text: "❌ Provide song name or YouTube URL!" }, { quoted: mek });
        try {
            await sock.sendMessage(chatJid, { text: `🎵 *Searching/Downloading:* Searching for "${text}" via keyless API...` }, { quoted: mek });
            
            let url = text;
            if (!text.startsWith("http")) {
                const searchRes = await axios.get(`https://html.duckduckgo.com/html/?q=site:youtube.com+${encodeURIComponent(text)}`);
                const html = searchRes.data;
                const match = html.match(//watch\?v=[a-zA-Z0-9_-]+/);
                if (!match) {
                    return sock.sendMessage(chatJid, { text: "❌ Could not find any matching YouTube videos." }, { quoted: mek });
                }
                url = `https://www.youtube.com` + match[0];
            }

            const downloadData = await downloadWithCobalt(url, { downloadMode: "audio" });
            const mediaBufferRes = await axios.get(downloadData.url, { responseType: 'arraybuffer' });
            
            await sock.sendMessage(chatJid, { text: "🎵 Sending audio file... channel links will be attached if sent in a group." }, { quoted: mek });
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

    // 📥 YouTube MP4 Downloader (Alias: ytmp4, video) - USES KEYLESS COBALT API
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

    // 📸 Instagram Video Downloader (Alias: insta, ig) - USES KEYLESS COBALT API
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

    // 🎵 TikTok Downloader (Alias: tiktok, tt) - USES KEYLESS COBALT API
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

    // 📘 Facebook Downloader (Alias: fb, fbdl) - USES KEYLESS COBALT API
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

    // 🎭 Random Meme Generator (Alias: meme) - USES MEME-API.COM (KEYLESS PUBLIC SERVICE)
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
    },

    // 🤪 Random Joke API (Alias: joke) - USES OFFICIAL-JOKE-API.APPSPOT.COM (KEYLESS PUBLIC SERVICE)
    joke: async ({ sock, chatJid, mek }) => {
        try {
            const res = await axios.get("https://official-joke-api.appspot.com/random_joke");
            const { setup, punchline } = res.data;
            await sock.sendMessage(chatJid, { text: `🤪 *Joke Time!* 🤪

*Q:* ${setup}

*A:* _${punchline}_` }, { quoted: mek });
        } catch (err) {
            await sock.sendMessage(chatJid, { text: "❌ Failed to load joke. Why did the computer show up at work? To get a byte to eat! 😂" }, { quoted: mek });
        }
    },

    // 🧠 Random Fact API (Alias: fact) - USES USELESSFACTS.JSPH.PL (KEYLESS PUBLIC SERVICE)
    fact: async ({ sock, chatJid, mek }) => {
        try {
            const res = await axios.get("https://uselessfacts.jsph.pl/api/v2/facts/random");
            const factText = res.data.text;
            await sock.sendMessage(chatJid, { text: `🧠 *Did You Know?* 🧠

${factText}` }, { quoted: mek });
        } catch (err) {
            await sock.sendMessage(chatJid, { text: "❌ Failed to fetch fact. Honey never spoils. You can theoretically eat 3,000-year-old honey!" }, { quoted: mek });
        }
    },

    // 🎵 Lyrics Search API (Alias: lyrics) - USES LYRIST VERCEL API (KEYLESS PUBLIC SERVICE)
    lyrics: async ({ sock, chatJid, mek, text }) => {
        if (!text) return sock.sendMessage(chatJid, { text: "❌ Provide song name!" }, { quoted: mek });
        try {
            await sock.sendMessage(chatJid, { text: `🔍 Searching lyrics for: *${text}* ...` }, { quoted: mek });
            const searchRes = await axios.get(`https://lyrist.vercel.app/api/${encodeURIComponent(text)}`);
            const data = searchRes.data;
            if (data && data.lyrics) {
                const messageText = `🎵 *Lyrics: ${data.title || text}*
✍️ *Artist:* ${data.artist || 'Unknown'}

${data.lyrics}`;
                await sock.sendMessage(chatJid, { text: messageText }, { quoted: mek });
            } else {
                await sock.sendMessage(chatJid, { text: `❌ No lyrics found for *${text}*.` }, { quoted: mek });
            }
        } catch (err) {
            await sock.sendMessage(chatJid, { text: `❌ Failed to load lyrics: ${err.message}` }, { quoted: mek });
        }
    }
};