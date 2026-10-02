import test from 'node:test';
import assert from 'node:assert/strict';
import { imageWorkerConfig } from '../../src/queue/imageWorker.mjs';

test('image worker defaults to three concurrent jobs', () => {
  assert.deepEqual(imageWorkerConfig({ REDIS_URL: 'redis://localhost:6379' }), {
    redisUrl: 'redis://localhost:6379', concurrency: 3,
  });
  assert.deepEqual(imageWorkerConfig({ REDIS_URL: 'redis://localhost:6379', IMAGE_WORKER_CONCURRENCY: '3' }), {
    redisUrl: 'redis://localhost:6379', concurrency: 3,
  });
  assert.throws(() => imageWorkerConfig({ REDIS_URL: 'redis://localhost:6379', IMAGE_WORKER_CONCURRENCY: '0' }), /integer between 1 and 32/);
});

test('image worker fails and refunds expired image jobs without requeueing', async () => {
  const { createImageWorker } = await import('../../src/queue/imageWorker.mjs');
  const calls = [];
  class Redis { async quit() {} }
  const service = await createImageWorker({
    env: { REDIS_URL: 'redis://test' },
    Redis,
    loadPool: () => ({ id: 'pool' }),
    closeDatabasePool: async () => {},
    createQueue: () => ({ createWorker() { return { async pause() {}, async close() {} }; }, async close() {} }),
    createHandler: () => async () => ({}),
    recover: async (args) => { calls.push(['recover', args.kind]); },
    recoverUnreserved: async () => {},
    recoverExpired: async (_pool, options) => {
      calls.push(['expired', options.kind, options.graceMs > 0, options.requeue, options.staleAfterMs]);
      return [
        { id: 'reserved', workspaceId: 'w', status: 'failed', reservationLedgerId: 'l2' },
        { id: 'unreserved', workspaceId: 'w', status: 'failed', reservationLedgerId: null },
        { id: 'skipped', workspaceId: 'w', status: 'queued', reservationLedgerId: 'l3' },
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
    ['expired', 'image', true, false, undefined],
    ['release', 'reserved'],
    ['settle', 'unreserved', 'failed'],
    ['recover', 'image'],
  ]);
});
