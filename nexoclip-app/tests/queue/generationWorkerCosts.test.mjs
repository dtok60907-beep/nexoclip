import test from 'node:test';
import assert from 'node:assert/strict';
import { createGenerationProcessor } from '../../src/queue/generationWorker.js';

function poolFor({ stale = false } = {}) {
  const job = { id: 'g1', workspace_id: 'w1', status: 'queued', attempt_count: 0, max_attempts: 1, reservation_ledger_id: null };
  async function query(text) {
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(text)) return { rows: [] };
    if (/SET status = 'running'/.test(text)) { job.attempt_count += 1; return { rows: [{ ...job }] }; }
    if (stale && /claim_token/.test(text)) return { rows: [] };
    return { rows: [job] };
  }
  return { query, async connect() { return { query, release() {} }; } };
}

const message = { type: 'generation', generationId: 'g1' };
const dispatch = { provider: 'openrouter', providerRequestId: 'request-1', dispatchId: 'd1' };

test('records incurred cost before output persistence failure and independently of a stale claim fence', async () => {
  for (const stale of [false, true]) {
    const events = [];
    const process = createGenerationProcessor({
      pool: poolFor({ stale }), settleCredits: false,
      recordCost: async (_pool, { observation }) => events.push(observation),
      handler: async (_job, _message, { onProviderUsage }) => {
        await onProviderUsage({ ...dispatch, eventType: 'succeeded', usage: { costUsd: 0.5 } });
        return { provider: 'openrouter', providerRequestId: 'request-1', usage: { costUsd: 0.5 } };
      },
      persistResult: async () => { throw new Error('Storage write failed'); },
    });
    assert.equal(await process(message), false);
    assert.equal(events[0].eventType, 'attempt_started');
    assert.ok(events.some((event) => event.eventType === 'succeeded' && event.usage.costUsd === 0.5));
    assert.equal(events.at(-1).eventType, 'output_failed');
    assert.equal(events.at(-1).providerRequestId, 'request-1');
  }
});

test('late provider observations remain writable after the worker has timed out', async () => {
  const events = [];
  let lateComplete;
  const keepAlive = setTimeout(() => {}, 100);
  try {
    const process = createGenerationProcessor({
      pool: poolFor(), settleCredits: false, timeoutMs: 5,
      recordCost: async (_pool, { observation }) => events.push(observation),
      handler: async (_job, _message, { onProviderUsage }) => {
        await onProviderUsage({ ...dispatch, eventType: 'submitted', usage: {} });
        await new Promise((resolve) => { lateComplete = async () => {
          await onProviderUsage({ ...dispatch, eventType: 'succeeded', usage: { costUsd: 1 } });
          resolve();
        }; });
        return { provider: 'openrouter', providerRequestId: 'request-1', usage: { costUsd: 1 } };
      },
    });
    assert.equal(await process(message), false);
    assert.equal(events.at(-1).eventType, 'timeout');
    await lateComplete();
    assert.equal(events.at(-1).eventType, 'succeeded');
    assert.equal(events.at(-1).usage.costUsd, 1);
  } finally { clearTimeout(keepAlive); }
});

test('failure to record the attempt prevents dispatching paid provider work', async () => {
  let dispatched = false;
  const process = createGenerationProcessor({
    pool: poolFor(), settleCredits: false,
    recordCost: async () => { throw new Error('Database unavailable'); },
    handler: async () => { dispatched = true; },
  });
  assert.equal(await process(message), false);
  assert.equal(dispatched, false);
});

test('observation failure after dispatch leaves work running and the durable dispatch unknown', async () => {
  const events = [];
  const errors = [];
  const process = createGenerationProcessor({
    pool: poolFor(), settleCredits: false,
    onError: (error) => errors.push(error.code),
    recordCost: async (_pool, { observation }) => {
      if (observation.eventType === 'succeeded') throw new Error('Temporary cost write outage');
      events.push(observation);
    },
    handler: async (_job, _message, { onProviderUsage }) => {
      await onProviderUsage({ ...dispatch, eventType: 'dispatch', usage: {} });
      await onProviderUsage({ ...dispatch, eventType: 'succeeded', usage: { costUsd: 0.5 } });
      return { provider: 'openrouter', providerRequestId: 'request-1', usage: { costUsd: 0.5 } };
    },
  });
  assert.equal(await process(message), true);
  assert.ok(events.some((event) => event.eventType === 'dispatch'));
  assert.ok(errors.includes('COST_RECORDING_FAILED'));
});

test('worker failure cannot promote partial provider usage to a final billed request', async () => {
  const events = [];
  const process = createGenerationProcessor({
    pool: poolFor(), settleCredits: false,
    recordCost: async (_pool, { observation }) => events.push(observation),
    handler: async (_job, _message, { onProviderUsage }) => {
      await onProviderUsage({ ...dispatch, eventType: 'poll', usage: { costUsd: 0.2 } });
      throw Object.assign(new Error('Poll connection lost'), { code: 'PROVIDER_UNAVAILABLE' });
    },
  });
  assert.equal(await process(message), false);
  assert.deepEqual(events.map((event) => event.eventType), ['attempt_started', 'poll', 'interrupted']);
  assert.equal(events.at(-1).usage.costUsd, 0.2);
});
