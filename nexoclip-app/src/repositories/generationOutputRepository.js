function json(value) {
  return JSON.stringify(value ?? {});
}

export async function recordGenerationOutput(client, {
  workspaceId, generationId, providerRequestId, outputIndex, assetId,
}) {
  const result = await client.query(
    `INSERT INTO generation_outputs
       (workspace_id, generation_job_id, provider_request_id, output_index, asset_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (workspace_id, generation_job_id, provider_request_id, output_index)
     DO UPDATE SET asset_id = EXCLUDED.asset_id
     RETURNING id, workspace_id, generation_job_id, provider_request_id, output_index, asset_id, created_at`,
    [workspaceId, generationId, providerRequestId, outputIndex, assetId],
  );
  return result.rows[0];
}

export async function recordProviderUsage(client, {
  workspaceId, generationId, provider, providerRequestId,
  estimatedCost = null, actualCost = null, units = {}, rawUsage = {},
  costCurrency = 'USD', costSource = actualCost === null ? 'unknown' : 'reported',
}) {
  const result = await client.query(
    `INSERT INTO provider_usage
       (workspace_id, generation_job_id, provider, provider_request_id,
        estimated_cost, actual_cost, units, raw_usage, cost_currency, cost_source)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10)
     ON CONFLICT (workspace_id, generation_job_id, provider_request_id)
     DO UPDATE SET estimated_cost = CASE WHEN provider_usage.cost_currency IS DISTINCT FROM EXCLUDED.cost_currency
                                        THEN EXCLUDED.estimated_cost
                                        ELSE COALESCE(EXCLUDED.estimated_cost, provider_usage.estimated_cost) END,
                   actual_cost = CASE WHEN provider_usage.cost_currency IS DISTINCT FROM EXCLUDED.cost_currency
                                     THEN EXCLUDED.actual_cost
                                     ELSE COALESCE(EXCLUDED.actual_cost, provider_usage.actual_cost) END,
                   cost_currency = EXCLUDED.cost_currency,
                   cost_source = CASE WHEN EXCLUDED.actual_cost IS NOT NULL
                                            OR provider_usage.cost_currency IS DISTINCT FROM EXCLUDED.cost_currency
                                            OR provider_usage.actual_cost IS NULL
                                      THEN EXCLUDED.cost_source ELSE provider_usage.cost_source END,
                   units = CASE WHEN EXCLUDED.actual_cost IS NOT NULL OR provider_usage.actual_cost IS NULL
                                THEN EXCLUDED.units ELSE provider_usage.units END,
                   raw_usage = CASE WHEN EXCLUDED.actual_cost IS NOT NULL OR provider_usage.actual_cost IS NULL
                                    THEN EXCLUDED.raw_usage ELSE provider_usage.raw_usage END,
                   updated_at = now()
     RETURNING id, workspace_id, generation_job_id, provider, provider_request_id,
               estimated_cost, actual_cost, units, raw_usage, cost_currency, cost_source, created_at, updated_at`,
    [workspaceId, generationId, provider, providerRequestId, estimatedCost, actualCost, json(units), json(rawUsage), costCurrency, costSource],
  );
  return result.rows[0];
}
