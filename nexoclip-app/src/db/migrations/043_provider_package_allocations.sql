CREATE TABLE provider_package_allocations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_id UUID NOT NULL REFERENCES provider_billing_imports(id) ON DELETE RESTRICT,
  payment_evidence_id BIGINT NOT NULL REFERENCES provider_payment_evidence(id) ON DELETE RESTRICT,
  group_key TEXT NOT NULL CHECK (group_key ~ '^[a-f0-9]{64}$'),
  usage_unit TEXT NOT NULL,
  total_quota NUMERIC(36,12) NOT NULL CHECK (total_quota>0 AND total_quota<>'NaN'::numeric),
  consumed_quota NUMERIC(36,12) NOT NULL CHECK (consumed_quota>0 AND consumed_quota<=total_quota AND consumed_quota<>'NaN'::numeric),
  allocated_usd NUMERIC(32,8) NOT NULL CHECK (allocated_usd>=0 AND allocated_usd<>'NaN'::numeric),
  allocated_idr NUMERIC(36,6) NOT NULL CHECK (allocated_idr>=0 AND allocated_idr<>'NaN'::numeric),
  note TEXT NOT NULL CHECK (length(note) BETWEEN 10 AND 2000),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(payment_evidence_id,group_key)
);
CREATE INDEX provider_package_allocations_import_idx ON provider_package_allocations(import_id,id DESC);
CREATE INDEX provider_package_allocations_actor_idx ON provider_package_allocations(created_by);
CREATE TRIGGER provider_package_allocations_immutable BEFORE UPDATE OR DELETE ON provider_package_allocations
  FOR EACH ROW EXECUTE FUNCTION reject_provider_billing_mutation();
