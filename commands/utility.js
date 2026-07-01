const config = require('../config');
const axios = require('axios');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

// Format seconds → "1d 2h 3m 4s"
function formatUptime(sec) {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return `${d > 0 ? d + "d " : ""}${h}h ${m}m ${s}s`;
}

// Resolve deep-unwrapped quoted media: prefer handler's mek.quoted, fallback to raw contextInfo.
function getQuoted(mek) {
    if (mek.quoted && mek.quoted.message) {
        return { message: mek.quoted.message, type: mek.quoted.type };
    }
    let q = mek.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!q) return null;
    while (
        q?.ephemeralMessage || q?.viewOnceMessage ||
        q?.viewOnceMessageV2 || q?.viewOnceMessageV2Extension
    ) {
        q = q.ephemeralMessage?.message || q.viewOnceMessage?.message ||
            q.viewOnceMessageV2?.message || q.viewOnceMessageV2Extension?.message;
    }
    if (!q) return null;
    return { message: q, type: Object.keys(q)[0] };
}

async function downloadBuffer(node, type) {
    const stream = await downloadContentFromMessage(node[type], type.replace('Message', ''));
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    return buffer;
}

// Categorized catalog. Add new commands here; anything registered but
// missing shows automatically under "🧩 Uncategorized".
const CATALOG = {
    "📥 Media & Downloads": {
        "s": { d: "Sticker from replied/sent image or video", a: ["sticker"] },
        "play": { d: "Search & download a song as MP3", a: [] },
        "ytmp3": { d: "YouTube link → MP3 audio", a: [] },
        "ytmp4": { d: "YouTube link → MP4 video", a: ["video"] },
        "insta": { d: "Download Instagram reel/post", a: ["ig"] },
        "tiktok": { d: "Download TikTok (no watermark)", a: ["tt"] },
        "fb": { d: "Download Facebook HD video", a: ["fbdl"] },
        "meme": { d: "Fetch a fresh meme", a: [] },
        "vv": { d: "Reveal a replied view-once media", a: [] },
        "send": { d: "Save/steal replied status or media", a: ["get"] },
        "pp": { d: "Get a user's profile picture", a: [] }
    },
    "👥 Group & Moderation": {
        "link": { d: "Get the group invite link", a: [] },
        "kick": { d: "Remove a member (reply/mention/number)", a: [] },
        "promote": { d: "Make a member admin", a: [] },
        "demote": { d: "Remove a member's admin", a: [] },
        "add": { d: "Add a member by number", a: [] },
        "close": { d: "Mute group (admins only)", a: [] },
        "open": { d: "Unmute group", a: [] },
        "tagall": { d: "Mention every member", a: ["everyone"] },
        "antilink": { d: "Link protection: off/warn/delete/kick", a: [] }
    },
    "🤖 AI & Utility": {
        "ai": { d: "Ask the AI assistant", a: ["chat", "ask"] },
        "ping": { d: "Check latency & status", a: ["p"] },
        "info": { d: "System diagnostics", a: ["system"] },
        "afk": { d: "Set Away-From-Keyboard status", a: [] },
        "help": { d: "Show this menu", a: ["h", "menu"] },
        "list": { d: "Plain command list", a: [] }
    },
    "⚙️ Auto & Presence": {
        "auto": { d: "Toggle typing/recording/online", a: ["presence"] },
        "autostatusview": { d: "Toggle auto-view statuses", a: [] },
        "autostatusreact": { d: "Toggle auto-react to statuses", a: [] },
        "autogreet": { d: "Greet new contacts (on/off or custom text)", a: ["greet", "welcome"] },
        "away": { d: "Away auto-reply for DMs & mentions (on/off or custom)", a: ["awaymode"] }
    },
    "👑 Owner & Self": {
        "setprefix": { d: "Change command prefix", a: ["sp"] },
        "setmode": { d: "Switch public/private", a: ["mode"] },
        "broadcast": { d: "Broadcast to all groups", a: ["bc"] },
        "setname": { d: "Update bot display name", a: ["sn"] },
        "setbio": { d: "Update bot bio", a: ["sb"] }
    },
    "🎭 Fun & Economy": {
        "joke": { d: "Random joke", a: [] },
        "fact": { d: "Random fact", a: [] },
        "bored": { d: "Suggest an activity", a: ["act"] },
        "excuse": { d: "Developer excuse", a: [] },
        "bible": { d: "Random or specific Bible verse", a: ["verse"] },
        "bal": { d: "Wallet & bank balance", a: ["balance", "wallet"] },
        "slot": { d: "Slot machine", a: ["slots"] },
        "daily": { d: "Claim daily coins", a: [] }
    }
};

