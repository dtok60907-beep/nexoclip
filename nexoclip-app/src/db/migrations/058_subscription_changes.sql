-- What a subscription payment does: start, renew, upgrade (prorated), switch to yearly,
-- or a downgrade that takes effect when the current period ends.
ALTER TABLE subscription_orders
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'new' CHECK (kind IN ('new', 'renew', 'upgrade', 'switch', 'downgrade')),
  ADD COLUMN IF NOT EXISTS from_plan_code TEXT,
  ADD COLUMN IF NOT EXISTS prorated_credits NUMERIC(20, 6) NOT NULL DEFAULT 0 CHECK (prorated_credits >= 0);

-- A paid downgrade waiting for the current period to end.
ALTER TABLE workspace_subscriptions
  ADD COLUMN IF NOT EXISTS pending_plan_code TEXT,
  ADD COLUMN IF NOT EXISTS pending_months INTEGER CHECK (pending_months IN (1, 12)),
  ADD COLUMN IF NOT EXISTS pending_monthly_credits NUMERIC(20, 6),
  ADD COLUMN IF NOT EXISTS pending_monthly_value_idr NUMERIC(20, 8);
