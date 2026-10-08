CREATE UNIQUE INDEX IF NOT EXISTS credit_topups_workspace_id_id_idx ON credit_topups(workspace_id, id);

CREATE TABLE IF NOT EXISTS payment_fee_observations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  topup_id UUID NOT NULL,
  lot_id UUID NOT NULL,
  fee_idr NUMERIC(20,8) NOT NULL CHECK (fee_idr >= 0 AND fee_idr <> 'NaN'::numeric),
  reconciliation_key TEXT NOT NULL,
  evidence_reference TEXT NOT NULL,
  recorded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, topup_id) REFERENCES credit_topups(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, lot_id) REFERENCES credit_lots(workspace_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, reconciliation_key)
);

CREATE OR REPLACE FUNCTION guard_payment_fee_observation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Payment fee observations are append-only' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS payment_fee_observations_append_only ON payment_fee_observations;
CREATE TRIGGER payment_fee_observations_append_only
  BEFORE UPDATE OR DELETE ON payment_fee_observations
  FOR EACH ROW EXECUTE FUNCTION guard_payment_fee_observation();
