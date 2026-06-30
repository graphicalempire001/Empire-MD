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

       // ────── RELIABLE .play (Best Free Public API 2026) ──────
    play: async ({ sock, chatJid, mek, text }) => {
        if (!text) return sock.sendMessage(chatJid, { text: "❌ Usage: .play <song name>\nExample: .play faded alan walker" }, { quoted: mek });

        await sock.sendMessage(chatJid, { text: `🔍 Searching for *${text}*...` }, { quoted: mek });

        try {
            // Using LolHuman API (currently one of the most stable free ones)
            const search = await axios.get(`https://api.lolhuman.xyz/api/ytsearch?apikey=FREE&query=${encodeURIComponent(text)}`);
            
            if (!search.data.result || search.data.result.length === 0) {
                throw new Error("No results");
            }

            const video = search.data.result[0];

            await sock.sendMessage(chatJid, { 
                text: `⬇️ Found: *${video.title}*\nDownloading audio...` 
            }, { quoted: mek });

            // Get direct audio link
            const audioRes = await axios.get(`https://api.lolhuman.xyz/api/ytaudio?apikey=FREE&url=https://youtube.com/watch?v=${video.videoId}`, {
                responseType: 'arraybuffer'
            });

            const filename = `${video.title.replace(/[^a-zA-Z0-9 ]/g, '')}.mp3`.substring(0, 50) + ".mp3";

            await sock.sendMessage(chatJid, {
                document: Buffer.from(audioRes.data),
                mimetype: 'audio/mpeg',
                fileName: filename,
                caption: `🎵 *${video.title}*\n👤 ${video.author}\n\nDownloaded with Empire MD`
            }, { quoted: mek });

        } catch (err) {
            console.error("Play error:", err.message);
            await sock.sendMessage(chatJid, { 
                text: "❌ Could not download song.\n\nTry these tips:\n• Use more specific name (artist + title)\n• Try again in a minute" 
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
