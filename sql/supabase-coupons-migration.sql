-- ============================================================================
-- Coupon Codes — admin-generated codes users redeem via `.free CODE` to get
-- temporary premium (extra days, no daily quota) without paying.
-- Run this AFTER supabase-premium-migration.sql (reuses bot_registry/subscribers).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.coupons (
  code            TEXT PRIMARY KEY,                 -- e.g. EMPIRE-XY7K2Q (case-insensitive, stored upper)
  days            INTEGER NOT NULL CHECK (days > 0), -- premium days granted on redemption
  max_uses        INTEGER NOT NULL DEFAULT 1 CHECK (max_uses > 0),
  uses_count      INTEGER NOT NULL DEFAULT 0,
  active          BOOLEAN NOT NULL DEFAULT true,
  expires_at      TIMESTAMPTZ,                       -- optional: code itself expires if unused by this date
  note            TEXT,                              -- admin label, e.g. "TikTok giveaway Aug 2026"
  created_by      TEXT,                               -- admin identifier
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupons_active ON public.coupons (active) WHERE active = true;

-- One redemption row per (code, phone) — prevents the same number reusing
-- one code twice even if max_uses allows other users to redeem it.
CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id              BIGSERIAL PRIMARY KEY,
  code            TEXT NOT NULL REFERENCES public.coupons(code) ON DELETE CASCADE,
  phone_number    TEXT NOT NULL,
  redeemed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_coupon_redemption UNIQUE (code, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_code ON public.coupon_redemptions (code);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_phone ON public.coupon_redemptions (phone_number);

-- Atomic redeem: validates + increments uses_count + inserts redemption row +
-- extends premium, all in one transaction so concurrent redemptions can't
-- both squeeze past max_uses (classic race condition otherwise).
CREATE OR REPLACE FUNCTION public.redeem_coupon(p_code TEXT, p_phone TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_code TEXT := upper(trim(p_code));
  v_phone TEXT := regexp_replace(p_phone, '[^0-9]', '', 'g');
  v_coupon public.coupons%ROWTYPE;
  v_result JSONB;
BEGIN
  IF v_phone = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'phone required');
  END IF;

  SELECT * INTO v_coupon FROM public.coupons WHERE code = v_code FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;
  IF NOT v_coupon.active THEN
    RETURN jsonb_build_object('ok', false, 'error', 'inactive');
  END IF;
  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < NOW() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;
  IF v_coupon.uses_count >= v_coupon.max_uses THEN
    RETURN jsonb_build_object('ok', false, 'error', 'exhausted');
  END IF;
  IF EXISTS (SELECT 1 FROM public.coupon_redemptions WHERE code = v_code AND phone_number = v_phone) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_redeemed');
  END IF;

  INSERT INTO public.coupon_redemptions (code, phone_number) VALUES (v_code, v_phone);

  UPDATE public.coupons SET uses_count = uses_count + 1 WHERE code = v_code;

  -- Reuse the same accrual logic as paid activation: stacks on remaining time.
  SELECT public.activate_premium_by_phone(v_phone, v_coupon.days, ('coupon:' || v_code)) INTO v_result;

  RETURN jsonb_build_object(
    'ok', true,
    'phone_number', v_phone,
    'days', v_coupon.days,
    'expires_at', v_result->>'expires_at'
  );
END;
$$;

-- Admin: create a coupon. Generates a random code if none supplied.
CREATE OR REPLACE FUNCTION public.create_coupon(
  p_days INTEGER,
  p_max_uses INTEGER DEFAULT 1,
  p_note TEXT DEFAULT NULL,
  p_created_by TEXT DEFAULT 'admin',
  p_code TEXT DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_code TEXT;
BEGIN
  v_code := upper(trim(COALESCE(p_code, 'EMPIRE-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6))));

  INSERT INTO public.coupons (code, days, max_uses, note, created_by, expires_at)
  VALUES (v_code, p_days, GREATEST(p_max_uses, 1), p_note, p_created_by, p_expires_at);

  RETURN jsonb_build_object('ok', true, 'code', v_code, 'days', p_days, 'max_uses', GREATEST(p_max_uses, 1));
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_coupon TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.create_coupon TO postgres, service_role;

