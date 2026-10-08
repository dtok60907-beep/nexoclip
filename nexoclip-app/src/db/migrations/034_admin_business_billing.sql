-- Immutable custom sale terms. Operator settlement and ledger grant are atomic.
CREATE TABLE business_credit_orders (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
 customer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 invoice_number TEXT NOT NULL UNIQUE,
 request_key UUID NOT NULL,
 UNIQUE (workspace_id, request_key),
 company_name TEXT NOT NULL,
 credits NUMERIC(20,6) NOT NULL CHECK (credits > 0 AND credits <> 'NaN'::numeric),
 bonus_credits NUMERIC(20,6) NOT NULL DEFAULT 0 CHECK (bonus_credits >= 0 AND bonus_credits <> 'NaN'::numeric),
 amount_idr INTEGER NOT NULL CHECK (amount_idr > 0),
 notes TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','canceled')),
 payment_reference TEXT,
 payment_fee_idr NUMERIC(20,8) CHECK (payment_fee_idr >= 0 AND payment_fee_idr <> 'NaN'::numeric),
 paid_at TIMESTAMPTZ,
 settled_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
 credit_ledger_id UUID REFERENCES credit_ledger(id) ON DELETE RESTRICT,
 topup_id UUID UNIQUE REFERENCES credit_topups(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (workspace_id, payment_reference),
 CHECK ((status = 'completed' AND payment_reference IS NOT NULL AND paid_at IS NOT NULL AND settled_by_user_id IS NOT NULL AND credit_ledger_id IS NOT NULL AND topup_id IS NOT NULL)
 OR (status <> 'completed' AND payment_reference IS NULL AND paid_at IS NULL AND settled_by_user_id IS NULL AND credit_ledger_id IS NULL AND topup_id IS NULL))
);
CREATE INDEX business_credit_orders_workspace_idx ON business_credit_orders(workspace_id, created_at DESC);
CREATE TABLE admin_account_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
 actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 action TEXT NOT NULL CHECK (action IN ('invoice_created','invoice_paid','invoice_canceled','credit_granted')),
 reason TEXT NOT NULL,
 entity_id UUID NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX admin_account_events_workspace_idx ON admin_account_events(workspace_id,created_at DESC);
CREATE TABLE account_session_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 action TEXT NOT NULL CHECK (action IN ('session_created','session_revoked')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX account_session_events_user_idx ON account_session_events(user_id,created_at DESC);
CREATE FUNCTION protect_admin_billing_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME = 'business_credit_orders' AND TG_OP = 'UPDATE' THEN
  IF OLD.status <> 'pending' OR NEW.status NOT IN ('completed','canceled') OR
   ROW(NEW.id,NEW.workspace_id,NEW.customer_user_id,NEW.created_by_user_id,NEW.invoice_number,NEW.request_key,NEW.company_name,NEW.credits,NEW.bonus_credits,NEW.amount_idr,NEW.notes,NEW.created_at)
   IS DISTINCT FROM ROW(OLD.id,OLD.workspace_id,OLD.customer_user_id,OLD.created_by_user_id,OLD.invoice_number,OLD.request_key,OLD.company_name,OLD.credits,OLD.bonus_credits,OLD.amount_idr,OLD.notes,OLD.created_at) THEN
    RAISE EXCEPTION 'Business sale terms and settled orders are immutable';
  END IF;
  RETURN NEW;
 END IF;
 RAISE EXCEPTION 'Admin billing history is append-only';
END $$;
CREATE TRIGGER business_credit_orders_history BEFORE UPDATE OR DELETE ON business_credit_orders FOR EACH ROW EXECUTE FUNCTION protect_admin_billing_history();
CREATE TRIGGER admin_account_events_history BEFORE UPDATE OR DELETE ON admin_account_events FOR EACH ROW EXECUTE FUNCTION protect_admin_billing_history();
-- Session lifecycle, not pageview tracking. No token, IP, or password is stored.
CREATE FUNCTION log_account_session_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  INSERT INTO account_session_events(user_id,action) VALUES(NEW.user_id,'session_created');
 ELSIF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN
  INSERT INTO account_session_events(user_id,action) VALUES(NEW.user_id,'session_revoked');
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER account_session_lifecycle AFTER INSERT OR UPDATE OF revoked_at ON sessions FOR EACH ROW EXECUTE FUNCTION log_account_session_lifecycle();
