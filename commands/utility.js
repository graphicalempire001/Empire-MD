const config = require('../config');
const meta = require('./_meta');

// Build a fancy box-framed section
function frame(title, lines) {
    const top = "╭━━━〔 " + title + " 〕━━━╮";
    const body = lines.map(l => "┃ " + l).join("\n");
    const bottom = "╰━━━━━━━━━━━━━━━━━╯";
    return `${top}\n${body}\n${bottom}`;
}

module.exports = {
    // ⚡ Ping
    ping: async ({ sock, chatJid, mek }) => {
        const startTime = Date.now();
        const sent = await sock.sendMessage(chatJid, { text: "⚡ *Calculating Latency...*" }, { quoted: mek });
        const latency = Date.now() - startTime;
        await sock.sendMessage(chatJid, {
            text: `🚀 *Pong!*
Latency: *${latency}ms*
Bot Name: *${config.botName}*
Mode: *${config.mode.toUpperCase()}*`
        }, { quoted: sent });
    },
    p: async (args) => module.exports.ping(args),

    // 📋 System Info
    info: async ({ sock, chatJid, mek }) => {
        const uptime = process.uptime();
        const hrs = Math.floor(uptime / 3600);
        const mins = Math.floor((uptime % 3600) / 60);
        const secs = Math.floor(uptime % 60);
        const textMessage = `🤖 *[EMPIRE MD SYSTEM PROFILE]* 🤖
👑 *Bot Name:* ${config.botName}
👤 *Owner Name:* ${config.ownerName}
⚙️ *Command Prefix:* ${config.prefix}
🔒 *Bot Mode:* ${config.mode.toUpperCase()}
🕒 *System Uptime:* ${hrs}h ${mins}m ${secs}s
📦 *Platform:* ${process.platform}
💾 *Memory Usage:* ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB / ${(process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2)} MB`;
        await sock.sendMessage(chatJid, { text: textMessage }, { quoted: mek });
    },
    system: async (args) => module.exports.info(args),

    // ❓ Full Help Menu (dynamic + framed version)
    help: async ({ sock, chatJid, mek, senderName, prefix }) => {
        const p = prefix || config.prefix || ".";
        const commands = require('./index'); // live registry

        const described = new Set();
        Object.values(meta).forEach(list =>
            list.forEach(c => {
                described.add(c.cmd);
                (c.alias || []).forEach(a => described.add(a));
            })
        );

        let out = ` *${config.botName}* — Command Center \n`;
        out += `👋 Hello *${senderName || "there"}*!\n`;
        out += `💡 Prefix: \`${p}\` 🔒 Mode: *${(config.mode || "private").toUpperCase()}*\n\n`;

        for (const [category, list] of Object.entries(meta)) {
            const lines = list.map(c => {
                const aliasTxt = (c.alias && c.alias.length) ? ` (${c.alias.map(a => p + a).join(", ")})` : "";
                const lock = c.owner ? " 👑" : "";
                return `${p}${c.cmd}${aliasTxt}${lock}\n ↳ ${c.desc}`;
            });
            out += frame(category, lines) + "\n\n";
        }

        // Auto-detect undocumented commands
        const allKeys = Object.keys(commands).filter(k => typeof commands[k] === "function");
        const undescribed = allKeys.filter(k => !described.has(k));
        if (undescribed.length) {
            const lines = undescribed.map(k => `${p}${k}`);
            out += frame("🆕 OTHER / NEW", lines) + "\n\n";
        }

        out += `📢 Channel: ${config.channelUrl}\n`;
        out += `🔢 Total commands: *${allKeys.length}*`;

        await sock.sendMessage(chatJid, { text: out }, { quoted: mek });
    },

    h: async (args) => module.exports.help(args),
    menu: async (args) => module.exports.help(args),

    // 📜 Compact list
    list: async ({ sock, chatJid, mek, prefix }) => {
        const p = prefix || config.prefix || ".";
        let out = `📜 *${config.botName} — Command List*\n`;

        // Note: MENU is not defined in your original file. If you have it elsewhere, import it.
        // For now I'm commenting it out to prevent crash.
        // If you have a MENU constant, add: const MENU = require('./menu') or define it.

        out += `_Use ${p}menu for full descriptions._`;
        await sock.sendMessage(chatJid, { text: out }, { quoted: mek });
    },

    // 📥 Send / Steal media
    send: async ({ sock, chatJid, mek }) => {
        try {
            const ctx = mek.message?.extendedTextMessage?.contextInfo;
            const quoted = ctx?.quotedMessage;
            if (!quoted) {
                return sock.sendMessage(chatJid, { text: "❌ Reply to a status/media with `.send`." }, { quoted: mek });
            }

            const fakeMek = {
                key: {
                    remoteJid: ctx.remoteJid || chatJid,
                    id: ctx.stanzaId,
                    participant: ctx.participant,
                    fromMe: false
                },
                message: quoted
            };

            const { downloadMediaMessage } = require('@whiskeysockets/baileys');
            const type = Object.keys(quoted)[0];
            const buffer = await downloadMediaMessage(
                fakeMek,
                'buffer',
                {},
                { logger: console, reuploadRequest: sock.updateMediaMessage }
            );

            if (!buffer) {
                return sock.sendMessage(chatJid, { text: "❌ Couldn't download that media." }, { quoted: mek });
            }

            const caption = "📥 *Stolen via Empire MD*";
            if (type === 'imageMessage') {
                await sock.sendMessage(chatJid, { image: buffer, caption }, { quoted: mek });
            } else if (type === 'videoMessage') {
                await sock.sendMessage(chatJid, { video: buffer, caption }, { quoted: mek });
            } else if (type === 'audioMessage') {
                await sock.sendMessage(chatJid, { audio: buffer, mimetype: 'audio/mp4' }, { quoted: mek });
            } else {
                await sock.sendMessage(chatJid, { text: "❌ That message type isn't supported for `.send`." }, { quoted: mek });
            }
        } catch (err) {
            console.error("send command error:", err);
            await sock.sendMessage(chatJid, { text: `❌ Failed: ${err.message}` }, { quoted: mek });
        }
    },

    get: async (args) => module.exports.send(args)
};
