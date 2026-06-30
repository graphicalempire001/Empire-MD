const config = require('../config');

// 🗂️ Single source of truth for the menu. Add a line here when you add a command.
const MENU = {
    "📥 MEDIA & DOWNLOADS": [
        [".s / .sticker", "Sticker from replied image/video"],
        [".play [song]", "Download MP3 song"],
        [".ytmp3 [url]", "YouTube → MP3"],
        [".ytmp4 / .video [url]", "YouTube → MP4"],
        [".ig / .insta [url]", "Instagram Reels/Posts"],
        [".tt / .tiktok [url]", "TikTok (no watermark)"],
        [".fb / .fbdl [url]", "Facebook HD video"],
        [".send", "Steal & resend media from a replied status"]
    ],
    "👑 OWNER & SYSTEM": [
        [".sp / .setprefix", "Change prefix"],
        [".mode / .setmode", "Toggle public/private"],
        [".bc / .broadcast", "Broadcast to all groups"],
        [".ping / .p", "Latency & status"],
        [".info / .system", "System diagnostics"]
    ],
    "💤 AFK": [
        [".afk [reason]", "Set away status"]
    ],
    "🤖 AI": [
        [".ai [text]", "Chat with AI"]
    ],
    "⚙️ AUTO FEATURES": [
        [".autostatusview", "Toggle auto-view statuses"],
        [".autostatusreact", "Toggle auto-react to statuses"]
    ],
    "👥 GROUP & MODERATION": [
        [".tagall", "Tag everyone"],
        [".kick / .add", "Manage members"],
        [".antilink", "Toggle anti-link"]
    ],
    "🎭 FUN": [
        [".meme", "Fetch a meme"],
        [".joke", "Random joke"],
        [".fact", "Random fact"],
        [".lyrics [song]", "Song lyrics"]
    ]
};

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

    // ❓ Full Help Menu (dynamic, categorised)
    help: async ({ sock, chatJid, mek, senderName, prefix }) => {
        const p = prefix || config.prefix || ".";
        let menu = `✨ *Hello, ${senderName}! Welcome to ${config.botName}* ✨

💡 *Prefix:* \`${p}\`
🔒 *Status:* *${(config.mode || "private").toUpperCase()} Mode*
`;
        for (const [category, cmds] of Object.entries(MENU)) {
            if (!cmds || !cmds.length) continue;
            menu += `
━━━━━━━━━━━━━━━━━━━━
${category}
━━━━━━━━━━━━━━━━━━━━
`;
            for (const [cmd, desc] of cmds) {
                menu += `👉 \`${cmd}\` - ${desc}
`;
            }
        }
        menu += `
━━━━━━━━━━━━━━━━━━━━
📢 *Official Channel:*
👉 ${config.channelUrl}
━━━━━━━━━━━━━━━━━━━━`;
        await sock.sendMessage(chatJid, { text: menu }, { quoted: mek });
    },
    h: async (args) => module.exports.help(args),
    menu: async (args) => module.exports.help(args),

    // 📜 .list — compact flat list of every command name
    list: async ({ sock, chatJid, mek, prefix }) => {
        const p = prefix || config.prefix || ".";
        let out = `📜 *${config.botName} — Command List*

`;
        for (const [category, cmds] of Object.entries(MENU)) {
            if (!cmds || !cmds.length) continue;
            const names = cmds.map(c => c[0]).join("  •  ");
            out += `*${category}*
${names}

`;
        }
        out += `_Use ${p}menu for full descriptions._`;
        await sock.sendMessage(chatJid, { text: out }, { quoted: mek });
    },

    // 📥 .send — steal media from a replied/quoted status (or any quoted media) and resend
    send: async ({ sock, chatJid, mek }) => {
        try {
            const ctx = mek.message?.extendedTextMessage?.contextInfo;
            const quoted = ctx?.quotedMessage;
            if (!quoted) {
                return sock.sendMessage(chatJid, { text: "❌ Reply to a status/media with `.send`." }, { quoted: mek });
            }

            // Reconstruct a message object Baileys can download
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
            const type = Object.keys(quoted)[0]; // imageMessage / videoMessage / etc.

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
    get: async (args) => module.exports.send(args) // alias .get
};
