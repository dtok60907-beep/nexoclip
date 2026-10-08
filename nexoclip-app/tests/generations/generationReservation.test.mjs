import test from 'node:test';
import assert from 'node:assert/strict';
import { createImageGenerationJobWithReservation, createVimaxGenerationJobWithReservation } from '../../src/services/generationService.js';

// The flat pricing rule only supplies the pricing version; the amount is the model price.
const flatPrice = async () => ({ usd: 0.025, credits: 2.5 });

function poolFor({ existing = null, balance = '10', pricing = { pricingVersion: { id: 'pv1', version: 3 }, rule: { operation: 'image_generation', unit: 'job', unitPrice: '2.500000' } } } = {}) {
  const calls = [];
  const client = {
    async query(text, values) {
      calls.push({ text, values });
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
      if (/FROM generation_jobs/.test(text) && /idempotency_key/.test(text)) return { rows: existing ? [existing] : [] };
      if (/FROM pricing_rules/.test(text)) return { rows: [{ pricing_version_id: pricing.pricingVersion.id, pricing_version: pricing.pricingVersion.version, operation: pricing.rule.operation, unit: pricing.rule.unit, unit_price: pricing.rule.unitPrice }] };
      if (/INSERT INTO credit_accounts/.test(text)) return { rows: [{ workspace_id: 'w1', balance }] };
      if (/FROM credit_accounts/.test(text)) return { rows: [{ workspace_id: 'w1', balance }] };
      if (/UPDATE credit_accounts/.test(text)) return { rows: [{ workspace_id: 'w1', balance: '7.500000' }] };
      if (/INSERT INTO credit_ledger/.test(text)) return { rows: [{ id: 'ledger-1', amount: '-2.500000' }] };
      if (/INSERT INTO generation_jobs/.test(text)) return { rows: [{ id: 'g1', status: 'queued', estimated_cost: '2.500000', pricing_version_id: 'pv1' }] };
      return { rows: [] };
    },
    release() {},
  };
  return { calls, async connect() { return client; }, async query(text, values) { calls.push({ text, values }); return { rows: [] }; } };
}

test('reserves priced credits and creates the generation job in one transaction', async () => {
  const pool = poolFor();
  const job = await createImageGenerationJobWithReservation(pool, 'w1', {
    prompt: 'fox', model: 'flux-dev', idempotencyKey: 'request-1', operation: 'image_generation', createdByUserId: 'attacker',
  }, { userId: 'u1', priceGeneration: flatPrice });
  assert.equal(job.id, 'g1');
  assert.equal(pool.calls[0].text, 'BEGIN');
  assert.match(pool.calls.find((call) => /INSERT INTO credit_ledger/.test(call.text)).text, /INSERT INTO credit_ledger/);
  const generationInsert = pool.calls.find((call) => /INSERT INTO generation_jobs/.test(call.text));
  assert.match(generationInsert.text, /estimated_cost/);
  assert.equal(generationInsert.values[1], 'u1');
  assert.equal(generationInsert.values.includes('attacker'), false);
  assert.equal(pool.calls.at(-1).text, 'COMMIT');
});

test('returns an idempotent existing job without reserving credits again', async () => {
  const pool = poolFor({ existing: { id: 'g-existing', status: 'queued' } });
  const job = await createImageGenerationJobWithReservation(pool, 'w1', {
    prompt: 'fox', model: 'flux-dev', idempotencyKey: 'request-1', operation: 'image_generation',
  }, { userId: 'u1', priceGeneration: async () => null });
  assert.equal(job.id, 'g-existing');
  assert.equal(pool.calls.filter((call) => /INSERT INTO credit_ledger/.test(call.text)).length, 0);
  assert.equal(pool.calls.at(-1).text, 'COMMIT');
});

test('creates a reserved ViMax job with explicit kind and structured parameters', async () => {
  const pool = poolFor({ pricing: { pricingVersion: { id: 'pv1', version: 1 }, rule: { operation: 'vimax_render_video', unit: 'job', unitPrice: '0.000000' } } });
  const job = await createVimaxGenerationJobWithReservation(pool, 'w1', {
    kind: 'vimax_render_video', sessionId: 's1', input: {}, idempotencyKey: 'request-1',
  }, { userId: 'u1' });
  const insert = pool.calls.find((call) => /INSERT INTO generation_jobs/.test(call.text));
  assert.match(insert.text, /kind/);
  assert.equal(insert.values[1], 'u1');
  assert.equal(insert.values[3], 'vimax_render_video');
  assert.equal(pool.calls.filter((call) => /INSERT INTO credit_ledger/.test(call.text)).length, 0);
  assert.equal(insert.values[10], null);
  assert.equal(job.status, 'queued');
});

