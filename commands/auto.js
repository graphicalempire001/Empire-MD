const config = require('../config');
const { updateSettings } = require('../lib/database');
const { isPremium, premiumRequiredMsg } = require('../lib/premium');

// Normalize a raw mention/number string down to bare digits for comparison
// against the participant JID (same approach botWorker.js uses for masters).
function normNumber(raw) {
  return String(raw || '').replace(/\D/g, '');
}

// Parse a free-text list of numbers separated by spaces, commas, or newlines.
function parseNumberList(text) {
  return String(text || '')
    .split(/[\s,]+/)
    .map(normNumber)
    .filter(Boolean);
}

// Shared random-emoji pool
const RANDOM_STATUS_EMOJIS = [
  "⚙️", "🔧", "🛠️", "⚡", "🔌", "💻", "🖥️", "📱",
  "🤖", "📡", "🛰️", "📶", "🔋", "💾", "🖱️", "⌨️",
  "🌐", "🔗", "📎", "📌", "📍", "🧩", "📦", "📁",
  "🗂️", "📊", "📈", "🧮", "⏱️", "🕒", "🔔", "☑️"
];
function pickRandomEmoji() {
  return RANDOM_STATUS_EMOJIS[Math.floor(Math.random() * RANDOM_STATUS_EMOJIS.length)];
}

// Helper: persist one or more setting changes for THIS bot, and keep the live socket in sync.
async function persist(sock, settings, patch) {
  const merged = { ...(settings || {}), ...patch };
  sock.botSettings = merged; // live session reflects change instantly
  if (sock.sessionId) {
    try { await updateSettings(sock.sessionId, patch); } catch (e) { console.error("persist error:", e.message); }
  }
  return merged;
}

