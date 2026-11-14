ALTER TABLE social_posts ADD COLUMN metrics JSONB NOT NULL DEFAULT '{}';
ALTER TABLE social_publish_jobs
  ALTER COLUMN generation_job_id DROP NOT NULL,
  ADD COLUMN media_type TEXT NOT NULL DEFAULT 'video' CHECK (media_type IN ('video','photo')),
  ADD COLUMN photo_title TEXT NOT NULL DEFAULT '',
  ADD COLUMN photo_cover_index INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN auto_add_music BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN public_post_ids TEXT[] NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX IF NOT EXISTS social_publish_job_workspace_idx ON social_publish_jobs(workspace_id,id);
CREATE TABLE social_publish_media (
  workspace_id UUID NOT NULL,
  social_publish_job_id UUID NOT NULL,
  asset_id UUID NOT NULL,
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 34),
  PRIMARY KEY(social_publish_job_id,position),
  UNIQUE(social_publish_job_id,asset_id),
  FOREIGN KEY(workspace_id,social_publish_job_id) REFERENCES social_publish_jobs(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY(workspace_id,asset_id) REFERENCES assets(workspace_id,id) ON DELETE RESTRICT
);
