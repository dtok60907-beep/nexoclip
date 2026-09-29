-- Repair installations where byteplus_asset_links was created before its
-- workspace/asset uniqueness constraint was added to migration 024.
-- The repository uses ON CONFLICT (workspace_id, local_asset_id), so the
-- matching unique index must exist even on databases that already ran 024.
CREATE UNIQUE INDEX IF NOT EXISTS byteplus_asset_links_workspace_asset_unique
  ON byteplus_asset_links (workspace_id, local_asset_id);
