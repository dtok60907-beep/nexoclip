import test from 'node:test';
import assert from 'node:assert/strict';
import { recordGenerationCostObservation, sanitizeProviderCostUsage } from '../../src/services/generationCostService.js';
import { estimateGenerationCredits } from '../../src/services/generationPricing.js';

function poolFor() {
  const calls = [];
  return { calls, async query(text, values) { calls.push({ text, values }); return { rows: [{ id: '1' }] }; } };
}

async function jobFor() {
  const quote = await estimateGenerationCredits({ kind: 'image', model: 'byteplus/seedream-4.5', parameters: {} }, {
    env: { USD_IDR_RATE: '17915', CREDIT_MARKUP_PERCENT: '60' },
  });
  return { id: 'g1', workspace_id: 'w1', attempt_count: 2, kind: 'image', model: 'byteplus/seedream-4.5', pricing_snapshot: quote.pricingSnapshot };
}

const observation = { provider: 'byteplus', providerRequestId: 'req-1', dispatchId: 'dispatch-1', eventType: 'succeeded' };
test('provider account identity comes from worker config, never provider payload, and missing identity stays unknown',async()=>{
  const pool=poolFor(),job=await jobFor();
  await recordGenerationCostObservation(pool,{job,observation:{...observation,providerAccountId:'999'},env:{BYTEPLUS_BILLING_ACCOUNT_ID:'123'}});
  assert.equal(pool.calls[0].values[13],'123');
  await recordGenerationCostObservation(pool,{job,observation,env:{}});
  assert.equal(pool.calls[1].values[13],null);
  await recordGenerationCostObservation(pool,{job,observation:{...observation,provider:'openrouter'},env:{BYTEPLUS_BILLING_ACCOUNT_ID:'123'}});
  assert.equal(pool.calls[2].values[13],null);
  await assert.rejects(recordGenerationCostObservation(pool,{job,observation,env:{BYTEPLUS_BILLING_ACCOUNT_ID:'invalid'}}),/configuration/);
});

test('records known zero USD without replacing unknown usage with a guessed zero', async () => {
  const job = await jobFor();
  const pool = poolFor();
  await recordGenerationCostObservation(pool, { job, observation: { ...observation, usage: { costUsd: 0 } } });
  await recordGenerationCostObservation(pool, { job, observation: { ...observation, usage: {} } });
  assert.deepEqual(pool.calls[0].values.slice(8, 12), [0, 0, 17915, 'reported']);
  assert.deepEqual(pool.calls[1].values.slice(8, 12), [null, null, 17915, 'unknown']);
  assert.equal(pool.calls[0].values[5], 2);
});

test('calculates image usage using the accepted quote and its frozen FX', async () => {
  const pool = poolFor();
  await recordGenerationCostObservation(pool, { job: await jobFor(), observation: { ...observation, usage: { generated_images: 1 } } });
  assert.deepEqual(pool.calls[0].values.slice(8, 12), [0.04, 716.6, 17915, 'calculated']);
  assert.match(pool.calls[0].text, /ON CONFLICT DO NOTHING/);
  assert.doesNotMatch(pool.calls[0].text, /claim_token|UPDATE|DELETE/);
});

test('legacy known USD leaves rupiah unknown when no accepted FX exists', async () => {
  const pool = poolFor();
  const job = { id: 'g1', workspace_id: 'w1', attempt_count: 1 };
  await recordGenerationCostObservation(pool, { job, observation: { ...observation, usage: { cost: 0.5 } } });
  assert.deepEqual(pool.calls[0].values.slice(8, 12), [0.5, null, null, 'reported']);
});

test('dispatch markers are unknown and numeric allowlist excludes provider secrets', async () => {
  const unsafe = { costUsd: 0.5, total_tokens: 7, authorization: 'Bearer secret-value', url: 'https://example/?key=secret', cost: null, generated_images: false, seconds: '' };
  assert.deepEqual(sanitizeProviderCostUsage(unsafe), { costUsd: 0.5, total_tokens: 7 });
  const pool = poolFor();
  await recordGenerationCostObservation(pool, { job: await jobFor(), observation: { ...observation, eventType: 'dispatch', usage: unsafe } });
  assert.equal(pool.calls[0].values[8], null);
  assert.equal(pool.calls[0].values[11], 'unknown');
  assert.equal(pool.calls[0].values[12], '{"costUsd":0.5,"total_tokens":7}');
  assert.doesNotMatch(JSON.stringify(pool.calls), /secret-value|Bearer|example/);
});

test('fingerprints deduplicate identical observations across resumed worker attempts', async () => {
  const job = await jobFor();
  const pool = poolFor();
  const event = { ...observation, usage: { costUsd: 0.5, total_tokens: 7 } };
  await recordGenerationCostObservation(pool, { job, observation: event });
  await recordGenerationCostObservation(pool, { job: { ...job, attempt_count: 3 }, observation: { ...event, dispatchId: 'new-dispatch', usage: { total_tokens: 7, costUsd: 0.5 } } });
  assert.equal(pool.calls[0].values[7], pool.calls[1].values[7]);
});

test('partial image token counts do not imply zero unreported input or image output', async () => {
  const base = await jobFor();
  const job = { ...base, model: 'google/gemini-2.5-flash-image', pricing_snapshot: {
    ...base.pricing_snapshot, model: 'google/gemini-2.5-flash-image',
    costBasis: { type: 'image_tokens', rates: { prompt: 0.000001, image_output: 0.0001 } },
  } };
  const pool = poolFor();
  for (const usage of [{ inputTokens: 2 }, { imageOutputTokens: 3 }, { inputTokens: 0, imageOutputTokens: 0 }]) {
    await recordGenerationCostObservation(pool, { job, observation: { ...observation, usage } });
  }
  assert.equal(pool.calls[0].values[8], null);
  assert.equal(pool.calls[1].values[8], null);
  assert.equal(pool.calls[2].values[8], 0);
  assert.equal(pool.calls[2].values[11], 'calculated');
});
