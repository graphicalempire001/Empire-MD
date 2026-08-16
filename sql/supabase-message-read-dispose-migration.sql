-- Empire MD — message read-state + chat disposal
-- Run AFTER supabase-dashboard-migration.sql (adds to the existing messages table).

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_messages_session_chat_unread
  ON public.messages (session_id, chat_jid) WHERE is_read = false;

-- Mark every message in one chat as read (called when the dashboard opens it).
CREATE OR REPLACE FUNCTION public.mark_chat_read(p_session_id TEXT, p_chat_jid TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.messages
    SET is_read = true
    WHERE session_id = p_session_id AND chat_jid = p_chat_jid AND is_read = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_chat_read TO postgres, service_role;
