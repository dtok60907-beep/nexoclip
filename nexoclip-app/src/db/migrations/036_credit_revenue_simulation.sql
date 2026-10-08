-- Reporting assumptions only: never change paid credit provenance or balances.
CREATE TABLE credit_revenue_simulations (
 workspace_id UUID NOT NULL,
 lot_id UUID NOT NULL,
 assumed_amount_idr NUMERIC(20,8) NOT NULL CHECK (assumed_amount_idr > 0 AND assumed_amount_idr <> 'NaN'::numeric),
 reference_credits NUMERIC(20,6) NOT NULL CHECK (reference_credits > 0 AND reference_credits <> 'NaN'::numeric),
 reason TEXT NOT NULL,
 recorded_by_user_id UUID NOT NULL REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,lot_id),
 FOREIGN KEY(workspace_id,lot_id) REFERENCES credit_lots(workspace_id,id) ON DELETE RESTRICT
);
CREATE FUNCTION protect_credit_revenue_simulation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Revenue simulations are append-only'; END IF;
 IF NOT EXISTS (SELECT 1 FROM credit_lots WHERE workspace_id=NEW.workspace_id AND id=NEW.lot_id AND source_type='promo' AND granted_credits=NEW.reference_credits) THEN
  RAISE EXCEPTION 'Simulation must match the original promo grant';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER credit_revenue_simulations_history BEFORE INSERT OR UPDATE OR DELETE ON credit_revenue_simulations FOR EACH ROW EXECUTE FUNCTION protect_credit_revenue_simulation();
