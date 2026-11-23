export async function listProjects(client, workspaceId) {
  const result = await client.query(
    `SELECT id, workspace_id, name, slug, description, created_at, updated_at
     FROM projects
     WHERE workspace_id = $1 AND studio IS NULL
     ORDER BY created_at DESC`,
    [workspaceId],
  );
  return result.rows;
}

export async function findProject(client, workspaceId, projectId) {
  const result = await client.query(
    `SELECT id, workspace_id, name, slug, description, created_at, updated_at
     FROM projects
     WHERE workspace_id = $1 AND id = $2 AND studio IS NULL
     LIMIT 1`,
    [workspaceId, projectId],
  );
  return result.rows[0] || null;
}

export async function createProject(client, { workspaceId, name, slug, description }) {
  const result = await client.query(
    `INSERT INTO projects (workspace_id, name, slug, description)
     VALUES ($1, $2, $3, $4)
     RETURNING id, workspace_id, name, slug, description, created_at, updated_at`,
    [workspaceId, name, slug, description || null],
  );
  return result.rows[0];
}

export async function updateProject(client, { workspaceId, projectId, name, slug, description }) {
  const result = await client.query(
    `UPDATE projects
     SET name = $3, slug = $4, description = $5, updated_at = now()
     WHERE workspace_id = $1 AND id = $2 AND studio IS NULL
     RETURNING id, workspace_id, name, slug, description, created_at, updated_at`,
    [workspaceId, projectId, name, slug, description || null],
  );
  return result.rows[0] || null;
}

export async function deleteProject(client, workspaceId, projectId) {
  const result = await client.query(
    'DELETE FROM projects WHERE workspace_id = $1 AND id = $2 AND studio IS NULL RETURNING id',
    [workspaceId, projectId],
  );
  return Boolean(result.rows[0]);
}
