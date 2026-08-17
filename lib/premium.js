/**
 * Empire MD — Premium / Plan System
 * ==================================
 * Price: ₦1,500 / 30 days (base monthly rate)
 *
 * Free  → basic commands + promo footer on every reply
 * Premium → full features, no promo, ghost mode, antibot power
 *
 * Premium-only features:
 *   - ghostmode / ghost
 *   - antidelete (chat restore)
 *   - .vv (view-once collector)
 *   - .send
 *   - .pdf / receipt / invoice / ocr / doc / document
 *   - pmode / privatestatus
 *   - antibot (can suppress FREE bots only — never Premium)
 */

const config = require('../config');

const PREMIUM_PRICE = Number(config.premiumPrice) || 1500; // NGN, base monthly rate
const PREMIUM_DURATION_DAYS = Number(config.premiumDurationDays) || 30;
const UPGRADE_LINK =
  process.env.UPGRADE_LINK ||
  config.upgradeLink ||
  'https://empirebot.space/upgrade';

/** Commands that require an active Premium plan */
const PREMIUM_COMMANDS = new Set([
  'ghostmode',
  'ghost',
  'vv',
  'viewonce',
  'send',
  'pdf',
  'receipt',
  'invoice',
  'ocr',
  'doc',
  'document',
  'word',
  'excel',
  'xlsx',
  'pmode',
  'privatestatus',
  'antibot',
  'antidelete',
  'ai',
  'cs'
]);

/** Free-tier daily command quota (does not apply to Premium/whitelisted). */
const FREE_DAILY_LIMIT = Number(config.freeDailyLimit) || 20;

/** Commands that never count against the free daily quota — utility/nav
 * commands, and the auto-status toggles (the background loop they enable
 * doesn't run through the per-message handler anyway, but the toggle
 * command itself shouldn't burn a slot either). */
const QUOTA_EXEMPT_COMMANDS = new Set([
  'help', 'h', 'menu', 'list',
  'ping', 'p',
  'upgrade', 'plan',
  'auto', 'autostatus', 'autoreact',
  'asv', 'asr'
]);

/**
 * Multi-month plan pricing — geometric-progression discount.
 * Each additional month compounds a 5% reduction on the whole bundle price:
 *   total(months) = round50( months * PREMIUM_PRICE * (0.95 ^ (months - 1)) )
 * So the discount accelerates the longer the commitment, not a flat % off.
 */
const PLAN_MONTH_OPTIONS = [1, 2, 3, 6];
const GEOMETRIC_DISCOUNT_RATE = 0.05; // 5% compounding per additional month

function round50(n) {
  return Math.round(n / 50) * 50;
}

// Multi-country pricing — mirrors public/Frontend/src/lib/pricing.ts and
// public/Frontend/api/_shared/pricing.js. Each currency has its own base
// monthly price (deliberately set, not a live FX conversion) so the
// subscription price stays stable rather than floating with markets daily.
// Keep all three files in sync when pricing changes.
const CURRENCIES = {
  NGN: { code: 'NGN', country: 'Nigeria', basePrice: PREMIUM_PRICE },
  GHS: { code: 'GHS', country: 'Ghana', basePrice: 15 },
  XAF: { code: 'XAF', country: 'Cameroon', basePrice: 650 },
};

function roundForCurrency(n, currencyCode) {
  return currencyCode === 'NGN' ? round50(n) : Math.round(n);
}

/**
 * @param {number} months
 * @returns {{ months:number, naive:number, price:number, savings:number, savingsPct:number }}
 */
function calcPlanPrice(months) {
  return calcPlanPriceFor('NGN', months);
}

/**
 * @param {string} currencyCode
 * @param {number} months
 */
function calcPlanPriceFor(currencyCode, months) {
  const cfg = CURRENCIES[currencyCode] || CURRENCIES.NGN;
  const n = Math.max(1, Math.round(Number(months) || 1));
  const naive = n * cfg.basePrice;
  const multiplier = Math.pow(1 - GEOMETRIC_DISCOUNT_RATE, n - 1);
  const price = roundForCurrency(naive * multiplier, cfg.code);
  const savings = naive - price;
  const savingsPct = naive > 0 ? Math.round((savings / naive) * 100) : 0;
  return { months: n, naive, price, savings, savingsPct };
}

function isValidCurrency(code) {
  return Object.prototype.hasOwnProperty.call(CURRENCIES, String(code || '').toUpperCase());
}

/** Precomputed table for the supported plan tiers (1, 2, 3, 6 months). */
const PLAN_TIERS = PLAN_MONTH_OPTIONS.map(calcPlanPrice);

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
    `• PDF / Invoice / Receipt / OCR / Docs  • Private Status  • Antibot\n` +
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
    `💰 *₦${PREMIUM_PRICE} / 30 days* (longer plans cost less per month)\n\n` +
    `Benefits:\n` +
    `• Ghost Mode (silent replies)\n` +
    `• Anti-Delete Chat\n` +
    `• View-Once (.vv) & .send\n` +
    `• PDF / Invoice / Receipt / OCR / Docs\n` +
    `• Private Status Mode\n` +
    `• Antibot (suppress free bots)\n\n` +
    `👉 Upgrade: ${UPGRADE_LINK}\n` +
    `Or type *${prefix}upgrade*`
  );
}

/** Shown once a free bot hits its daily command quota. */
function quotaExceededMsg(prefix = '.') {
  return (
    `⏳ *Daily Quota Reached*\n\n` +
    `Free plan is limited to *${FREE_DAILY_LIMIT} commands/day*. You've used them all — ` +
    `quota resets in 24 hours.\n\n` +
    `💎 *Premium* has unlimited commands, no daily cap.\n` +
    `👉 Upgrade: ${UPGRADE_LINK}\n` +
    `Or type *${prefix}upgrade*`
  );
}

/**
 * Calculate new expiry date from now (or extend an existing future expiry).
 * @param {string|Date|null} currentExpires
 * @param {number} days
 * @returns {string} ISO string
 */
function calcExpiry(currentExpires, days = PREMIUM_DURATION_DAYS) {
  const base =
    currentExpires && new Date(currentExpires) > new Date()
      ? new Date(currentExpires)
      : new Date();
  base.setDate(base.getDate() + Number(days));
  return base.toISOString();
}

module.exports = {
  PREMIUM_PRICE,
  PREMIUM_DURATION_DAYS,
  UPGRADE_LINK,
  PREMIUM_COMMANDS,
  FREE_DAILY_LIMIT,
  QUOTA_EXEMPT_COMMANDS,
  PLAN_MONTH_OPTIONS,
  PLAN_TIERS,
  GEOMETRIC_DISCOUNT_RATE,
  calcPlanPrice,
  calcPlanPriceFor,
  isValidCurrency,
  CURRENCIES,
  isPremium,
  isPremiumCommand,
  freePromoFooter,
  premiumRequiredMsg,
  quotaExceededMsg,
  calcExpiry
};

