CREATE TABLE meta_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL,
  config_id TEXT NOT NULL,
  client_business_id TEXT NOT NULL,
  system_user_id TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  access_expires_at TIMESTAMPTZ,
  data_access_expires_at TIMESTAMPTZ,
  granted_scopes TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'connected' CHECK(status IN ('connected','reconnect_required','disconnected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,user_id,app_id,client_business_id),
  UNIQUE(workspace_id,id,user_id)
);
ALTER TABLE social_accounts DROP CONSTRAINT social_accounts_provider_check;
ALTER TABLE social_accounts ADD CONSTRAINT social_accounts_provider_check CHECK(provider IN ('tiktok','instagram'));
ALTER TABLE social_accounts ADD COLUMN meta_integration_id UUID;
ALTER TABLE social_accounts ADD CONSTRAINT social_accounts_meta_owner_fk
  FOREIGN KEY(workspace_id,meta_integration_id,user_id) REFERENCES meta_integrations(workspace_id,id,user_id) ON DELETE CASCADE;
ALTER TABLE social_accounts ADD CONSTRAINT social_accounts_meta_provider_check
  CHECK((provider='instagram' AND meta_integration_id IS NOT NULL) OR (provider='tiktok' AND meta_integration_id IS NULL));

CREATE TABLE meta_ad_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  user_id UUID NOT NULL,
  meta_integration_id UUID NOT NULL,
  provider_account_id TEXT NOT NULL CHECK(provider_account_id ~ '^act_[0-9]+$'),
  name TEXT,
  currency TEXT,
  timezone_name TEXT,
  account_status INTEGER,
  is_available BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(workspace_id,meta_integration_id,user_id) REFERENCES meta_integrations(workspace_id,id,user_id) ON DELETE CASCADE,
  UNIQUE(meta_integration_id,provider_account_id)
);
CREATE INDEX meta_ad_accounts_owner_idx ON meta_ad_accounts(workspace_id,user_id);

CREATE TABLE meta_oauth_states (
  state_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  session_token_hash BYTEA NOT NULL,
  redirect_uri TEXT NOT NULL,
  app_id TEXT NOT NULL,
  config_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now()+interval '10 minutes'
);
