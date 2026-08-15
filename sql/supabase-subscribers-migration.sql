-- Empire MD — Subscribers migration
-- Tracks premium/whitelist status by PHONE NUMBER, decoupled from bot_registry's
-- session_id lifecycle. This is what lets a paying user disconnect and reconnect
-- (which mints a brand-new session_id) without losing their remaining Premium time —
-- the old bot_registry row can even be deleted by the inactivity cleanup job and this
-- table is untouched.

CREATE TABLE IF NOT EXISTS public.subscribers (
  phone_number      TEXT PRIMARY KEY,                 -- digits only, no + or leading 0
  plan              TEXT NOT NULL DEFAULT 'free'
                      CHECK (plan IN ('free', 'premium')),
  plan_expires_at   TIMESTAMPTZ,
  is_whitelisted    BOOLEAN NOT NULL DEFAULT false,    -- admin manual override, no expiry
  whitelist_reason  TEXT,
  last_payment_ref  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscribers_plan
  ON public.subscribers (plan);

CREATE INDEX IF NOT EXISTS idx_subscribers_whitelisted
  ON public.subscribers (is_whitelisted)
  WHERE is_whitelisted = true;

CREATE INDEX IF NOT EXISTS idx_subscribers_expires
  ON public.subscribers (plan_expires_at);

-- Activate/extend premium for a PHONE NUMBER (accumulates on top of remaining time,
-- same accrual behaviour as the existing session-based activate_premium).
CREATE OR REPLACE FUNCTION public.activate_premium_by_phone(
  p_phone        TEXT,
  p_days         INTEGER DEFAULT 30,
  p_payment_ref  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_expires TIMESTAMPTZ;
  v_row     public.subscribers%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.subscribers WHERE phone_number = p_phone;

  IF FOUND AND v_row.plan = 'premium' AND v_row.plan_expires_at IS NOT NULL AND v_row.plan_expires_at > NOW() THEN
    v_expires := v_row.plan_expires_at + (p_days || ' days')::INTERVAL;
  ELSE
    v_expires := NOW() + (p_days || ' days')::INTERVAL;
  END IF;

  INSERT INTO public.subscribers (phone_number, plan, plan_expires_at, last_payment_ref, updated_at)
  VALUES (p_phone, 'premium', v_expires, p_payment_ref, NOW())
  ON CONFLICT (phone_number) DO UPDATE SET
    plan             = 'premium',
    plan_expires_at  = v_expires,
    last_payment_ref = COALESCE(p_payment_ref, public.subscribers.last_payment_ref),
    updated_at       = NOW();

  RETURN jsonb_build_object('ok', true, 'phone_number', p_phone, 'plan', 'premium', 'expires_at', v_expires);
END;
$$;

-- Admin manual whitelist by phone number (no expiry — stays premium until removed).
CREATE OR REPLACE FUNCTION public.set_whitelist_by_phone(
  p_phone   TEXT,
  p_enabled BOOLEAN DEFAULT true,
  p_reason  TEXT DEFAULT 'admin'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.subscribers (phone_number, is_whitelisted, whitelist_reason, updated_at)
  VALUES (p_phone, p_enabled, CASE WHEN p_enabled THEN p_reason ELSE NULL END, NOW())
  ON CONFLICT (phone_number) DO UPDATE SET
    is_whitelisted   = p_enabled,
    whitelist_reason = CASE WHEN p_enabled THEN p_reason ELSE NULL END,
    updated_at       = NOW();

  RETURN jsonb_build_object('ok', true, 'phone_number', p_phone, 'whitelisted', p_enabled);
END;
$$;

DROP TRIGGER IF EXISTS trg_subscribers_updated_at ON public.subscribers;
CREATE TRIGGER trg_subscribers_updated_at
  BEFORE UPDATE ON public.subscribers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_all_subscribers" ON public.subscribers;
CREATE POLICY "deny_all_subscribers" ON public.subscribers
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

GRANT ALL ON public.subscribers TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.activate_premium_by_phone TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.set_whitelist_by_phone TO postgres, service_role;
