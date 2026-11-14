CREATE TABLE tiktok_oauth_states (
  state_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE social_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider = 'tiktok'),
  provider_account_id TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  granted_scopes TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','reconnect_required','disconnected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id, provider, provider_account_id),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, id, user_id)
);

CREATE TABLE social_account_credentials (
  social_account_id UUID PRIMARY KEY REFERENCES social_accounts(id) ON DELETE CASCADE,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  access_expires_at TIMESTAMPTZ NOT NULL,
  refresh_expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE social_publish_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  social_account_id UUID NOT NULL,
  generation_job_id UUID NOT NULL,
  asset_id UUID NOT NULL,
  provider TEXT NOT NULL CHECK (provider = 'tiktok'),
  mode TEXT NOT NULL CHECK (mode IN ('upload','direct')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','uploading','processing','awaiting_creator','published','failed','needs_review')),
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  privacy_level TEXT,
  disable_comment BOOLEAN NOT NULL DEFAULT true,
  disable_duet BOOLEAN NOT NULL DEFAULT true,
  disable_stitch BOOLEAN NOT NULL DEFAULT true,
  brand_content_toggle BOOLEAN NOT NULL DEFAULT false,
  brand_organic_toggle BOOLEAN NOT NULL DEFAULT false,
  is_aigc BOOLEAN NOT NULL DEFAULT true,
  provider_publish_id TEXT,
  provider_status TEXT,
  provider_error TEXT,
  upload_url_encrypted TEXT,
  next_poll_at TIMESTAMPTZ,
  scheduled_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT social_publish_account_fk FOREIGN KEY (workspace_id, social_account_id, user_id) REFERENCES social_accounts(workspace_id, id, user_id) ON DELETE CASCADE,
  CONSTRAINT social_publish_generation_fk FOREIGN KEY (workspace_id, generation_job_id) REFERENCES generation_jobs(workspace_id, id) ON DELETE RESTRICT,
  CONSTRAINT social_publish_asset_fk FOREIGN KEY (workspace_id, asset_id) REFERENCES assets(workspace_id, id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, user_id, idempotency_key)
);

CREATE INDEX social_publish_due_idx ON social_publish_jobs(status, next_poll_at, scheduled_at) WHERE status IN ('queued','processing','uploading');
CREATE INDEX social_publish_owner_idx ON social_publish_jobs(workspace_id, user_id, created_at DESC);

CREATE TABLE social_publish_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  social_publish_job_id UUID REFERENCES social_publish_jobs(id) ON DELETE CASCADE,
  social_account_id UUID REFERENCES social_accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider = 'tiktok'),
  event_type TEXT NOT NULL,
  event_fingerprint TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
