-- Platform-owned supplier evidence, never customer credit or per-job allocation.
CREATE TABLE provider_billing_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'byteplus' CHECK (provider = 'byteplus'),
  provider_account_id TEXT NOT NULL CHECK (length(provider_account_id) BETWEEN 1 AND 160),
  billing_cycle TEXT NOT NULL CHECK (billing_cycle ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  currency TEXT NOT NULL CHECK (currency = 'USD'),
  file_hash TEXT NOT NULL UNIQUE CHECK (file_hash ~ '^[a-f0-9]{64}$'),
  reference TEXT NOT NULL CHECK (length(reference) BETWEEN 3 AND 160),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL CHECK (period_end > period_start),
  row_count INTEGER NOT NULL CHECK (row_count BETWEEN 1 AND 10000),
  package_row_count INTEGER NOT NULL CHECK (package_row_count BETWEEN 0 AND row_count),
  gross_usd NUMERIC(32,8) NOT NULL CHECK (gross_usd >= 0 AND gross_usd <> 'NaN'::numeric),
  savings_plan_gross_usd NUMERIC(32,8) NOT NULL CHECK (savings_plan_gross_usd >= 0 AND savings_plan_gross_usd <> 'NaN'::numeric),
  discount_usd NUMERIC(32,8) NOT NULL CHECK (discount_usd >= 0 AND discount_usd <> 'NaN'::numeric),
  coupon_usd NUMERIC(32,8) NOT NULL CHECK (coupon_usd >= 0 AND coupon_usd <> 'NaN'::numeric),
  truncated_usd NUMERIC(32,8) NOT NULL CHECK (truncated_usd >= 0 AND truncated_usd <> 'NaN'::numeric),
  pre_tax_usd NUMERIC(32,8) NOT NULL CHECK (pre_tax_usd >= 0 AND pre_tax_usd <> 'NaN'::numeric),
  tax_usd NUMERIC(32,8) NOT NULL CHECK (tax_usd >= 0 AND tax_usd <> 'NaN'::numeric),
  total_usd NUMERIC(32,8) NOT NULL CHECK (total_usd >= 0 AND total_usd <> 'NaN'::numeric),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, provider_account_id),
  UNIQUE (provider_account_id, reference)
);
CREATE INDEX provider_billing_imports_period_idx ON provider_billing_imports(provider_account_id,period_start,period_end);
CREATE INDEX provider_billing_imports_created_idx ON provider_billing_imports(created_at DESC,id);
CREATE INDEX provider_billing_imports_actor_idx ON provider_billing_imports(created_by);

CREATE TABLE provider_billing_lines (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_id UUID NOT NULL,
  provider_account_id TEXT NOT NULL,
  identity_hash TEXT NOT NULL CHECK (identity_hash ~ '^[a-f0-9]{64}$'),
  line_number INTEGER NOT NULL CHECK (line_number > 0),
  configuration TEXT NOT NULL,
  billing_unit TEXT NOT NULL,
  usage_unit TEXT NOT NULL,
  usage NUMERIC(36,12) NOT NULL CHECK (usage >= 0 AND usage <> 'NaN'::numeric),
  package_usage NUMERIC(36,12) NOT NULL CHECK (package_usage >= 0 AND package_usage <> 'NaN'::numeric),
  total_usd NUMERIC(32,8) NOT NULL CHECK (total_usd >= 0 AND total_usd <> 'NaN'::numeric),
  evidence JSONB NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  FOREIGN KEY (import_id,provider_account_id) REFERENCES provider_billing_imports(id,provider_account_id) ON DELETE RESTRICT,
  UNIQUE (provider_account_id,identity_hash),
  UNIQUE (import_id,line_number)
);
CREATE INDEX provider_billing_lines_import_idx ON provider_billing_lines(import_id);

CREATE TABLE provider_billing_reviews (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_id UUID NOT NULL REFERENCES provider_billing_imports(id) ON DELETE RESTRICT,
  note TEXT NOT NULL CHECK (length(note) BETWEEN 10 AND 2000),
  comparison_hash TEXT NOT NULL CHECK (comparison_hash ~ '^[a-f0-9]{64}$'),
  comparison_snapshot JSONB NOT NULL CHECK (jsonb_typeof(comparison_snapshot) = 'object'),
  review_hash TEXT NOT NULL UNIQUE CHECK (review_hash ~ '^[a-f0-9]{64}$'),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX provider_billing_reviews_import_idx ON provider_billing_reviews(import_id,id DESC);
CREATE INDEX provider_billing_reviews_actor_idx ON provider_billing_reviews(created_by);

CREATE FUNCTION reject_provider_billing_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Provider billing evidence is append-only' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER provider_billing_imports_immutable BEFORE UPDATE OR DELETE ON provider_billing_imports FOR EACH ROW EXECUTE FUNCTION reject_provider_billing_mutation();
CREATE TRIGGER provider_billing_lines_immutable BEFORE UPDATE OR DELETE ON provider_billing_lines FOR EACH ROW EXECUTE FUNCTION reject_provider_billing_mutation();
CREATE TRIGGER provider_billing_reviews_immutable BEFORE UPDATE OR DELETE ON provider_billing_reviews FOR EACH ROW EXECUTE FUNCTION reject_provider_billing_mutation();
