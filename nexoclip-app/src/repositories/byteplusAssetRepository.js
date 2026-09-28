const columns = `id, workspace_id, canvas_project_id, local_asset_id, group_id, provider_asset_id, attempt_id,
  status, error, project_name, created_at, updated_at`;
const legacyProject = '__legacy__';

export async function findBytePlusAssetLink(client, workspaceId, localAssetId, canvasProjectId = legacyProject) {
  const result = await client.query(`SELECT ${columns} FROM byteplus_asset_links WHERE workspace_id = $1 AND local_asset_id = $2 AND canvas_project_id = $3 LIMIT 1`, [workspaceId, localAssetId, canvasProjectId]);
  return result.rows[0] || null;
}

export async function findBytePlusAssetGroup(client, projectName, canvasProjectId = legacyProject, workspaceId = null) {
  const result = await client.query(`SELECT group_id FROM byteplus_asset_links WHERE project_name = $1 AND canvas_project_id = $2 AND group_id IS NOT NULL AND ($3::uuid IS NULL OR workspace_id = $3) ORDER BY updated_at DESC LIMIT 1`, [projectName, canvasProjectId, workspaceId]);
  return result.rows[0]?.group_id || null;
}

export async function createProcessingBytePlusAssetLink(client, { workspaceId, localAssetId, canvasProjectId = legacyProject, projectName = 'default', attemptId }) {
  const result = await client.query(`INSERT INTO byteplus_asset_links (workspace_id, local_asset_id, canvas_project_id, status, project_name, attempt_id) VALUES ($1, $2, $3, 'processing', $4, $5) ON CONFLICT (workspace_id, canvas_project_id, local_asset_id) DO NOTHING RETURNING ${columns}`, [workspaceId, localAssetId, canvasProjectId, projectName, attemptId]);
  return result.rows[0] || findBytePlusAssetLink(client, workspaceId, localAssetId, canvasProjectId);
}

export async function updateBytePlusAssetLink(client, { workspaceId, localAssetId, canvasProjectId = legacyProject, groupId, providerAssetId, status, error, expectedAttemptId }) {
  const result = await client.query(`UPDATE byteplus_asset_links SET group_id = COALESCE($4, group_id), provider_asset_id = COALESCE($5, provider_asset_id), status = $6, error = $7::jsonb, updated_at = now() WHERE workspace_id = $1 AND local_asset_id = $2 AND canvas_project_id = $3 AND ($8::uuid IS NULL OR attempt_id = $8) RETURNING ${columns}`, [workspaceId, localAssetId, canvasProjectId, groupId, providerAssetId, status, error && JSON.stringify(error), expectedAttemptId || null]);
  return result.rows[0] || null;
}

export async function compareAndSetBytePlusAssetLinkStatus(client, { workspaceId, localAssetId, canvasProjectId = legacyProject, expectedStatus, expectedProviderAssetId, status, error, expectedAttemptId }) {
  const result = await client.query(`UPDATE byteplus_asset_links SET status = $6, error = $7::jsonb, updated_at = now() WHERE workspace_id = $1 AND local_asset_id = $2 AND canvas_project_id = $3 AND status = $4 AND provider_asset_id IS NOT DISTINCT FROM $5 AND ($8::uuid IS NULL OR attempt_id = $8) RETURNING ${columns}`, [workspaceId, localAssetId, canvasProjectId, expectedStatus, expectedProviderAssetId, status, error && JSON.stringify(error), expectedAttemptId || null]);
  return result.rows[0] || null;
}

export async function deleteBytePlusAssetLink(client, { workspaceId, localAssetId, canvasProjectId = legacyProject, providerAssetId, attemptId }) {
  const result = await client.query(`DELETE FROM byteplus_asset_links WHERE workspace_id = $1 AND local_asset_id = $2 AND canvas_project_id = $3 AND provider_asset_id = $4 AND attempt_id = $5`, [workspaceId, localAssetId, canvasProjectId, providerAssetId, attemptId]);
  return result.rowCount > 0;
}

export async function markBytePlusAssetLinkStale(client, { workspaceId, localAssetId, canvasProjectId = legacyProject, providerAssetId, attemptId, errorCode }) {
  const result = await client.query(`UPDATE byteplus_asset_links SET status = 'failed', error = $6::jsonb, updated_at = now() WHERE workspace_id = $1 AND local_asset_id = $2 AND canvas_project_id = $3 AND provider_asset_id = $4 AND attempt_id = $5`, [workspaceId, localAssetId, canvasProjectId, providerAssetId, attemptId, JSON.stringify({ code: errorCode })]);
  return result.rowCount > 0;
}

export async function resetBytePlusAssetLink(client, { workspaceId, localAssetId, canvasProjectId = legacyProject, attemptId, projectName, clearGroup = false }) {
  const result = await client.query(`UPDATE byteplus_asset_links SET provider_asset_id = NULL, attempt_id = $4, project_name = $5, status = 'processing', group_id = CASE WHEN $6 THEN NULL ELSE group_id END, error = NULL, updated_at = now() WHERE workspace_id = $1 AND local_asset_id = $2 AND canvas_project_id = $3 RETURNING ${columns}`, [workspaceId, localAssetId, canvasProjectId, attemptId, projectName, clearGroup]);
  return result.rows[0] || null;
}
