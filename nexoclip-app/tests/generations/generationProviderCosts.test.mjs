import test from 'node:test';
import assert from 'node:assert/strict';
import { createSaasImageHandler } from '../../src/services/saasImageGeneration.js';
import { createSaasVideoHandler } from '../../src/services/saasVideoGeneration.js';

const job = { id: 'g1', workspace_id: 'w1', model: 'byteplus/seedance-2.5', prompt: 'fox', parameters: {} };
const pool = { async connect() { return { async query() { return { rows: [{ id: 'a1' }] }; }, release() {} }; } };

test('image provider cost is observed before output storage failure', async () => {
  const events = [];
  const handler = createSaasImageHandler({
    pool, storage: { async put() { throw new Error('Storage unavailable'); } },
    providerRouter: { async generateImage() { return { provider: 'openai', providerRequestId: 'image-request-1', usage: { costUsd: 0.2 }, outputs: ['data:image/png;base64,cG5n'] }; } },
    onProviderUsage: async (event) => events.push(event),
  });
  await assert.rejects(handler(job), /Storage unavailable/);
  assert.deepEqual(events.map((event) => event.eventType), ['succeeded', 'output_failed']);
  assert.ok(events.every((event) => event.providerRequestId === 'image-request-1' && event.usage.costUsd === 0.2));
});

test('video failure and timeout retain unknown or reported provider usage separately', async () => {
  for (const state of [{ status: 'failed', usage: { cost: 0.3 } }, { status: 'processing' }]) {
    const events = [];
    const handler = createSaasVideoHandler({
      pool, storage: {}, maxPolls: 1, sleep: async () => {},
      providerRouter: { async submitVideo() { return { id: 'video-request-1', provider: 'byteplus' }; }, async pollVideo() { return state; } },
      onProviderUsage: async (event) => events.push(event),
    });
    await assert.rejects(handler(job), { code: state.status === 'failed' ? 'PROVIDER_GENERATION_FAILED' : 'GENERATION_TIMEOUT' });
    assert.ok(events.every((event) => event.providerRequestId === 'video-request-1'));
    assert.equal(events.at(-1).eventType, state.status === 'failed' ? 'failed' : 'timeout');
    assert.deepEqual(events.at(-1).usage, state.usage || {});
  }
});

test('completed resumed video records the same request cost even if download fails', async () => {
  const events = [];
  let submitted = false;
  const handler = createSaasVideoHandler({
    pool, storage: {},
    providerRouter: {
      async submitVideo() { submitted = true; },
      async pollVideo() { return { status: 'completed', usage: { cost: 0 } }; },
      async downloadVideo() { throw new Error('Output download unavailable'); },
    },
    onProviderUsage: async (event) => events.push(event),
  });
  await assert.rejects(handler({ ...job, provider: 'byteplus', provider_request_id: 'resumed-request-1' }), /Output download unavailable/);
  assert.equal(submitted, false);
  assert.deepEqual(events.map((event) => event.eventType), ['submitted', 'succeeded', 'output_failed']);
  assert.ok(events.every((event) => event.providerRequestId === 'resumed-request-1'));
  assert.equal(events.at(-1).usage.cost, 0);
});

test('known partial video usage followed by polling interruption remains provisional', async () => {
  const events = [];
  let polls = 0;
  const handler = createSaasVideoHandler({
    pool, storage: {}, sleep: async () => {}, maxPolls: 2,
    providerRouter: {
      async submitVideo() { return { provider: 'byteplus', id: 'partial-request-1' }; },
      async pollVideo() {
        polls += 1;
        if (polls === 1) return { status: 'processing', usage: { costUsd: 0.2 } };
        throw Object.assign(new Error('Provider polling connection lost'), { code: 'PROVIDER_UNAVAILABLE' });
      },
    },
    onProviderUsage: async (event) => events.push(event),
  });
  await assert.rejects(handler(job), /polling connection lost/);
  assert.deepEqual(events.map((event) => event.eventType), ['submitted', 'poll', 'interrupted']);
  assert.equal(events.at(-1).usage.costUsd, 0.2);
});
