-- ============================================================================
-- EMPIRE MD — COMPLETE SUPABASE SCHEMA (FROM SCRATCH)
-- ============================================================================
-- Run this ENTIRE file once in a NEW Supabase project:
--   Dashboard → SQL Editor → New query → Paste → Run
--
-- Covers:
--   • bot_registry   (every bot / session / plan / stats / settings JSON)
--   • ai_memory      (per-bot, per-user AI conversation history)
--   • payments       (Paystack / Flutterwave / manual)
--   • platform_config (global admin settings for public page + admin panel)
--   • RPCs           (increment_usage, increment_command_count)
--   • Indexes, views, helpers
--
-- Session IDs are expected in the form:  EMPIRE-MD_<BOTNAME>_<SUFFIX>
-- (Change generateSessionId() in server.js from BOTWAN_ to EMPIRE-MD_)
--
-- No row limits. Service-role key bypasses RLS for the Node backend.
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- optional fuzzy search on bot names


-- ============================================================================
-- 1. bot_registry  — core multi-bot registry
-- ============================================================================
-- One row = one paired WhatsApp bot instance.
-- `settings` JSONB holds per-bot runtime config (prefix, mode, ownerNumber,
-- ghostMode, antilink, welcome, aichatmode, anticall, etc.)

CREATE TABLE IF NOT EXISTS public.bot_registry (
  -- Identity
  session_id          TEXT PRIMARY KEY,                 -- e.g. EMPIRE-MD_MYBOT_A1B2C
  bot_name            TEXT NOT NULL,
  phone_number        TEXT,                             -- paired WhatsApp number (digits only)
  owner_phone         TEXT,                             -- optional explicit owner (digits)

  -- Lifecycle
  status              TEXT NOT NULL DEFAULT 'online'
                        CHECK (status IN ('online', 'offline', 'paused', 'banned')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active         TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),

  -- Usage counters (admin dashboard + leaderboard)
  message_count       BIGINT NOT NULL DEFAULT 0,
  command_count       BIGINT NOT NULL DEFAULT 0,

  -- Moderation / abuse
  is_abusive          BOOLEAN NOT NULL DEFAULT false,
  abuse_reason        TEXT,

  -- Premium / monetization
  plan                TEXT NOT NULL DEFAULT 'free'
                        CHECK (plan IN ('free', 'premium')),
  plan_expires_at     TIMESTAMPTZ,
  is_whitelisted      BOOLEAN NOT NULL DEFAULT false,  -- admin force-premium
  whitelist_reason    TEXT,
  payment_ref         TEXT,                             -- last successful payment reference

  -- Per-bot runtime configuration (prefix, mode, features, owners…)
  -- See comment block below for expected keys.
  settings            JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Optional free-form notes for admin
  admin_notes         TEXT
);

COMMENT ON TABLE public.bot_registry IS
  'Empire MD multi-bot registry. session_id is the primary key (EMPIRE-MD_NAME_XXXXX).';

COMMENT ON COLUMN public.bot_registry.settings IS
  'JSONB per-bot config. Expected keys include:
   botName, prefix, mode ("public"|"private"),
   ownerNumber (text[]), plan, plan_expires_at, is_whitelisted, ghostMode,
   autostatusview, autostatusreact, defaultStatusEmoji, autoviewonce,
   autodownload, autoread, auttyping, autorecord, autoreply,
   antidelete ("off"|"chat"|"dm"|true), antilink, antispam, antitoxic,
   antibot, antifake, antiarabic, alwaysOnline, welcome, goodbye,
   aichatmode ("off"|"mention"|"aggressive"), autogreet, greetMessage,
   awaymode, awayMessage, hidePresence, anticallMode, anticallList,
   channelUrl, channelName, channelThumb, newsletterJid,
   _groupAntibot (object), _antibotSuppressed (bool)';