module.exports = {
  RANDOM_STATUS_EMOJIS,
  pickRandomEmoji,

  // ⚙️ Auto Presence Settings (Alias: auto, presence)
  auto: async ({ sock, chatJid, mek, text, isOwner, settings }) => {
    if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ Owner only command!" }, { quoted: mek });
    const s = settings || {};
    if (!text) {
      return sock.sendMessage(chatJid, { text: `🤖 *Auto Presence Control (per-bot):*
👉 *.auto typing* - Toggle typing indicator (now: ${s.auttyping ? "ON" : "OFF"})
👉 *.auto recording* - Toggle recording indicator (now: ${s.autorecord ? "ON" : "OFF"})
👉 *.auto online* - Toggle always-online (now: ${s.alwaysOnline ? "ON" : "OFF"})` }, { quoted: mek });
    }
    const choice = text.toLowerCase().trim();
    if (choice === "typing") {
      const v = !s.auttyping;
      await persist(sock, s, { auttyping: v });
      await sock.sendMessage(chatJid, { text: `✅ *Auto Typing:* *${v ? "ON" : "OFF"}*` }, { quoted: mek });
    } else if (choice === "recording") {
      const v = !s.autorecord;
      await persist(sock, s, { autorecord: v });
      await sock.sendMessage(chatJid, { text: `✅ *Auto Recording:* *${v ? "ON" : "OFF"}*` }, { quoted: mek });
    } else if (choice === "online") {
      const v = !s.alwaysOnline;
      await persist(sock, s, { alwaysOnline: v });
      await sock.sendMessage(chatJid, { text: `✅ *Always Online:* *${v ? "ON" : "OFF"}*` }, { quoted: mek });
    } else {
      await sock.sendMessage(chatJid, { text: "❌ Invalid option! Choose: typing, recording, or online" }, { quoted: mek });
    }
  },
  presence: async (args) => module.exports.auto(args),

  // 👁️ Auto Status View — toggle + Premium filtering.
  //  .asv                        → toggle view-all on/off
  //  .asv mode                   → show current mode + list      (Premium)
  //  .asv mode all               → view every status              (Premium)
  //  .asv mode only 234801 234802 → view ONLY these numbers        (Premium)
  //  .asv mode omit 234801       → view everyone EXCEPT these      (Premium)
  //  .asv add 234801             → add number to the active list   (Premium)
  //  .asv remove 234801          → remove number from active list  (Premium)
  //  .asv list                   → show current mode + numbers     (Premium)
  autostatusview: async ({ sock, chatJid, mek, isOwner, settings, text }) => {
    if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ Owner only command!" }, { quoted: mek });
    const s = settings || {};
    const arg = (text || '').trim();
    const [sub, ...rest] = arg.split(/\s+/);
    const subCmd = (sub || '').toLowerCase();
    const restText = rest.join(' ');

    // Plain `.asv` with no args (or `.asv on`/`.asv off`) → original toggle behavior.
    if (!subCmd || subCmd === 'on' || subCmd === 'off') {
      const v = subCmd ? subCmd === 'on' : !(s.autostatusview);
      await persist(sock, s, { autostatusview: v });
      return sock.sendMessage(chatJid, { text: `✅ *Auto Status View:* *${v ? "ON" : "OFF"}*` }, { quoted: mek });
    }

    // Everything below (mode/add/remove/list) is a Premium feature.
    if (!isPremium(s)) {
      return sock.sendMessage(chatJid, { text: premiumRequiredMsg('asv mode') }, { quoted: mek });
    }

    if (subCmd === 'list') {
      const mode = s.asvMode || 'all';
      const nums = Array.isArray(s.asvNumbers) ? s.asvNumbers : [];
      const label = mode === 'only' ? '✅ Only viewing' : mode === 'omit' ? '🚫 Omitting' : 'Viewing everyone';
      return sock.sendMessage(chatJid, {
        text: `👁️ *Auto Status View*\n\n` +
          `Mode: *${mode.toUpperCase()}*\n` +
          `${label}${nums.length ? ':\n' + nums.map((n) => `• ${n}`).join('\n') : ''}`
      }, { quoted: mek });
    }

    if (subCmd === 'mode') {
      const modeArg = (rest[0] || '').toLowerCase();
      if (!modeArg) {
        const mode = s.asvMode || 'all';
        return sock.sendMessage(chatJid, {
          text: `👁️ *Current ASV mode:* *${mode.toUpperCase()}*\n\n` +
            `Change it with:\n` +
            `👉 *.asv mode all* — view everyone\n` +
            `👉 *.asv mode only 234801... 234802...* — view ONLY these\n` +
            `👉 *.asv mode omit 234801...* — view everyone EXCEPT these`
        }, { quoted: mek });
      }
      if (modeArg === 'all') {
        await persist(sock, s, { asvMode: 'all', asvNumbers: [] });
        return sock.sendMessage(chatJid, { text: `✅ *ASV mode:* now viewing *everyone's* status.` }, { quoted: mek });
      }
      if (modeArg === 'only' || modeArg === 'omit') {
        const nums = parseNumberList(restText.replace(new RegExp('^' + modeArg, 'i'), ''));
        if (!nums.length) {
          return sock.sendMessage(chatJid, {
            text: `❌ Give at least one number.\nExample: *.asv mode ${modeArg} 2348012345678*`
          }, { quoted: mek });
        }
        await persist(sock, s, { asvMode: modeArg, asvNumbers: nums });
        const label = modeArg === 'only' ? 'Only viewing statuses from' : 'Viewing everyone EXCEPT';
        return sock.sendMessage(chatJid, {
          text: `✅ *ASV mode:* *${modeArg.toUpperCase()}*\n${label}:\n${nums.map((n) => `• ${n}`).join('\n')}`
        }, { quoted: mek });
      }
      return sock.sendMessage(chatJid, { text: `❌ Invalid mode. Use: all, only, or omit.` }, { quoted: mek });
    }

    if (subCmd === 'add' || subCmd === 'remove') {
      const nums = parseNumberList(restText);
      if (!nums.length) {
        return sock.sendMessage(chatJid, { text: `❌ Give at least one number to ${subCmd}.` }, { quoted: mek });
      }
      const mode = s.asvMode && s.asvMode !== 'all' ? s.asvMode : 'only'; // default to whitelist if not set yet
      const current = new Set(Array.isArray(s.asvNumbers) ? s.asvNumbers : []);
      if (subCmd === 'add') {
        nums.forEach((n) => current.add(n));
      } else {
        nums.forEach((n) => current.delete(n));
      }
      const updated = Array.from(current);
      await persist(sock, s, { asvMode: mode, asvNumbers: updated });
      return sock.sendMessage(chatJid, {
        text: `✅ Updated *${mode.toUpperCase()}* list (${updated.length} number${updated.length === 1 ? '' : 's'}).\nType *.asv list* to view it.`
      }, { quoted: mek });
    }

    return sock.sendMessage(chatJid, {
      text: `❌ Unknown option. Use: *.asv*, *.asv mode*, *.asv add*, *.asv remove*, or *.asv list*`
    }, { quoted: mek });
  },
  // 🎟️ .free CODE — redeem an admin-issued coupon for temporary premium.
  // Coupons are created from the admin dashboard: pick a duration (e.g. 3 days),
  // generate a code, share it. This command applies it to the redeemer's number.
  free: async ({ sock, chatJid, mek, text, sender }) => {
    const code = (text || '').trim();
    if (!code) {
      return sock.sendMessage(chatJid, {
        text: `❌ Give me a coupon code!\n\nExample: *.free EMPIRE-XY7K2Q*`
      }, { quoted: mek });
    }
    const phoneNumber = String(sender || '').replace(/[^0-9]/g, '');
    if (!phoneNumber) {
      return sock.sendMessage(chatJid, { text: "❌ Couldn't read your number, try again." }, { quoted: mek });
    }

    const { redeemCoupon } = require('../lib/database');
    const result = await redeemCoupon(code, phoneNumber);

    if (!result.ok) {
      const messages = {
        invalid_code: '❌ That coupon code doesn\'t exist. Double-check it and try again.',
        inactive: '❌ That coupon has been deactivated.',
        expired: '❌ That coupon has expired.',
        exhausted: '❌ That coupon has already been fully redeemed by others.',
        already_redeemed: '❌ You\'ve already redeemed this coupon.',
      };
      return sock.sendMessage(chatJid, {
        text: messages[result.error] || `❌ Couldn't redeem that code: ${result.error}`
      }, { quoted: mek });
    }

    const expiresDate = result.expires_at ? new Date(result.expires_at) : null;
    const expiresLabel = expiresDate
      ? expiresDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'soon';

    return sock.sendMessage(chatJid, {
      text: `🎉 *Coupon Redeemed!*\n\n` +
        `✅ +${result.days} day${result.days === 1 ? '' : 's'} of *Premium* added\n` +
        `📅 Premium now active until *${expiresLabel}*\n\n` +
        `Enjoy unlimited commands, no daily quota, and every premium feature until then!`
    }, { quoted: mek });
  },
  asv: async (args) => module.exports.autostatusview(args),

  // 💖 Toggle auto-react to statuses (per-bot). Alias: asr
  //  .autostatusreact          → toggle on/off (random emoji mode)
  //  .autostatusreact 🔥       → turn on with a FIXED emoji
  //  .autostatusreact random   → force random-emoji mode on
  autostatusreact: async ({ sock, chatJid, mek, isOwner, settings, text }) => {
    if (!isOwner) return sock.sendMessage(chatJid, { text: "❌ Owner only command!" }, { quoted: mek });
    const arg = (text || "").trim();
    const patch = {};

    if (arg.toLowerCase() === "random" || arg === "") {
      patch.defaultStatusEmoji = null; // null = random mode
      patch.autostatusreact = arg ? true : !(settings?.autostatusreact);
    } else {
      patch.defaultStatusEmoji = arg; // fixed emoji
      patch.autostatusreact = true;
    }

    await persist(sock, settings, patch);
    const modeText = patch.autostatusreact
      ? (patch.defaultStatusEmoji ? `ON (fixed ${patch.defaultStatusEmoji})` : "ON (random emojis)")
      : "OFF";
    await sock.sendMessage(chatJid, { text: `✅ *Auto Status React:* *${modeText}*` }, { quoted: mek });
  },
  asr: async (args) => module.exports.autostatusreact(args),

  // 👋 DM Auto-Welcome (business) — greets new private chats only, never groups
  // .welcome              → status + help
  // .welcome on|off       → toggle
  // .welcome Hello! ...   → set custom message + turn ON
  welcome: async ({ sock, chatJid, mek, text, isOwner, settings }) => {
    if (!isOwner) {
      return sock.sendMessage(chatJid, { text: "❌ Owner only command!" }, { quoted: mek });
    }

    const s = settings || {};
    const arg = (text || "").trim();
    const low = arg.toLowerCase();

    if (!arg) {
      return sock.sendMessage(chatJid, {
        text: `👋 *DM Auto-Welcome* (business)
Status: *${s.autogreet ? "ON" : "OFF"}*
Message:
_${s.greetMessage || "(default: Hello and welcome! Type .help …)"}_

👉 *.welcome on* — enable for new private chats
👉 *.welcome off* — disable
👉 *.welcome Your custom text here* — set message & enable

_Only fires once per new DM contact. Never runs in groups._
_Tip: mention your channel, hours, or catalog in the message._`
      }, { quoted: mek });
    }

    const persist = async (patch) => {
      const { updateSettings } = require('../lib/database');
      const merged = { ...(s || {}), ...patch };
      sock.botSettings = merged;
      if (sock.sessionId) {
        try { await updateSettings(sock.sessionId, patch); }
        catch (e) { console.error("welcome persist:", e.message); }
      }
    };

    if (low === "on" || low === "enable") {
      await persist({ autogreet: true });
      return sock.sendMessage(chatJid, { text: "✅ *DM Welcome ON* — new private chats will get your welcome message." }, { quoted: mek });
    }
    if (low === "off" || low === "disable") {
      await persist({ autogreet: false });
      return sock.sendMessage(chatJid, { text: "✅ *DM Welcome OFF*." }, { quoted: mek });
    }

    // custom message → save + enable
    await persist({ autogreet: true, greetMessage: arg });
    await sock.sendMessage(chatJid, {
      text: `✅ *DM Welcome ON* with custom message:\n\n_${arg}_`
    }, { quoted: mek });
  },
  autogreet: async (args) => module.exports.welcome(args),

  // 👁️ Hide Presence — delayed blue ticks (Alias: hp, hidepresence)
  // Bot session never sends read receipts until it replies.
  // NOTE: Opening the chat on the PHONE app can still blue-tick unless
  // WhatsApp → Settings → Privacy → Read receipts is OFF on that phone.
  hp: async ({ sock, chatJid, mek, text, isOwner, settings }) => {
    if (!isOwner) {
      return sock.sendMessage(chatJid, { text: "❌ Owner only command!" }, { quoted: mek });
    }
    const s = settings || {};
    const arg = (text || "").toLowerCase().trim();
    let next;
    if (arg === "on" || arg === "enable") next = true;
    else if (arg === "off" || arg === "disable") next = false;
    else next = !s.hidePresence;

    const patch = {
      hidePresence: next,
      autoread: false
    };
    if (next) {
      patch.alwaysOnline = false;
      patch.auttyping = false;
      patch.autorecord = false;
    }
    await persist(sock, s, patch);

    if (next) {
      try { await sock.sendPresenceUpdate("unavailable"); } catch (_) {}
    }

    await sock.sendMessage(chatJid, {
      text: next
        ? `✅ *Hide Presence ON*
• Linked bot will not send blue ticks on receive
• Blue tick is sent only after this bot replies
• Online / typing indicators disabled for this session

⚠️ *Phone tip:* If you open the chat on your phone, WhatsApp itself may still blue-tick.
To block that too: *WhatsApp → Settings → Privacy → Read receipts → OFF*`
        : "✅ *Hide Presence OFF* — normal behaviour restored."
    }, { quoted: mek });
  },
  hidepresence: async (args) => module.exports.hp(args),
};
