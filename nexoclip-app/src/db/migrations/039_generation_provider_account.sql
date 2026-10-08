ALTER TABLE generation_cost_events ADD COLUMN provider_account_id TEXT
  CHECK (provider_account_id IS NULL OR provider_account_id ~ '^[0-9]{1,32}$');
CREATE INDEX generation_cost_events_provider_account_idx
  ON generation_cost_events(provider,provider_account_id,created_at);
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
  (e.cost_usd IS NOT NULL) DESC,e.id DESC;
