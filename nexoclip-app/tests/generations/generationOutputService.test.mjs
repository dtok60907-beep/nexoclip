import test from 'node:test';
import assert from 'node:assert/strict';
import { persistGenerationResult } from '../../src/services/generationOutputService.js';

function poolFor() {
  const calls = [];
  const client = {
    async query(text, values) {
      calls.push({ text, values });
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
      if (text.includes('generation_outputs')) return { rows: [{ id: 'o1' }] };
      return { rows: [{ id: 'u1' }] };
    },
    release() {},
  };
  return { calls, async connect() { return client; } };
}

test('persists outputs and usage in one transaction with workspace context', async () => {
  const pool = poolFor();
  const result = await persistGenerationResult(pool, {
    workspaceId: 'w1', generationId: 'g1', provider: 'muapi', providerRequestId: 'req1',
    estimatedCostUsd: 0.1, outputs: [{ assetId: 'a1' }], usage: { cost: 0.12, units: { seconds: 4 } },
  });
  assert.deepEqual(result, { outputs: [{ id: 'o1' }], usage: { id: 'u1' } });
  assert.equal(pool.calls.filter(({ text }) => text === 'BEGIN').length, 1);
  assert.equal(pool.calls.filter(({ text }) => text === 'COMMIT').length, 1);
  const insert = pool.calls.find(({ text }) => text.includes('INSERT INTO provider_usage'));
  assert.equal(insert.values[4], 0.1);
  assert.equal(insert.values[5], 0.12);
  assert.equal(insert.values[8], 'USD');
  assert.equal(insert.values[9], 'reported');
});

test('records normalized token cost and preserves normalized usage for recovery', async () => {
  const pool = poolFor();
  const usage = { imageOutputTokens: 1290, inputTokens: 20 };
  await persistGenerationResult(pool, {
    workspaceId: 'w1', generationId: 'g1', provider: 'google', providerRequestId: 'req1',
    estimatedCostUsd: 0.04, actualCostUsd: 0.032, usage,
  });
  const insert = pool.calls.find(({ text }) => text.includes('INSERT INTO provider_usage'));
  assert.equal(insert.values[5], 0.032);
  assert.equal(insert.values[9], 'calculated');
  assert.deepEqual(JSON.parse(insert.values[7]), usage);
});

test('explicit zero provider cost is recorded while absent or invalid cost remains unknown', async () => {
  for (const [usage, expected] of [[{ costUsd: 0 }, 0], [{}, null], [{ cost: null }, null], [{ cost: -1 }, null], [{ cost: Infinity }, null], [{ cost: ' ' }, null], [{ cost: [] }, null]]) {
    const pool = poolFor();
    await persistGenerationResult(pool, { workspaceId: 'w1', generationId: 'g1', provider: 'openrouter', providerRequestId: 'req1', usage });
    const insert = pool.calls.find(({ text }) => text.includes('INSERT INTO provider_usage'));
    assert.equal(insert.values[5], expected);
    assert.equal(insert.values[9], expected === null ? 'unknown' : 'reported');
  }
});

test('cost provenance follows the normalized cost rather than a conflicting raw field', async () => {
  const pool = poolFor();
  await persistGenerationResult(pool, {
    workspaceId: 'w1', generationId: 'g1', provider: 'openai', providerRequestId: 'req1',
    actualCostUsd: 0.04, usage: { costUsd: 'invalid', cost: 0.09, imageOutputTokens: 1000 },
  });
  const insert = pool.calls.find(({ text }) => text.includes('INSERT INTO provider_usage'));
  assert.equal(insert.values[5], 0.04);
  assert.equal(insert.values[9], 'calculated');
});

test('does not infer provider USD from an old estimatedCost credit argument', async () => {
  const pool = poolFor();
  await persistGenerationResult(pool, { workspaceId: 'w1', generationId: 'g1', provider: 'muapi', providerRequestId: 'req1', estimatedCost: 250 });
  const insert = pool.calls.find(({ text }) => text.includes('INSERT INTO provider_usage'));
  assert.equal(insert.values[4], null);
});

test('retains normalized counters alongside provider raw usage for promotional zero recovery', async () => {
  const pool = poolFor();
  const usage = { costUsd: 0, imageOutputTokens: 100, rawUsage: { provider_flag: 'promo' } };
  await persistGenerationResult(pool, { workspaceId: 'w1', generationId: 'g1', provider: 'openai', providerRequestId: 'req1', actualCostUsd: 0, usage });
  const insert = pool.calls.find(({ text }) => text.includes('INSERT INTO provider_usage'));
  assert.deepEqual(JSON.parse(insert.values[7]), usage);
});
