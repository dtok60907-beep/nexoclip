-- Enterprise deals priced from a profit share: the operator enters the deal value and the
-- profit kept, and the rest buys credits at cost. Both are kept with the sale terms.
ALTER TABLE business_credit_orders
  ADD COLUMN IF NOT EXISTS profit_percent NUMERIC(5,2) CHECK (profit_percent >= 0 AND profit_percent < 100),
  ADD COLUMN IF NOT EXISTS cost_idr_per_credit NUMERIC(12,4) CHECK (cost_idr_per_credit > 0);

-- Sale terms stay immutable, the new ones included.
CREATE OR REPLACE FUNCTION protect_admin_billing_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME = 'business_credit_orders' AND TG_OP = 'UPDATE' THEN
  IF OLD.status <> 'pending' OR NEW.status NOT IN ('completed','canceled') OR
   ROW(NEW.id,NEW.workspace_id,NEW.customer_user_id,NEW.created_by_user_id,NEW.invoice_number,NEW.request_key,NEW.company_name,NEW.credits,NEW.bonus_credits,NEW.amount_idr,NEW.notes,NEW.created_at,NEW.profit_percent,NEW.cost_idr_per_credit)
   IS DISTINCT FROM ROW(OLD.id,OLD.workspace_id,OLD.customer_user_id,OLD.created_by_user_id,OLD.invoice_number,OLD.request_key,OLD.company_name,OLD.credits,OLD.bonus_credits,OLD.amount_idr,OLD.notes,OLD.created_at,OLD.profit_percent,OLD.cost_idr_per_credit) THEN
    RAISE EXCEPTION 'Business sale terms and settled orders are immutable';
  END IF;
  RETURN NEW;
 END IF;
 RAISE EXCEPTION 'Admin billing history is append-only';
END $$;
