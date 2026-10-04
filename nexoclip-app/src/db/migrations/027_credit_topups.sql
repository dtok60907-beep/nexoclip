-- Credit top-up orders paid through a payment gateway (Pakasir). Credits are
-- granted exactly once per order through the credit ledger, keyed
-- `topup:<id>`, after the gateway confirms the payment.
CREATE TABLE IF NOT EXISTS credit_topups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  package_code TEXT NOT NULL,
  amount_idr INTEGER NOT NULL CHECK (amount_idr > 0),
  credits NUMERIC(20, 6) NOT NULL CHECK (credits > 0),
  provider_key TEXT NOT NULL DEFAULT 'pakasir',
  order_id TEXT NOT NULL UNIQUE,
  provider_txn_id TEXT,
  payment_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'canceled', 'failed')),
  is_sandbox BOOLEAN NOT NULL DEFAULT false,
  credit_ledger_id UUID REFERENCES credit_ledger(id) ON DELETE SET NULL,
  failure_reason TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_key, provider_txn_id)
);

CREATE INDEX IF NOT EXISTS credit_topups_workspace_created_idx
  ON credit_topups (workspace_id, created_at DESC);
