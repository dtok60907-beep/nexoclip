import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverUnreservedGenerations } from '../../src/services/generationCreditSettlementService.js';
import { actualGenerationCredits } from '../../src/services/generationPricing.js';

const snapshot = {
  schemaVersion: 1, kind: 'image', model: 'byteplus/seedream-4-5-251128',
  usdIdrRate: 17915, referenceUsdIdrRate: 17915, creditsPerUsd: 100, markupMultiplier: 1.6,
  estimatedProviderCostUsd: 0.04, quotedCredits: 6.4,
  costBasis: { type: 'images', source: 'byteplus-rate-table', usdPerImage: 0.04 },
};

function recoveryPool(overrides = {}) {
  const calls = [];
  const generation = {
    id: 'g1', workspace_id: 'w1', status: 'succeeded', settlement_status: 'pending',
    reservation_ledger_id: 'reserve1', kind: snapshot.kind, model: snapshot.model,
    parameters: {}, estimated_cost: '6.4', pricing_snapshot: snapshot,
    provider_actual_cost: '0.01', provider_cost_currency: 'USD', provider_cost_source: 'reported',
    provider_raw_usage: { costUsd: 0.01 }, ...overrides,
  };
  const ledger = [];
  let balance = 0;
  let lockTail = Promise.resolve();
  return {
    calls, generation, ledger,
    async query(text) {
      calls.push({ text });
      return { rows: generation.settlement_status === 'pending' ? [{ ...generation }] : [] };
    },
    async connect() {
      let unlock;
      return {
        async query(text, values) {
          calls.push({ text, values });
          if (text === 'BEGIN') return { rows: [] };
          if (text === 'COMMIT' || text === 'ROLLBACK') { unlock?.(); return { rows: [] }; }
          if (/FROM generation_jobs/.test(text) && /FOR UPDATE/.test(text)) {
            const previous = lockTail;
            lockTail = new Promise((resolve) => { unlock = resolve; });
            await previous;
            return { rows: [{ ...generation }] };
          }
          if (/FROM credit_ledger/.test(text)) return { rows: ledger.filter((entry) => entry.idempotency_key === values[1]) };
          if (/credit_accounts/.test(text)) {
            if (/UPDATE/.test(text)) balance = values[1];
            return { rows: [{ workspace_id: 'w1', balance }] };
          }
          if (/INSERT INTO credit_ledger/.test(text)) {
            const entry = { amount: values[1], reason: values[3], idempotency_key: values[4], metadata: JSON.parse(values[5]) };
            ledger.push(entry);
            return { rows: [entry] };
          }
          if (/UPDATE generation_jobs/.test(text)) {
            generation.settlement_status = values[3];
            return { rows: [{ ...generation }] };
          }
          if (/^SELECT finalize_generation_credit_lots\(/.test(text)) return { rows: [] };
          throw new Error(`Unexpected query: ${text}`);
        },
        release() { unlock?.(); },
      };
    },
  };
}

test('recovery refunds the frozen quote difference without fetching current pricing', async () => {
  const pool = recoveryPool();
  const originalFetch = globalThis.fetch;
  const previousMarkup = process.env.CREDIT_MARKUP_PERCENT;
  const previousRate = process.env.USD_IDR_RATE;
  globalThis.fetch = async () => { throw new Error('Recovery must use the frozen quote'); };
  process.env.CREDIT_MARKUP_PERCENT = '900';
  process.env.USD_IDR_RATE = '35000';
  try {
    const [recovered] = await recoverUnreservedGenerations(pool);
    assert.equal(recovered.settlement_status, 'captured');
    assert.equal(pool.ledger.length, 1);
    assert.ok(Math.abs(pool.ledger[0].amount - 4.8) < 1e-9);
    assert.equal(pool.ledger[0].metadata.actualCost, 1.6);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousMarkup === undefined) delete process.env.CREDIT_MARKUP_PERCENT;
    else process.env.CREDIT_MARKUP_PERCENT = previousMarkup;
    if (previousRate === undefined) delete process.env.USD_IDR_RATE;
    else process.env.USD_IDR_RATE = previousRate;
  }
});

