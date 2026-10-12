-- The workspace a user is working in. Every "default workspace" lookup (generations,
-- credits, Director, ...) resolves to it, so switching workspace is one consistent switch.
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;
