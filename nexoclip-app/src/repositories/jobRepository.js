const RETURN_COLS = 'id, workspace_id, kind, status, parameters, result, error, created_at, updated_at';
// The history lists also show what was asked for and with which model.
const LIST_COLS = `${RETURN_COLS}, prompt, model, (SELECT asset_id FROM generation_outputs WHERE workspace_id = generation_jobs.workspace_id AND generation_job_id = generation_jobs.id ORDER BY output_index LIMIT 1) AS output_asset_id`;

export async function insertJob(client, { workspaceId, kind, params }) {
  const result = await client.query(
    `INSERT INTO generation_jobs (workspace_id, kind, status, parameters)
     VALUES ($1, $2, 'queued', $3)
     RETURNING ${RETURN_COLS}`,
    [workspaceId, kind, params ?? {}],
  );
  return result.rows[0];
}

export async function findJob(client, workspaceId, id) {
  const result = await client.query(
    `SELECT ${RETURN_COLS} FROM generation_jobs
     WHERE workspace_id = $1 AND id = $2 LIMIT 1`,
    [workspaceId, id],
  );
  return result.rows[0] || null;
}

export async function listJobs(client, { workspaceId, statuses = null, kind = null, limit = 50 }) {
  const where = ['workspace_id = $1'];
  const params = [workspaceId];
  if (statuses && statuses.length) { params.push(statuses); where.push(`status = ANY($${params.length})`); }
  if (kind) { params.push(kind); where.push(`kind = $${params.length}`); }
  params.push(limit);
  const result = await client.query(
    `SELECT ${LIST_COLS} FROM generation_jobs
     WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC LIMIT $${params.length}`,
    params,
  );
  return result.rows;
}

export async function updateJob(client, { workspaceId, id, status, result = null, error = null }) {
  const res = await client.query(
    `UPDATE generation_jobs
     SET status = $3, result = $4, error = $5, updated_at = now()
     WHERE workspace_id = $1 AND id = $2
     RETURNING ${RETURN_COLS}`,
    [workspaceId, id, status, result, error],
  );
  return res.rows[0] || null;
}
