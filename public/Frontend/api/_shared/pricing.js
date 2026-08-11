// Server-side pricing source of truth. Mirrors ../../../../lib/premium.js
// (kept as a separate copy because this Vercel project deploys from
// public/Frontend only, and premium.js is CommonJS while this project is
// ESM). If you change pricing, update BOTH files.
//
// NEVER trust a price/amount sent by the client — always recompute it here
// from `months` and compare against what the payment provider reports paid.

export const PREMIUM_PRICE = 1500; // NGN per month, base rate
export const PREMIUM_DURATION_DAYS = 30;
export const PLAN_MONTH_OPTIONS = [1, 2, 3, 6];
export const GEOMETRIC_DISCOUNT_RATE = 0.05; // 5% compounding per extra month

function round50(n) {
  return Math.round(n / 50) * 50;
}

/**
 * @param {number} months
 * @returns {{months:number, naive:number, price:number, savings:number, savingsPct:number}}
 */
export function calcPlanPrice(months) {
  const n = Math.max(1, Math.round(Number(months) || 1));
  const naive = n * PREMIUM_PRICE;
  const multiplier = Math.pow(1 - GEOMETRIC_DISCOUNT_RATE, n - 1);
  const price = round50(naive * multiplier);
  const savings = naive - price;
  const savingsPct = naive > 0 ? Math.round((savings / naive) * 100) : 0;
  return { months: n, naive, price, savings, savingsPct };
}

export const PLAN_TIERS = PLAN_MONTH_OPTIONS.map(calcPlanPrice);

export function isValidMonths(months) {
  return PLAN_MONTH_OPTIONS.includes(Math.round(Number(months)));
}
