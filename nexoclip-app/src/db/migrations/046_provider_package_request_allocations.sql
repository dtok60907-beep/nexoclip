CREATE TABLE provider_package_request_allocations (
  reconciliation_id BIGINT PRIMARY KEY REFERENCES provider_request_reconciliations(id) ON DELETE RESTRICT,
  package_allocation_id BIGINT NOT NULL REFERENCES provider_package_allocations(id) ON DELETE RESTRICT,
  consumed_quota NUMERIC(36,12) NOT NULL CHECK(consumed_quota>0 AND consumed_quota<>'NaN'::numeric)
);
CREATE INDEX provider_package_request_allocations_source_idx ON provider_package_request_allocations(package_allocation_id);
CREATE TRIGGER provider_package_request_allocations_immutable BEFORE UPDATE OR DELETE ON provider_package_request_allocations
  FOR EACH ROW EXECUTE FUNCTION reject_provider_billing_mutation();
