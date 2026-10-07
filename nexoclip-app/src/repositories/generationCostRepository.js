export async function appendGenerationCostEvent(client, {
  workspaceId, generationId, provider, providerRequestId = null, dispatchId,
  workerAttempt, eventType, observationFingerprint, costUsd = null,
  costIdr = null, usdIdrRate = null, costSource = 'unknown', usage = {}, providerAccountId = null,
}) {
  const result = await client.query(
    `INSERT INTO generation_cost_events
       (workspace_id, generation_job_id, provider, provider_request_id, dispatch_id,
        worker_attempt, event_type, observation_fingerprint, cost_usd, cost_idr,
        usd_idr_rate, cost_source, usage,provider_account_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb,$14)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [workspaceId, generationId, provider, providerRequestId, dispatchId,
      workerAttempt, eventType, observationFingerprint, costUsd, costIdr,
      usdIdrRate, costSource, JSON.stringify(usage),providerAccountId],
  );
  return result.rows[0] || null;
}

export async function listGenerationCostObservations(client, workspaceId, generationId) {
  const result = await client.query(
    `SELECT * FROM latest_generation_cost_observations
     WHERE workspace_id = $1 AND generation_job_id = $2 ORDER BY id`,
    [workspaceId, generationId],
  );
  return result.rows;
}
