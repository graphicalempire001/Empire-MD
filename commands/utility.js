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

    // ────── MULTI-API FALLBACK .play (Best Chance) ──────
    play: async ({ sock, chatJid, mek, text }) => {
        if (!text) return sock.sendMessage(chatJid, { text: "❌ Usage: .play <song name>" }, { quoted: mek });

        await sock.sendMessage(chatJid, { text: `🔍 Searching for "${text}"...` }, { quoted: mek });

        const apis = [
            // 1. LolHuman
            async () => {
                const r = await axios.get(`https://api.lolhuman.xyz/api/ytplay?apikey=FREE&query=${encodeURIComponent(text)}`);
                if (r.data?.result?.audio) {
                    const buf = await axios.get(r.data.result.audio, { responseType: 'arraybuffer' });
                    return { buffer: buf.data, title: r.data.result.title };
                }
                throw new Error();
            },
            // 2. Cobalt Tools
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
            },
            // 3. Alternative endpoint
            async () => {
                const r = await axios.get(`https://api.popcat.xyz/song?query=${encodeURIComponent(text)}`);
                if (r.data?.url) {
                    const buf = await axios.get(r.data.url, { responseType: 'arraybuffer' });
                    return { buffer: buf.data, title: r.data.title || text };
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
                    caption: `🎵 ${result.title}\n\nDownloaded with Empire MD`
                }, { quoted: mek });
                return; // Success → stop
            } catch (_) {
                continue; // Try next API
            }
        }

        // All APIs failed
        await sock.sendMessage(chatJid, { 
            text: "❌ All download sources failed.\n\nTry again later or send a YouTube link." 
        }, { quoted: mek });
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
