-- Big projects produced with an agency partner, whose profit is shared. The AI cost
-- (provider spend of the project's workspace) is paid back first; the rest is profit.
CREATE TABLE IF NOT EXISTS agency_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  contact TEXT NOT NULL DEFAULT '',
  bank_name TEXT NOT NULL DEFAULT '',
  bank_account_number TEXT NOT NULL DEFAULT '',
  bank_account_name TEXT NOT NULL DEFAULT '',
  default_share_percent NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (default_share_percent >= 0 AND default_share_percent <= 100),
  notes TEXT NOT NULL DEFAULT '',
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS revenue_share_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES agency_partners(id) ON DELETE RESTRICT,
  -- The workspace the project is produced in: its provider spend is the AI cost.
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  client_name TEXT NOT NULL CHECK (length(client_name) BETWEEN 1 AND 200),
  scope TEXT NOT NULL DEFAULT '',
  project_value_idr BIGINT NOT NULL CHECK (project_value_idr > 0),
  partner_share_percent NUMERIC(5,2) NOT NULL CHECK (partner_share_percent >= 0 AND partner_share_percent <= 100),
  other_costs_idr BIGINT NOT NULL DEFAULT 0 CHECK (other_costs_idr >= 0),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'delivered', 'closed', 'canceled')),
  delivered_at TIMESTAMPTZ,
  client_paid_at TIMESTAMPTZ,
  partner_paid_at TIMESTAMPTZ,
  -- The AI cost stops counting once the project is closed.
  closed_at TIMESTAMPTZ,
  notes TEXT NOT NULL DEFAULT '',
  document_seq BIGSERIAL UNIQUE,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS revenue_share_projects_partner_idx ON revenue_share_projects (partner_id, created_at DESC);
