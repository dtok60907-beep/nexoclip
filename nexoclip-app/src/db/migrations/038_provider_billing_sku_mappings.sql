-- Mapping is scoped to imported evidence; it never allocates money to jobs.
CREATE TABLE provider_billing_sku_mappings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_id UUID NOT NULL REFERENCES provider_billing_imports(id) ON DELETE RESTRICT,
  group_key TEXT NOT NULL CHECK (group_key ~ '^[a-f0-9]{64}$'),
  configuration TEXT NOT NULL,
  billing_unit TEXT NOT NULL,
  usage_unit TEXT NOT NULL,
  model TEXT CHECK (model IS NULL OR length(model) BETWEEN 1 AND 200),
  note TEXT NOT NULL CHECK (length(note) BETWEEN 10 AND 2000),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX provider_billing_sku_mappings_group_idx ON provider_billing_sku_mappings(import_id,group_key,id DESC);
CREATE INDEX provider_billing_sku_mappings_actor_idx ON provider_billing_sku_mappings(created_by);
CREATE TRIGGER provider_billing_sku_mappings_immutable BEFORE UPDATE OR DELETE ON provider_billing_sku_mappings
  FOR EACH ROW EXECUTE FUNCTION reject_provider_billing_mutation();
