import { fileURLToPath } from 'node:url';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { getPool, closePool } from '../db/pool.js';
import { createReferenceStorage, createStorage } from '../services/assetService.js';
import { createDefaultSaasImageHandler } from '../services/saasImageGeneration.js';
import { persistGenerationResult } from '../services/generationOutputService.js';
import { createBullMqGenerationQueue } from './bullmqGenerationQueue.js';
import { recoverQueuedGenerations, generationQueueName } from './generationQueue.js';
import { createGenerationProcessor } from './generationWorker.js';
import { recoverUnreservedGenerations } from '../services/generationCreditSettlementService.js';
import { recordGenerationCostObservation } from '../services/generationCostService.js';

export function imageWorkerConfig(env = process.env) {
  if (!env.REDIS_URL) throw new Error('REDIS_URL is required');
  const concurrency = Number(env.IMAGE_WORKER_CONCURRENCY || 3);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) throw new Error('IMAGE_WORKER_CONCURRENCY must be an integer between 1 and 32');
  return { redisUrl: env.REDIS_URL, concurrency };
}

export async function createImageWorker({
  env = process.env, Redis = IORedis, loadPool = getPool, closeDatabasePool = closePool,
  createQueue = createBullMqGenerationQueue, createHandler = createDefaultSaasImageHandler,
  recover = recoverQueuedGenerations, recoverUnreserved = recoverUnreservedGenerations,
  persistResult = persistGenerationResult, createStorage: loadStorage = createStorage,
  recordCost = recordGenerationCostObservation,
  createReferenceStorage: loadReferenceStorage = createReferenceStorage,
  schedule = globalThis.setInterval, clearSchedule = globalThis.clearInterval, onError = console.error,
} = {}) {
  const config = imageWorkerConfig(env);
  const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  const pool = loadPool();
  const queue = createQueue({ Queue, Worker, connection, queueName: generationQueueName('image') });
  const recoverNow = async () => { await recoverUnreserved(pool); return recover({ pool, queue, kind: 'image' }); };
  await recoverNow();
  const interval = schedule(() => recoverNow().catch(onError), 30_000);
  interval.unref?.();
  const storage = loadStorage(env);
  const processor = createGenerationProcessor({
    pool,
    handler: createHandler({ pool, storage, referenceStorage: loadReferenceStorage(env, storage) }),
    provider: 'openrouter', persistResult, onError, recordCost,
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
  const service = await createImageWorker();
  const shutdown = async () => { await service.close(); process.exit(0); };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
