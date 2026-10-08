CREATE TABLE provider_payment_evidence (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_id UUID NOT NULL REFERENCES provider_billing_imports(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('invoice_payment','package_purchase')),
  amount_usd NUMERIC(32,8) NOT NULL CHECK (amount_usd>0 AND amount_usd<>'NaN'::numeric),
  amount_idr NUMERIC(32,2) NOT NULL CHECK (amount_idr>0 AND amount_idr<>'NaN'::numeric),
  paid_at TIMESTAMPTZ NOT NULL,
  reference TEXT NOT NULL CHECK (length(reference) BETWEEN 3 AND 160),
  note TEXT NOT NULL CHECK (length(note) BETWEEN 10 AND 2000),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(import_id,kind,reference)
);
CREATE INDEX provider_payment_evidence_import_idx ON provider_payment_evidence(import_id,id DESC);
CREATE INDEX provider_payment_evidence_actor_idx ON provider_payment_evidence(created_by);
CREATE TRIGGER provider_payment_evidence_immutable BEFORE UPDATE OR DELETE ON provider_payment_evidence
  FOR EACH ROW EXECUTE FUNCTION reject_provider_billing_mutation();
