-- estimated_cost is the customer credit quote. Keep the provider USD estimate
-- separate, and leave historical/legacy jobs unknown rather than inventing COGS.
ALTER TABLE generation_jobs
  ADD COLUMN IF NOT EXISTS estimated_provider_cost_usd NUMERIC(20, 8)
    CONSTRAINT generation_jobs_provider_estimate_nonnegative
    CHECK (estimated_provider_cost_usd >= 0 AND estimated_provider_cost_usd <> 'NaN'::numeric),
  ADD COLUMN IF NOT EXISTS pricing_snapshot JSONB
    CONSTRAINT generation_jobs_pricing_snapshot_object
    CHECK (jsonb_typeof(pricing_snapshot) = 'object');

COMMENT ON COLUMN generation_jobs.estimated_provider_cost_usd IS
  'Quoted provider cost in USD, separate from estimated_cost in customer credits; NULL means unknown.';
COMMENT ON COLUMN generation_jobs.pricing_snapshot IS
  'Immutable pricing inputs accepted at admission; NULL for historical or legacy jobs.';

CREATE OR REPLACE FUNCTION guard_generation_pricing_snapshot()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.pricing_snapshot IS NOT NULL AND (
    NEW.pricing_snapshot IS DISTINCT FROM OLD.pricing_snapshot OR
    NEW.estimated_provider_cost_usd IS DISTINCT FROM OLD.estimated_provider_cost_usd
  ) THEN
    RAISE EXCEPTION 'Generation pricing snapshot and provider estimate are immutable once quoted'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS generation_jobs_pricing_snapshot_immutable ON generation_jobs;
CREATE TRIGGER generation_jobs_pricing_snapshot_immutable
  BEFORE UPDATE OF pricing_snapshot, estimated_provider_cost_usd ON generation_jobs
  FOR EACH ROW EXECUTE FUNCTION guard_generation_pricing_snapshot();
