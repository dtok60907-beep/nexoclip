const columns = `id, workspace_id, created_by_user_id, project_id, kind, status, prompt, model,
  parameters, result, error, estimated_cost, pricing_version_id, reservation_ledger_id, settlement_status,
  idempotency_key, attempt_count, max_attempts, next_attempt_at, timeout_at,
  vimax_session_id, provider, provider_request_id, progress,
  created_at, updated_at, started_at, finished_at`;

export async function createImageGeneration(client, { workspaceId, createdByUserId = null, projectId, kind = 'image', prompt, model, parameters, idempotencyKey, estimatedCost, pricingVersionId, reservationLedgerId }) {
  const reserved = idempotencyKey !== undefined;
  const result = await client.query(
    reserved
      ? `INSERT INTO generation_jobs
           (workspace_id, created_by_user_id, project_id, kind, prompt, model, parameters, idempotency_key,
            estimated_cost, pricing_version_id, reservation_ledger_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)
         RETURNING ${columns}`
      : `INSERT INTO generation_jobs (workspace_id, created_by_user_id, project_id, kind, prompt, model, parameters)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         RETURNING ${columns}`,
    reserved
      ? [workspaceId, createdByUserId, projectId, kind, prompt, model, JSON.stringify(parameters), idempotencyKey, estimatedCost, pricingVersionId, reservationLedgerId]
      : [workspaceId, createdByUserId, projectId, kind, prompt, model, JSON.stringify(parameters)],
  );
  return result.rows[0];
}

export async function createVimaxGeneration(client, {
  workspaceId, createdByUserId = null, projectId, kind, prompt, model, parameters, idempotencyKey,
  estimatedCost, pricingVersionId, reservationLedgerId, vimaxSessionId,
}) {
  const result = await client.query(
    `INSERT INTO generation_jobs
       (workspace_id, created_by_user_id, project_id, kind, prompt, model, parameters, idempotency_key,
        estimated_cost, pricing_version_id, reservation_ledger_id, vimax_session_id, provider)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13)
     RETURNING ${columns}`,
    [
      workspaceId, createdByUserId, projectId, kind, prompt, model, JSON.stringify(parameters), idempotencyKey,
      estimatedCost, pricingVersionId, reservationLedgerId, vimaxSessionId, 'vimax',
    ],
  );
  return result.rows[0];
}

export async function findGeneration(client, workspaceId, generationId) {
  const result = await client.query(
    `SELECT ${columns}, COALESCE((
       SELECT jsonb_agg(jsonb_build_object(
         'assetId', a.id, 'filename', a.filename, 'contentType', a.content_type,
         'storageKey', a.storage_key, 'outputIndex', go.output_index,
         'providerRequestId', go.provider_request_id
       ) ORDER BY go.output_index)
       FROM generation_outputs go
       JOIN assets a ON a.workspace_id = go.workspace_id AND a.id = go.asset_id
       WHERE go.workspace_id = generation_jobs.workspace_id AND go.generation_job_id = generation_jobs.id
     ), '[]'::jsonb) AS outputs
     FROM generation_jobs
     WHERE workspace_id = $1 AND id = $2 LIMIT 1`,
    [workspaceId, generationId],
  );
  return result.rows[0] || null;
}

export async function findGenerationByIdempotencyKey(client, workspaceId, idempotencyKey) {
  const result = await client.query(
    `SELECT ${columns} FROM generation_jobs
     WHERE workspace_id = $1 AND idempotency_key = $2 LIMIT 1`,
    [workspaceId, idempotencyKey],
  );
  return result.rows[0] || null;
}
