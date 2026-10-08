-- Track the acquisition value of credits separately from the append-only
-- customer ledger. Historical balances and outstanding reservations have
-- unknown revenue; package/list prices cannot reconstruct their provenance.
CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_workspace_id_id_idx
  ON credit_ledger (workspace_id, id);

CREATE TABLE IF NOT EXISTS credit_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_ledger_id UUID,
  source_type TEXT NOT NULL CHECK (source_type IN ('paid', 'promo', 'sandbox', 'legacy', 'unknown')),
  granted_credits NUMERIC(20, 6) NOT NULL CHECK (granted_credits > 0 AND granted_credits <> 'NaN'::numeric),
  available_credits NUMERIC(20, 6) NOT NULL CHECK (available_credits >= 0 AND available_credits <= granted_credits),
  amount_idr NUMERIC(20, 8) CHECK (amount_idr >= 0 AND amount_idr <> 'NaN'::numeric),
  payment_fee_idr NUMERIC(20, 8) CHECK (payment_fee_idr >= 0 AND payment_fee_idr <> 'NaN'::numeric),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, source_ledger_id),
  FOREIGN KEY (workspace_id, source_ledger_id) REFERENCES credit_ledger(workspace_id, id) ON DELETE RESTRICT,
  CHECK ((source_type = 'paid' AND source_ledger_id IS NOT NULL AND amount_idr IS NOT NULL AND amount_idr > 0)
    OR (source_type IN ('promo', 'sandbox') AND source_ledger_id IS NOT NULL
      AND amount_idr IS NOT NULL AND payment_fee_idr IS NOT NULL AND amount_idr = 0 AND payment_fee_idr = 0)
    OR (source_type IN ('legacy', 'unknown') AND amount_idr IS NULL AND payment_fee_idr IS NULL))
);

CREATE INDEX IF NOT EXISTS credit_lots_fifo_idx
  ON credit_lots (workspace_id, created_at, id) WHERE available_credits > 0;
CREATE UNIQUE INDEX IF NOT EXISTS credit_lots_legacy_balance_idx
  ON credit_lots (workspace_id) WHERE source_type = 'legacy' AND source_ledger_id IS NULL;

CREATE TABLE IF NOT EXISTS generation_credit_allocations (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  generation_job_id UUID NOT NULL,
  lot_id UUID NOT NULL,
  reserved_credits NUMERIC(20, 6) NOT NULL CHECK (reserved_credits > 0 AND reserved_credits <> 'NaN'::numeric),
  consumed_credits NUMERIC(20, 6) NOT NULL DEFAULT 0 CHECK (consumed_credits >= 0),
  returned_credits NUMERIC(20, 6) NOT NULL DEFAULT 0 CHECK (returned_credits >= 0),
  finalized_at TIMESTAMPTZ,
  PRIMARY KEY (workspace_id, generation_job_id, lot_id),
  FOREIGN KEY (workspace_id, generation_job_id) REFERENCES generation_jobs(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, lot_id) REFERENCES credit_lots(workspace_id, id) ON DELETE RESTRICT,
  CHECK ((finalized_at IS NULL AND consumed_credits = 0 AND returned_credits = 0)
    OR (finalized_at IS NOT NULL AND consumed_credits + returned_credits = reserved_credits))
);

-- Include still-reserved credits in the unknown lot's original grant so
-- capture/release can restore unused credits to that same unknown source.
INSERT INTO credit_lots (workspace_id, source_type, granted_credits, available_credits, created_at)
SELECT account.workspace_id, 'legacy', account.balance + COALESCE(reservations.credits, 0),
       account.balance, account.created_at
FROM credit_accounts account
LEFT JOIN LATERAL (
  SELECT SUM(-ledger.amount) AS credits
  FROM generation_jobs generation
  JOIN credit_ledger ledger ON ledger.workspace_id = generation.workspace_id AND ledger.id = generation.reservation_ledger_id
  WHERE generation.workspace_id = account.workspace_id AND generation.settlement_status = 'pending' AND ledger.amount < 0
) reservations ON TRUE
WHERE account.balance + COALESCE(reservations.credits, 0) > 0
  AND NOT EXISTS (SELECT 1 FROM credit_lots existing WHERE existing.workspace_id = account.workspace_id)
