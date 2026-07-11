const config = require('../config');
const { updateSettings } = require('../lib/database');

module.exports = {
    // ⚙️ Change Prefix (Alias: prefix, sp)
    setprefix: async ({ sock, chatJid, mek, text, isOwner, settings }) => {
        if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ This is an owner-only command!" }, { quoted: mek });
        if (!text) return sock.sendMessage(chatJid, { text: "❌ Please provide a new prefix (e.g. .setprefix !)" }, { quoted: mek });

        const newPrefix = text.trim();
        const merged = { ...(settings || {}), prefix: newPrefix };
        sock.botSettings = merged; // update live memory cache instantly

        if (sock.sessionId) {
            try {
                await updateSettings(sock.sessionId, { prefix: newPrefix });
            } catch (err) {
                console.error("Failed to persist prefix change:", err.message);
            }
        }

        await sock.sendMessage(chatJid, { text: `✅ *Success:* Bot prefix has been successfully updated to: *${newPrefix}*` }, { quoted: mek });
    },
    sp: async (args) => module.exports.setprefix(args),

    // 🔒 Toggle Bot Mode: Public / Private (Alias: mode, setmode)
    setmode: async ({ sock, chatJid, mek, text, isOwner, settings }) => {
        if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ This is an owner-only command!" }, { quoted: mek });

        const mode = (text || "").toLowerCase().trim();
        if (!mode || (mode !== "public" && mode !== "private")) {
            const currentMode = settings?.mode || config.mode || "private";
            return sock.sendMessage(chatJid, { text: `❌ Invalid mode! Use:
👉 *.setmode public* to allow everyone to use commands
👉 *.setmode private* to restrict commands to owners only (Current: *${currentMode.toUpperCase()}*)` }, { quoted: mek });
        }

        const merged = { ...(settings || {}), mode };
        sock.botSettings = merged; // update live memory cache instantly

        if (sock.sessionId) {
            try {
                await updateSettings(sock.sessionId, { mode });
            } catch (err) {
                console.error("Failed to persist mode change:", err.message);
            }
        }

        await sock.sendMessage(chatJid, { text: `✅ *Bot Mode Updated:* The bot is now set to *${mode.toUpperCase()}* mode.` }, { quoted: mek });
    },
    mode: async (args) => module.exports.setmode(args),

    // 📣 Group Broadcast with Follow Channel button (Alias: bc, broadcast)
    broadcast: async ({ sock, chatJid, mek, text, isOwner }) => {
        if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ This is an owner-only command!" }, { quoted: mek });
        if (!text) return sock.sendMessage(chatJid, { text: "❌ Provide text to broadcast!" }, { quoted: mek });

        const channelUrl = config.channelUrl || "https://whatsapp.com/channel/0029VaI3OXiF6smuq5LxxN15";
        const message = `📢 *[EMPIRE-BOTWAN BROADCAST]* 📢

${text}

━━━━━━━━━━━━━━━━━━━━
📢 *Stay Connected! Follow Our Channel:*
👉 ${channelUrl}
━━━━━━━━━━━━━━━━━━━━`;

        try {
            const groups = await sock.groupFetchAllParticipating();
            const groupJids = Object.keys(groups);

            await sock.sendMessage(chatJid, { text: `🚀 Starting owner broadcast to *${groupJids.length}* groups...` }, { quoted: mek });
            for (const jid of groupJids) {
                try {
                    await sock.sendMessage(jid, { text: message });
                } catch (err) {
                    console.error(`Failed to send broadcast to group: ${jid}`, err.message);
                }
            }
            await sock.sendMessage(chatJid, { text: "✅ Broadcast completed successfully!" }, { quoted: mek });
        } catch (err) {
            await sock.sendMessage(chatJid, { text: `❌ Broadcast failed: ${err.message}` }, { quoted: mek });
        }
    },
    bc: async (args) => module.exports.broadcast(args),

    // 📲 Pair a new bot for another number (reply / mention / typed number)
    pair: async ({ sock, chatJid, mek, text, isOwner, quotedSender, contextInfo }) => {
        if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ This is an owner-only command!" }, { quoted: mek });

        // Resolve target: reply → mention → typed number
        let targetJid =
            quotedSender ||
            (contextInfo?.mentionedJid && contextInfo.mentionedJid[0]) ||
            null;

        let cleanPhone = targetJid ? targetJid.replace(/[^0-9]/g, '') : "";

        // Parse typed args:  .pair 234701... BotName   OR   .pair BotName (with reply/mention)
        const args = (text || "").trim().split(/ +/).filter(Boolean);
        if (!cleanPhone && args.length) {
            const maybeNum = args[0].replace(/[^0-9]/g, '');
            if (maybeNum.length >= 8) { cleanPhone = maybeNum; args.shift(); }
        }
        let botName = args.join(" ").trim();

        if (!cleanPhone) {
            return sock.sendMessage(chatJid, {
                text: `❌ *Usage:*
• Reply to a user: *.pair BotName*
• Mention: *.pair @user BotName*
• Or type: *.pair 2347012345678 BotName*`
            }, { quoted: mek });
        }
        if (!botName) botName = `Bot_${cleanPhone.slice(-4)}`;

        if (typeof global.startPairingSession !== 'function') {
            return sock.sendMessage(chatJid, { text: "❌ Pairing engine not available on this server build." }, { quoted: mek });
        }

        await sock.sendMessage(chatJid, { text: `📲 Generating pairing code for *+${cleanPhone}* (bot: *${botName}*)...` }, { quoted: mek });

        const result = await global.startPairingSession(botName, cleanPhone);
        if (!result.ok) {
            return sock.sendMessage(chatJid, { text: `❌ ${result.error}` }, { quoted: mek });
        }

        const targetDm = cleanPhone + '@s.whatsapp.net';
        const codeMsg =
`🔐 *Empire MD Pairing Code*

*Bot Name:* ${botName}
*Code:* ${result.code}

📱 *How to link:*
1. Open WhatsApp on *+${cleanPhone}*
2. Settings → *Linked Devices*
3. *Link a Device* → *Link with phone number instead*
4. Enter the code above (expires soon).`;

        // DM the code to the target, and also show it to the owner here.
        try { await sock.sendMessage(targetDm, { text: codeMsg }); } catch (_) {}
        await sock.sendMessage(chatJid, { text: codeMsg }, { quoted: mek });
    },
    psession: async (args) => module.exports.pair(args)
};
