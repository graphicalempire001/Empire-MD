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

    // ────── CLEAN HELP / MENU ──────
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
            }
        } catch (e) {
            console.error("Help error:", e);
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

    // ────── RESTORED .send (Steal from Status / Quoted Media) ──────
    send: async ({ sock, chatJid, mek }) => {
        try {
            const ctx = mek.message?.extendedTextMessage?.contextInfo;
            const quoted = ctx?.quotedMessage;

            if (!quoted) {
                return sock.sendMessage(chatJid, { text: "❌ Reply to a status or any media message with `.send`" }, { quoted: mek });
            }

            const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

            const type = Object.keys(quoted)[0];
            let buffer;

            if (['imageMessage', 'videoMessage', 'audioMessage'].includes(type)) {
                const stream = await downloadContentFromMessage(quoted[type], type.replace('Message', ''));
                buffer = Buffer.from([]);
                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk]);
                }
            } else {
                return sock.sendMessage(chatJid, { text: "❌ This media type is not supported." }, { quoted: mek });
            }

            const caption = "📥 *Saved via Empire MD*";

            if (type === 'imageMessage') {
                await sock.sendMessage(chatJid, { image: buffer, caption }, { quoted: mek });
            } else if (type === 'videoMessage') {
                await sock.sendMessage(chatJid, { video: buffer, caption }, { quoted: mek });
            } else if (type === 'audioMessage') {
                await sock.sendMessage(chatJid, { audio: buffer, mimetype: 'audio/mp4', caption }, { quoted: mek });
            }
        } catch (err) {
            console.error("Send error:", err);
            await sock.sendMessage(chatJid, { text: "❌ Failed to steal media." }, { quoted: mek });
        }
    },

    get: async (args) => module.exports.send(args),

    // ────── MULTI-API .play ──────
    play: async ({ sock, chatJid, mek, text }) => {
        if (!text) return sock.sendMessage(chatJid, { text: "❌ Usage: .play <song name>" }, { quoted: mek });

        await sock.sendMessage(chatJid, { text: `🔍 Searching "${text}"...` }, { quoted: mek });

        const apis = [
            async () => {
                const r = await axios.get(`https://api.lolhuman.xyz/api/ytplay?apikey=FREE&query=${encodeURIComponent(text)}`);
                if (r.data?.result?.audio) {
                    const buf = await axios.get(r.data.result.audio, { responseType: 'arraybuffer' });
                    return { buffer: buf.data, title: r.data.result.title };
                }
                throw new Error();
            },
            async () => {
                const r = await axios.post('https://cobalt.tools/api/json', {
                    url: `https://youtube.com/results?search_query=${encodeURIComponent(text)}`,
                    isAudioOnly: true
                });
                if (r.data?.url) {
                    const buf = await axios.get(r.data.url, { responseType: 'arraybuffer' });
                    return { buffer: buf.data, title: text };
                }
                throw new Error();
            }
        ];

        for (const api of apis) {
            try {
                const result = await api();
                await sock.sendMessage(chatJid, {
                    document: Buffer.from(result.buffer),
                    mimetype: 'audio/mpeg',
                    fileName: `${result.title}.mp3`,
                    caption: `🎵 ${result.title}\n\nEmpire MD`
                }, { quoted: mek });
                return;
            } catch (_) { continue; }
        }

        await sock.sendMessage(chatJid, { text: "❌ Failed to download song. Try again later." }, { quoted: mek });
    },

    pp: async ({ sock, chatJid, mek }) => {
        try {
            const target = mek.message?.extendedTextMessage?.contextInfo?.participant || chatJid;
            const pp = await sock.profilePictureUrl(target, 'image');
            await sock.sendMessage(chatJid, { image: { url: pp }, caption: "📸 Profile Picture" }, { quoted: mek });
        } catch {
            await sock.sendMessage(chatJid, { text: "❌ No profile picture found." }, { quoted: mek });
        }
    },

    vv: async ({ sock, chatJid, mek }) => {
        const quoted = mek.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted) return sock.sendMessage(chatJid, { text: "❌ Reply to a view once message!" }, { quoted: mek });

        try {
            const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
            const type = Object.keys(quoted)[0];
            const stream = await downloadContentFromMessage(quoted[type], type.replace('Message', ''));
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

            if (type === 'imageMessage') {
                await sock.sendMessage(chatJid, { image: buffer, caption: "✅ View Once Image Saved" }, { quoted: mek });
            } else if (type === 'videoMessage') {
                await sock.sendMessage(chatJid, { video: buffer, caption: "✅ View Once Video Saved" }, { quoted: mek });
            }
        } catch {
            await sock.sendMessage(chatJid, { text: "❌ Failed to collect view once." }, { quoted: mek });
        }
    }
};