module.exports = {
    // ⚡ Ping (Alias: p)
    ping: async ({ sock, chatJid, mek }) => {
        const start = Date.now();
        const sent = await sock.sendMessage(chatJid, { text: "⚡ *Pong!*" }, { quoted: mek });
        const latency = Date.now() - start;
        await sock.sendMessage(chatJid, {
            text: `🚀 *Latency:* ${latency}ms
Bot: *${config.botName}*  |  Mode: *${(config.mode || "private").toUpperCase()}*`
        }, { quoted: sent });
    },
    p: async (args) => module.exports.ping(args),

    // 📋 System Info (Alias: system)
    info: async ({ sock, chatJid, mek }) => {
        const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
        await sock.sendMessage(chatJid, {
            text: `🤖 *[EMPIRE MD SYSTEM PROFILE]*
👑 *Bot:* ${config.botName}
👤 *Owner:* ${config.ownerName}
⚙️ *Prefix:* ${config.prefix}
🔒 *Mode:* ${(config.mode || "private").toUpperCase()}
🕒 *Uptime:* ${formatUptime(process.uptime())}
📦 *Platform:* ${process.platform}
💾 *Memory:* ${mem} MB`
        }, { quoted: mek });
    },
    system: async (args) => module.exports.info(args),

    // ❓ Professional, self-verifying Menu (Alias: h, menu)
    help: async ({ sock, chatJid, mek, senderName, prefix }) => {
        const px = prefix || config.prefix || ".";
        const uptime = formatUptime(process.uptime());
        const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
        const dbConnected = !!process.env.SUPABASE_URL && !!process.env.SUPABASE_KEY;
        const dbStatus = dbConnected ? "🟢 Connected" : "🟡 Local Cache";
        const now = new Date().toLocaleString();

        // Coverage check vs live registry
        let registered = {};
        try { registered = require('../lib/commands'); } catch (_) {}
        const listed = new Set();
        for (const cat of Object.values(CATALOG)) {
            for (const [cmd, meta] of Object.entries(cat)) {
                listed.add(cmd);
                (meta.a || []).forEach(a => listed.add(a));
            }
        }
        const uncategorized = Object.keys(registered).filter(c => !listed.has(c));

        let total = 0;
        for (const cat of Object.values(CATALOG)) total += Object.keys(cat).length;
        total += uncategorized.length;

        let menu = `╭━━━〔 *${config.botName}* 〕━━━┈⊷
┃ 👋 Hello, *${senderName || "User"}*!
┃ 👑 *Owner:* ${config.ownerName}
┃ ⚙️ *Prefix:* ${px}
┃ 🔒 *Mode:* ${(config.mode || "private").toUpperCase()}
┃ 🕒 *Uptime:* ${uptime}
┃ 💾 *Memory:* ${mem} MB
┃ 🗄️ *Database:* ${dbStatus}
┃ 📊 *Commands:* ${total}
┃ 📅 ${now}
╰━━━━━━━━━━━━━━━┈⊷
`;

        for (const [category, cmds] of Object.entries(CATALOG)) {
            menu += `
╭──〔 *${category}* 〕
`;
            for (const [cmd, meta] of Object.entries(cmds)) {
                const aliasTxt = meta.a && meta.a.length ? ` (${meta.a.map(a => px + a).join(", ")})` : "";
                menu += `┃ ▸ *${px}${cmd}*${aliasTxt}
┃    ${meta.d}
`;
            }
            menu += `╰────────────┈⊷
`;
        }

        if (uncategorized.length) {
            menu += `
╭──〔 *🧩 Uncategorized* 〕
`;
            uncategorized.forEach(c => { menu += `┃ ▸ *${px}${c}*
`; });
            menu += `╰────────────┈⊷
`;
        }

        menu += `
╭━━━━━━━━━━━━━━━┈⊷
┃ 📢 *Channel:*
┃ ${config.channelUrl}
┃
┃ _Powered by ${config.botName} • Made with ❤️_
╰━━━━━━━━━━━━━━━┈⊷`;

        await sock.sendMessage(chatJid, { text: menu }, { quoted: mek });
    },
    h: async (args) => module.exports.help(args),
    menu: async (args) => module.exports.help(args),

    // 📋 Plain list
    list: async ({ sock, chatJid, mek, prefix }) => {
        const px = prefix || config.prefix || ".";
        let out = "📋 *Command List*

";
        for (const [cat, cmds] of Object.entries(CATALOG)) {
            out += `*${cat}*
`;
            for (const [cmd, meta] of Object.entries(cmds)) {
                out += `• ${px}${cmd} — ${meta.d}
`;
            }
            out += "
";
        }
        await sock.sendMessage(chatJid, { text: out }, { quoted: mek });
    },

    // 📥 Save/steal replied status or media (Alias: get)
    send: async ({ sock, chatJid, mek }) => {
        try {
            const q = getQuoted(mek);
            if (!q) return sock.sendMessage(chatJid, { text: "❌ Reply to a status or media message with .send" }, { quoted: mek });

            const { message, type } = q;
            if (!['imageMessage', 'videoMessage', 'audioMessage'].includes(type)) {
                return sock.sendMessage(chatJid, { text: "❌ This media type is not supported." }, { quoted: mek });
            }

            const buffer = await downloadBuffer(message, type);
            const caption = "📥 *Saved via Empire MD*";

            if (type === 'imageMessage') await sock.sendMessage(chatJid, { image: buffer, caption }, { quoted: mek });
            else if (type === 'videoMessage') await sock.sendMessage(chatJid, { video: buffer, caption }, { quoted: mek });
            else if (type === 'audioMessage') await sock.sendMessage(chatJid, { audio: buffer, mimetype: 'audio/mp4' }, { quoted: mek });
        } catch (err) {
            console.error("Send error:", err);
            await sock.sendMessage(chatJid, { text: "❌ Failed to save media." }, { quoted: mek });
        }
    },
    get: async (args) => module.exports.send(args),

    // 🎵 Multi-API play
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
                    caption: `🎵 ${result.title}

Empire MD`
                }, { quoted: mek });
                return;
            } catch (_) { continue; }
        }
        await sock.sendMessage(chatJid, { text: "❌ Failed to download song. Try again later." }, { quoted: mek });
    },

    // 📸 Profile picture
    pp: async ({ sock, chatJid, mek, quotedSender }) => {
        try {
            const target = quotedSender || mek.message?.extendedTextMessage?.contextInfo?.participant || chatJid;
            const url = await sock.profilePictureUrl(target, 'image');
            await sock.sendMessage(chatJid, { image: { url }, caption: "📸 Profile Picture" }, { quoted: mek });
        } catch {
            await sock.sendMessage(chatJid, { text: "❌ No profile picture found." }, { quoted: mek });
        }
    },

    // 👁️ View-once revealer (uses deep-unwrapped quoted)
    vv: async ({ sock, chatJid, mek }) => {
        const q = getQuoted(mek);
        if (!q) return sock.sendMessage(chatJid, { text: "❌ Reply to a view once message!" }, { quoted: mek });

        try {
            const { message, type } = q;
            if (!['imageMessage', 'videoMessage'].includes(type)) {
                return sock.sendMessage(chatJid, { text: "❌ Reply to a view-once *image* or *video*." }, { quoted: mek });
            }
            const buffer = await downloadBuffer(message, type);
            if (type === 'imageMessage') await sock.sendMessage(chatJid, { image: buffer, caption: "✅ View Once Image Saved" }, { quoted: mek });
            else await sock.sendMessage(chatJid, { video: buffer, caption: "✅ View Once Video Saved" }, { quoted: mek });
        } catch (err) {
            console.error("vv error:", err);
            await sock.sendMessage(chatJid, { text: "❌ Failed to collect view once." }, { quoted: mek });
        }
    }
};
