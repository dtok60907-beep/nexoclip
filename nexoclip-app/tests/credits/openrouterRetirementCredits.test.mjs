// Credit-safety coverage for the credited /api/generations path that replaces the
// retired uncredited /api/openrouter/{images,videos} routes.
// Already covered elsewhere (not duplicated here):
//  - reserve + ledger debit: tests/generations/generationReservation.test.mjs
//    'reserves priced credits and creates the generation job in one transaction',
//    'reserves the per-model price instead of the flat rule when the model is priced'
//  - settle on success: tests/credits/generationSettlement.test.mjs
//    'captures actual cost once and releases the unused reservation atomically'
process.env.DATABASE_URL ||= 'postgres://test:***@localhost/test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { createGenerationsPostHandler } from '../../app/api/generations/route.js';
import { createImageGenerationJobWithReservation } from '../../src/services/generationService.js';
import { refundGenerationReservation } from '../../src/services/generationCreditSettlementService.js';

function reservationPool(balance) {
  const calls = [];
  const client = {
    async query(text, values) {
      calls.push({ text, values });
      if (/FROM generation_jobs/.test(text) && /idempotency_key/.test(text)) return { rows: [] };
      if (/FROM pricing_rules/.test(text)) return { rows: [{ pricing_version_id: 'pv1', pricing_version: 3, operation: 'image_generation', unit: 'job', unit_price: '2.500000' }] };
      if (/INSERT INTO credit_accounts|FROM credit_accounts/.test(text)) return { rows: [{ workspace_id: 'w1', balance }] };
      return { rows: [] };
    },
    release() {},
  };
  return { calls, async connect() { return client; }, async query(text, values) { calls.push({ text, values }); return { rows: [] }; } };
}

test('/api/generations with insufficient credits returns "Insufficient credits" and never publishes to a provider queue', async () => {
  const pool = reservationPool('2');
  let published = 0;
  const handler = createGenerationsPostHandler({
    resolveContext: async () => ({ user: { id: 'u1' }, workspace: { id: 'w1', role: 'member' } }),
    reserve: (db, workspaceId, input, opts) => createImageGenerationJobWithReservation(db, workspaceId, input, { ...opts, priceGeneration: async () => null }),
    publish: async () => { published += 1; },
    pool,
  });
  const req = new Request('http://app/api/generations', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-workspace-id': 'w1', 'idempotency-key': 'k1' },
    body: JSON.stringify({ kind: 'image', prompt: 'fox', model: 'flux-dev' }),
  });
  req.cookies = { get: () => ({ value: 'token' }) };
  const res = await handler(req);
  assert.ok(res.status >= 400 && res.status < 500, `status ${res.status}`);
  assert.match((await res.json()).error, /Insufficient credits/);
  assert.equal(published, 0);
  assert.equal(pool.calls.filter(({ text }) => /INSERT INTO generation_jobs|INSERT INTO credit_ledger/.test(text)).length, 0);
  assert.equal(pool.calls.at(-1).text, 'ROLLBACK');
});

test('refund after provider failure is full and idempotent: a second refund adds no ledger entry', async () => {
  const generation = { id: 'g1', workspace_id: 'w1', status: 'failed', settlement_status: 'pending', estimated_cost: '10', reservation_ledger_id: 'reserve-1' };
  const ledger = [];
  const client = {
    async query(text, values) {
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
      if (/FROM generation_jobs/.test(text) && /FOR UPDATE/.test(text)) return { rows: [{ ...generation }] };
      if (/INSERT INTO credit_accounts/.test(text)) return { rows: [{ workspace_id: 'w1', balance: '0' }] };
      if (/FROM credit_accounts/.test(text) && /FOR UPDATE/.test(text)) return { rows: [{ workspace_id: 'w1', balance: '0' }] };
      if (/FROM credit_ledger/.test(text)) return { rows: ledger.filter((entry) => entry.key === values[1]) };
      if (/UPDATE credit_accounts/.test(text)) return { rows: [{ workspace_id: 'w1', balance: '10' }] };
      if (/INSERT INTO credit_ledger/.test(text)) { ledger.push({ key: values[4], amount: values[1], reason: values[3] }); return { rows: [{ id: `l${ledger.length}` }] }; }
      if (/UPDATE generation_jobs/.test(text)) { generation.settlement_status = values[3]; return { rows: [{ ...generation }] }; }
      return { rows: [] };
    },
    release() {},
  };
  const pool = { async connect() { return client; } };
  await refundGenerationReservation(pool, { workspaceId: 'w1', generationId: 'g1' });
  await refundGenerationReservation(pool, { workspaceId: 'w1', generationId: 'g1' });
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].amount, 10);
  assert.match(ledger[0].reason, /refund/);
  assert.equal(generation.settlement_status, 'refunded');
});
