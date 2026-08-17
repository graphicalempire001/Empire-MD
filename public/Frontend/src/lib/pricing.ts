// Client-side mirror of api/_shared/pricing.js — for display only.
// The server independently recomputes and enforces this at
// /api/payment/verify, so this file being wrong would only mislead the UI,
// never let anyone underpay. Keep both in sync when the price changes.

export const PREMIUM_PRICE = 1500; // NGN per month, base rate
export const PREMIUM_DURATION_DAYS = 30;
export const PLAN_MONTH_OPTIONS = [1, 2, 3, 6] as const;
const GEOMETRIC_DISCOUNT_RATE = 0.05;

// Multi-country pricing. Each currency has its own base monthly price (set
// deliberately, not a live FX conversion) so the subscription price stays
// stable and predictable rather than floating with currency markets day to
// day. Seed values below were set from approximate NGN->GHS/XAF market rates
// (~0.0083 and ~0.41 respectively) — review and adjust periodically, these
// will drift out of date as rates move.
export interface CurrencyConfig {
  code: 'NGN' | 'GHS' | 'XAF';
  country: string;
  symbol: string;
  basePrice: number; // per month, in this currency's smallest-common display unit
  // Flutterwave payment_options, in DISPLAY ORDER — bank/mobile money first,
  // card last, per product decision to prioritize bank/mobile money.
  paymentOptions: string;
}

export const CURRENCIES: Record<string, CurrencyConfig> = {
  NGN: { code: 'NGN', country: 'Nigeria', symbol: '₦', basePrice: 1500, paymentOptions: 'banktransfer,ussd,card,mobilemoney' },
  GHS: { code: 'GHS', country: 'Ghana', symbol: 'GH₵', basePrice: 15, paymentOptions: 'mobilemoneyghana,card' },
  XAF: { code: 'XAF', country: 'Cameroon', symbol: 'FCFA', basePrice: 650, paymentOptions: 'mobilemoneyfranco,card' },
};

export function calcPlanPriceFor(currencyCode: string, months: number): PlanTier {
  const cfg = CURRENCIES[currencyCode] || CURRENCIES.NGN;
  const n = Math.max(1, Math.round(months || 1));
  const naive = n * cfg.basePrice;
  const multiplier = Math.pow(1 - GEOMETRIC_DISCOUNT_RATE, n - 1);
  const price = roundForCurrency(naive * multiplier, currencyCode);
  const savings = naive - price;
  const savingsPct = naive > 0 ? Math.round((savings / naive) * 100) : 0;
  return { months: n, naive, price, savings, savingsPct };
}

function roundForCurrency(n: number, currencyCode: string) {
  // NGN prices round to the nearest 50; smaller-denomination currencies
  // (Ghana Cedi, CFA Franc) round to the nearest whole unit instead, since
  // "nearest 50" would be far too coarse at their price scale.
  return currencyCode === 'NGN' ? Math.round(n / 50) * 50 : Math.round(n);
}

export interface PlanTier {
  months: number;
  naive: number;
  price: number;
  savings: number;
  savingsPct: number;
}

export function calcPlanPrice(months: number): PlanTier {
  return calcPlanPriceFor('NGN', months);
}

export const PLAN_TIERS: PlanTier[] = PLAN_MONTH_OPTIONS.map(calcPlanPrice);

export function formatNaira(n: number) {
  return `₦${n.toLocaleString('en-NG')}`;
}

export function formatCurrency(n: number, currencyCode: string) {
  const cfg = CURRENCIES[currencyCode] || CURRENCIES.NGN;
  return `${cfg.symbol}${n.toLocaleString('en-NG')}`;
}
