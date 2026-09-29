-- Scope BytePlus trusted assets and provider groups to one Canvas project.
-- Existing links remain in the legacy workspace scope and can be re-trusted
-- independently when first used by a Canvas project.
ALTER TABLE byteplus_asset_links
  ADD COLUMN IF NOT EXISTS canvas_project_id TEXT NOT NULL DEFAULT 'workspace';

ALTER TABLE byteplus_asset_links
  DROP CONSTRAINT IF EXISTS byteplus_asset_links_workspace_id_local_asset_id_key;

DROP INDEX IF EXISTS byteplus_asset_links_workspace_asset_unique;

CREATE UNIQUE INDEX IF NOT EXISTS byteplus_asset_links_workspace_project_asset_unique
  ON byteplus_asset_links (workspace_id, canvas_project_id, local_asset_id);

CREATE INDEX IF NOT EXISTS byteplus_asset_links_workspace_project_group_idx
  ON byteplus_asset_links (workspace_id, canvas_project_id, project_name, updated_at DESC)
  WHERE group_id IS NOT NULL;