-- Unique bot names (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS uq_bot_registry_bot_name_lower
  ON public.bot_registry (lower(trim(bot_name)));

-- Performance indexes (no artificial limits)
CREATE INDEX IF NOT EXISTS idx_bot_registry_status
  ON public.bot_registry (status);

CREATE INDEX IF NOT EXISTS idx_bot_registry_plan
  ON public.bot_registry (plan);

CREATE INDEX IF NOT EXISTS idx_bot_registry_last_active
  ON public.bot_registry (last_active DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_bot_registry_created_at
  ON public.bot_registry (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bot_registry_message_count
  ON public.bot_registry (message_count DESC);

CREATE INDEX IF NOT EXISTS idx_bot_registry_phone
  ON public.bot_registry (phone_number);

CREATE INDEX IF NOT EXISTS idx_bot_registry_is_abusive
  ON public.bot_registry (is_abusive)
  WHERE is_abusive = true;

CREATE INDEX IF NOT EXISTS idx_bot_registry_whitelisted
  ON public.bot_registry (is_whitelisted)
  WHERE is_whitelisted = true;

CREATE INDEX IF NOT EXISTS idx_bot_registry_settings_gin
  ON public.bot_registry USING GIN (settings);


-- ============================================================================
-- 2. ai_memory  — per-bot, per-user conversation history
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ai_memory (
  id              BIGSERIAL PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES public.bot_registry(session_id) ON DELETE CASCADE,
  user_jid        TEXT NOT NULL,                    -- e.g. 2348012345678@s.whatsapp.net
  display_name    TEXT,
  history         JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{role, content}, …]
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_ai_memory_session_user UNIQUE (session_id, user_jid)
);

CREATE INDEX IF NOT EXISTS idx_ai_memory_session
  ON public.ai_memory (session_id);

CREATE INDEX IF NOT EXISTS idx_ai_memory_user
  ON public.ai_memory (user_jid);

CREATE INDEX IF NOT EXISTS idx_ai_memory_updated
  ON public.ai_memory (updated_at DESC);


-- ============================================================================
-- 3. payments  — monetization ledger
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      TEXT REFERENCES public.bot_registry(session_id) ON DELETE SET NULL,
  phone_number    TEXT,
  amount          NUMERIC(12, 2) NOT NULL DEFAULT 1500,
  currency        TEXT NOT NULL DEFAULT 'NGN',
  provider        TEXT,                             -- paystack | flutterwave | stripe | manual
  reference       TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'success', 'failed', 'abandoned', 'reversed')),
  metadata        JSONB DEFAULT '{}'::jsonb,        -- raw provider payload if needed
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payments_session
  ON public.payments (session_id);

CREATE INDEX IF NOT EXISTS idx_payments_status
  ON public.payments (status);

