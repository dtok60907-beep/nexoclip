import test from 'node:test';
import assert from 'node:assert/strict';
import { createImageGenerationJobWithReservation } from '../../src/services/generationService.js';

function poolFor({ counts = { rate: 0, budget: '0', active: 0 }, limit = { rate_limit: 2, rate_window_seconds: 60, max_concurrent: 2, budget_credits: '10' } } = {}) {
  const calls = [];
  const client = {
    async query(text, values) {
      calls.push({ text, values });
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
      if (/FROM generation_jobs/.test(text) && /idempotency_key/.test(text)) return { rows: [] };
      if (/FROM pricing_rules/.test(text)) return { rows: [{ pricing_version_id: 'pv1', pricing_version: 1, operation: 'image_generation', unit: 'job', unit_price: '2.5' }] };
      if (/workspace_generation_limits/.test(text)) return { rows: [limit] };
      if (/COUNT\(\*\)/.test(text) && /created_at/.test(text)) return { rows: [{ count: String(counts.rate) }] };
      if (/COUNT\(\*\)/.test(text)) return { rows: [{ count: String(counts.active) }] };
      if (/SUM\(estimated_cost\)/.test(text)) return { rows: [{ total: counts.budget }] };
      if (/INSERT INTO credit_accounts/.test(text) || /FROM credit_accounts/.test(text)) return { rows: [{ workspace_id: 'w1', balance: '20' }] };
      if (/UPDATE credit_accounts/.test(text)) return { rows: [{ workspace_id: 'w1', balance: '17.5' }] };
      if (/INSERT INTO credit_ledger/.test(text)) return { rows: [{ id: 'ledger-1' }] };
      if (/INSERT INTO generation_jobs/.test(text)) return { rows: [{ id: 'g1', status: 'queued' }] };
      return { rows: [] };
    },
    release() {},
  };
  return { calls, async connect() { return client; } };
}

const input = { prompt: 'fox', model: 'flux-dev', idempotencyKey: 'request-1' };

test('rejects a workspace when its generation rate window is exhausted', async () => {
  await assert.rejects(
    createImageGenerationJobWithReservation(poolFor({ counts: { rate: 2, budget: '0', active: 0 } }), 'w1', input, { userId: 'u1' }),
    (error) => error.code === 'GENERATION_RATE_LIMITED' && error.status === 429 && /rate limit/i.test(error.message),
  );
});

test('rejects a workspace when its concurrency limit is exhausted', async () => {
  await assert.rejects(
    createImageGenerationJobWithReservation(poolFor({ counts: { rate: 0, budget: '0', active: 2 } }), 'w1', input, { userId: 'u1' }),
    (error) => error.code === 'GENERATION_CONCURRENCY_LIMITED' && error.status === 429,
  );
});

test('rejects a reservation when the workspace budget would be exceeded', async () => {
  await assert.rejects(
    createImageGenerationJobWithReservation(poolFor({ counts: { rate: 0, budget: '9', active: 0 } }), 'w1', input, { userId: 'u1' }),
    (error) => error.code === 'GENERATION_BUDGET_EXCEEDED' && error.status === 402 && /budget/i.test(error.message),
  );
});

test('keeps repeated idempotent requests ahead of admission limits', async () => {
  const pool = poolFor({ counts: { rate: 2, budget: '20', active: 0 } });
  const existing = { id: 'g-existing', status: 'queued' };
  pool.connect = async () => ({
    async query(text, values) {
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
      if (/FROM generation_jobs/.test(text) && /idempotency_key/.test(text)) return { rows: [existing] };
      throw new Error('limit checks must not run for an existing request');
    }, release() {},
  });
  const result = await createImageGenerationJobWithReservation(pool, 'w1', input, { userId: 'u1' });
  assert.equal(result.id, 'g-existing');
});
