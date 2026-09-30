import test from 'node:test';
import assert from 'node:assert/strict';
import { createStoryboardWorker, createStoryboardProcessor, workerConfig } from '../../src/queue/storyboardWorker.mjs';

test('rejects missing required worker configuration without exposing values', () => {
  assert.throws(
    () => workerConfig({ REDIS_URL: 'redis://secret@redis', VIMAX_RUNTIME_URL: 'http://runtime' }),
    (error) => error.message === 'VIMAX_RUNTIME_TOKEN is required' && !error.message.includes('secret'),
  );
});

function processorPool(job) {
  const calls = [];
  return {
    calls,
    async connect() {
      return {
        async query(text, values) {
          calls.push({ text, values });
          if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
          if (/SET status = 'running'/.test(text)) {
            if (job.status !== 'queued') return { rows: [] };
            job.status = 'running';
            job.attempt_count += 1;
            // The real claim query stamps a fencing token on the job.
            job.claim_token = `claim-${job.attempt_count}`;
            return { rows: [job] };
          }
          return { rows: [] };
        },
        release() {},
      };
    },
    async query(text, values) {
      calls.push({ text, values });
      if (/SET status = 'queued'/.test(text)) job.status = 'queued';
      if (/status = 'succeeded'/.test(text)) job.status = 'succeeded';
      if (/status = 'failed'/.test(text)) job.status = 'failed';
      if (/SET status = \$4/.test(text)) job.status = values[3];
      return { rows: [job] };
    },
  };
}

test('BullMQ processor atomically claims duplicate delivery once before settling success', async () => {
  const job = { id: 'g1', workspace_id: 'w1', status: 'queued', attempt_count: 0, max_attempts: 3 };
  const pool = processorPool(job);
  const processed = [];
  const processor = createStoryboardProcessor({ pool, runtimeClient: { execute: async (claimed) => { processed.push(claimed.id); return { ok: true }; } }, onError: () => {} });

  assert.equal(await processor({ type: 'generation', generationId: 'g1', workspaceId: 'w1' }), true);
  await assert.rejects(processor({ type: 'generation', generationId: 'g1', workspaceId: 'w1' }), /requires recovery/);
  assert.deepEqual(processed, ['g1']);
  assert.equal(job.status, 'succeeded');
});

test('BullMQ processor persists retryable runtime failures for recovery', async () => {
  const job = { id: 'g1', workspace_id: 'w1', status: 'queued', attempt_count: 0, max_attempts: 3 };
  const pool = processorPool(job);
  const processor = createStoryboardProcessor({
    pool,
    runtimeClient: { execute: async () => { throw Object.assign(new Error('unavailable'), { code: 'PROVIDER_UNAVAILABLE', retryable: true }); } },
    onError: () => {},
  });

  assert.equal(await processor({ type: 'generation', generationId: 'g1', workspaceId: 'w1' }), false);
  assert.equal(job.status, 'queued');
  assert.equal(pool.calls.some(({ text }) => /SET status = 'queued'/.test(text)), true);
});

test('BullMQ redelivery refuses to acknowledge a DB-running job before lease recovery', async () => {
  const job = { id: 'g1', workspace_id: 'w1', status: 'running', attempt_count: 1, max_attempts: 3 };
  const processor = createStoryboardProcessor({
    pool: processorPool(job), runtimeClient: { execute: async () => { throw new Error('must not execute'); } }, onError: () => {},
  });
  await assert.rejects(processor({ type: 'generation', generationId: 'g1', workspaceId: 'w1' }), /requires recovery/);
});

test('BullMQ processor persists each runtime progress event and completion result', async () => {
  const job = { id: 'g1', workspace_id: 'w1', status: 'queued', attempt_count: 0, max_attempts: 3 };
  const pool = processorPool(job);
  const processor = createStoryboardProcessor({
    pool,
    runtimeClient: { execute: async (_job, {onProgress}) => {
      await onProgress({type: 'tool_progress', progress: {stage: 'rendering', message: 'frame 1'}});
      return {ok: true, result: {generated: ['workspace/clip.mp4']}};
    } },
    onError: () => {},
  });
  await processor({ type: 'generation', generationId: 'g1', workspaceId: 'w1' });
  assert.equal(pool.calls.some(({text}) => /SET progress = \$3::jsonb/.test(text)), true);
  assert.equal(pool.calls.some(({text}) => /result = \$3::jsonb/.test(text)), true);
});

test('BullMQ processor terminally fails and releases reserved credits', async () => {
  const job = { id: 'g1', workspace_id: 'w1', status: 'queued', attempt_count: 2, max_attempts: 3, reservation_ledger_id: 'r1' };
  const pool = processorPool(job);
  const processor = createStoryboardProcessor({
    pool,
    runtimeClient: { execute: async () => { throw new Error('invalid'); } },
    releaseCredits: async () => {},
    onError: () => {},
  });

  assert.equal(await processor({ type: 'generation', generationId: 'g1', workspaceId: 'w1' }), false);
  assert.equal(job.status, 'failed');
});

test('pauses BullMQ consumption before closing worker, queue, and pool', async () => {
  const calls = [];
  const worker = await createStoryboardWorker({
    env: { REDIS_URL: 'redis://redis', VIMAX_RUNTIME_URL: 'http://runtime', VIMAX_RUNTIME_TOKEN: 'token' },
    getPool: () => ({ end: async () => calls.push('pool.close') }),
    closePool: async () => calls.push('pool.closeSingleton'),
    Redis: class { async quit() { calls.push('redis.close'); } },
    createRuntimeClient: () => ({ execute: async () => ({ ok: true }) }),
    createQueue: () => ({
      createWorker: () => ({ pause: async () => calls.push('worker.pause'), close: async () => calls.push('worker.close') }),
      close: async () => calls.push('queue.close'),
    }),
    recoverQueuedGenerations: async () => calls.push('recover'),
    recoverExpired: async () => [],
    recoverUnreserved: async () => [],
    setInterval: () => ({ unref() {}, clear() {} }),
    clearInterval: () => {},
  });

  await worker.close();

  assert.deepEqual(calls, ['recover', 'worker.pause', 'worker.close', 'queue.close', 'redis.close', 'pool.closeSingleton']);
});
