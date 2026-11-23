export async function getWorkspaceBrandKit(db, workspaceId) {
  const result = await db.query('SELECT data FROM workspace_brand_kits WHERE workspace_id = $1', [workspaceId]);
  return result.rows[0]?.data || null;
}

export async function saveWorkspaceBrandKit(db, { workspaceId, userId, data }) {
  const result = await db.query(
    `INSERT INTO workspace_brand_kits (workspace_id, updated_by, data)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (workspace_id) DO UPDATE SET updated_by = EXCLUDED.updated_by, data = EXCLUDED.data, updated_at = now()
     RETURNING data`,
    [workspaceId, userId, JSON.stringify(data)],
  );
  return result.rows[0].data;
}
