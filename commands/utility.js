const config = require('../config');
const meta = require('./_meta');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Frame function
function frame(title, lines) {
    const top = "╭━━━〔 " + title + " 〕━━━╮";
    const body = lines.map(l => "┃ " + l).join("\n");
    const bottom = "╰━━━━━━━━━━━━━━━━━╯";
    return `${top}\n${body}\n${bottom}`;
}

module.exports = {
    // ... (keep your existing ping, info, help, list commands)

    ping: async ({ sock, chatJid, mek }) => { /* your ping code */ },
    p: async (args) => module.exports.ping(args),
    info: async ({ sock, chatJid, mek }) => { /* your info code */ },
    system: async (args) => module.exports.info(args),

    help: async ({ sock, chatJid, mek, senderName, prefix }) => { /* your help code */ },
    h: async (args) => module.exports.help(args),
    menu: async (args) => module.exports.help(args),

    list: async ({ sock, chatJid, mek, prefix }) => { /* your list code */ },

    // ────── NEW: PLAY MUSIC (Search + Send as Document) ──────
    play: async ({ sock, chatJid, mek, text }) => {
        if (!text) return sock.sendMessage(chatJid, { text: "❌ Provide song name!\nExample: .play faded" }, { quoted: mek });

        await sock.sendMessage(chatJid, { text: `🔍 Searching for *${text}*...` }, { quoted: mek });

        try {
            // Free public API (YTMate / Cobalt style fallback)
            const searchRes = await axios.get(`https://api.popcat.xyz/song?query=${encodeURIComponent(text)}`);
            const song = searchRes.data;

            if (!song || !song.url) throw new Error("Song not found");

            await sock.sendMessage(chatJid, { text: `⬇️ Downloading *${song.title}* by ${song.artist}...` }, { quoted: mek });

            const audioRes = await axios.get(song.url, { responseType: 'arraybuffer' });
            const filename = `${song.title.replace(/[^a-zA-Z0-9]/g, '_')}.mp3`;

            await sock.sendMessage(chatJid, {
                document: Buffer.from(audioRes.data),
                mimetype: 'audio/mpeg',
                fileName: filename,
                caption: `🎵 *${song.title}*\n👤 ${song.artist}\n\nDownloaded via Empire MD`
            }, { quoted: mek });

        } catch (err) {
            console.error(err);
            await sock.sendMessage(chatJid, { 
                text: "❌ Could not find or download the song. Try a more specific name." 
            }, { quoted: mek });
        }
    },

    // ────── .pp → Get Profile Picture ──────
    pp: async ({ sock, chatJid, mek }) => {
        try {
            let target = mek.message?.extendedTextMessage?.contextInfo?.participant || mek.key.participant || chatJid;
            if (!target) target = chatJid;

            const ppUrl = await sock.profilePictureUrl(target, 'image');
            await sock.sendMessage(chatJid, { image: { url: ppUrl }, caption: "📸 Profile Picture" }, { quoted: mek });
        } catch (e) {
            await sock.sendMessage(chatJid, { text: "❌ Could not fetch profile picture." }, { quoted: mek });
        }
    },

    // ────── .vv → View Once (Collect View-Once Media) ──────
    vv: async ({ sock, chatJid, mek }) => {
        const quoted = mek.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted) return sock.sendMessage(chatJid, { text: "❌ Reply to a view-once message!" }, { quoted: mek });

        try {
            const type = Object.keys(quoted)[0];
            if (type === 'imageMessage' || type === 'videoMessage') {
                const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
                const stream = await downloadContentFromMessage(quoted[type], type === 'imageMessage' ? 'image' : 'video');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

                if (type === 'imageMessage') {
                    await sock.sendMessage(chatJid, { image: buffer, caption: "✅ View Once Image Saved" }, { quoted: mek });
                } else {
                    await sock.sendMessage(chatJid, { video: buffer, caption: "✅ View Once Video Saved" }, { quoted: mek });
                }
            } else {
                await sock.sendMessage(chatJid, { text: "❌ Only images and videos supported." }, { quoted: mek });
            }
        } catch (err) {
            await sock.sendMessage(chatJid, { text: "❌ Failed to collect view once." }, { quoted: mek });
        }
    }
};
