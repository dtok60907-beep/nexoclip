CREATE TABLE provider_request_cost_corrections (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reconciliation_id BIGINT NOT NULL REFERENCES provider_request_reconciliations(id) ON DELETE RESTRICT,
  previous_cost_event_id BIGINT NOT NULL REFERENCES generation_cost_events(id) ON DELETE RESTRICT,
  cost_event_id BIGINT NOT NULL UNIQUE REFERENCES generation_cost_events(id) ON DELETE RESTRICT,
  payment_evidence_id BIGINT NOT NULL REFERENCES provider_payment_evidence(id) ON DELETE RESTRICT,
  group_key TEXT NOT NULL CHECK(group_key ~ '^[a-f0-9]{64}$'),
  cost_usd NUMERIC(20,8) NOT NULL CHECK(cost_usd>=0 AND cost_usd<>'NaN'::numeric),
  evidence_reference TEXT NOT NULL CHECK(length(evidence_reference) BETWEEN 3 AND 160),
  note TEXT NOT NULL CHECK(length(note) BETWEEN 10 AND 2000),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(reconciliation_id,previous_cost_event_id)
);
CREATE INDEX provider_request_cost_corrections_history_idx ON provider_request_cost_corrections(reconciliation_id,id DESC);
CREATE TRIGGER provider_request_cost_corrections_append_only BEFORE UPDATE OR DELETE ON provider_request_cost_corrections
  FOR EACH ROW EXECUTE FUNCTION reject_provider_billing_mutation();
