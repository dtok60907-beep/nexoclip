-- Motion studio AI jobs: one request to the AI director (plan, then any voiceover and music it was asked for), run
-- by the motion worker so it survives the user closing or refreshing the page. The results are written into the
-- project's document; the row keeps the status, the progress line and what it charged.
CREATE TABLE IF NOT EXISTS motion_jobs (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES motion_projects(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  input JSONB NOT NULL,
  progress TEXT NOT NULL DEFAULT '',
  error TEXT,
  credits NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS motion_jobs_project_created_idx ON motion_jobs (project_id, created_at DESC);
-- One job at a time per project.
CREATE UNIQUE INDEX IF NOT EXISTS motion_jobs_one_active_idx ON motion_jobs (project_id) WHERE status IN ('queued', 'running');
