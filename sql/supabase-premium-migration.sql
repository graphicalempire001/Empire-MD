-- ============================================================
-- Empire MD — Premium / Monetization Migration
-- Run this ENTIRE file in Supabase → SQL Editor → New Query
-- ============================================================

-- 1. Plan columns on bot_registry
ALTER TABLE bot_registry
  ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_whitelisted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS whitelist_reason TEXT,
  ADD COLUMN IF NOT EXISTS payment_ref TEXT,
  ADD COLUMN IF NOT EXISTS last_active TIMESTAMPTZ DEFAULT NOW();

-- Optional safety constraint (uncomment if you want strict values)
-- ALTER TABLE bot_registry DROP CONSTRAINT IF EXISTS bot_registry_plan_check;
-- ALTER TABLE bot_registry
--   ADD CONSTRAINT bot_registry_plan_check
--   CHECK (plan IN ('free', 'premium'));

-- 2. Payments table
CREATE TABLE IF NOT EXISTS payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    TEXT,
  phone_number  TEXT,
  amount        NUMERIC(12, 2),
  currency      TEXT DEFAULT 'NGN',
  provider      TEXT,                 -- paystack | flutterwave | stripe | manual
  reference     TEXT UNIQUE,
  status        TEXT DEFAULT 'pending', -- pending | success | failed
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  paid_at       TIMESTAMPTZ
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_bot_registry_plan
  ON bot_registry (plan);

CREATE INDEX IF NOT EXISTS idx_bot_registry_last_active
  ON bot_registry (last_active);

CREATE INDEX IF NOT EXISTS idx_payments_reference
  ON payments (reference);

CREATE INDEX IF NOT EXISTS idx_payments_session
  ON payments (session_id);

-- 4. Backfill last_active for existing rows
UPDATE bot_registry
SET last_active = COALESCE(last_active, created_at, NOW())
WHERE last_active IS NULL;

-- 5. Ensure plan defaults to free for any nulls
UPDATE bot_registry
SET plan = 'free'
WHERE plan IS NULL;
