CREATE UNIQUE INDEX IF NOT EXISTS projects_workspace_id_id_idx ON projects (workspace_id, id);

CREATE TABLE IF NOT EXISTS generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id UUID,
  CONSTRAINT generation_jobs_project_workspace_fk
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'image' CHECK (kind = 'image'),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  prompt TEXT NOT NULL,
  model TEXT NOT NULL,
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  error JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS generation_jobs_workspace_created_idx
  ON generation_jobs (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS generation_jobs_workspace_status_idx
  ON generation_jobs (workspace_id, status);
