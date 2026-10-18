-- The provider's own failure text (e.g. which reference image BytePlus refused and why).
-- generation_jobs.error reaches the browser and stays generic; this column is for admins.
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS provider_error TEXT;

-- Seedance refused this image as showing a real person, so later generations trust it
-- before submitting instead of failing first.
ALTER TABLE assets ADD COLUMN IF NOT EXISTS byteplus_needs_trust BOOLEAN NOT NULL DEFAULT false;

-- BytePlus trusts the video worker borrowed for one generation. The account holds only a
-- few dozen trusted assets, so each is removed once no running generation holds it.
CREATE TABLE IF NOT EXISTS byteplus_trust_loans (
  generation_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  local_asset_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (generation_id, local_asset_id),
  FOREIGN KEY (workspace_id, local_asset_id) REFERENCES assets(workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS byteplus_trust_loans_asset_idx
  ON byteplus_trust_loans (workspace_id, local_asset_id);
