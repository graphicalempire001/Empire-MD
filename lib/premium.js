/**
 * Empire MD — Premium / Plan System
 * ==================================
 * Price: ₦1,500 / 30 days
 *
 * Free  → basic commands + promo footer on every reply
 * Premium → full features, no promo, ghost mode, antibot power
 *
 * Premium-only features:
 *   - ghostmode / ghost
 *   - antidelete chat restore
 *   - .vv (view-once collector)
 *   - .send
 *   - .pdf / receipt / doc / document
 *   - pmode / privatestatus
 *   - antibot (can suppress FREE bots only — never Premium)
 */

const config = require('../config');

const PREMIUM_PRICE = Number(config.premiumPrice) || 1500; // NGN
const PREMIUM_DURATION_DAYS = Number(config.premiumDurationDays) || 30;
const UPGRADE_LINK =
  process.env.UPGRADE_LINK ||
  config.upgradeLink ||
  'https://empire-md.vercel.app/upgrade';

/** Commands that require an active Premium plan */
const PREMIUM_COMMANDS = new Set([
  'ghostmode',
  'ghost',
  'vv',
  'viewonce',
  'send',
  'pdf',
  'receipt',
  'doc',
  'document',
  'pmode',
  'privatestatus',
  'antibot'
]);

/**
 * Resolve whether a bot session is currently Premium.
 * Priority: admin whitelist > active paid plan > free
 *
 * @param {object} settings  - per-session settings JSON
 * @param {object} registryRow - row from bot_registry (optional)
 * @returns {boolean}
 */
function isPremium(settings = {}, registryRow = {}) {
  if (registryRow.is_whitelisted === true || settings.is_whitelisted === true) {
    return true;
  }

  const plan = String(registryRow.plan || settings.plan || 'free').toLowerCase();
  if (plan !== 'premium') return false;

  const expires = registryRow.plan_expires_at || settings.plan_expires_at;
  if (!expires) return true; // no expiry = treat as active (admin override)
  return new Date(expires) > new Date();
}

/** @param {string} cmd */
function isPremiumCommand(cmd) {
  return PREMIUM_COMMANDS.has(String(cmd || '').toLowerCase());
}

/**
 * Free-tier promotional footer appended under command replies.
 * @param {string} prefix
 */
function freePromoFooter(prefix = '.') {
  return (
    `\n\n━━━━━━━━━━━━━━━━━━━━\n` +
    `🔒 *Free Plan*\n` +
    `Upgrade to *Premium* (₦${PREMIUM_PRICE}/mo) for:\n` +
    `• Ghost Mode  • Anti-Delete Chat  • .vv / .send\n` +
    `• PDF / Docs  • Private Status  • Antibot\n` +
    `👉 ${UPGRADE_LINK}\n` +
    `Or type *${prefix}upgrade*`
  );
}

/**
 * Message shown when a free user tries a Premium command.
 * @param {string} cmd
 * @param {string} prefix
 */
function premiumRequiredMsg(cmd, prefix = '.') {
  return (
    `🔒 *Premium Feature*\n\n` +
    `\`${prefix}${cmd}\` is available only on *Premium* plan.\n\n` +
    `💰 *₦${PREMIUM_PRICE} / 30 days*\n\n` +
    `Benefits:\n` +
    `• Ghost Mode (silent replies)\n` +
    `• Anti-Delete Chat\n` +
    `• View-Once (.vv) & .send\n` +
    `• PDF / Receipt / Docs\n` +
    `• Private Status Mode\n` +
    `• Antibot (suppress free bots)\n\n` +
    `👉 Upgrade: ${UPGRADE_LINK}\n` +
    `Or type *${prefix}upgrade*`
  );
}

/**
 * Calculate new expiry date from now (or extend an existing future expiry).
 * @param {string|Date|null} currentExpires
 * @returns {string} ISO string
 */
function calcExpiry(currentExpires) {
  const base =
    currentExpires && new Date(currentExpires) > new Date()
      ? new Date(currentExpires)
      : new Date();
  base.setDate(base.getDate() + PREMIUM_DURATION_DAYS);
  return base.toISOString();
}

module.exports = {
  PREMIUM_PRICE,
  PREMIUM_DURATION_DAYS,
  UPGRADE_LINK,
  PREMIUM_COMMANDS,
  isPremium,
  isPremiumCommand,
  freePromoFooter,
  premiumRequiredMsg,
  calcExpiry
};