test('returns the prior ViMax job for the same workspace idempotency key without a second ledger insert', async () => {
  const pool = poolFor({ existing: { id: 'existing', status: 'queued' } });
  const job = await createVimaxGenerationJobWithReservation(pool, 'w1', {
    kind: 'vimax_render_video', sessionId: 's1', input: {}, idempotencyKey: 'request-1',
  }, { userId: 'u1' });
  assert.equal(job.id, 'existing');
  assert.equal(pool.calls.filter((call) => /INSERT INTO credit_ledger/.test(call.text)).length, 0);
});

test('re-reads a ViMax job after a concurrent idempotency unique conflict', async () => {
  const calls = [];
  let lookups = 0;
  const client = {
    async query(text, values) {
      calls.push({ text, values });
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
      if (/FROM generation_jobs/.test(text) && /idempotency_key/.test(text)) {
        lookups += 1;
        return { rows: lookups === 1 ? [] : [{ id: 'existing', status: 'queued' }] };
      }
      if (/FROM pricing_rules/.test(text)) return { rows: [{ pricing_version_id: 'pv1', pricing_version: 1, operation: 'vimax_render_video', unit: 'job', unit_price: '0.000000' }] };
      if (/INSERT INTO credit_accounts/.test(text) || /FROM credit_accounts/.test(text) || /UPDATE credit_accounts/.test(text)) return { rows: [{ workspace_id: 'w1', balance: '10' }] };
      if (/INSERT INTO credit_ledger/.test(text)) return { rows: [{ id: 'ledger-1' }] };
      if (/INSERT INTO generation_jobs/.test(text)) throw Object.assign(new Error('duplicate'), { code: '23505' });
      return { rows: [] };
    },
    release() {},
  };
  const job = await createVimaxGenerationJobWithReservation({ async connect() { return client; } }, 'w1', {
    kind: 'vimax_render_video', sessionId: 's1', input: {}, idempotencyKey: 'request-1',
  }, { userId: 'u1' });
  assert.equal(job.id, 'existing');
  assert.equal(calls.filter((call) => call.text === 'ROLLBACK').length, 1);
  assert.equal(calls.filter((call) => /FROM generation_jobs/.test(call.text)).length, 2);
});

test('rejects reservation when the workspace balance is insufficient', async () => {
  const pool = poolFor({ balance: '2' });
  await assert.rejects(
    createImageGenerationJobWithReservation(pool, 'w1', { prompt: 'fox', model: 'flux-dev', idempotencyKey: 'request-1', operation: 'image_generation' }, { userId: 'u1', priceGeneration: flatPrice }),
    /Insufficient credits/,
  );
  assert.equal(pool.calls.at(-1).text, 'ROLLBACK');
});

test('reserves the per-model price instead of the flat rule when the model is priced', async () => {
  const pool = poolFor({ balance: '1000' });
  await createImageGenerationJobWithReservation(pool, 'w1', { prompt: 'fox', model: 'byteplus/seedream-4-5-251128', idempotencyKey: 'request-9', operation: 'image_generation' }, {
    userId: 'u1', priceGeneration: async () => ({ usd: 0.04, credits: 5.2 }),
  });
  const ledger = pool.calls.find((call) => /INSERT INTO credit_ledger/.test(call.text));
  assert.ok(ledger.values.includes(-5.2), `reservation ledger values: ${JSON.stringify(ledger.values)}`);
});

test('refuses a model with no price instead of reserving the flat rule', async () => {
  const pool = poolFor({ balance: '1000' });
  await assert.rejects(
    createImageGenerationJobWithReservation(pool, 'w1', { prompt: 'fox', model: 'unknown/model', idempotencyKey: 'request-10', operation: 'image_generation' }, { userId: 'u1', priceGeneration: async () => null }),
    (error) => error.code === 'MODEL_PRICE_UNAVAILABLE' && error.status === 422,
  );
  assert.equal(pool.calls.filter((call) => /INSERT INTO credit_ledger/.test(call.text)).length, 0);
  assert.equal(pool.calls.at(-1).text, 'ROLLBACK');
});

test('stores provider USD and immutable pricing context with the reservation, ignoring client snapshot', async () => {
  const pool = poolFor({ balance: '1000' });
  const snapshot = { schemaVersion: 1, usdIdrRate: 17915, quotedCredits: 6.4, estimatedProviderCostUsd: 0.04 };
  await createImageGenerationJobWithReservation(pool, 'w1', {
    prompt: 'fox', model: 'byteplus/seedream-4-5-251128', idempotencyKey: 'snapshot-1',
    pricingSnapshot: { markupMultiplier: 0 }, estimatedProviderCostUsd: 0,
  }, { userId: 'u1', priceGeneration: async () => ({ usd: 0.04, credits: 6.4, pricingSnapshot: snapshot }) });
  const insert = pool.calls.find(({ text }) => text.includes('INSERT INTO generation_jobs'));
  assert.equal(insert.values[11], 0.04);
  assert.deepEqual(JSON.parse(insert.values[12]), { ...snapshot, pricingVersionId: 'pv1', pricingVersion: 3 });
});
