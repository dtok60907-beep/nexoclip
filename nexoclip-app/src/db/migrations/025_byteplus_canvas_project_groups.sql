-- Scope BytePlus trust mappings and asset groups to a Canvas project.
ALTER TABLE byteplus_asset_links ADD COLUMN IF NOT EXISTS canvas_project_id TEXT NOT NULL DEFAULT '__legacy__';
ALTER TABLE byteplus_asset_links DROP CONSTRAINT IF EXISTS byteplus_asset_links_workspace_id_local_asset_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS byteplus_asset_links_project_asset_key ON byteplus_asset_links (workspace_id, canvas_project_id, local_asset_id);
CREATE INDEX IF NOT EXISTS byteplus_asset_links_project_group_key ON byteplus_asset_links (workspace_id, canvas_project_id, project_name, group_id);
