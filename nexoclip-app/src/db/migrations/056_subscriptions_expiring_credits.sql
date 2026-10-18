-- Credits that expire (subscription credits end with their month). A lot's expires_at
-- is NULL for credits that never expire: every lot granted before this migration, and
-- top-ups. Generations spend the lot that expires soonest first, then the oldest.
ALTER TABLE credit_lots ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS credit_lots_expiring_idx ON credit_lots (expires_at)
  WHERE available_credits > 0 AND expires_at IS NOT NULL;

CREATE OR REPLACE FUNCTION reserve_generation_credit_lots(p_workspace UUID, p_generation UUID, p_credits NUMERIC)
RETURNS VOID AS $$
DECLARE lot RECORD; remaining NUMERIC := p_credits; allocated NUMERIC; taken NUMERIC;
BEGIN
  IF p_credits IS NULL OR p_credits <= 0 OR p_credits = 'NaN'::numeric THEN
    RAISE EXCEPTION 'Credit reservation is invalid' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM credit_accounts WHERE workspace_id = p_workspace FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Credit account is missing' USING ERRCODE = '23514'; END IF;
  SELECT SUM(reserved_credits) INTO allocated FROM generation_credit_allocations
    WHERE workspace_id = p_workspace AND generation_job_id = p_generation;
  IF allocated IS NOT NULL THEN
    IF allocated <> p_credits THEN RAISE EXCEPTION 'Credit allocation replay mismatch' USING ERRCODE = '23514'; END IF;
    PERFORM assert_credit_lot_balance(p_workspace);
    RETURN;
  END IF;
  FOR lot IN SELECT id, available_credits FROM credit_lots
    WHERE workspace_id = p_workspace AND available_credits > 0 ORDER BY expires_at NULLS LAST, created_at, id FOR UPDATE LOOP
    taken := LEAST(remaining, lot.available_credits);
    INSERT INTO generation_credit_allocations (workspace_id, generation_job_id, lot_id, reserved_credits)
      VALUES (p_workspace, p_generation, lot.id, taken);
    UPDATE credit_lots SET available_credits = available_credits - taken WHERE workspace_id = p_workspace AND id = lot.id;
    remaining := remaining - taken;
    EXIT WHEN remaining = 0;
  END LOOP;
  IF remaining <> 0 THEN RAISE EXCEPTION 'Insufficient credit lots' USING ERRCODE = '23514'; END IF;
  PERFORM assert_credit_lot_balance(p_workspace);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION debit_credit_lots(p_workspace UUID, p_credits NUMERIC) RETURNS VOID AS $$
DECLARE lot RECORD; remaining NUMERIC := p_credits; taken NUMERIC;
BEGIN
  IF p_credits IS NULL OR p_credits <= 0 OR p_credits = 'NaN'::numeric THEN
    RAISE EXCEPTION 'Credit debit is invalid' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM credit_accounts WHERE workspace_id = p_workspace FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Credit account is missing' USING ERRCODE = '23514'; END IF;
  FOR lot IN SELECT id, available_credits FROM credit_lots
    WHERE workspace_id = p_workspace AND available_credits > 0 ORDER BY expires_at NULLS LAST, created_at, id FOR UPDATE LOOP
    taken := LEAST(remaining, lot.available_credits);
    UPDATE credit_lots SET available_credits = available_credits - taken WHERE workspace_id = p_workspace AND id = lot.id;
    remaining := remaining - taken;
    EXIT WHEN remaining = 0;
  END LOOP;
  IF remaining <> 0 THEN RAISE EXCEPTION 'Insufficient credit lots' USING ERRCODE = '23514'; END IF;
  PERFORM assert_credit_lot_balance(p_workspace);
END;
$$ LANGUAGE plpgsql;

-- Monthly and yearly plans. Payment is one-off per period through Pakasir (renewed by
-- the customer); credits arrive month by month and expire at the end of their month.
CREATE TABLE IF NOT EXISTS subscription_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  plan_code TEXT NOT NULL,
  months INTEGER NOT NULL CHECK (months IN (1, 12)),
  monthly_credits NUMERIC(20, 6) NOT NULL CHECK (monthly_credits > 0),
  amount_idr INTEGER NOT NULL CHECK (amount_idr > 0),
  order_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'canceled')),
  provider_key TEXT NOT NULL DEFAULT 'pakasir',
  provider_txn_id TEXT UNIQUE,
  payment_url TEXT,
  is_sandbox BOOLEAN NOT NULL DEFAULT false,
  failure_reason TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscription_orders_workspace_idx ON subscription_orders (workspace_id, created_at DESC);

-- When the next month's credits are due, the plan behind the subscription, and what
-- one month of it was paid (its credits carry that value into the revenue reports).
ALTER TABLE workspace_subscriptions
  ADD COLUMN IF NOT EXISTS plan_code TEXT,
  ADD COLUMN IF NOT EXISTS monthly_credits NUMERIC(20, 6),
  ADD COLUMN IF NOT EXISTS monthly_value_idr NUMERIC(20, 8),
  ADD COLUMN IF NOT EXISTS next_credit_grant_at TIMESTAMPTZ;
