const config = require('../config');
const axios = require('axios');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { updateSettings } = require('../lib/database');
const { buildChannelCard, resolveBotName } = require('../lib/channelCard');

// --- Helper Functions ---

function formatUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${d > 0 ? d + "d " : ""}${h}h ${m}m ${s}s`;
}

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

// Logic to handle DM vs Chat routing for sensitive commands
async function getDestination(sock, chatJid, settings) {
  const mode = settings?.privacyMode || 'chat'; // Default to chat
  if (mode === 'dm') {
    return (sock.ownerNumber?.[0] || sock.user.id.split(':')[0]) + '@s.whatsapp.net';
  }
  return chatJid;
}

async function getChannelThumb() {
  const thumbUrl = config.channelThumb || config.menuThumb;
  if (!thumbUrl) return null;
  try {
    const res = await axios.get(thumbUrl, { responseType: 'arraybuffer', timeout: 10000 });
    return Buffer.from(res.data);
  } catch (e) {
    console.error("Channel thumb fetch failed:", e.message);
    return null;
  }
}

async function buildChannelContext() {
  const channelUrl = config.channelUrl || "https://whatsapp.com/channel/0029VaI3OXiF6smuq5LxxN15";
  const thumb = await getChannelThumb();
  const ctx = {
    externalAdReply: {
      title: `${config.botName || "Empire MD"} • Official Channel`,
      body: "Tap to open the channel",
      mediaType: 1,
      renderLargerThumbnail: true,
      sourceUrl: channelUrl,
      mediaUrl: channelUrl,
      showAdAttribution: true
    }
  };
  if (thumb) {
    ctx.externalAdReply.thumbnail = thumb;
  } else if (config.channelThumb || config.menuThumb) {
    ctx.externalAdReply.thumbnailUrl = config.channelThumb || config.menuThumb;
  }
  if (config.newsletterJid) {
    ctx.forwardedNewsletterMessageInfo = {
      newsletterJid: config.newsletterJid,
      newsletterName: config.channelName || config.botName || "Empire MD",
      serverMessageId: 1
    };
    ctx.isForwarded = true;
    ctx.forwardingScore = 1;
  }
  return ctx;
}

// Categorized catalog.
const CATALOG = {
  "📥 Media & Downloads": {
    "s": { d: "Sticker from replied/sent image or video", a: ["sticker"] },
    "play": { d: "Search & download a song as direct audio", a: [] },
    "ytmp3": { d: "YouTube link → MP3 audio", a: [] },
    "ytmp4": { d: "YouTube link → MP4 video", a: ["video"] },
    "insta": { d: "Download Instagram reel/post", a: ["ig"] },
    "tiktok": { d: "Download TikTok (no watermark)", a: ["tt"] },
    "fb": { d: "Download Facebook HD video", a: ["fbdl"] },
    "meme": { d: "Fetch a fresh meme", a: [] },
    "vv": { d: "Reveal replied view-once image/video/voice note", a: [] },
    "send": { d: "Save/steal replied status or media", a: ["get"] },
    "pp": { d: "Get a user's profile picture (reply/mention/number)", a: [] }
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
    "antilink": { d: "Per-group link protection (silent delete)", a: [] },
    "antimention": { d: "Per-group: delete status mentions (not chat tags)", a: ["am"] },
    "tag": { d: "Tag everyone silently (no name list)", a: [] },
    "greet": { d: "Per-group welcome on join (on/off/custom)", a: [] }
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
    "away": { d: "Away auto-reply for DMs & mentions (on/off or custom)", a: ["awaymode"] },
    "antidelete": { d: "Recover deleted messages: off/chat/dm", a: ["ad", "antidel"] },
    "anticall": { d: "Reject calls: all / list / off", a: ["at"] },
    "welcome": { d: "DM auto-welcome for new chats (business)", a: ["autogreet"] },
    "privacymode": { d: "Route .pp/.vv/.send results to DM (chat/dm)", a: ["pmode"] }
  },
  "👑 Owner & Self": {
    "setprefix": { d: "Change command prefix", a: ["sp"] },
    "setmode": { d: "Switch public/private", a: ["mode"] },
    "broadcast": { d: "Broadcast to all groups", a: ["bc"] },
    "setname": { d: "Update bot display name", a: ["sn"] },
    "setbio": { d: "Update bot bio", a: ["sb"] }
  },
  "🎭 Fun & Faith": {
    "joke": { d: "Random joke", a: [] },
    "fact": { d: "Random fact", a: [] },
    "bored": { d: "Suggest an activity", a: ["act"] },
    "bible": { d: "Random or specific Bible verse", a: ["verse"] },
    "quran": { d: "Qur'an ayah (random / 2:255 / surah)", a: ["qur", "ayat"] }
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
Bot: *${resolveBotName(sock, sock.botSettings)}* | Mode: *${((sock.botSettings?.mode) || config.mode || "private").toUpperCase()}*`
    }, { quoted: sent });
  },
  p: async (args) => module.exports.ping(args),

  // 📋 System Info (Alias: system)
  info: async ({ sock, chatJid, mek, settings }) => {
    const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
    const botName = resolveBotName(sock, settings);
    const px = settings?.prefix || config.prefix || ".";
    const modeLabel = (settings?.mode || config.mode || "private").toUpperCase();
    await sock.sendMessage(chatJid, {
      text: `🤖 *[${botName} SYSTEM PROFILE]*

✅ *Bot:* ${botName}
👤 *Owner:* ${config.ownerName}
⚙️ *Prefix:* ${px}
🔒 *Mode:* ${modeLabel}
🕒 *Uptime:* ${formatUptime(process.uptime())}
📦 *Platform:* ${process.platform}
💾 *Memory:* ${mem} MB`
    }, { quoted: mek });
  },
  system: async (args) => module.exports.info(args),

  // ❓ Menu (Alias: h, menu)
  help: async ({ sock, chatJid, mek, senderName, prefix, settings }) => {
    const px = prefix || settings?.prefix || config.prefix || ".";
    const botName = resolveBotName(sock, settings);
    const uptime = formatUptime(process.uptime());
    const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
    const dbConnected = !!process.env.SUPABASE_URL && !!process.env.SUPABASE_KEY;
    const dbStatus = dbConnected ? "🟢 Connected (Supabase)" : "🟡 Local Cache";
    const now = new Date().toLocaleString();

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

    const modeLabel = (settings?.mode || config.mode || "private").toUpperCase();
    let menu = `╭━━━〔 *✅ ${botName}* 〕━━━┈⊷
┃ 👋 Hello, *${senderName || "User"}*!
┃ 👑 *Owner:* ${config.ownerName}
┃ ⚙️ *Prefix:* ${px}
┃ 🔒 *Mode:* ${modeLabel}
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
┃ ${meta.d}
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
┃ ✅ *Verified · Official Channel*
┃ _Tap the channel card below_
┃
┃ _Powered by ${botName} • Made with ❤️_
╰━━━━━━━━━━━━━━━┈⊷`;

    try {
      const contextInfo = await buildChannelCard(sock, settings, {
        title: `✅ ${botName} · Official Channel`,
        body: 'Tap to view channel'
      });
      await sock.sendMessage(chatJid, { text: menu, contextInfo }, { quoted: mek });
    } catch (err) {
      console.error("Menu card error, sending plain menu:", err.message);
      await sock.sendMessage(chatJid, { text: menu }, { quoted: mek });
    }
  },
  h: async (args) => module.exports.help(args),
  menu: async (args) => module.exports.help(args),

  // 📋 Plain list
  list: async ({ sock, chatJid, mek, prefix }) => {
    const px = prefix || config.prefix || ".";
    let out = `📋 *Command List*
`;
    for (const [cat, cmds] of Object.entries(CATALOG)) {
      out += `*${cat}*
`;
      for (const [cmd, meta] of Object.entries(cmds)) {
        out += `• ${px}${cmd} — ${meta.d}
`;
      }
      out += `
`;
    }
    await sock.sendMessage(chatJid, { text: out }, { quoted: mek });
  },

  // 📥 FIXED SAVE/STEAL (With DM Routing)
  send: async ({ sock, chatJid, mek, settings }) => {
    try {
      const q = getQuoted(mek);
      if (!q) return sock.sendMessage(chatJid, { text: "❌ Reply to a status or media message with .send" }, { quoted: mek });
      const { message, type } = q;
      if (!['imageMessage', 'videoMessage', 'audioMessage'].includes(type)) {
        return sock.sendMessage(chatJid, { text: "❌ This media type is not supported." }, { quoted: mek });
      }
      const buffer = await downloadBuffer(message, type);
      const dest = await getDestination(sock, chatJid, settings);
      const caption = "📥 *Saved via Empire MD*";
      
      if (type === 'imageMessage') await sock.sendMessage(dest, { image: buffer, caption }, { quoted: mek });
      else if (type === 'videoMessage') await sock.sendMessage(dest, { video: buffer, caption }, { quoted: mek });
      else if (type === 'audioMessage') await sock.sendMessage(dest, { audio: buffer, mimetype: 'audio/mp4' }, { quoted: mek });

      // No feedback message — keep process clean
    } catch (err) {
      console.error("Send error:", err);
      await sock.sendMessage(chatJid, { text: "❌ Failed to save media." }, { quoted: mek });
    }
  },
  get: async (args) => module.exports.send(args),

  // 🎵 Play
  play: async ({ sock, chatJid, mek, text }) => {
    if (!text) return sock.sendMessage(chatJid, { text: "❌ Usage: .play song name" }, { quoted: mek });
    const yt = require('@vreden/youtube_scraper');
    try {
      const search = await yt.search(text);
      const video = search?.results?.find(v => v.type === 'video') || search?.results?.[0];
      if (!video || !video.url) {
        return sock.sendMessage(chatJid, { text: `❌ No results found for *"${text}"*.` }, { quoted: mek });
      }
      const dl = await yt.ytmp3(video.url, 128);
      if (!dl?.status || !dl?.download?.url) {
        return sock.sendMessage(chatJid, { text: "❌ Failed to fetch the audio." }, { quoted: mek });
      }
      const meta = dl.metadata || {};
      const title = meta.title || video.title || text;
      const fileName = `${title}.mp3`;
      const buf = await axios.get(dl.download.url, { responseType: 'arraybuffer', timeout: 60000 });
      await sock.sendMessage(chatJid, {
        audio: Buffer.from(buf.data),
        mimetype: 'audio/mpeg',
        fileName: fileName,
        ptt: false
      }, { quoted: mek });
      await sock.sendMessage(chatJid, {
        text: `🎵 *${title}*
👤 ${meta.author?.name || "Unknown"}
⏱️ ${meta.timestamp || "N/A"}
_✅ Powered by ${resolveBotName(sock, sock.botSettings)}_`
      }, { quoted: mek });
    } catch (err) {
      console.error("Play error:", err.message);
      await sock.sendMessage(chatJid, { text: `❌ Failed to download song.` }, { quoted: mek });
    }
  },

  // 📸 PP — profile picture (reply / mention / number). Works in groups AND private chats.
  pp: async ({ sock, chatJid, mek, quotedSender, contextInfo, args, isGroup, settings }) => {
    try {
      // Resolve target: reply → mention → typed number → self (group) / chat partner (DM)
      let target =
        quotedSender ||
        contextInfo?.participant ||
        (contextInfo?.mentionedJid && contextInfo.mentionedJid[0]) ||
        null;

      if (!target && args && args.length) {
        const num = args[0].replace(/[^0-9]/g, '');
        if (num.length >= 8) target = num + '@s.whatsapp.net';
      }

      if (!target) {
        // Group: default to bot's own PP. Private chat: the other person is chatJid.
        target = isGroup
          ? (sock.user.id.split(':')[0] + '@s.whatsapp.net')
          : chatJid;
      }

      // Normalize LID → PN if needed (best-effort)
      if (typeof target === 'string' && target.endsWith('@lid') && sock.signalRepository?.lidMapping?.getPNForLID) {
        try {
          const pn = await sock.signalRepository.lidMapping.getPNForLID(target);
          if (pn) target = pn;
        } catch (_) {}
      }

      const dest = await getDestination(sock, chatJid, settings);
      const url = await sock.profilePictureUrl(target, 'image');
      await sock.sendMessage(dest, {
        image: { url },
        caption: `📸 *Profile Picture*\nTarget: @${target.split('@')[0]}`,
        mentions: [target]
      }, { quoted: mek });
      // No feedback message — keep process clean
    } catch {
      await sock.sendMessage(chatJid, {
        text: "❌ No profile picture found (or it's hidden by privacy settings)."
      }, { quoted: mek });
    }
  },

  // 🛡️ ANTIDELETE TOGGLE
  antidelete: async ({ sock, chatJid, mek, text, isOwner, settings }) => {
    if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ This is an owner-only command!" }, { quoted: mek });
    const mode = (text || "").toLowerCase().trim();
    if (!["off", "chat", "dm"].includes(mode)) {
      return sock.sendMessage(chatJid, { 
        text: `🛡️ *Antidelete Settings*
Current: *${(settings?.antidelete || "off").toUpperCase()}*

👉 *.antidelete off*
👉 *.antidelete chat*
👉 *.antidelete dm*` 
      }, { quoted: mek });
    }

    await updateSettings(sock.sessionId, { antidelete: mode });
    sock.botSettings = { ...settings, antidelete: mode };
    await sock.sendMessage(chatJid, { text: `✅ *Antidelete* is now set to *${mode.toUpperCase()}*.` }, { quoted: mek });
  },
  ad: async (args) => module.exports.antidelete(args),
  antidel: async (args) => module.exports.antidelete(args),

  // ⚙️ PRIVACY MODE TOGGLE
  privacymode: async ({ sock, chatJid, mek, text, isOwner, settings }) => {
    if (!isOwner) return;
    const mode = (text || "").toLowerCase().trim();
    if (!["chat", "dm"].includes(mode)) {
      return sock.sendMessage(chatJid, { text: "⚙️ *Privacy Mode:* .privacymode [chat|dm]\n(Controls where .pp, .vv, and .send results are sent)" }, { quoted: mek });
    }
    await updateSettings(sock.sessionId, { privacyMode: mode });
    sock.botSettings = { ...settings, privacyMode: mode };
    await sock.sendMessage(chatJid, { text: `✅ *Privacy Mode* set to *${mode.toUpperCase()}*` }, { quoted: mek });
  },
  pmode: async (args) => module.exports.privacymode(args),

  // 👁️ VV — reveal view-once media (image / video / voice note). Works with DM routing.
  vv: async ({ sock, chatJid, mek, settings }) => {
    const q = getQuoted(mek);
    if (!q) return sock.sendMessage(chatJid, { text: "❌ Reply to a view-once message or voice note!" }, { quoted: mek });
    try {
      const { message, type } = q;
      const supported = ['imageMessage', 'videoMessage', 'audioMessage'];
      if (!supported.includes(type)) {
        return sock.sendMessage(chatJid, {
          text: "❌ Reply to a view-once *image*, *video*, or *voice note*."
        }, { quoted: mek });
      }
      const buffer = await downloadBuffer(message, type);
      const dest = await getDestination(sock, chatJid, settings);
      const who = (mek.quotedSender || chatJid).split('@')[0];
      const caption = `👁️ *Revealed* from @${who}`;
      const mentions = mek.quotedSender ? [mek.quotedSender] : [];

      if (type === 'imageMessage') {
        await sock.sendMessage(dest, { image: buffer, caption, mentions }, { quoted: mek });
      } else if (type === 'videoMessage') {
        await sock.sendMessage(dest, { video: buffer, caption, mentions }, { quoted: mek });
      } else if (type === 'audioMessage') {
        // Voice notes / PTT — send as audio (ptt if original was ptt)
        const isPtt = !!message.audioMessage?.ptt;
        await sock.sendMessage(dest, {
          audio: buffer,
          mimetype: message.audioMessage?.mimetype || 'audio/ogg; codecs=opus',
          ptt: isPtt,
          mentions
        }, { quoted: mek });
      }
      // No feedback message — keep process clean
    } catch (err) {
      console.error("vv error:", err);
      await sock.sendMessage(chatJid, { text: "❌ Failed to collect media." }, { quoted: mek });
    }
  }
};
      
