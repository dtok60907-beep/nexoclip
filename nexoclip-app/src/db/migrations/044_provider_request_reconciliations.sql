CREATE TABLE provider_request_reconciliations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_id UUID NOT NULL REFERENCES provider_billing_imports(id) ON DELETE RESTRICT,
  payment_evidence_id BIGINT NOT NULL REFERENCES provider_payment_evidence(id) ON DELETE RESTRICT,
  cost_event_id BIGINT NOT NULL UNIQUE REFERENCES generation_cost_events(id) ON DELETE RESTRICT,
  provider_account_id TEXT NOT NULL,
  provider_request_id TEXT NOT NULL,
  group_key TEXT NOT NULL CHECK (group_key ~ '^[a-f0-9]{64}$'),
  cost_usd NUMERIC(20,8) NOT NULL CHECK(cost_usd>=0 AND cost_usd<>'NaN'::numeric),
  evidence_reference TEXT NOT NULL CHECK(length(evidence_reference) BETWEEN 3 AND 160),
  note TEXT NOT NULL CHECK(length(note) BETWEEN 10 AND 2000),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider_account_id,provider_request_id)
);
CREATE INDEX provider_request_reconciliations_import_idx ON provider_request_reconciliations(import_id,id DESC);
CREATE TRIGGER provider_request_reconciliations_append_only BEFORE UPDATE OR DELETE ON provider_request_reconciliations
  FOR EACH ROW EXECUTE FUNCTION reject_provider_billing_mutation();

-- Audited reconciliations supersede worker estimates, including later worker observations.
-- Append the new field to preserve all existing view columns and ordering.
CREATE OR REPLACE VIEW latest_generation_cost_observations AS
SELECT DISTINCT ON (
  e.workspace_id,e.generation_job_id,e.provider,e.provider_account_id,e.provider_request_id,
  CASE WHEN e.provider_request_id IS NULL THEN e.dispatch_id END
) e.id,e.workspace_id,e.generation_job_id,e.provider,e.provider_request_id,e.dispatch_id,
  e.worker_attempt,e.event_type,e.observation_fingerprint,e.cost_usd,e.cost_idr,e.usd_idr_rate,
  e.cost_source,e.usage,e.created_at,
  COALESCE(e.provider_request_id,'dispatch:' || e.dispatch_id::text) AS request_key,e.provider_account_id
FROM generation_cost_events e
WHERE e.event_type <> 'attempt_started'
  AND (e.provider_request_id IS NOT NULL OR NOT EXISTS (
    SELECT 1 FROM generation_cost_events bound
    WHERE bound.workspace_id=e.workspace_id AND bound.generation_job_id=e.generation_job_id
      AND bound.dispatch_id=e.dispatch_id AND bound.provider=e.provider
      AND bound.provider_account_id IS NOT DISTINCT FROM e.provider_account_id
      AND bound.provider_request_id IS NOT NULL
  ))
ORDER BY e.workspace_id,e.generation_job_id,e.provider,e.provider_account_id,e.provider_request_id,
  CASE WHEN e.provider_request_id IS NULL THEN e.dispatch_id END,
  (e.cost_usd IS NOT NULL) DESC,(e.event_type='reconciled') DESC,e.id DESC;
