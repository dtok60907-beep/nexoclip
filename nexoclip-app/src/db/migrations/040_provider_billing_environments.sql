CREATE TABLE provider_billing_environments (
  import_id UUID PRIMARY KEY REFERENCES provider_billing_imports(id) ON DELETE RESTRICT,
  environment TEXT NOT NULL CHECK (environment IN ('development','production')),
  note TEXT NOT NULL CHECK (length(note) BETWEEN 10 AND 2000),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX provider_billing_environments_environment_idx ON provider_billing_environments(environment,import_id);
CREATE INDEX provider_billing_environments_actor_idx ON provider_billing_environments(created_by);
CREATE TRIGGER provider_billing_environments_immutable BEFORE UPDATE OR DELETE ON provider_billing_environments
  FOR EACH ROW EXECUTE FUNCTION reject_provider_billing_mutation();
