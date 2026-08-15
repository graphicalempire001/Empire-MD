-- Empire MD — Dashboard & quota migration
-- Adds: free-tier daily command quota, WhatsApp message log (for the
-- dashboard message reader), OTP codes (dashboard password reset), and
-- dashboard auth sessions.

-- 1. Quota columns on bot_registry -----------------------------------
ALTER TABLE public.bot_registry
  ADD COLUMN IF NOT EXISTS commands_today INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quota_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS dashboard_password_hash TEXT,
  ADD COLUMN IF NOT EXISTS dashboard_password_set_at TIMESTAMPTZ;

-- Atomic check-and-increment with automatic day rollover.
CREATE OR REPLACE FUNCTION public.increment_quota(
  p_session_id TEXT,
  p_limit      INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row public.bot_registry%ROWTYPE;
  v_count INTEGER;
BEGIN
  SELECT * INTO v_row FROM public.bot_registry WHERE session_id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', true, 'remaining', p_limit - 1);
  END IF;

  IF v_row.quota_date IS DISTINCT FROM CURRENT_DATE THEN
    v_count := 1;
    UPDATE public.bot_registry
      SET commands_today = 1, quota_date = CURRENT_DATE
      WHERE session_id = p_session_id;
    RETURN jsonb_build_object('allowed', true, 'remaining', p_limit - 1);
  END IF;

  IF v_row.commands_today >= p_limit THEN
    RETURN jsonb_build_object('allowed', false, 'remaining', 0);
  END IF;

  v_count := v_row.commands_today + 1;
  UPDATE public.bot_registry SET commands_today = v_count WHERE session_id = p_session_id;
  RETURN jsonb_build_object('allowed', true, 'remaining', p_limit - v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_quota TO postgres, service_role;

-- 2. Message log --------------------------------------------------------
-- Every inbound/outbound message the bot sees, so the dashboard can show a
-- "read your WhatsApp without opening WhatsApp" view per chat.
CREATE TABLE IF NOT EXISTS public.messages (
  id          BIGSERIAL PRIMARY KEY,
  session_id  TEXT NOT NULL,
  chat_jid    TEXT NOT NULL,
  sender_jid  TEXT,
  sender_name TEXT,
  from_me     BOOLEAN NOT NULL DEFAULT false,
  msg_type    TEXT NOT NULL DEFAULT 'text',   -- text | image | video | audio | document | sticker | other
  body        TEXT,                            -- text content or a media caption; capped client-side
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_session_chat_time
  ON public.messages (session_id, chat_jid, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_session_time
  ON public.messages (session_id, created_at DESC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_all_messages" ON public.messages;
CREATE POLICY "deny_all_messages" ON public.messages
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
GRANT ALL ON public.messages TO postgres, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.messages_id_seq TO postgres, service_role;

-- 3. OTP codes (dashboard password reset, delivered via the user's own
--    WhatsApp DM) -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.otp_codes (
  id            BIGSERIAL PRIMARY KEY,
  session_id    TEXT NOT NULL,
  phone_number  TEXT NOT NULL,
  code_hash     TEXT NOT NULL,
  purpose       TEXT NOT NULL DEFAULT 'dashboard_reset',
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_session ON public.otp_codes (session_id, purpose, created_at DESC);

ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_all_otp" ON public.otp_codes;
CREATE POLICY "deny_all_otp" ON public.otp_codes
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
GRANT ALL ON public.otp_codes TO postgres, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.otp_codes_id_seq TO postgres, service_role;

-- 4. Dashboard auth sessions (server-tracked, revocable — simpler and
--    safer than a stateless JWT for a self-hosted single-server setup) --
CREATE TABLE IF NOT EXISTS public.dashboard_sessions (
  token       TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dashboard_sessions_expiry ON public.dashboard_sessions (expires_at);

ALTER TABLE public.dashboard_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_all_dashboard_sessions" ON public.dashboard_sessions;
CREATE POLICY "deny_all_dashboard_sessions" ON public.dashboard_sessions
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
GRANT ALL ON public.dashboard_sessions TO postgres, service_role;
