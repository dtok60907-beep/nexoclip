CREATE TABLE provider_package_request_corrections (
  cost_correction_id BIGINT PRIMARY KEY REFERENCES provider_request_cost_corrections(id) ON DELETE RESTRICT,
  package_allocation_id BIGINT NOT NULL REFERENCES provider_package_allocations(id) ON DELETE RESTRICT,
  previous_consumed_quota NUMERIC(36,12) NOT NULL CHECK(previous_consumed_quota>=0 AND previous_consumed_quota<>'NaN'::numeric),
  consumed_quota NUMERIC(36,12) NOT NULL CHECK(consumed_quota>=0 AND consumed_quota<>'NaN'::numeric)
);
CREATE INDEX provider_package_request_corrections_source_idx ON provider_package_request_corrections(package_allocation_id);
CREATE TRIGGER provider_package_request_corrections_immutable BEFORE UPDATE OR DELETE ON provider_package_request_corrections
  FOR EACH ROW EXECUTE FUNCTION reject_provider_billing_mutation();
