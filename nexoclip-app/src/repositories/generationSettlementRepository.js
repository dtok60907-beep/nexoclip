export async function lockGenerationForSettlement(client, workspaceId, generationId) {
  const result = await client.query(
    `SELECT id, workspace_id, status, settlement_status, estimated_cost, reservation_ledger_id
     FROM generation_jobs WHERE workspace_id = $1 AND id = $2 FOR UPDATE`,
    [workspaceId, generationId],
  );
  return result.rows[0] || null;
}

export async function settleUnreservedGeneration(client, workspaceId, generationId, status) {
  const settlementStatus = status === 'succeeded' ? 'captured' : status === 'failed' ? 'released' : null;
  if (!settlementStatus) throw new TypeError('Unreserved generation must be terminal');
  const result = await client.query(
    `UPDATE generation_jobs SET settlement_status = $4, updated_at = now()
     WHERE workspace_id = $1 AND id = $2 AND settlement_status = 'pending'
       AND reservation_ledger_id IS NULL AND status = $3
     RETURNING id, workspace_id, status, settlement_status, estimated_cost, reservation_ledger_id`,
    [workspaceId, generationId, status, settlementStatus],
  );
  return result.rows[0] || null;
}

export async function findPendingTerminalGenerations(pool) {
  const result = await pool.query(
    `SELECT generation.id, generation.workspace_id, generation.status, generation.reservation_ledger_id,
            generation.kind, generation.model, generation.parameters, generation.estimated_cost,
            generation.pricing_snapshot,
            usage.actual_cost AS provider_actual_cost, usage.cost_currency AS provider_cost_currency,
            usage.cost_source AS provider_cost_source, usage.raw_usage AS provider_raw_usage
     FROM generation_jobs generation
     LEFT JOIN LATERAL (
       SELECT actual_cost, cost_currency, cost_source, raw_usage
       FROM provider_usage usage
       WHERE usage.workspace_id = generation.workspace_id
         AND usage.generation_job_id = generation.id
         AND usage.provider = COALESCE(generation.provider, 'muapi')
         AND usage.provider_request_id = COALESCE(generation.provider_request_id,
               COALESCE(generation.provider, 'muapi') || ':' || generation.id::text)
       ORDER BY usage.updated_at DESC, usage.id DESC
       LIMIT 1
     ) usage ON generation.status = 'succeeded'
     WHERE generation.settlement_status = 'pending' AND generation.status IN ('succeeded', 'failed')`,
  );
  return result.rows;
}

export const findPendingUnreservedTerminalGenerations = findPendingTerminalGenerations;

export async function updateGenerationSettlement(client, workspaceId, generationId, from, to) {
  const result = await client.query(
    `UPDATE generation_jobs SET settlement_status = $4, updated_at = now()
     WHERE workspace_id = $1 AND id = $2 AND settlement_status = $3
     RETURNING id, workspace_id, status, settlement_status, estimated_cost, reservation_ledger_id`,
    [workspaceId, generationId, from, to],
  );
  return result.rows[0] || null;
}
