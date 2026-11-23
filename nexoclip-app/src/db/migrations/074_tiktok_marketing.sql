CREATE TABLE tiktok_marketing_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL,
  advertiser_id TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected' CHECK(status IN ('connected','reconnect_required','disconnected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,user_id,app_id,advertiser_id),
  UNIQUE(workspace_id,id,user_id)
);
CREATE INDEX tiktok_marketing_owner_idx ON tiktok_marketing_accounts(workspace_id,user_id,status);

CREATE TABLE tiktok_marketing_oauth_states (
  state_hash TEXT PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token_hash BYTEA NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now()+interval '15 minutes'
);
