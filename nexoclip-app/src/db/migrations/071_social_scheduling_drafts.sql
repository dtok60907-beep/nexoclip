ALTER TABLE social_publish_jobs DROP CONSTRAINT social_publish_jobs_status_check;
ALTER TABLE social_publish_jobs ADD CONSTRAINT social_publish_jobs_status_check
  CHECK(status IN ('scheduled','queued','uploading','processing','awaiting_creator','published','failed','needs_review','cancelled'));
ALTER TABLE social_publish_jobs ADD COLUMN schedule_timezone TEXT;
CREATE INDEX social_publish_scheduled_idx ON social_publish_jobs(scheduled_at) WHERE status='scheduled';

CREATE TABLE social_publish_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'tiktok' CHECK(provider='tiktok'),
  content JSONB NOT NULL CHECK(jsonb_typeof(content)='object'),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX social_publish_drafts_owner_idx ON social_publish_drafts(workspace_id,user_id,updated_at DESC);
