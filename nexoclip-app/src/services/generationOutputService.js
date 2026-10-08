import { getPool } from '../db/pool.js';
import { recordGenerationOutput, recordProviderUsage } from '../repositories/generationOutputRepository.js';

export async function persistGenerationResult(pool, {
  workspaceId, generationId, provider, providerRequestId, estimatedCostUsd = null,
  actualCostUsd, outputs = [], usage = {},
}) {
  if (!workspaceId || !generationId || !provider || !providerRequestId) {
    throw new TypeError('workspace, generation, provider, and provider request are required');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const savedOutputs = [];
    for (const [outputIndex, output] of outputs.entries()) {
      if (!output?.assetId) throw new TypeError('generation output assetId is required');
      savedOutputs.push(await recordGenerationOutput(client, {
        workspaceId, generationId, providerRequestId, outputIndex, assetId: output.assetId,
      }));
    }
    const reportedCost = validUsd(usage.costUsd) ?? validUsd(usage.cost);
    const actualCost = actualCostUsd === undefined ? reportedCost : validUsd(actualCostUsd);
    const savedUsage = await recordProviderUsage(client, {
      workspaceId, generationId, provider, providerRequestId,
      estimatedCost: validUsd(estimatedCostUsd), actualCost,
      costCurrency: 'USD',
      costSource: actualCost === null ? 'unknown' : reportedCost === actualCost ? 'reported' : 'calculated',
      // Keep normalized counters as well as any nested provider usage. They
      // allow recovery to reproduce settlement without reloading rates.
      units: usage.units ?? {}, rawUsage: usage,
    });
    await client.query('COMMIT');
    return { outputs: savedOutputs, usage: savedUsage };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

function validUsd(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export async function persistGenerationResultWithDefaultPool(input) {
  return persistGenerationResult(getPool(), input);
}
