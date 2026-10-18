-- The seller's details printed on quotations, invoices and receipts. One row.
CREATE TABLE IF NOT EXISTS company_profile (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  legal_name TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  npwp TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  bank_name TEXT NOT NULL DEFAULT '',
  bank_account_number TEXT NOT NULL DEFAULT '',
  bank_account_name TEXT NOT NULL DEFAULT '',
  signer_name TEXT NOT NULL DEFAULT '',
  signer_title TEXT NOT NULL DEFAULT '',
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO company_profile (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Sequential document numbers (NXB/2026/10/0001) for business invoices; the existing
-- invoice_number stays the unique key.
ALTER TABLE business_credit_orders ADD COLUMN IF NOT EXISTS document_seq BIGSERIAL;
CREATE UNIQUE INDEX IF NOT EXISTS business_credit_orders_document_seq_idx ON business_credit_orders (document_seq);