test('recovery uses only the successful provider request within the same workspace', async () => {
  const pool = recoveryPool();
  await recoverUnreservedGenerations(pool);
  const sql = pool.calls[0].text;
  assert.match(sql, /usage\.workspace_id = generation\.workspace_id/);
  assert.match(sql, /usage\.generation_job_id = generation\.id/);
  assert.match(sql, /usage\.provider = COALESCE\(generation\.provider/);
  assert.match(sql, /usage\.provider_request_id = COALESCE\(generation\.provider_request_id/);
  assert.match(sql, /ORDER BY usage\.updated_at DESC, usage\.id DESC\s+LIMIT 1/);
  assert.doesNotMatch(sql, /SUM\(/i);
});

test('recovery caps charge at the reserved credits', async () => {
  const pool = recoveryPool({ provider_actual_cost: '1', provider_raw_usage: { costUsd: 1 } });
  const [recovered] = await recoverUnreservedGenerations(pool);
  assert.equal(recovered.settlement_status, 'captured');
  assert.equal(pool.ledger.length, 0);
});

test('recovery preserves exact raw reported USD across the stored cost rounding boundary', async () => {
  const pool = recoveryPool({ provider_actual_cost: '0.01000000', provider_raw_usage: { costUsd: 0.0100000001 } });
  const immediate = await actualGenerationCredits(pool.generation, pool.generation.provider_raw_usage);
  await recoverUnreservedGenerations(pool);
  assert.equal(immediate, 1.7);
  assert.equal(pool.ledger[0].metadata.actualCost, immediate);
});

test('recovery reconstructs calculated USD from frozen rates and original token counts', async () => {
  const pool = recoveryPool({
    pricing_snapshot: { ...snapshot, costBasis: { type: 'image_tokens', source: 'image-rate-table', rates: { image_output: 0.0100000001 } } },
    provider_actual_cost: '0.01000000', provider_cost_source: 'calculated', provider_raw_usage: { imageOutputTokens: 1 },
  });
  const immediate = await actualGenerationCredits(pool.generation, pool.generation.provider_raw_usage);
  await recoverUnreservedGenerations(pool);
  assert.equal(immediate, 1.7);
  assert.equal(pool.ledger[0].metadata.actualCost, immediate);
});

test('recovery falls back to labelled stored USD when exact usage is absent', async () => {
  const pool = recoveryPool({ provider_raw_usage: {} });
  await recoverUnreservedGenerations(pool);
  assert.equal(pool.ledger[0].metadata.actualCost, 1.6);
});

test('unlabelled, invalid and legacy usage keeps the reservation', async () => {
  for (const overrides of [
    { provider_cost_currency: null },
    { provider_cost_currency: 'IDR' },
    { provider_cost_source: 'legacy' },
    { provider_cost_source: 'unknown' },
    { provider_actual_cost: null },
    { provider_actual_cost: -1 },
    { provider_actual_cost: false },
    { provider_actual_cost: ' ' },
    { pricing_snapshot: null },
  ]) {
    const pool = recoveryPool(overrides);
    const [recovered] = await recoverUnreservedGenerations(pool);
    assert.equal(recovered.settlement_status, 'captured');
    assert.equal(pool.ledger.length, 0);
  }
});

test('zero provider COGS does not turn a recovered generation into a free sale', async () => {
  for (const rawUsage of [{ costUsd: 0 }, { costUsd: 0, generated_images: 1 }]) {
    const pool = recoveryPool({ provider_actual_cost: 0, provider_raw_usage: rawUsage });
    await recoverUnreservedGenerations(pool);
    assert.equal(pool.generation.settlement_status, 'captured');
    assert.equal(pool.ledger.length, 0);
  }
});

test('zero or malformed original counts retain the immediate sales settlement policy', async () => {
  for (const counts of [{ inputTokens: 0, imageOutputTokens: 0 }, { imageOutputTokens: 'invalid' }]) {
    const pool = recoveryPool({
      pricing_snapshot: { ...snapshot, costBasis: { type: 'image_tokens', source: 'image-rate-table', rates: { image_output: 0.01, request: 0.005 } } },
      provider_actual_cost: '0.00500000', provider_cost_source: 'calculated', provider_raw_usage: counts,
    });
    assert.equal(await actualGenerationCredits(pool.generation, counts), null);
    await recoverUnreservedGenerations(pool);
    assert.equal(pool.generation.settlement_status, 'captured');
    assert.equal(pool.ledger.length, 0);
  }
});

test('concurrent recovery captures and refunds the same reservation once', async () => {
  const pool = recoveryPool({ provider_cost_source: 'calculated' });
  await Promise.all([recoverUnreservedGenerations(pool), recoverUnreservedGenerations(pool)]);
  assert.equal(pool.generation.settlement_status, 'captured');
  assert.equal(pool.ledger.length, 1);
  assert.ok(Math.abs(pool.ledger[0].amount - 4.8) < 1e-9);
  assert.deepEqual(await recoverUnreservedGenerations(pool), []);
  assert.equal(pool.ledger.length, 1);
});
