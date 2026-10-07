import { fileURLToPath } from 'node:url';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { getPool, closePool } from '../db/pool.js';
import { createReferenceStorage, createStorage } from '../services/assetService.js';
import { createDefaultSaasVideoHandler } from '../services/saasVideoGeneration.js';
import { findBytePlusAssetLink } from '../repositories/byteplusAssetRepository.js';
import { persistGenerationResult } from '../services/generationOutputService.js';
import { createBullMqGenerationQueue } from './bullmqGenerationQueue.js';
import { recoverQueuedGenerations, generationQueueName } from './generationQueue.js';
import { createGenerationProcessor } from './generationWorker.js';
import { recoverUnreservedGenerations, releaseGenerationReservation, settleUnreservedGeneration } from '../services/generationCreditSettlementService.js';
import { recoverExpiredGenerationJobs } from '../repositories/generationStateRepository.js';
import { recordGenerationCostObservation } from '../services/generationCostService.js';

// A worker killed mid-job (deploys restart this service) leaves the job
// 'running'. Recover it once its lease has been expired for a grace period;
// the handler resumes polling the provider task if one was already created.
// Jobs whose lease expired hours ago are failed and refunded, not re-run.
const EXPIRED_GRACE_MS = 2 * 60 * 1000;
const EXPIRED_STALE_MS = 6 * 60 * 60 * 1000;

// Seedance can take 15+ minutes for a 30s 1080p video (one took 13.5 min),
// so the 10-minute job and polling limits shared with images timed long
// renders out mid-generation. The job lease follows this timeout.
const DEFAULT_VIDEO_TIMEOUT_MINUTES = 30;
const VIDEO_POLL_INTERVAL_MS = 5_000;

export function videoWorkerConfig(env = process.env) {
  if (!env.REDIS_URL) throw new Error('REDIS_URL is required');
  const concurrency = Number(env.VIDEO_WORKER_CONCURRENCY || 3);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) throw new Error('VIDEO_WORKER_CONCURRENCY must be an integer between 1 and 8');
  const timeoutMinutes = Number(env.VIDEO_GENERATION_TIMEOUT_MINUTES || DEFAULT_VIDEO_TIMEOUT_MINUTES);
  if (!Number.isFinite(timeoutMinutes) || timeoutMinutes < 5 || timeoutMinutes > 120) throw new Error('VIDEO_GENERATION_TIMEOUT_MINUTES must be between 5 and 120');
  const timeoutMs = Math.round(timeoutMinutes * 60 * 1000);
  return { redisUrl: env.REDIS_URL, concurrency, timeoutMs, maxPolls: Math.floor(timeoutMs / VIDEO_POLL_INTERVAL_MS), pollIntervalMs: VIDEO_POLL_INTERVAL_MS };
}

export async function createVideoWorker({
  env = process.env, Redis = IORedis, loadPool = getPool, closeDatabasePool = closePool,
  createQueue = createBullMqGenerationQueue, createHandler = createDefaultSaasVideoHandler,
  recover = recoverQueuedGenerations, recoverUnreserved = recoverUnreservedGenerations,
  recoverExpired = recoverExpiredGenerationJobs, releaseCredits = releaseGenerationReservation,
  settleUnreserved = settleUnreservedGeneration,
  persistResult = persistGenerationResult, createStorage: loadStorage = createStorage,
  recordCost = recordGenerationCostObservation,
  createReferenceStorage: loadReferenceStorage = createReferenceStorage,
  findBytePlusAssetLink: findAssetLink = findBytePlusAssetLink,
  schedule = globalThis.setInterval, clearSchedule = globalThis.clearInterval, onError = console.error,
} = {}) {
  const config = videoWorkerConfig(env);
  const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  const pool = loadPool();
  const queue = createQueue({ Queue, Worker, connection, queueName: generationQueueName('video') });
  const recoverNow = async () => {
    await recoverUnreserved(pool);
    const expired = await recoverExpired(pool, { kind: 'video', graceMs: EXPIRED_GRACE_MS, staleAfterMs: EXPIRED_STALE_MS });
    for (const job of expired) {
      if (job.status !== 'failed') continue;
      if (job.reservationLedgerId === null) await settleUnreserved(pool, { workspaceId: job.workspaceId, generationId: job.id, status: 'failed' });
      else await releaseCredits(pool, { workspaceId: job.workspaceId, generationId: job.id });
    }
    return recover({ pool, queue, kind: 'video' });
  };
  await recoverNow();
  const interval = schedule(() => recoverNow().catch(onError), 30_000);
  interval.unref?.();
  const storage = loadStorage(env);
  const processor = createGenerationProcessor({
    pool,
    handler: createHandler({ pool, storage, referenceStorage: loadReferenceStorage(env, storage), findBytePlusAssetLink: findAssetLink, env, maxPolls: config.maxPolls, pollIntervalMs: config.pollIntervalMs }),
    provider: 'openrouter', persistResult, onError, timeoutMs: config.timeoutMs, recordCost,
  });
  const worker = queue.createWorker(processor, { concurrency: config.concurrency });
  let closed = false;
  return { async close() {
    if (closed) return;
    closed = true;
    clearSchedule(interval);
    await worker.pause();
    await worker.close();
    await queue.close();
    await connection.quit();
    await closeDatabasePool();
  } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const service = await createVideoWorker();
  const shutdown = async () => { await service.close(); process.exit(0); };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
