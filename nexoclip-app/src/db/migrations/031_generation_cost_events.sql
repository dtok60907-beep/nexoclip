-- Provider cost observations are independent of the job's completion fence:
-- a timed-out or superseded worker can still report a real incurred charge.
CREATE TABLE IF NOT EXISTS generation_cost_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  generation_job_id UUID NOT NULL,
  provider TEXT NOT NULL CHECK (length(provider) > 0),
  provider_request_id TEXT CHECK (provider_request_id IS NULL OR length(provider_request_id) > 0),
  dispatch_id UUID NOT NULL,
  worker_attempt INTEGER NOT NULL CHECK (worker_attempt > 0),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'attempt_started', 'dispatch', 'submitted', 'poll', 'succeeded', 'failed',
    'timeout', 'interrupted', 'output_failed', 'reconciled'
  )),
  observation_fingerprint TEXT NOT NULL CHECK (length(observation_fingerprint) = 64),
  cost_usd NUMERIC(20, 8) CHECK (cost_usd >= 0 AND cost_usd <> 'NaN'::numeric),
  cost_idr NUMERIC(20, 6) CHECK (cost_idr >= 0 AND cost_idr <> 'NaN'::numeric),
  usd_idr_rate NUMERIC(20, 6) CHECK (usd_idr_rate > 0 AND usd_idr_rate <> 'NaN'::numeric),
  cost_source TEXT NOT NULL CHECK (cost_source IN ('reported', 'calculated', 'unknown')),
  usage JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(usage) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT generation_cost_events_job_workspace_fk
    FOREIGN KEY (workspace_id, generation_job_id)
    REFERENCES generation_jobs(workspace_id, id) ON DELETE RESTRICT,
  CONSTRAINT generation_cost_events_known_source
    CHECK ((cost_usd IS NULL AND cost_source = 'unknown') OR
           (cost_usd IS NOT NULL AND cost_source IN ('reported', 'calculated'))),
  CONSTRAINT generation_cost_events_idr_basis
    CHECK (cost_idr IS NULL OR (cost_usd IS NOT NULL AND
      (usd_idr_rate IS NOT NULL OR (cost_usd = 0 AND cost_idr = 0))))
);

CREATE UNIQUE INDEX IF NOT EXISTS generation_cost_events_request_observation_idx
  ON generation_cost_events (workspace_id, generation_job_id, provider, provider_request_id, observation_fingerprint)
  WHERE provider_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS generation_cost_events_dispatch_observation_idx
  ON generation_cost_events (workspace_id, generation_job_id, provider, dispatch_id, observation_fingerprint)
  WHERE provider_request_id IS NULL;
CREATE INDEX IF NOT EXISTS generation_cost_events_workspace_job_idx
  ON generation_cost_events (workspace_id, generation_job_id, id DESC);
CREATE INDEX IF NOT EXISTS generation_cost_events_dispatch_idx
  ON generation_cost_events (workspace_id, generation_job_id, dispatch_id)
  WHERE provider_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION reject_generation_cost_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Generation cost events are append-only' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS generation_cost_events_append_only ON generation_cost_events;
CREATE TRIGGER generation_cost_events_append_only
  BEFORE UPDATE OR DELETE ON generation_cost_events
  FOR EACH ROW EXECUTE FUNCTION reject_generation_cost_event_mutation();

-- Count one charge per provider request, including failed/fallback requests.
-- New unknown observations cannot erase previously observed known costs;
-- newer known observations supersede older ones as billing corrections.
-- A dispatch without a response remains unknown until bound to a request ID.
CREATE OR REPLACE VIEW latest_generation_cost_observations AS
SELECT DISTINCT ON (
  e.workspace_id, e.generation_job_id, e.provider, e.provider_request_id,
  CASE WHEN e.provider_request_id IS NULL THEN e.dispatch_id END
) e.*, COALESCE(e.provider_request_id, 'dispatch:' || e.dispatch_id::text) AS request_key
FROM generation_cost_events e
WHERE e.event_type <> 'attempt_started'
  AND (e.provider_request_id IS NOT NULL OR NOT EXISTS (
    SELECT 1 FROM generation_cost_events bound
    WHERE bound.workspace_id = e.workspace_id
      AND bound.generation_job_id = e.generation_job_id
      AND bound.dispatch_id = e.dispatch_id
      AND bound.provider_request_id IS NOT NULL
  ))
ORDER BY e.workspace_id, e.generation_job_id, e.provider,
  e.provider_request_id, CASE WHEN e.provider_request_id IS NULL THEN e.dispatch_id END,
  (e.cost_usd IS NOT NULL) DESC, e.id DESC;
