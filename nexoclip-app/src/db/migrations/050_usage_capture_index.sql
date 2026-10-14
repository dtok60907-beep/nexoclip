-- The admin Jobs list and usage analytics find each generation's capture entry (what the workspace finally paid)
-- by the generation id in its metadata.
CREATE INDEX IF NOT EXISTS credit_ledger_capture_generation_idx
  ON credit_ledger (workspace_id, (metadata->>'generationId'))
  WHERE reason = 'generation_capture';
