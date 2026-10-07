import test from 'node:test';
import assert from 'node:assert/strict';
import { createGenerationWorker, createGenerationProcessor } from '../../src/queue/generationWorker.js';
import { estimateGenerationCredits } from '../../src/services/generationPricing.js';

function poolFor(job) {
  async function query(text, values) {
    if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
    if (/settlement_status = 'pending'/.test(text)) return { rows: [] };
    if (/SET status = 'running'/.test(text)) { job.status = 'running'; job.attempt_count += 1; return { rows: [job] }; }
    if (text.includes('SET status = $4')) job.status = values[3];
    return { rows: [job] };
  }
  return { query, async connect() { return { query, release() {} }; } };
}

test('passes the provider persistence hook result through successful worker handling', async () => {
  const job = { id: 'g1', workspace_id: 'w1', status: 'queued', attempt_count: 0, max_attempts: 3 };
  const pool = poolFor(job);
  let persisted;
  const worker = createGenerationWorker({
    pool,
    queue: { async dequeue() { return { type: 'generation', generationId: 'g1' }; } },
    pollIntervalMs: 0,
    persistResult: async (receivedPool, result) => { assert.equal(receivedPool, pool); persisted = result; },
    handler: async () => ({ status: 'succeeded', providerRequestId: 'req1', outputs: [{ assetId: 'a1' }], usage: { cost: 0.2 } }),
  });
  await worker.run({ maxMessages: 1 });
  assert.deepEqual(persisted, { workspaceId: 'w1', generationId: 'g1', provider: 'muapi', providerRequestId: 'req1', estimatedCostUsd: null, actualCostUsd: 0.2, outputs: [{ assetId: 'a1' }], usage: { cost: 0.2 } });
});

test('worker records provider estimate independently of credit reservation', async () => {
  const job = { id: 'g1', workspace_id: 'w1', kind: 'image', model: 'byteplus/seedream-4.5', status: 'queued', attempt_count: 0, max_attempts: 3,
    estimated_cost: '6.4', estimated_provider_cost_usd: '0.04' };
  let persisted;
  await createGenerationWorker({
    pool: poolFor(job), queue: { async dequeue() { return { type: 'generation', generationId: 'g1' }; } }, pollIntervalMs: 0,
    persistResult: async (_pool, result) => { persisted = result; },
    handler: async () => ({ status: 'succeeded', provider: 'byteplus', providerRequestId: 'req1', usage: { generated_images: 1 } }),
  }).run({ maxMessages: 1 });
  assert.equal(persisted.estimatedCostUsd, '0.04');
  assert.equal(persisted.actualCostUsd, 0.04);
  assert.equal(Object.hasOwn(persisted, 'estimatedCost'), false);
});

test('snapshot worker keeps promotional zero COGS separate from the customer credit charge', async () => {
  const quote = await estimateGenerationCredits({ kind: 'image', model: 'byteplus/seedream-4.5', parameters: {} }, {
    env: { USD_IDR_RATE: '17915', CREDIT_MARKUP_PERCENT: '60' },
  });
  const job = {
    id: 'g1', workspace_id: 'w1', kind: 'image', model: 'byteplus/seedream-4.5', parameters: {}, status: 'queued',
    attempt_count: 0, max_attempts: 3, reservation_ledger_id: 'ledger-1',
    estimated_cost: quote.credits, estimated_provider_cost_usd: quote.usd, pricing_snapshot: quote.pricingSnapshot,
  };
  let persisted;
  let captured;
  const process = createGenerationProcessor({
    pool: poolFor(job),
    persistResult: async (_pool, result) => { persisted = result; },
    captureCredits: async (_pool, args) => { captured = args; },
    handler: async () => ({ status: 'succeeded', provider: 'byteplus', providerRequestId: 'req1', usage: { costUsd: 0, generated_images: 1 } }),
  });
  assert.equal(await process({ type: 'generation', generationId: 'g1' }), true);
  assert.equal(persisted.actualCostUsd, 0);
  assert.equal(persisted.estimatedCostUsd, 0.04);
  assert.equal(captured.actualCost, 6.4);
});