ON CONFLICT (workspace_id) WHERE source_type = 'legacy' AND source_ledger_id IS NULL DO NOTHING;

INSERT INTO generation_credit_allocations (workspace_id, generation_job_id, lot_id, reserved_credits)
SELECT generation.workspace_id, generation.id, lot.id, -ledger.amount
FROM generation_jobs generation
JOIN credit_ledger ledger ON ledger.workspace_id = generation.workspace_id AND ledger.id = generation.reservation_ledger_id
JOIN credit_lots lot ON lot.workspace_id = generation.workspace_id AND lot.source_type = 'legacy' AND lot.source_ledger_id IS NULL
WHERE generation.settlement_status = 'pending' AND ledger.amount < 0
  AND NOT EXISTS (SELECT 1 FROM generation_credit_allocations existing
    WHERE existing.workspace_id = generation.workspace_id AND existing.generation_job_id = generation.id)
ON CONFLICT (workspace_id, generation_job_id, lot_id) DO NOTHING;

CREATE OR REPLACE FUNCTION guard_credit_lot_basis() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
    OR NEW.source_ledger_id IS DISTINCT FROM OLD.source_ledger_id
    OR NEW.source_type IS DISTINCT FROM OLD.source_type
    OR NEW.granted_credits IS DISTINCT FROM OLD.granted_credits
    OR NEW.amount_idr IS DISTINCT FROM OLD.amount_idr
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Credit acquisition basis is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS credit_lots_basis_immutable ON credit_lots;
CREATE TRIGGER credit_lots_basis_immutable BEFORE UPDATE ON credit_lots
  FOR EACH ROW EXECUTE FUNCTION guard_credit_lot_basis();

-- All writers lock the account before lots. NUMERIC arithmetic stays inside
-- PostgreSQL, and drift aborts the transaction rather than inventing a grant.
CREATE OR REPLACE FUNCTION assert_credit_lot_balance(p_workspace UUID) RETURNS VOID AS $$
DECLARE account_balance NUMERIC; lot_balance NUMERIC;
BEGIN
  SELECT balance INTO account_balance FROM credit_accounts WHERE workspace_id = p_workspace FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Credit account is missing' USING ERRCODE = '23514'; END IF;
  SELECT COALESCE(SUM(available_credits), 0) INTO lot_balance FROM credit_lots WHERE workspace_id = p_workspace;
  IF lot_balance <> account_balance THEN
    RAISE EXCEPTION 'Credit lot balance drift' USING ERRCODE = '23514';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reserve_generation_credit_lots(p_workspace UUID, p_generation UUID, p_credits NUMERIC)
RETURNS VOID AS $$
DECLARE lot RECORD; remaining NUMERIC := p_credits; allocated NUMERIC; taken NUMERIC;
BEGIN
  IF p_credits IS NULL OR p_credits <= 0 OR p_credits = 'NaN'::numeric THEN
    RAISE EXCEPTION 'Credit reservation is invalid' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM credit_accounts WHERE workspace_id = p_workspace FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Credit account is missing' USING ERRCODE = '23514'; END IF;
  SELECT SUM(reserved_credits) INTO allocated FROM generation_credit_allocations
    WHERE workspace_id = p_workspace AND generation_job_id = p_generation;
  IF allocated IS NOT NULL THEN
    IF allocated <> p_credits THEN RAISE EXCEPTION 'Credit allocation replay mismatch' USING ERRCODE = '23514'; END IF;
    PERFORM assert_credit_lot_balance(p_workspace);
    RETURN;
  END IF;
  FOR lot IN SELECT id, available_credits FROM credit_lots
    WHERE workspace_id = p_workspace AND available_credits > 0 ORDER BY created_at, id FOR UPDATE LOOP
    taken := LEAST(remaining, lot.available_credits);
    INSERT INTO generation_credit_allocations (workspace_id, generation_job_id, lot_id, reserved_credits)
      VALUES (p_workspace, p_generation, lot.id, taken);
    UPDATE credit_lots SET available_credits = available_credits - taken WHERE workspace_id = p_workspace AND id = lot.id;
    remaining := remaining - taken;
    EXIT WHEN remaining = 0;
  END LOOP;
  IF remaining <> 0 THEN RAISE EXCEPTION 'Insufficient credit lots' USING ERRCODE = '23514'; END IF;
  PERFORM assert_credit_lot_balance(p_workspace);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION finalize_generation_credit_lots(p_workspace UUID, p_generation UUID, p_reserved NUMERIC, p_consumed NUMERIC)
