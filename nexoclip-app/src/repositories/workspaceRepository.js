// The user's current workspace (users.current_workspace_id) is listed first, so everything
// that takes "the default workspace" (getDefaultWorkspace -> workspaces[0]) follows a switch.
export async function listUserWorkspaces(client, userId) {
  const result = await client.query(
    `SELECT w.id, w.name, w.slug, wm.role, (w.id = u.current_workspace_id) AS is_current
     FROM workspace_memberships wm
     JOIN workspaces w ON w.id = wm.workspace_id
     JOIN users u ON u.id = wm.user_id
     WHERE wm.user_id = $1
     ORDER BY (w.id = u.current_workspace_id) DESC NULLS LAST, w.created_at ASC`,
    [userId],
  );

  return result.rows;
}

export async function findWorkspaceMembership(client, workspaceId, userId) {
  const result = await client.query(
    `SELECT w.id, w.name, w.slug, wm.user_id, wm.role
     FROM workspace_memberships wm
     JOIN workspaces w ON w.id = wm.workspace_id
     WHERE wm.workspace_id = $1 AND wm.user_id = $2
     LIMIT 1`,
    [workspaceId, userId],
  );

  return result.rows[0] || null;
}

export async function countOwnedWorkspaces(client, userId) {
  const result = await client.query(
    `SELECT count(*)::int AS count FROM workspace_memberships WHERE user_id = $1 AND role = 'owner'`,
    [userId],
  );
  return result.rows[0]?.count || 0;
}

export async function insertWorkspace(client, { name, slug, ownerId }) {
  const workspace = (await client.query(
    `INSERT INTO workspaces (name, slug) VALUES ($1, $2) RETURNING id, name, slug`,
    [name, slug],
  )).rows[0];
  await client.query(
    `INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`,
    [workspace.id, ownerId],
  );
  await client.query(
    `INSERT INTO credit_accounts (workspace_id) VALUES ($1) ON CONFLICT (workspace_id) DO NOTHING`,
    [workspace.id],
  );
  return { ...workspace, role: 'owner' };
}

export async function setCurrentWorkspace(client, userId, workspaceId) {
  await client.query(`UPDATE users SET current_workspace_id = $2 WHERE id = $1`, [userId, workspaceId]);
}
