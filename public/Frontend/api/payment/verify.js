// POST /api/payment/verify
// Body: { phone: "2348012345678", months: 1|2|3|6, transaction_id: "..." }
//
// Flow:
//  1. Recompute the expected price server-side from `months` (never trust
//     a client-sent amount — that's how people 1-naira their way to Premium).
//  2. Verify the transaction with Flutterwave using the SECRET key
//     (server-side only, never exposed to the browser).
//  3. Confirm status === 'successful', currency === 'NGN', amount paid >=
//     expected price.
//  4. Look up the bot registered under that phone number in Supabase.
//  5. Extend/activate Premium for `months` worth of days, log the payment.
//
// Env vars required (set in Vercel project settings):
//   FLW_SECRET_KEY      - Flutterwave secret key (server-side only)
//   SUPABASE_URL
//   SUPABASE_KEY        - service_role key (RLS denies anon/auth writes)

import { createClient } from '@supabase/supabase-js';
import { calcPlanPrice, isValidMonths, PREMIUM_DURATION_DAYS } from '../_shared/pricing.js';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function verifyWithFlutterwave(transactionId) {
  const secret = process.env.FLW_SECRET_KEY;
  if (!secret) throw new Error('FLW_SECRET_KEY not configured');
  const res = await fetch(
    `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transactionId)}/verify`,
    { headers: { Authorization: `Bearer ${secret}` } }
  );
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Flutterwave verify ${res.status}: ${t.slice(0, 200)}`);
  }
  const body = await res.json();
  return body?.data || null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { phone, months, transaction_id } = req.body || {};
    const cleanPhone = String(phone || '').replace(/[^0-9]/g, '');

    if (!cleanPhone) {
      return res.status(400).json({ success: false, error: 'phone is required' });
    }
    if (!isValidMonths(months)) {
      return res.status(400).json({ success: false, error: 'invalid months — choose 1, 2, 3 or 6' });
    }
    if (!transaction_id) {
      return res.status(400).json({ success: false, error: 'transaction_id is required' });
    }

    const expected = calcPlanPrice(months);

    // 1. Verify with Flutterwave — source of truth for what was actually paid.
    let txn;
    try {
      txn = await verifyWithFlutterwave(transaction_id);
    } catch (e) {
      console.error('[payment/verify] Flutterwave error:', e.message);
      return res.status(502).json({ success: false, error: 'Could not reach payment provider. Try again shortly.' });
    }

    if (!txn) {
      return res.status(400).json({ success: false, error: 'Transaction not found' });
    }
    if (txn.status !== 'successful') {
      return res.status(200).json({
        success: false,
        error: `Payment not completed (status: ${txn.status}). If money left your account, it should reverse automatically within a few minutes.`,
      });
    }
    if (String(txn.currency).toUpperCase() !== 'NGN') {
      return res.status(400).json({ success: false, error: 'Unexpected currency on transaction' });
    }
    if (Number(txn.amount) < expected.price) {
      console.error('[payment/verify] amount mismatch', { paid: txn.amount, expected: expected.price });
      return res.status(400).json({ success: false, error: 'Amount paid does not match the selected plan' });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return res.status(500).json({ success: false, error: 'Database not configured' });
    }

    // 2. Find the bot registered to this phone number.
    const { data: bot, error: lookupErr } = await supabase
      .from('bot_registry')
      .select('session_id, plan, plan_expires_at, bot_name')
      .eq('phone_number', cleanPhone)
      .order('last_active', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (lookupErr) {
      console.error('[payment/verify] lookup error:', lookupErr.message);
      return res.status(500).json({ success: false, error: 'Lookup failed' });
    }
    if (!bot) {
      // No bot paired to this number yet — that's fine now, Premium is tracked
      // by phone number. Activate it anyway so it's already active the moment
      // they pair, and log the payment.
      const days = months * PREMIUM_DURATION_DAYS;
      const { data: activation, error: rpcErr } = await supabase.rpc('activate_premium_by_phone', {
        p_phone: cleanPhone,
        p_days: days,
        p_payment_ref: String(transaction_id),
      });

      await supabase.from('payments').insert({
        session_id: null,
        phone_number: cleanPhone,
        amount: txn.amount,
        currency: 'NGN',
        provider: 'flutterwave',
        reference: String(transaction_id),
        status: 'success',
        metadata: { months, tx: txn },
        paid_at: new Date().toISOString(),
      });

      if (rpcErr || !activation?.ok) {
        console.error('[payment/verify] phone activation failed:', rpcErr?.message || activation?.error);
        return res.status(200).json({
          success: false,
          error:
            'Payment received, but activation failed. Contact support with your payment reference — nothing is lost.',
          reference: String(transaction_id),
        });
      }

      return res.status(200).json({
        success: true,
        plan: 'premium',
        expires_at: activation.expires_at,
        months,
        amount_paid: txn.amount,
        note: 'Premium is active on your number — pair your bot now and it will pick this up automatically.',
      });
    }

    // 3. Activate/extend Premium by PHONE NUMBER — this is what survives a
    // disconnect/reconnect, since reconnecting mints a brand-new session_id.
    // We also patch the currently-live bot_registry row so the UI reflects
    // it immediately without waiting for the bot to re-register.
    const days = months * PREMIUM_DURATION_DAYS;
    const { data: activation, error: rpcErr } = await supabase.rpc('activate_premium_by_phone', {
      p_phone: cleanPhone,
      p_days: days,
      p_payment_ref: String(transaction_id),
    });

    if (rpcErr || !activation?.ok) {
      console.error('[payment/verify] activation failed:', rpcErr?.message || activation?.error);
      return res.status(500).json({
        success: false,
        error: 'Payment verified but activation failed. Contact support with your payment reference — you will not lose this payment.',
        reference: String(transaction_id),
      });
    }

    // Mirror onto the live session row too, so the bot's own premium-gate
    // checks (which currently read bot_registry) see it without a re-register.
    await supabase
      .from('bot_registry')
      .update({ plan: 'premium', plan_expires_at: activation.expires_at, payment_ref: String(transaction_id) })
      .eq('session_id', bot.session_id);

    // 4. Log the payment for records/admin reconciliation.
    await supabase.from('payments').insert({
      session_id: bot.session_id,
      phone_number: cleanPhone,
      amount: txn.amount,
      currency: 'NGN',
      provider: 'flutterwave',
      reference: String(transaction_id),
      status: 'success',
      metadata: { months, tx: txn },
      paid_at: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      session_id: bot.session_id,
      bot_name: bot.bot_name,
      plan: 'premium',
      expires_at: activation.expires_at,
      months,
      amount_paid: txn.amount,
    });
  } catch (e) {
    console.error('[api/payment/verify] error:', e);
    return res.status(500).json({ success: false, error: 'internal error' });
  }
}
