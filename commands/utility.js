const config = require('../config');
const meta = require('./_meta');

// Frame function for beautiful menu
function frame(title, lines) {
    const top = "╭━━━〔 " + title + " 〕━━━╮";
    const body = lines.map(l => "┃ " + l).join("\n");
    const bottom = "╰━━━━━━━━━━━━━━━━━╯";
    return `${top}\n${body}\n${bottom}`;
}

module.exports = {
    ping: async ({ sock, chatJid, mek }) => {
        const startTime = Date.now();
        const sent = await sock.sendMessage(chatJid, { text: "⚡ *Calculating Latency...*" }, { quoted: mek });
        const latency = Date.now() - startTime;
        await sock.sendMessage(chatJid, {
            text: `🚀 *Pong!*\nLatency: *${latency}ms*\nBot: *${config.botName}*`
        }, { quoted: sent });
    },
    p: async (args) => module.exports.ping(args),

    info: async ({ sock, chatJid, mek }) => {
        const uptime = process.uptime();
        const hrs = Math.floor(uptime / 3600);
        const mins = Math.floor((uptime % 3600) / 60);
        const secs = Math.floor(uptime % 60);
        await sock.sendMessage(chatJid, {
            text: `🤖 *EMPIRE MD SYSTEM INFO*\n\n` +
                  `Bot: ${config.botName}\n` +
                  `Owner: ${config.ownerName}\n` +
                  `Prefix: ${config.prefix}\n` +
                  `Mode: ${config.mode?.toUpperCase() || "PRIVATE"}\n` +
                  `Uptime: ${hrs}h ${mins}m ${secs}s`
        }, { quoted: mek });
    },
    system: async (args) => module.exports.info(args),

    // ==================== FIXED HELP MENU ====================
    help: async ({ sock, chatJid, mek, senderName, prefix }) => {
        const p = prefix || config.prefix || ".";
        
        let out = `*${config.botName || "Empire MD"}* — Command Menu\n`;
        out += `👋 Hello *${senderName || "User"}*!\n`;
        out += `💡 Prefix: \`${p}\` | Mode: *${(config.mode || "private").toUpperCase()}*\n\n`;

        try {
            if (meta && Object.keys(meta).length > 0) {
                for (const [category, list] of Object.entries(meta)) {
                    const lines = list.map(c => {
                        const alias = c.alias && c.alias.length ? ` (${c.alias.map(a => p + a).join(", ")})` : "";
                        return `${p}${c.cmd}${alias} → ${c.desc}`;
                    });
                    out += frame(category.toUpperCase(), lines) + "\n\n";
                }
            } else {
                out += "📋 No categorized commands loaded.\n";
            }
        } catch (e) {
            console.error("Help menu error:", e);
            out += "⚠️ Error loading menu. Try .list\n";
        }

        out += `📢 Channel: ${config.channelUrl || "Not set"}\n`;
        out += `\nUse ${p}list for quick command names.`;

        await sock.sendMessage(chatJid, { text: out }, { quoted: mek });
    },

    h: async (args) => module.exports.help(args),
    menu: async (args) => module.exports.help(args),

    list: async ({ sock, chatJid, mek, prefix }) => {
        const p = prefix || config.prefix || ".";
        await sock.sendMessage(chatJid, {
            text: `📜 Type *${p}help* or *${p}menu* for full categorized menu.`
        }, { quoted: mek });
    },

    // Placeholder for send/get (you can expand later)
    send: async ({ sock, chatJid, mek }) => {
        await sock.sendMessage(chatJid, { text: "📥 .send is temporarily limited." }, { quoted: mek });
    },
    get: async (args) => module.exports.send(args)
};
