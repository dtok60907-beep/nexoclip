import { transitionGeneration, isRetryableFailure, retryDelayMs } from './generationStateMachine.js';
import { captureGenerationCredits, recoverUnreservedGenerations, releaseGenerationReservation, settleUnreservedGeneration } from '../services/generationCreditSettlementService.js';
import { transitionGenerationJob, retryGenerationJob, failGenerationJob, completeGenerationJob } from '../repositories/generationStateRepository.js';
import { randomUUID } from 'node:crypto';
import { actualGenerationCredits, actualGenerationCostUsd } from '../services/generationPricing.js';

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_LEASE_MS = 10 * 60 * 1000;

async function claimGeneration(pool, generationId, leaseMs = DEFAULT_LEASE_MS) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE generation_jobs
       SET status = 'running', attempt_count = attempt_count + 1,
           timeout_at = now() + ($2::bigint * interval '1 millisecond'), claim_token = gen_random_uuid(),
           started_at = COALESCE(started_at, now()), updated_at = now()
       WHERE id = $1 AND status = 'queued'
         AND (NOT EXISTS (SELECT 1 FROM workspace_generation_limits l WHERE l.workspace_id = generation_jobs.workspace_id)
           OR (SELECT COUNT(*) FROM generation_jobs active
               WHERE active.workspace_id = generation_jobs.workspace_id
                 AND active.status IN ('running', 'processing')) <
              (SELECT max_concurrent FROM workspace_generation_limits l WHERE l.workspace_id = generation_jobs.workspace_id))
       RETURNING id, workspace_id, project_id, kind, status, prompt, model, parameters,
                 estimated_cost, estimated_provider_cost_usd, pricing_snapshot,
                 pricing_version_id, reservation_ledger_id, created_at,
                 updated_at, started_at, attempt_count, max_attempts, claim_token,
                 provider, provider_request_id`, 
      [generationId, leaseMs],
    );
    await client.query('COMMIT');
    return result.rows[0] || null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// Credits to capture: the provider's reported usage priced per model, never
// more than was reserved. usage.cost used to be passed through as credits,
// but providers report it in USD, which would have refunded almost the
// whole reservation. With no usable usage, the reservation is captured.
async function settledCredits(job, usage, priceActualUsage) {
  const reserved = Number(job.estimated_cost ?? 0);
  let actual = null;
  try {
    actual = await priceActualUsage(job, usage || {});
  } catch (error) {
    console.error('[pricing] could not price actual usage', job.id, error?.message);
  }
  if (actual === null || !Number.isFinite(actual)) return reserved;
  if (actual > reserved) {
    console.warn('[pricing] actual cost above reservation; capturing the reservation', { generationId: job.id, actual, reserved });
    return reserved;
  }
  return actual;
}

export function createGenerationProcessor({
  pool,
  handler,
  onError = () => {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
  baseDelayMs = 1000,
  maxDelayMs = 60000,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  persistResult = null,
  provider = 'muapi',
  settleCredits = true,
  captureCredits = captureGenerationCredits,
  releaseCredits = releaseGenerationReservation,
  settleUnreserved = settleUnreservedGeneration,
  priceActualUsage = actualGenerationCredits,
  priceProviderUsage = actualGenerationCostUsd,
  recordCost = null,
}) {
  if (!pool || typeof handler !== 'function') throw new TypeError('pool and handler are required');

  return async function process(message) {
    if (!message || message.type !== 'generation' || !message.generationId) return false;
    const job = await claimGeneration(pool, message.generationId, timeoutMs || DEFAULT_LEASE_MS);
    if (!job) {
      const error = new Error('Generation delivery requires recovery before acknowledgement');
      error.code = 'GENERATION_REQUIRES_RECOVERY';
      error.retryable = true;
      throw error;
    }
    const workspaceId = job.workspace_id || message.workspaceId;
    const attempt = Number(job.attempt_count || 1);
    const claimToken = job.claim_token || randomUUID();
    const limit = Number(job.max_attempts || maxAttempts);
    let terminal = false;
    let timeout;
    let latestObservation = null;
    const attemptDispatchId = randomUUID();
    const onProviderUsage = recordCost ? async (observation) => {
      latestObservation = observation;
      try {
        return await recordCost(pool, { job, observation });
      } catch (cause) {
        const error = Object.assign(new Error('Provider cost observation could not be recorded', { cause }), {
          code: 'COST_RECORDING_FAILED', retryable: false,
        });
        onError(error, job);
        // Do not send new paid requests without a durable dispatch marker.
        // Once dispatched, preserve generation progress and leave unknown COGS
        // explicit; later observations can still reconcile the same request.
        if (['dispatch', 'attempt_started'].includes(observation.eventType)) throw error;
        return null;
      }
    } : null;
    try {
      if (onProviderUsage) await onProviderUsage({ provider: 'worker', dispatchId: attemptDispatchId, eventType: 'attempt_started', usage: {} });
      const timedHandler = Promise.resolve().then(() => handler(job, message, { onProviderUsage }));
      const timedOut = new Promise((_, reject) => {
        timeout = setTimeout(() => reject(Object.assign(new Error('Generation timed out'), { code: 'GENERATION_TIMEOUT' })), timeoutMs);
        timeout.unref?.();
      });
      const result = await Promise.race([timedHandler, timedOut]);
      clearTimeout(timeout);
      const nextStatus = result?.status || 'succeeded';
      if (onProviderUsage && nextStatus === 'succeeded') {
        const observed = latestObservation?.eventType !== 'attempt_started' ? latestObservation : null;
        await onProviderUsage({
          provider: result.provider || observed?.provider || job.provider || provider,
          providerRequestId: observed ? (observed.providerRequestId || null) : (result.providerRequestId || job.provider_request_id || null),
          dispatchId: observed?.dispatchId || attemptDispatchId,
          eventType: 'succeeded', usage: result.usage || observed?.usage || {},
        });
      }
      if (nextStatus === 'succeeded') {
        const completion = {
          workspaceId, generationId: job.id, provider: result.provider || job.provider || provider,
          result: result.result || {}, attempt, claimToken,
          providerRequestId: result.providerRequestId || null,
        };
        if (persistResult) {
          // The reservation is a customer credit amount, never a provider USD
          // estimate. Unknown provider usage remains null for honest COGS.
          let actualCostUsd = null;
          try {
            actualCostUsd = await priceProviderUsage(job, result.usage || {});
          } catch (error) {
            console.error('[pricing] could not normalize provider cost', job.id, error?.message);
          }
          await persistResult(pool, {
            workspaceId, generationId: job.id, provider: completion.provider,
            providerRequestId: result.providerRequestId || `${completion.provider}:${job.id}`,
            estimatedCostUsd: job.estimated_provider_cost_usd ?? null,
            actualCostUsd, outputs: result.outputs || [], usage: result.usage || {},
          });
        }
        const completed = await completeGenerationJob(pool, completion);
        if (!completed) return false;
        const transitioned = await transitionGenerationJob(pool, {workspaceId, generationId: job.id, from: 'running', to: 'succeeded', attempt, claimToken});
        if (!transitioned) return false;
      }
      transitionGeneration('running', nextStatus);
      if (nextStatus === 'succeeded' && settleCredits && job.reservation_ledger_id) {
        await captureCredits(pool, { workspaceId, generationId: job.id, actualCost: await settledCredits(job, result.usage, priceActualUsage) });
      }
      if (nextStatus === 'processing') {
        await transitionGenerationJob(pool, { workspaceId, generationId: job.id, from: 'running', to: 'processing', attempt, claimToken });
      } else {
        terminal = true;
        if (settleCredits && job.reservation_ledger_id === null) await settleUnreserved(pool, { workspaceId, generationId: job.id, status: 'succeeded' });
      }
      return true;
    } catch (error) {
      if (onProviderUsage && latestObservation && latestObservation.eventType !== 'attempt_started') {
        const providerWasFinal = ['succeeded', 'output_failed', 'failed', 'reconciled'].includes(latestObservation.eventType);
        await onProviderUsage({
          ...latestObservation,
          eventType: error?.code === 'GENERATION_TIMEOUT' ? 'timeout'
            : (providerWasFinal ? (latestObservation.eventType === 'failed' ? 'failed' : 'output_failed') : 'interrupted'),
          usage: error?.usage || latestObservation.usage || {},
        });
      }
      if (terminal) {
        onError(error, job);
        return false;
      }
      const failure = {
        code: error.code || 'GENERATION_FAILED',
        retryable: isRetryableFailure(error),
        // The browser needs a useful terminal error, but worker errors can include
        // provider response bodies. Keep the durable job record deliberately generic.
        message: error.publicMessage || `${job.kind === 'video' ? 'Video' : 'Image'} generation failed. Please retry or select another model.`,
      };
      if (failure.retryable && attempt < limit) {
        const delay = retryDelayMs(attempt, { baseDelayMs, maxDelayMs });
        await retryGenerationJob(pool, {
          workspaceId, generationId: job.id, attempt, claimToken, nextAttemptAt: new Date(Date.now() + delay).toISOString(), error: failure,
        });
      } else {
        const failed = await failGenerationJob(pool, { workspaceId, generationId: job.id, error: failure, attempt, claimToken });
        if (!failed) return false;
        terminal = true;
        if (settleCredits && job.reservation_ledger_id) await releaseCredits(pool, { workspaceId, generationId: job.id });
        if (settleCredits && job.reservation_ledger_id === null) await settleUnreserved(pool, { workspaceId, generationId: job.id, status: 'failed' });
      }
      onError(error, job);
      return false;
    } finally {
      clearTimeout(timeout);
    }
  };
}

export function createGenerationWorker({
  pool,
  queue,
  handler,
  concurrency = DEFAULT_CONCURRENCY,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  onError = () => {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
  baseDelayMs = 1000,
  maxDelayMs = 60000,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  persistResult = null,
  provider = 'muapi',
  settleCredits = true,
  settleUnreserved = settleUnreservedGeneration,
  recoverUnreserved = recoverUnreservedGenerations,
  recordCost = null,
}) {
  if (!queue?.dequeue) throw new TypeError('queue.dequeue is required');
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new RangeError('concurrency must be positive');
  const process = createGenerationProcessor({ pool, handler, onError, timeoutMs, baseDelayMs, maxDelayMs, maxAttempts, persistResult, provider, settleCredits, settleUnreserved, recordCost });
  let stopped = false;
  let active = new Set();

  return {
    stop() { stopped = true; },

    async run({ maxMessages = Infinity } = {}) {
      if (settleCredits) await recoverUnreserved(pool);
      let received = 0;
      while (!stopped && received < maxMessages) {
        while (!stopped && active.size < concurrency && received < maxMessages) {
          const message = await queue.dequeue();
          if (!message) break;
          received += 1;
          const task = process(message).catch(onError).finally(() => active.delete(task));
          active.add(task);
        }

        if (active.size) await Promise.race(active);
        else if (!stopped && received < maxMessages) await sleep(pollIntervalMs);
      }
      await Promise.all(active);
    },
  };
}

export { claimGeneration };
