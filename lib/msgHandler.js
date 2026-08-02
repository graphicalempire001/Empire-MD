// Empire MD - Core Message Handler (Per-Bot Owner + AI Engine: mention / swipe / aggressive + self-owner reply)
const config = require('../config');
const { getSettings, isBotAbusive, db, updateSettings, incrementUsage, incrementCommandCount } = require('./database');
const commands = require('./commands');

const IGNORE_KEYS = new Set([
  'senderKeyDistributionMessage',
  'messageContextInfo'
]);

const PUBLIC_ALWAYS = new Set(['help', 'h', 'menu', 'list', 'ping', 'p']);

function isOwnerCheck(sender, botId, customOwners = []) {
  const cleanSender = sender.replace(/[^0-9]/g, '');
  const cleanBot = botId.replace(/[^0-9]/g, '');
  if (cleanSender && cleanSender === cleanBot) return true;
  const owners = Array.isArray(customOwners) ? customOwners : [];
  return owners.some(owner => {
    const cleanOwner = String(owner).replace(/[^0-9]/g, '');
    if (!cleanOwner) return false;
    return cleanSender === cleanOwner || cleanSender.endsWith(cleanOwner);
  });
}

async function resolveRealJid(sock, chatJid, isGroup, mek, rawSender) {
  if (mek.key.participantPn) return mek.key.participantPn;
  if (!isGroup || !rawSender.endsWith('@lid')) return rawSender;
  try {
    if (sock.signalRepository?.lidMapping?.getPNForLID) {
      const pn = await sock.signalRepository.lidMapping.getPNForLID(rawSender);
      if (pn) return pn;
    }
    const meta = await sock.groupMetadata(chatJid);
    const match = meta.participants.find(
      p => p.id === rawSender || p.lid === rawSender || p.jid === rawSender
    );
    if (match) return match.phoneNumber || match.jid || match.id || rawSender;
  } catch (e) {
    console.error("LID resolve failed:", e.message);
  }
  return rawSender;
}

const LINK_REGEX = new RegExp("chat\\.whatsapp\\.com/[A-Za-z0-9]+|wa\\.me/|t\\.me/|https?://|www\\.[^\\s]+|[a-z0-9-]+\\.(com|net|org|io|xyz|me|link|gg|info|biz)", "i");

const greetedContacts = new Set();
const awayCooldown = {};
const AWAY_COOLDOWN_MS = 10 * 60 * 1000;

async function applyPresence(sock, chatJid, settings) {
  try {
    if (settings.auttyping) {
      await sock.sendPresenceUpdate('composing', chatJid);
    } else if (settings.autorecord) {
      await sock.sendPresenceUpdate('recording', chatJid);
    } else if (settings.alwaysOnline) {
      await sock.sendPresenceUpdate('available', chatJid);
    }
  } catch (e) {
    console.error("Presence update failed:", e.message);
  }
}

async function isGroupAdmin(sock, chatJid, jid) {
  try {
    const meta = await sock.groupMetadata(chatJid);
    const p = meta.participants.find(x => x.id === jid);
    return !!(p && (p.admin === 'admin' || p.admin === 'superadmin'));
  } catch (_) {
    return false;
  }
}

async function handleAgentReply(sock, mek, body, chatJid, sender, settings) {
  const autoreply = settings.autoreply ?? config.settings?.autoreply;
  if (autoreply && !chatJid.endsWith('@g.us')) {
    await sock.sendMessage(chatJid, {
      text: "🤖 *[Empire MD Auto-Response]* Thank you for reaching out! The owner is currently away. Please use .help to see available commands."
    }, { quoted: mek });
  }
}

