import test from 'node:test';
import assert from 'node:assert/strict';

const { createVideoWorker, videoWorkerConfig } = await import('../../src/queue/videoWorker.mjs');

test('video worker defaults to three concurrent jobs', () => {
  assert.equal(videoWorkerConfig({ REDIS_URL: 'redis://localhost:6379' }).concurrency, 3);
  assert.equal(videoWorkerConfig({ REDIS_URL: 'redis://localhost:6379' }).redisUrl, 'redis://localhost:6379');
  assert.equal(videoWorkerConfig({ REDIS_URL: 'redis://localhost:6379', VIDEO_WORKER_CONCURRENCY: '3' }).concurrency, 3);
  assert.throws(() => videoWorkerConfig({ REDIS_URL: 'redis://localhost:6379', VIDEO_WORKER_CONCURRENCY: '0' }), /integer between 1 and 8/);
});

test('video worker injects trusted mapping lookup and environment into only its handler', async () => {
  let handlerDependencies;
  const env = { REDIS_URL: 'redis://test', BYTEPLUS_SEEDANCE_2_ENDPOINT: 'ep-private' };
  const findBytePlusAssetLink = async () => null;
  class Redis {
    async quit() {}
  }
  const worker = { async pause() {}, async close() {} };
  const queue = {
    createWorker() { return worker; },
    async close() {},
  };

  const service = await createVideoWorker({
    env,
    Redis,
    loadPool: () => ({ id: 'pool' }),
    closeDatabasePool: async () => {},
    createQueue: () => queue,
    createHandler(dependencies) { handlerDependencies = dependencies; return async () => ({}); },
    findBytePlusAssetLink,
    recover: async () => {},
    recoverUnreserved: async () => {},
    recoverExpired: async () => [],
    createStorage: () => ({ id: 'storage' }),
    createReferenceStorage: () => ({ id: 'references' }),
    schedule: () => ({ unref() {} }),
    clearSchedule: () => {},
  });

  assert.equal(handlerDependencies.env, env);
  assert.equal(handlerDependencies.findBytePlusAssetLink, findBytePlusAssetLink);
  await service.close();
});


test('video worker recovers expired video jobs and refunds the ones it fails', async () => {
  const calls = [];
  class Redis { async quit() {} }
  const service = await createVideoWorker({
    env: { REDIS_URL: 'redis://test' },
    Redis,
    loadPool: () => ({ id: 'pool' }),
    closeDatabasePool: async () => {},
    createQueue: () => ({ createWorker() { return { async pause() {}, async close() {} }; }, async close() {} }),
    createHandler: () => async () => ({}),
    recover: async (args) => { calls.push(['recover', args.kind]); },
    recoverUnreserved: async () => {},
    recoverExpired: async (_pool, options) => {
      calls.push(['expired', options.kind, options.graceMs > 0, options.staleAfterMs > 0]);
      return [
        { id: 'requeued', workspaceId: 'w', status: 'queued', reservationLedgerId: 'l1' },
        { id: 'reserved', workspaceId: 'w', status: 'failed', reservationLedgerId: 'l2' },
        { id: 'unreserved', workspaceId: 'w', status: 'failed', reservationLedgerId: null },
      ];
    },
    releaseCredits: async (_pool, args) => { calls.push(['release', args.generationId]); },
    settleUnreserved: async (_pool, args) => { calls.push(['settle', args.generationId, args.status]); },
    createStorage: () => ({}),
    createReferenceStorage: () => ({}),
    schedule: () => ({ unref() {} }),
    clearSchedule: () => {},
  });
  await service.close();
  assert.deepEqual(calls, [
    ['expired', 'video', true, true],
    ['release', 'reserved'],
    ['settle', 'unreserved', 'failed'],
    ['recover', 'video'],
  ]);
});

test('video jobs get a 30-minute timeout and polling budget, configurable by env', async () => {
  const { videoWorkerConfig } = await import('../../src/queue/videoWorker.mjs');
  const config = videoWorkerConfig({ REDIS_URL: 'redis://x' });
  assert.equal(config.timeoutMs, 30 * 60 * 1000);
  assert.equal(config.maxPolls * config.pollIntervalMs, 30 * 60 * 1000);
  assert.equal(videoWorkerConfig({ REDIS_URL: 'redis://x', VIDEO_GENERATION_TIMEOUT_MINUTES: '45' }).timeoutMs, 45 * 60 * 1000);
  assert.throws(() => videoWorkerConfig({ REDIS_URL: 'redis://x', VIDEO_GENERATION_TIMEOUT_MINUTES: '1' }), /between 5 and 120/);
});
