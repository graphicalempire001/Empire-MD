const config = require('../config');

module.exports = {
    // ⚡ Ping Command (Alias: ping, p)
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

    // 📋 System Info (Alias: info, system)
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

    // ❓ Comprehensive Help Menu (Alias: help, h, menu)
    help: async ({ sock, chatJid, mek, senderName }) => {
        const menu = `✨ *Hello, ${senderName}! Welcome to ${config.botName}* ✨

💡 *Command Prefixes:* \`${config.prefix}\` (Short & abbreviated commands supported!)
🔒 *Bot Status:* *${config.mode.toUpperCase()} Mode* (Change using \`.setmode\`)

━━━━━━━━━━━━━━━━━━━━
📥 *MEDIA & DOWNLOADS (API powered)*
━━━━━━━━━━━━━━━━━━━━
👉 \`.s\` / \`.sticker\` - Create high quality stickers from replied image/video.
👉 \`.play [song name]\` - Search & download MP3 song.
👉 \`.ytmp3 [url]\` - Download YouTube video as MP3 audio.
👉 \`.ytmp4 [url]\` / \`.video\` - Download YouTube video as high-quality MP4.
👉 \`.ig [url]\` / \`.insta\` - Download Instagram Reels / Posts.
👉 \`.tt [url]\` / \`.tiktok\` - Download TikTok videos without watermark.
👉 \`.fb [url]\` / \`.fbdl\` - Download Facebook high-definition videos.

━━━━━━━━━━━━━━━━━━━━
👑 *OWNER & SYSTEM CONTROL*
━━━━━━━━━━━━━━━━━━━━
👉 \`.sp [prefix]\` / \`.setprefix\` - Change command prefix instantly.
👉 \`.mode [public/private]\` / \`.setmode\` - Toggle public command access.
👉 \`.bc [text]\` / \`.broadcast\` - Send custom broadcast to all groups with automatic channel follow button.
👉 \`.ping\` / \`.p\` - Test bot latency & active status.
👉 \`.info\` / \`.system\` - Display detailed system resources & runtime diagnostics.

━━━━━━━━━━━━━━━━━━━━
🎭 *FUN & ENTERTAINMENT (API powered)*
━━━━━━━━━━━━━━━━━━━━
👉 \`.meme\` - Fetch a fresh hilarious internet meme.
👉 \`.joke\` - Fetch a random hilarious question-and-answer joke.
👉 \`.fact\` - Fetch an interesting random educational fact.
👉 \`.lyrics [song]\` - Retrieve detailed synchronized lyrics.

━━━━━━━━━━━━━━━━━━━━
📢 *Official Follow Link:*
👉 ${config.channelUrl}
━━━━━━━━━━━━━━━━━━━━`;

        await sock.sendMessage(chatJid, { text: menu }, { quoted: mek });
    },
    h: async (args) => module.exports.help(args),
    menu: async (args) => module.exports.help(args)
};