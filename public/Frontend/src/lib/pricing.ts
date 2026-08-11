// Client-side mirror of api/_shared/pricing.js — for display only.
// The server independently recomputes and enforces this at
// /api/payment/verify, so this file being wrong would only mislead the UI,
// never let anyone underpay. Keep both in sync when the price changes.

export const PREMIUM_PRICE = 1500; // NGN per month, base rate
export const PREMIUM_DURATION_DAYS = 30;
export const PLAN_MONTH_OPTIONS = [1, 2, 3, 6] as const;
const GEOMETRIC_DISCOUNT_RATE = 0.05;

export interface PlanTier {
  months: number;
  naive: number;
  price: number;
  savings: number;
  savingsPct: number;
}

function round50(n: number) {
  return Math.round(n / 50) * 50;
}

export function calcPlanPrice(months: number): PlanTier {
  const n = Math.max(1, Math.round(months || 1));
  const naive = n * PREMIUM_PRICE;
  const multiplier = Math.pow(1 - GEOMETRIC_DISCOUNT_RATE, n - 1);
  const price = round50(naive * multiplier);
  const savings = naive - price;
  const savingsPct = naive > 0 ? Math.round((savings / naive) * 100) : 0;
  return { months: n, naive, price, savings, savingsPct };
}

export const PLAN_TIERS: PlanTier[] = PLAN_MONTH_OPTIONS.map(calcPlanPrice);

export function formatNaira(n: number) {
  return `₦${n.toLocaleString('en-NG')}`;
}
