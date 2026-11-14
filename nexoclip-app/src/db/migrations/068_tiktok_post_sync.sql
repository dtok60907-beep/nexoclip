ALTER TABLE social_accounts
  ADD COLUMN posts_sync_cursor BIGINT,
  ADD COLUMN posts_sync_run_id UUID,
  ADD COLUMN posts_sync_lease_id UUID,
  ADD COLUMN posts_sync_lease_until TIMESTAMPTZ,
  ADD COLUMN posts_next_sync_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN posts_synced_at TIMESTAMPTZ,
  ADD COLUMN posts_sync_error TEXT;

-- Older local TikTok schemas only had the workspace/account unique key.
CREATE UNIQUE INDEX IF NOT EXISTS social_accounts_post_owner_idx
  ON social_accounts(workspace_id,id,user_id);

CREATE TABLE social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  user_id UUID NOT NULL,
  social_account_id UUID NOT NULL,
  provider TEXT NOT NULL CHECK (provider = 'tiktok'),
  provider_post_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  cover_url TEXT,
  share_url TEXT,
  duration INTEGER,
  published_at TIMESTAMPTZ NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT true,
  seen_sync_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id,social_account_id,user_id)
    REFERENCES social_accounts(workspace_id,id,user_id) ON DELETE CASCADE,
  UNIQUE (social_account_id,provider_post_id)
);
CREATE INDEX social_posts_owner_idx ON social_posts(workspace_id,user_id,published_at DESC,id DESC);
CREATE INDEX social_accounts_sync_due_idx ON social_accounts(posts_next_sync_at) WHERE status='connected';
