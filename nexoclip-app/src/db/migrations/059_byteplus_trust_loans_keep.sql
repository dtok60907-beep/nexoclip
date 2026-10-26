-- A finished generation gives its BytePlus trust loans back by marking them released
-- instead of deleting them: the trust stays on BytePlus so the next generation with the
-- same image reuses it (BytePlus allows only a few asset writes a minute), and the sweep
-- removes a trust once its image has gone unused for a few days.
ALTER TABLE byteplus_trust_loans ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS byteplus_trust_loans_released_idx
  ON byteplus_trust_loans (released_at);
