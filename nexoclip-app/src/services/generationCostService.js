import { createHash } from 'node:crypto';
import { appendGenerationCostEvent } from '../repositories/generationCostRepository.js';
import { actualGenerationCostUsd } from './generationPricing.js';

const USAGE_FIELDS = new Set([
  'cost', 'costUsd', 'completion_tokens', 'total_tokens', 'prompt_tokens',
  'inputTokens', 'imageOutputTokens', 'textOutputTokens', 'generated_images',
  'input_tokens', 'output_tokens', 'seconds', 'duration',
]);

function amount(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

// Providers occasionally include response bodies/credentials in error objects.
// Store only the numeric usage fields needed to reconstruct cost, never that body.
export function sanitizeProviderCostUsage(usage = {}) {
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return {};
  return Object.fromEntries(Object.keys(usage).sort()
    .filter((key) => USAGE_FIELDS.has(key) && amount(usage[key]) !== null)
    .map((key) => [key, usage[key]]));
}

function quoteFx(job) {
  try {
    const snapshot = typeof job.pricing_snapshot === 'string'
      ? JSON.parse(job.pricing_snapshot) : job.pricing_snapshot;
    const rate = amount(snapshot?.usdIdrRate);
    return rate > 0 ? rate : null;
  } catch { return null; }
}

function completeTokenImageUsage(job, usage) {
  let snapshot = null;
  try {
    snapshot = typeof job.pricing_snapshot === 'string'
      ? JSON.parse(job.pricing_snapshot) : job.pricing_snapshot;
  } catch { return false; }
  const tokenImage = snapshot?.costBasis?.type === 'image_tokens' ||
    (!snapshot && job.kind === 'image' && ['inputTokens', 'imageOutputTokens', 'textOutputTokens'].some((key) => Object.hasOwn(usage, key)));
  return !tokenImage || (Object.hasOwn(usage, 'inputTokens') && Object.hasOwn(usage, 'imageOutputTokens'));
}

export async function recordGenerationCostObservation(pool, {
  job, observation, priceProviderUsage = actualGenerationCostUsd,
}) {
  const usage = sanitizeProviderCostUsage(observation.usage);
  const reported = amount(usage.costUsd) ?? amount(usage.cost);
  let costUsd = null;
  // Dispatch and attempt markers describe unknown work, never a zero invoice.
  if (!['dispatch', 'attempt_started'].includes(observation.eventType)) {
    // A provider's explicit USD invoice is a cost fact even if the historical
    // quote is missing or malformed. Only calculated costs need its rate basis.
    if (reported !== null) costUsd = reported;
    else if (completeTokenImageUsage(job, usage)) {
      try { costUsd = amount(await priceProviderUsage(job, usage)); } catch {
        console.error('[cogs] provider usage could not be priced', { generationId: job.id });
      }
    }
  }
  const costSource = costUsd === null ? 'unknown' : (reported !== null ? 'reported' : 'calculated');
  const usdIdrRate = quoteFx(job);
  const costIdr = costUsd === null ? null : (costUsd === 0 ? 0 : (usdIdrRate === null ? null : costUsd * usdIdrRate));
  const providerRequestId = typeof observation.providerRequestId === 'string' && observation.providerRequestId.trim()
    ? observation.providerRequestId.trim() : null;
  const fact = {
    eventType: observation.eventType, usage, costUsd, costIdr, usdIdrRate, costSource,
  };
  const observationFingerprint = createHash('sha256').update(JSON.stringify(fact)).digest('hex');
  return appendGenerationCostEvent(pool, {
    workspaceId: job.workspace_id, generationId: job.id,
    provider: observation.provider, providerRequestId, dispatchId: observation.dispatchId,
    workerAttempt: Number(job.attempt_count || 1), observationFingerprint, ...fact,
  });
}
