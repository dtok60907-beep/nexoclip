import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { getPool, closePool } from '../db/pool.js';
import { createBullMqGenerationQueue } from './bullmqGenerationQueue.js';
import { recoverQueuedGenerations, generationQueueName } from './generationQueue.js';
import { createStoryboardRuntimeClient } from './storyboardRuntimeClient.js';
import { createGenerationProcessor } from './generationWorker.js';
import { recordGenerationProgress, recordGenerationProgressById, recoverExpiredGenerationJobs } from '../repositories/generationStateRepository.js';
import { releaseGenerationReservation, recoverUnreservedGenerations, settleUnreservedGeneration } from '../services/generationCreditSettlementService.js';

const REQUIRED = ['REDIS_URL', 'VIMAX_RUNTIME_URL', 'VIMAX_RUNTIME_TOKEN'];

export function workerConfig(env = process.env) {
  for (const key of REQUIRED) if (!env[key]) throw new Error(`${key} is required`);
  const concurrency = Number(env.STORYBOARD_WORKER_CONCURRENCY || 1);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) throw new Error('STORYBOARD_WORKER_CONCURRENCY must be an integer between 1 and 32');
  return {
    redisUrl: env.REDIS_URL, runtimeUrl: env.VIMAX_RUNTIME_URL, runtimeToken: env.VIMAX_RUNTIME_TOKEN, concurrency,
    progressCallbackUrl: env.VIMAX_PROGRESS_CALLBACK_URL || '', progressToken: env.VIMAX_PROGRESS_TOKEN || env.VIMAX_RUNTIME_TOKEN,
  };
}

export function createStoryboardProcessor({ pool, runtimeClient, onError = console.error, ...options }) {
  return createGenerationProcessor({
    pool,
    handler: async (job) => {
      const response = await runtimeClient.execute(job, {
        onProgress: async (event) => recordGenerationProgress(pool, {
          workspaceId: job.workspace_id,
          generationId: job.id,
          attempt: Number(job.attempt_count),
          claimToken: job.claim_token,
          progress: event?.progress || {stage: 'running'},
        }),
      });
      if (!response?.ok) throw Object.assign(new Error('Storyboard runtime rejected generation'), { code: 'PROVIDER_UNAVAILABLE' });
      return {
        status: 'succeeded', provider: 'vimax',
        result: {...(response.result || {}), artifacts: runtimeArtifacts(job.workspace_id, response.result || {})},
      };
    },
    onError,
    ...options,
  });
}

function runtimeArtifacts(workspaceId, result) {
  const paths = [...new Set(Object.values(result).flatMap((value) => Array.isArray(value) ? value : [value]).filter((value) => typeof value === 'string'))];
  return paths.flatMap((path) => {
    const normalized = path.replaceAll('\\', '/').replace(/^\/+/, '');
    if (!normalized || normalized.includes('..') || !normalized.startsWith(`${workspaceId}/`)) return [];
    const name = normalized.split('/').at(-1);
    return [{path: normalized, name, kind: /\.(mp4|mov|webm)$/i.test(name) ? 'video' : 'file'}];
  });
}

async function createProgressServer({token, pool}) {
  if (!token) return {server: null, url: ''};
  const server = createServer(async (request, response) => {
    const jobId = request.url?.match(/^\/internal\/progress\/([A-Za-z0-9-]+)$/)?.[1];
    if (request.method !== 'POST' || !jobId || request.headers['x-nexoclip-progress-token'] !== token) {
      response.writeHead(401).end(); return;
    }
    let body = '';
    for await (const chunk of request) body += chunk;
    try {
      const event = JSON.parse(body);
      const progress = await recordGenerationProgressById(pool, {generationId: jobId, attempt: Number(event.attempt), claimToken: event.claim_token, progress: event.progress || {stage: 'running'}});
      response.writeHead(progress ? 204 : 404).end();
    } catch { response.writeHead(400).end(); }
  });
  const configured = process.env.VIMAX_PROGRESS_CALLBACK_URL;
  const port = configured ? Number(new URL(configured).port || 80) : 0;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', resolve);
  });
  return {server, url: configured || `http://127.0.0.1:${server.address().port}/internal/progress`};
}

export async function createStoryboardWorker({
  env = process.env, getPool: loadPool = getPool, closePool: closeDatabasePool = closePool,
  createQueue = createBullMqGenerationQueue, createRuntimeClient = createStoryboardRuntimeClient, Redis = IORedis,
  recoverQueuedGenerations: recover = recoverQueuedGenerations, recoverExpired = recoverExpiredGenerationJobs,
  recoverUnreserved = recoverUnreservedGenerations,
  releaseCredits = releaseGenerationReservation, settleUnreserved = settleUnreservedGeneration, setInterval: schedule = globalThis.setInterval,
  clearInterval: clearSchedule = globalThis.clearInterval, onError = console.error,
} = {}) {
  const config = workerConfig(env);
  const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  const pool = loadPool();
  const queue = createQueue({ Queue, Worker, connection, queueName: generationQueueName('vimax') });
  const progress = await createProgressServer({token: config.progressToken, pool});
  const runtimeClient = createRuntimeClient({
    baseUrl: config.runtimeUrl, token: config.runtimeToken,
    progressCallbackUrl: config.progressCallbackUrl || progress.url, progressToken: config.progressToken,
  });
  const recoverNow = async () => {
    await recoverUnreserved(pool);
    const expired = await recoverExpired(pool);
    for (const job of expired) {
      if (job.status === 'failed') {
        if (job.reservationLedgerId === null) await settleUnreserved(pool, {workspaceId: job.workspaceId, generationId: job.id, status: 'failed'});
        else await releaseCredits(pool, {workspaceId: job.workspaceId, generationId: job.id});
      }
    }
    return recover({ pool, queue, kind: 'vimax' });
  };
  await recoverNow();
  const interval = schedule(recoverNow, 30_000);
  interval.unref?.();
  const worker = queue.createWorker(createStoryboardProcessor({ pool, runtimeClient, onError }), { concurrency: config.concurrency });
  let closed = false;
  return {
    async close() {
      if (closed) return;
      closed = true;
      clearSchedule(interval);
      await worker.pause();
      await worker.close();
      await new Promise((resolve) => progress.server?.close(resolve) || resolve());
      await queue.close();
      await connection.quit();
      await closeDatabasePool();
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const service = await createStoryboardWorker();
  const shutdown = async () => { await service.close(); process.exit(0); };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
