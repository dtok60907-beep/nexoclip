-- Motion studio projects: one motion graphic (style, format, scenes, custom look and the AI chat) per row.
CREATE TABLE IF NOT EXISTS motion_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  doc JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS motion_projects_workspace_updated_idx
  ON motion_projects (workspace_id, updated_at DESC);
