CREATE TABLE workspace_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('youtube','google-sheets','google-drive','dropbox')),
  provider_user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','reconnect_required','disconnected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id,user_id,provider,provider_user_id)
);
CREATE INDEX workspace_integrations_owner_idx ON workspace_integrations(workspace_id,user_id,status);

CREATE TABLE workspace_integration_oauth_states (
  state_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('youtube','google-sheets','google-drive','dropbox')),
  session_token_hash BYTEA NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now()+interval '10 minutes'
);