CREATE INDEX IF NOT EXISTS idx_payments_created
  ON public.payments (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_phone
  ON public.payments (phone_number);


-- ============================================================================
-- 4. platform_config  — global settings for public page + admin panel
-- ============================================================================
-- Key/value store so you never hardcode price, channel links, feature flags, etc.
CREATE TABLE IF NOT EXISTS public.platform_config (
  key             TEXT PRIMARY KEY,
  value           JSONB NOT NULL,
  description     TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed sensible defaults (safe to re-run)
INSERT INTO public.platform_config (key, value, description) VALUES
  ('premium_price',           '1500',                                          'Premium price in NGN per month'),
  ('premium_duration_days',   '30',                                            'Premium subscription length in days'),
  ('upgrade_link',            '"https://empire-md.vercel.app/upgrade"',        'Public upgrade / checkout URL'),
  ('channel_url',             '"https://whatsapp.com/channel/0029VaI3OXiF6smuq5LxxN15"', 'Official channel link'),
  ('channel_name',            '"Empire BOT-WAN"',                              'Channel display name'),
  ('channel_thumb',           '"https://i.ibb.co/8LMKhwqt/download.jpg"',      'Channel thumbnail URL'),
  ('newsletter_jid',          '"120363213059253232@newsletter"',               'WhatsApp newsletter/channel JID'),
  ('bot_name_default',        '"Empire MD"',                                   'Default bot display name'),
  ('prefix_default',          '"."',                                           'Default command prefix'),
  ('mode_default',            '"private"',                                     'Default mode: private | public'),
  ('pairing_paused',          'false',                                         'Emergency switch: block new pairing'),
  ('inactive_kill_days',      '3',                                             'Kill process after N days inactive'),
  ('inactive_delete_days',    '14',                                            'Delete session folder after N days'),
  ('session_id_prefix',       '"EMPIRE-MD"',                                   'Prefix used when generating session IDs'),
  ('features_free',           '["help","menu","ping","play","sticker","meme","joke","fact"]', 'Commands available on free'),
  ('features_premium',        '["ghostmode","vv","send","pdf","receipt","doc","pmode","antibot"]', 'Commands requiring premium'),
  ('maintenance_message',     'null',                                          'If set, public page shows this message')
ON CONFLICT (key) DO NOTHING;


-- ============================================================================
-- 5. RPC helpers used by the Node backend
-- ============================================================================

-- Atomic message counter + last_active touch
CREATE OR REPLACE FUNCTION public.increment_usage(p_session_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.bot_registry
  SET
    message_count = COALESCE(message_count, 0) + 1,
    last_active   = NOW(),
    updated_at    = NOW()
  WHERE session_id = p_session_id;
END;
$$;

-- Atomic command counter
CREATE OR REPLACE FUNCTION public.increment_command_count(p_session_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.bot_registry
  SET
    command_count = COALESCE(command_count, 0) + 1,
    last_active   = NOW(),
    updated_at    = NOW()
  WHERE session_id = p_session_id;
END;
$$;

-- Activate / extend premium for a session (used by webhook + admin)
CREATE OR REPLACE FUNCTION public.activate_premium(
  p_session_id   TEXT,
  p_days         INTEGER DEFAULT 30,
  p_payment_ref  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_expires TIMESTAMPTZ;
  v_row     public.bot_registry%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.bot_registry WHERE session_id = p_session_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session not found');
  END IF;

  IF v_row.plan = 'premium'
     AND v_row.plan_expires_at IS NOT NULL
     AND v_row.plan_expires_at > NOW() THEN
    v_expires := v_row.plan_expires_at + (p_days || ' days')::INTERVAL;
  ELSE
    v_expires := NOW() + (p_days || ' days')::INTERVAL;
  END IF;

  UPDATE public.bot_registry
  SET
    plan             = 'premium',
    plan_expires_at  = v_expires,
    payment_ref      = COALESCE(p_payment_ref, payment_ref),
    settings         = settings
                       || jsonb_build_object(
                            'plan', 'premium',
                            'plan_expires_at', to_jsonb(v_expires)
                          ),
    updated_at       = NOW()
  WHERE session_id = p_session_id;

  RETURN jsonb_build_object(
    'ok', true,
    'session_id', p_session_id,
    'plan', 'premium',
    'expires_at', v_expires
  );
END;
$$;

-- Admin whitelist toggle
CREATE OR REPLACE FUNCTION public.set_whitelist(
  p_session_id TEXT,
  p_enabled    BOOLEAN DEFAULT true,
  p_reason     TEXT DEFAULT 'admin'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.bot_registry
  SET
    is_whitelisted   = p_enabled,
    whitelist_reason = CASE WHEN p_enabled THEN p_reason ELSE NULL END,
    settings         = settings || jsonb_build_object('is_whitelisted', p_enabled),
    updated_at       = NOW()
  WHERE session_id = p_session_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session not found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'session_id', p_session_id, 'whitelisted', p_enabled);
END;
$$;

-- Touch last_active only
CREATE OR REPLACE FUNCTION public.touch_last_active(p_session_id TEXT)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.bot_registry
  SET last_active = NOW(), updated_at = NOW()
  WHERE session_id = p_session_id;
$$;


-- ============================================================================
-- 6. Helpful views for admin dashboard / public directory
-- ============================================================================

-- Live public directory (online bots only)
CREATE OR REPLACE VIEW public.v_public_bots AS
SELECT
  session_id,
  bot_name,
  phone_number,
  status,
  plan,
  created_at,
  last_active
FROM public.bot_registry
WHERE status = 'online'
ORDER BY created_at DESC;

-- Admin overview (everything, no limits)
CREATE OR REPLACE VIEW public.v_admin_bots AS
SELECT
  session_id,
  bot_name,
  phone_number,
  owner_phone,
  status,
  plan,
  plan_expires_at,
  is_whitelisted,
  whitelist_reason,
  is_abusive,
  abuse_reason,
  message_count,
  command_count,
  last_active,
  created_at,
  payment_ref,
  settings->>'prefix' AS prefix,
  settings->>'mode'   AS mode,
  settings->'ownerNumber' AS owner_numbers,
  admin_notes
FROM public.bot_registry
ORDER BY created_at DESC;

-- Premium expiring soon (next 7 days)
CREATE OR REPLACE VIEW public.v_premium_expiring AS
SELECT
  session_id,
  bot_name,
  phone_number,
  plan_expires_at,
  payment_ref
FROM public.bot_registry
WHERE plan = 'premium'
  AND is_whitelisted = false
  AND plan_expires_at IS NOT NULL
  AND plan_expires_at BETWEEN NOW() AND NOW() + INTERVAL '7 days'
ORDER BY plan_expires_at ASC;

-- Inactive bots (for cleanup scripts)
CREATE OR REPLACE VIEW public.v_inactive_bots AS
SELECT
  session_id,
  bot_name,
  phone_number,
  status,
  plan,
  last_active,
  created_at
FROM public.bot_registry
WHERE last_active IS NULL
   OR last_active < NOW() - INTERVAL '3 days'
ORDER BY last_active ASC NULLS FIRST;


-- ============================================================================
-- 7. updated_at trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bot_registry_updated_at ON public.bot_registry;
CREATE TRIGGER trg_bot_registry_updated_at
  BEFORE UPDATE ON public.bot_registry
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_ai_memory_updated_at ON public.ai_memory;
CREATE TRIGGER trg_ai_memory_updated_at
  BEFORE UPDATE ON public.ai_memory
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================================
-- 8. Row Level Security (optional safety)
-- ============================================================================
-- Backend uses the service_role key → bypasses RLS.
-- These policies protect against accidental anon/authenticated access.

ALTER TABLE public.bot_registry    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_memory       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;

-- Deny-all by default for anon/authenticated (service_role still has full access)
DROP POLICY IF EXISTS "deny_all_bot_registry" ON public.bot_registry;
CREATE POLICY "deny_all_bot_registry" ON public.bot_registry
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_all_ai_memory" ON public.ai_memory;
CREATE POLICY "deny_all_ai_memory" ON public.ai_memory
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_all_payments" ON public.payments;
CREATE POLICY "deny_all_payments" ON public.payments
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- Public read of non-secret platform config (optional — comment out if you prefer all private)
DROP POLICY IF EXISTS "public_read_platform_config" ON public.platform_config;
CREATE POLICY "public_read_platform_config" ON public.platform_config
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "deny_write_platform_config" ON public.platform_config;
CREATE POLICY "deny_write_platform_config" ON public.platform_config
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);


-- ============================================================================
-- 9. Grants (service role already has everything; explicit for clarity)
-- ============================================================================
GRANT USAGE ON SCHEMA public TO postgres, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO postgres, service_role;


-- ============================================================================
-- 10. Example default settings JSON (documentation only — not executed)
-- ============================================================================
-- When registerBot() creates a row, settings looks like:
-- {
--   "botName": "MyBot",
--   "prefix": ".",
--   "mode": "private",
--   "ownerNumber": ["2348012345678"],
--   "plan": "free",
--   "ghostMode": false,
--   "alwaysOnline": true,
--   "welcome": true,
--   "autostatusview": true,
--   "autostatusreact": true,
--   "antidelete": true,
--   "aichatmode": "off"
-- }


-- ============================================================================
-- DONE
-- ============================================================================
-- Next steps:
-- 1. In your Node .env set:
--      SUPABASE_URL=https://xxxx.supabase.co
--      SUPABASE_KEY=<service_role key>   ← use service_role, not anon
-- 2. In server.js change generateSessionId to:
--      return `EMPIRE-MD_${formattedName}_${randomSuffix}`;
-- 3. Restart the bot server.
-- ============================================================================
