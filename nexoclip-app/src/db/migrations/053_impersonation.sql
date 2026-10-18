-- An operator signed in as a customer (support, quality checks, security). The session
-- row is the customer's; this row says who really holds it, why, and whether it may act.
-- It is also the audit trail: rows are never deleted, only ended.
CREATE TABLE IF NOT EXISTS impersonation_sessions (
  session_id UUID PRIMARY KEY REFERENCES sessions(id) ON DELETE RESTRICT,
  operator_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 3 AND 500),
  read_only BOOLEAN NOT NULL DEFAULT true,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  CHECK (operator_user_id <> target_user_id)
);

CREATE INDEX IF NOT EXISTS impersonation_sessions_target_idx ON impersonation_sessions (target_user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS impersonation_sessions_operator_idx ON impersonation_sessions (operator_user_id, started_at DESC);
