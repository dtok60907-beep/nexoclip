export async function findWorkspaceGenerationLimits(client, workspaceId) {
  const result = await client.query(
    `SELECT workspace_id, rate_limit, rate_window_seconds, max_concurrent, budget_credits, budget_period
     FROM workspace_generation_limits WHERE workspace_id = $1 FOR UPDATE`,
    [workspaceId],
  );
  return result.rows[0] || null;
}

export async function countRecentGenerations(client, workspaceId, since) {
  const result = await client.query(
    `SELECT COUNT(*)::integer AS count FROM generation_jobs
     WHERE workspace_id = $1 AND created_at >= $2`, [workspaceId, since],
  );
  return Number(result.rows[0]?.count || 0);
}

export async function countActiveGenerations(client, workspaceId) {
  const result = await client.query(
    `SELECT COUNT(*)::integer AS count FROM generation_jobs
     WHERE workspace_id = $1 AND status IN ('queued', 'running', 'processing')`, [workspaceId],
  );
  return Number(result.rows[0]?.count || 0);
}

export async function sumBudgetGenerations(client, workspaceId, periodStart) {
  const result = await client.query(
    `SELECT COALESCE(SUM(estimated_cost), 0)::numeric AS total FROM generation_jobs
     WHERE workspace_id = $1 AND created_at >= $2 AND status <> 'failed'`, [workspaceId, periodStart],
  );
  return Number(result.rows[0]?.total || 0);
}

export async function insertDefaultGenerationLimits(client, workspaceId, limits) {
  const result = await client.query(
    `INSERT INTO workspace_generation_limits
       (workspace_id, rate_limit, rate_window_seconds, max_concurrent, budget_credits, budget_period)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (workspace_id) DO NOTHING
     RETURNING workspace_id, rate_limit, rate_window_seconds, max_concurrent, budget_credits, budget_period`,
    [
      workspaceId,
      limits.rate_limit,
      limits.rate_window_seconds,
      limits.max_concurrent,
      limits.budget_credits,
      limits.budget_period,
    ],
  );
  return result.rows[0] || null;
}