async function handleMessage(sock, mek) {
  try {
    if (!mek.message) return;

    // 📊 BASIC USAGE TRACKING
    if (sock.sessionId) {
        incrementUsage(sock.sessionId).catch(() => {});
    }

    const msgKeys = Object.keys(mek.message);
    const msgType = msgKeys.find(k => !IGNORE_KEYS.has(k)) || msgKeys[0];
    let msg = mek.message[msgType];

    if (msgType === "ephemeralMessage") {
      msg = msg.message;
      const innerKeys = Object.keys(msg).filter(k => !IGNORE_KEYS.has(k));
      const innerType = innerKeys[0] || Object.keys(msg)[0];
      msg = msg[innerType];
    }

    while (
      msg?.ephemeralMessage ||
      msg?.viewOnceMessage ||
      msg?.viewOnceMessageV2 ||
      msg?.viewOnceMessageV2Extension
    ) {
      const unwrapped =
        msg.ephemeralMessage?.message ||
        msg.viewOnceMessage?.message ||
        msg.viewOnceMessageV2?.message ||
        msg.viewOnceMessageV2Extension?.message;
      if (!unwrapped) break;
      const uKeys = Object.keys(unwrapped).filter(k => !IGNORE_KEYS.has(k));
      const t = uKeys[0] || Object.keys(unwrapped)[0];
      msg = unwrapped[t];
    }

    const contextInfo = (msg && typeof msg === "object" && msg.contextInfo) || {};

    mek.quoted = null;
    if (contextInfo.quotedMessage) {
      let quoted = contextInfo.quotedMessage;
      while (
        quoted?.ephemeralMessage ||
        quoted?.viewOnceMessage ||
        quoted?.viewOnceMessageV2 ||
        quoted?.viewOnceMessageV2Extension
      ) {
        quoted =
          quoted.ephemeralMessage?.message ||
          quoted.viewOnceMessage?.message ||
          quoted.viewOnceMessageV2?.message ||
          quoted.viewOnceMessageV2Extension?.message;
      }
      mek.quoted = {
        id: contextInfo.stanzaId,
        // In groups participant is set; in private chats it is often missing —
        // fall back to remoteJid (the chat partner) so .pp / .vv work on reply in DMs.
        sender: contextInfo.participant || (mek.key.remoteJid?.endsWith('@g.us') ? null : mek.key.remoteJid),
        message: quoted,
        type: quoted ? Object.keys(quoted)[0] : null
      };
    }
    mek.quotedSender = mek.quoted?.sender || null;

    const chatJid = mek.key.remoteJid;
    const isGroup = chatJid.endsWith('@g.us');
    const connectedNumber = sock.user.id.split(':')[0];
    const botId = connectedNumber + '@s.whatsapp.net';
    const fromMe = mek.key.fromMe === true;

    const rawSender = fromMe
      ? botId
      : (mek.key.participant || mek.quotedSender || mek.key.remoteJid);

    const sender = fromMe
      ? botId
      : await resolveRealJid(sock, chatJid, isGroup, mek, rawSender);
    const senderName = mek.pushName || "User";

    let body =
      (typeof msg === "string" ? msg : "") ||
      msg?.conversation ||
      msg?.text ||
      msg?.caption ||
      msg?.imageMessage?.caption ||
      msg?.videoMessage?.caption ||
      msg?.extendedTextMessage?.text ||
      "";

    // 🚫 ABUSE GATE
    try {
      let abusive = sock.isAbusive === true;
      if (!abusive && sock.sessionId) {
        abusive = await isBotAbusive(sock.sessionId);
        sock.isAbusive = abusive;
      }
      if (abusive) {
        console.log(`[ABUSE BLOCK] Session ${sock.sessionId || 'N/A'} is flagged abusive — ignoring message.`);
        return;
      }
    } catch (_) {}

    let settings = {};
    try {
      if (sock.sessionId) {
        settings = (await getSettings(sock.sessionId)) || {};
      }
    } catch (e) {
      console.error("Settings load error:", e.message);
    }

    await applyPresence(sock, chatJid, settings);

    const currentMode = settings.mode || config.mode || "private";
    const prefix = settings.prefix || config.prefix || ".";

    let ownerNumbers = [];
    if (Array.isArray(settings.ownerNumber) && settings.ownerNumber.length) {
      ownerNumbers = settings.ownerNumber;
    } else if (Array.isArray(sock.ownerNumber) && sock.ownerNumber.length) {
      ownerNumbers = sock.ownerNumber;
    } else {
      ownerNumbers = [connectedNumber];
    }

    const isOwner = fromMe || isOwnerCheck(sender, botId, ownerNumbers);
    const cleanSender = sender.replace(/[^0-9]/g, '');

    // 🔎 OWNER DEBUG LOGGING
    console.log(`[OWNER DEBUG] Session:${sock.sessionId || 'N/A'} | Sender:${cleanSender} | Bot:${connectedNumber} | Owners:${JSON.stringify(ownerNumbers)} | fromMe:${fromMe} | IsOwner:${isOwner} | Mode:${currentMode} | Body:"${body}"`);

    const isCmd = body.startsWith(prefix);
    const args = body.slice(prefix.length).trim().split(/ +/);
    const command = isCmd ? args.shift().toLowerCase() : "";
    const text = args.join(" ");

    // ─────────────── Non-command messages ───────────────
    if (!isCmd) {
      // === 🔗 ANTILINK ENFORCEMENT (groups only) ===
      const antilinkMode = settings.antilink || "off";
      if (isGroup && antilinkMode !== "off" && !isOwner && !fromMe && LINK_REGEX.test(body)) {
        const senderIsAdmin = await isGroupAdmin(sock, chatJid, sender);
        if (!senderIsAdmin) {
          if (antilinkMode === "delete" || antilinkMode === "kick") {
            try { await sock.sendMessage(chatJid, { delete: mek.key }); }
            catch (e) { console.error("Antilink delete failed (is the bot an admin?):", e.message); }
          }
          try {
            await sock.sendMessage(chatJid, {
              text: `🚫 *Antilink:* @${sender.split('@')[0]}, links are not allowed in this group.` +
                (antilinkMode === "kick" ? " You are being removed." : ""),
              mentions: [sender]
            });
          } catch (_) {}
          if (antilinkMode === "kick") {
            try { await sock.groupParticipantsUpdate(chatJid, [sender], "remove"); }
            catch (e) { console.error("Antilink kick failed (is the bot an admin?):", e.message); }
          }
          return;
        }
      }

      // === 🤖 AI CONVERSATION MODES ===
      const aiMode = settings.aichatmode || "off";
      if (aiMode !== "off" && body && body.trim()) {
        const cleanBot = connectedNumber.replace(/[^0-9]/g, '');
        const isSelfAiEcho = /^🤖\s*\*Empire AI:\*/.test(body) || /^🧠/.test(body);
        const repliedToBot = mek.quotedSender ? mek.quotedSender.replace(/[^0-9]/g, '').endsWith(cleanBot) : false;
        const mentions = contextInfo.mentionedJid || [];
        const mentionedBot = mentions.some(j => j.replace(/[^0-9]/g, '').endsWith(cleanBot));

        const shouldAnswer = !isSelfAiEcho && (
          (!fromMe && (repliedToBot || mentionedBot)) ||
          (!fromMe && aiMode === "aggressive" && !isGroup) ||
          (fromMe && (repliedToBot || mentionedBot))
        );

        if (shouldAnswer) {
          let aiText = body;
          if (mentionedBot) aiText = aiText.replace(new RegExp(`@${cleanBot}`, 'g'), '').trim();
          if (aiText) {
            try {
              const { runAi } = require('../commands/ai');
              await runAi({ sock, chatJid, mek, text: aiText, senderName, sender, settings });
            } catch (e) { console.error("AI auto-trigger failed:", e.message); }
            return;
          }
        }
      }

      // === 🧾 BUSINESS AUTO-GREETING ===
      if (!isGroup && !fromMe && settings.autogreet) {
        const gKey = `${sock.sessionId || 'N/A'}:${sender}`;
        if (!greetedContacts.has(gKey)) {
          greetedContacts.add(gKey);
          const greetText = settings.greetMessage || `👋 *Hello and welcome!* Type *${prefix}help* to see what I can do.`;
          try { await sock.sendMessage(chatJid, { text: greetText }, { quoted: mek }); } catch (_) {}
        }
      }

      // === 🌙 AWAY MODE ===
      if (!fromMe && settings.awaymode) {
        const ownerMatch = (jid) => ownerNumbers.some(o => jid.replace(/[^0-9]/g, '').endsWith(String(o).replace(/[^0-9]/g, '')));
        const trigger = !isGroup || (contextInfo.mentionedJid || []).some(ownerMatch) || (mek.quotedSender ? ownerMatch(mek.quotedSender) : false);
        const aKey = `${sock.sessionId || 'N/A'}:${sender}`;
        if (trigger && (Date.now() - (awayCooldown[aKey] || 0) > AWAY_COOLDOWN_MS)) {
          awayCooldown[aKey] = Date.now();
          try { await sock.sendMessage(chatJid, { text: settings.awayMessage || `🌙 *I'm currently away.*` }, { quoted: mek }); } catch (_) {}
        }
      }

      // === 🔔 AFK DETECTION ===
      if (db.afk) {
        const mentions = contextInfo.mentionedJid || [];
        for (const jid of mentions) {
          if (db.afk[jid]) {
            const afkData = db.afk[jid];
            await sock.sendMessage(chatJid, {
              text: `🔔 *[AFK MODE]* @${jid.split('@')[0]} is Away.
*Reason:* ${afkData.reason}
*Since:* ${new Date(afkData.time).toLocaleTimeString()}`,
              mentions: [jid]
            }, { quoted: mek });
          }
        }
      }

      await handleAgentReply(sock, mek, body, chatJid, sender, settings);
      return;
    }

    // Private mode protection
    if (currentMode === "private" && !isOwner && !PUBLIC_ALWAYS.has(command)) return;

    // 🚀 COMMAND EXECUTION
    if (commands[command]) {
      try {
        await commands[command]({
          sock,
          mek,
          chatJid,
          sender,
          senderName,
          isGroup,
          isOwner,
          args,
          text,
          body,
          prefix,
          settings,
          quoted: mek.quoted,
          quotedSender: mek.quotedSender,
          contextInfo
        });
        
        // 📈 TRACK COMMAND USAGE
        if (sock.sessionId) {
            incrementCommandCount(sock.sessionId).catch(() => {});
        }
      } catch (cmdErr) {
        console.error(`❌ Command Error [${command}]:`, cmdErr.message);
        await sock.sendMessage(chatJid, { text: `❌ *Error executing command:* ${cmdErr.message}` }, { quoted: mek });
      }
    } else {
      await sock.sendMessage(chatJid, { text: `❓ *Unknown command:* \`${prefix}${command}\`` }, { quoted: mek });
    }

  } catch (err) {
    // 🛡️ GLOBAL HANDLER SAFETY: Prevents unhandled errors from hanging the bot
    console.error("🔥 CRITICAL MESSAGE HANDLER ERROR:", err);
  }
}

module.exports = {
  handleMessage
};
