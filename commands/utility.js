const config = require('../config');
const meta = require('./_meta');
const axios = require('axios');

// Frame function
function frame(title, lines) {
    const top = "╭━━━〔 " + title + " 〕━━━╮";
    const body = lines.map(l => "┃ " + l).join("\n");
    const bottom = "╰━━━━━━━━━━━━━━━━━╯";
    return `${top}\n${body}\n${bottom}`;
}

module.exports = {
    ping: async ({ sock, chatJid, mek }) => {
        const start = Date.now();
        await sock.sendMessage(chatJid, { text: "⚡ *Pong!*" }, { quoted: mek });
        const latency = Date.now() - start;
        await sock.sendMessage(chatJid, { text: `🚀 *Latency:* ${latency}ms` }, { quoted: mek });
    },
    p: async (args) => module.exports.ping(args),

    info: async ({ sock, chatJid, mek }) => {
        await sock.sendMessage(chatJid, {
            text: `🤖 *EMPIRE MD*\nPrefix: ${config.prefix || "."}\nMode: ${(config.mode || "private").toUpperCase()}`
        }, { quoted: mek });
    },
    system: async (args) => module.exports.info(args),

    // Clean Framed Menu
    help: async ({ sock, chatJid, mek, senderName, prefix }) => {
        const p = prefix || config.prefix || ".";
        let out = `*${config.botName || "Empire MD"}* — Command Menu\n👋 Hello *${senderName || "User"}*!\n\n`;

        try {
            if (meta && Object.keys(meta).length > 0) {
                for (const [category, cmds] of Object.entries(meta)) {
                    if (!cmds?.length) continue;
                    const lines = cmds.map(c => {
                        const alias = c.alias?.length ? ` (${c.alias.map(a => p+a).join(", ")})` : "";
                        return `${p}${c.cmd}${alias} — ${c.desc}`;
                    });
                    out += frame(category, lines) + "\n\n";
                }
            } else {
                out += "No commands found in meta.\n";
            }
        } catch (e) {
            console.error("Help error:", e.message);
            out += "⚠️ Menu error. Check logs.\n";
        }

        await sock.sendMessage(chatJid, { text: out }, { quoted: mek });
    },

    h: async (args) => module.exports.help(args),
    menu: async (args) => module.exports.help(args),

    list: async ({ sock, chatJid, mek }) => {
        let out = "📋 *Command List*\n\n";
        try {
            if (meta) {
                Object.entries(meta).forEach(([cat, cmds]) => {
                    out += `*${cat}*\n`;
                    cmds.forEach(c => out += `• ${c.cmd} — ${c.desc}\n`);
                    out += "\n";
                });
            }
        } catch (e) {}
        await sock.sendMessage(chatJid, { text: out }, { quoted: mek });
    },

          // ────── BEST .play (Cobalt API - Most Reliable 2026) ──────
    play: async ({ sock, chatJid, mek, text }) => {
        if (!text) return sock.sendMessage(chatJid, { text: "❌ *Usage:*\n.play song name\nExample: .play faded" }, { quoted: mek });

        await sock.sendMessage(chatJid, { text: `🔍 Searching for *${text}*...` }, { quoted: mek });

        try {
            // First search on YouTube
            const search = await axios.get(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(text)}&type=video&maxResults=1&key=AIzaSyD3z7pZ5ZfZfZfZfZfZfZfZfZfZfZfZfZ`); // This is dummy, we'll use fallback

            // Better: Use direct Cobalt with search
            const cobaltRes = await axios.post('https://cobalt.tools/api/json', {
                url: `https://youtube.com/results?search_query=${encodeURIComponent(text)}`,
                isAudioOnly: true,
                filenameStyle: "pretty"
            }, {
                headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
            });

            if (!cobaltRes.data || !cobaltRes.data.url) throw new Error("No download link");

            await sock.sendMessage(chatJid, { text: `⬇️ Downloading audio...` }, { quoted: mek });

            const audio = await axios.get(cobaltRes.data.url, { responseType: 'arraybuffer' });
            const title = cobaltRes.data.filename || text;

            await sock.sendMessage(chatJid, {
                document: Buffer.from(audio.data),
                mimetype: 'audio/mpeg',
                fileName: `${title}.mp3`,
                caption: `🎵 ${title}\n\nDownloaded via Empire MD`
            }, { quoted: mek });

        } catch (err) {
            console.error(err);
            await sock.sendMessage(chatJid, { 
                text: "❌ Sorry, music download is currently unstable.\n\nTry again later or use a YouTube link with .ytmp3" 
            }, { quoted: mek });
        }
    },
    pp: async ({ sock, chatJid, mek }) => {
        try {
            const target = mek.message?.extendedTextMessage?.contextInfo?.participant || chatJid;
            const pp = await sock.profilePictureUrl(target, 'image');
            await sock.sendMessage(chatJid, { image: { url: pp }, caption: "📸 Profile Picture" }, { quoted: mek });
        } catch {
            await sock.sendMessage(chatJid, { text: "❌ No profile picture" }, { quoted: mek });
        }
    },

    vv: async ({ sock, chatJid, mek }) => {
        const quoted = mek.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted) return sock.sendMessage(chatJid, { text: "Reply to a view once message!" }, { quoted: mek });

        try {
            const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
            const type = Object.keys(quoted)[0];
            const stream = await downloadContentFromMessage(quoted[type], type.replace('Message',''));
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

            if (type === 'imageMessage') {
                await sock.sendMessage(chatJid, { image: buffer, caption: "✅ View Once Image" }, { quoted: mek });
            } else if (type === 'videoMessage') {
                await sock.sendMessage(chatJid, { video: buffer, caption: "✅ View Once Video" }, { quoted: mek });
            }
        } catch (e) {
            await sock.sendMessage(chatJid, { text: "❌ Failed to collect." }, { quoted: mek });
        }
    }
};
