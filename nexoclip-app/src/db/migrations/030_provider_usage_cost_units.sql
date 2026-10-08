-- Historical estimated_cost may contain credits rather than USD. Leave its
-- currency unknown; do not relabel or convert historical amounts by guesswork.
ALTER TABLE provider_usage
  ADD COLUMN IF NOT EXISTS cost_currency TEXT
    CHECK (cost_currency IS NULL OR cost_currency = 'USD'),
  ADD COLUMN IF NOT EXISTS cost_source TEXT NOT NULL DEFAULT 'legacy'
    CHECK (cost_source IN ('legacy', 'reported', 'calculated', 'unknown'));
