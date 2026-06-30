const config = require('../config');
const meta = require('./_meta');

// Beautiful frame
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
        await sock.sendMessage(chatJid, {
            text: `🚀 Latency: *${latency}ms*`
        }, { quoted: mek });
    },
    p: async (args) => module.exports.ping(args),

    info: async ({ sock, chatJid, mek }) => {
        await sock.sendMessage(chatJid, {
            text: `🤖 *EMPIRE MD*\nPrefix: ${config.prefix || "."}\nMode: ${(config.mode || "private").toUpperCase()}`
        }, { quoted: mek });
    },
    system: async (args) => module.exports.info(args),

    // ────── CLEAN FRAMED HELP / MENU ──────
    help: async ({ sock, chatJid, mek, senderName, prefix }) => {
        const p = prefix || config.prefix || ".";
        
        let out = `*${config.botName || "Empire MD"}* — Command Menu\n`;
        out += `👋 Hello *${senderName || "User"}*!\n\n`;

        try {
            if (meta && Object.keys(meta).length > 0) {
                for (const [category, cmds] of Object.entries(meta)) {
                    if (!cmds || cmds.length === 0) continue;
                    
                    const lines = cmds.map(c => {
                        const alias = c.alias && c.alias.length 
                            ? ` (${c.alias.map(a => p+a).join(", ")})` 
                            : "";
                        return `${p}${c.cmd}${alias} — ${c.desc}`;
                    });

                    out += frame(category.toUpperCase(), lines) + "\n\n";
                }
            }
        } catch (e) {
            out += "⚠️ Failed to load menu.\n";
        }

        await sock.sendMessage(chatJid, { text: out }, { quoted: mek });
    },

    h: async (args) => module.exports.help(args),
    menu: async (args) => module.exports.help(args),

    // ────── UNIQUE .list COMMAND (WhatsApp Style) ──────
    list: async ({ sock, chatJid, mek, prefix }) => {
        const p = prefix || config.prefix || ".";
        let out = `📋 *${config.botName || "Empire MD"} Command List*\n\n`;

        try {
            if (meta && Object.keys(meta).length > 0) {
                for (const [category, cmds] of Object.entries(meta)) {
                    out += `🔸 *${category}*\n`;
                    cmds.forEach(c => {
                        const alias = c.alias && c.alias.length 
                            ? ` (${c.alias.join(", ")})` 
                            : "";
                        out += `   ${p}${c.cmd}${alias} — ${c.desc}\n`;
                    });
                    out += "\n";
                }
            } else {
                out += "No commands loaded.\n";
            }
        } catch (e) {
            out += "Error loading list.\n";
        }

        await sock.sendMessage(chatJid, { text: out }, { quoted: mek });
    }
};