RETURNS VOID AS $$
DECLARE allocation_row RECORD; reserved NUMERIC; finalized BOOLEAN; prior_consumed NUMERIC;
        remaining NUMERIC := p_consumed; consumed NUMERIC; returned NUMERIC;
BEGIN
  IF p_reserved IS NULL OR p_reserved <= 0 OR p_reserved = 'NaN'::numeric
    OR p_consumed IS NULL OR p_consumed < 0 OR p_consumed = 'NaN'::numeric THEN
    RAISE EXCEPTION 'Credit consumption is invalid' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM credit_accounts WHERE workspace_id = p_workspace FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Credit account is missing' USING ERRCODE = '23514'; END IF;
  SELECT SUM(reserved_credits), BOOL_AND(finalized_at IS NOT NULL), SUM(consumed_credits)
    INTO reserved, finalized, prior_consumed FROM generation_credit_allocations
    WHERE workspace_id = p_workspace AND generation_job_id = p_generation;
  IF reserved IS NULL OR reserved <> p_reserved OR p_consumed > reserved THEN
    RAISE EXCEPTION 'Credit reservation allocation mismatch' USING ERRCODE = '23514';
  END IF;
  IF finalized THEN
    IF prior_consumed <> p_consumed THEN RAISE EXCEPTION 'Credit consumption replay mismatch' USING ERRCODE = '23514'; END IF;
    PERFORM assert_credit_lot_balance(p_workspace);
    RETURN;
  END IF;
  FOR allocation_row IN SELECT lot.id, allocation.reserved_credits, allocation.finalized_at
    FROM generation_credit_allocations allocation JOIN credit_lots lot
      ON lot.workspace_id = allocation.workspace_id AND lot.id = allocation.lot_id
    WHERE allocation.workspace_id = p_workspace AND allocation.generation_job_id = p_generation
    ORDER BY lot.created_at, lot.id FOR UPDATE OF lot, allocation LOOP
    IF allocation_row.finalized_at IS NOT NULL THEN RAISE EXCEPTION 'Partial credit allocation finalization' USING ERRCODE = '23514'; END IF;
    consumed := LEAST(remaining, allocation_row.reserved_credits);
    returned := allocation_row.reserved_credits - consumed;
    UPDATE credit_lots SET available_credits = available_credits + returned WHERE workspace_id = p_workspace AND id = allocation_row.id;
    UPDATE generation_credit_allocations SET consumed_credits = consumed, returned_credits = returned, finalized_at = now()
      WHERE workspace_id = p_workspace AND generation_job_id = p_generation AND lot_id = allocation_row.id;
    remaining := remaining - consumed;
  END LOOP;
  PERFORM assert_credit_lot_balance(p_workspace);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION debit_credit_lots(p_workspace UUID, p_credits NUMERIC) RETURNS VOID AS $$
DECLARE lot RECORD; remaining NUMERIC := p_credits; taken NUMERIC;
BEGIN
  IF p_credits IS NULL OR p_credits <= 0 OR p_credits = 'NaN'::numeric THEN
    RAISE EXCEPTION 'Credit debit is invalid' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM credit_accounts WHERE workspace_id = p_workspace FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Credit account is missing' USING ERRCODE = '23514'; END IF;
  FOR lot IN SELECT id, available_credits FROM credit_lots
    WHERE workspace_id = p_workspace AND available_credits > 0 ORDER BY created_at, id FOR UPDATE LOOP
    taken := LEAST(remaining, lot.available_credits);
    UPDATE credit_lots SET available_credits = available_credits - taken WHERE workspace_id = p_workspace AND id = lot.id;
    remaining := remaining - taken;
    EXIT WHEN remaining = 0;
  END LOOP;
  IF remaining <> 0 THEN RAISE EXCEPTION 'Insufficient credit lots' USING ERRCODE = '23514'; END IF;
  PERFORM assert_credit_lot_balance(p_workspace);
END;
$$ LANGUAGE plpgsql;
