import test from 'node:test';
import assert from 'node:assert/strict';
import { feeAmount, listPaymentFeeCandidates, reconcilePaymentFee } from '../../src/services/paymentFeeService.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const topupId = '33333333-3333-4333-8333-333333333333';
const input = { workspaceId, userId, topupId, feeIdr: '2500.25', reconciliationKey: 'receipt-1', evidenceReference: 'invoice-1' };
function setup({ replay = false, mismatch = false, noLot = false } = {}) {
  const calls = [];
  return {
    calls,
    pool: { async connect() { return { async query(sql) { calls.push(sql); }, release() {} }; } },
    repo: {
      async lockPaidTopupLot() { return noLot ? null : { lot_id: 'lot-1', payment_fee_idr: '3000.00000000' }; },
      async insertPaymentFeeObservation(_client, value) { return { inserted: !replay, observation: { id: '1', topup_id: topupId, lot_id: 'lot-1', fee_idr: mismatch ? '9000' : value.feeIdr, evidence_reference: 'invoice-1' } }; },
      async setLotPaymentFee(_client, _workspace, _lot, amount) { calls.push(['setFee', amount]); },
    },
  };
}

test('fee amounts preserve decimal precision and explicit zero while rejecting unknown/invalid inputs', () => {
  assert.equal(feeAmount('0'), '0.00000000');
  assert.equal(feeAmount('0001.00000001'), '1.00000001');
  for (const value of [null, undefined, '', ' ', [], true, -1, Infinity, '1e3', '0.000000001']) assert.throws(() => feeAmount(value));
});
test('verified fee is appended and projected in the same transaction', async () => {
  const { pool, repo, calls } = setup();
  const result = await reconcilePaymentFee(pool, input, repo);
  assert.equal(result.feeIdr, '2500.25000000');
  assert.deepEqual(calls, ['BEGIN', ['setFee', '2500.25000000'], 'COMMIT']);
});
test('replaying older evidence never undoes a newer fee correction', async () => {
  const { pool, repo, calls } = setup({ replay: true });
  const result = await reconcilePaymentFee(pool, input, repo);
  assert.equal(result.replayed, true);
  assert.equal(result.feeIdr, '3000.00000000');
  assert.deepEqual(calls, ['BEGIN', 'COMMIT']);
});
test('reusing evidence key for a different fee rolls back', async () => {
  const { pool, repo, calls } = setup({ replay: true, mismatch: true });
  await assert.rejects(reconcilePaymentFee(pool, input, repo), { status: 409 });
  assert.deepEqual(calls, ['BEGIN', 'ROLLBACK']);
});
test('sandbox, legacy or other-tenant payments without a paid lot cannot be reconciled', async () => {
  const { pool, repo, calls } = setup({ noLot: true });
  await assert.rejects(reconcilePaymentFee(pool, input, repo), { status: 404 });
  assert.deepEqual(calls, ['BEGIN', 'ROLLBACK']);
});

test('candidate pagination validates limits and preserves unknown fees', async () => {
  let received;
  const repo = { async listPaidTopupLots(_pool, args) { received = args; return { total: '21', items: [{ id: topupId, package_code: 'starter', amount_idr: '149000', completed_at: '2026-10-01T00:00:00Z', payment_fee_idr: null }] }; } };
  const result = await listPaymentFeeCandidates({}, { workspaceId, page: '2' }, repo);
  assert.deepEqual(received, { workspaceId, page: 2, pageSize: 20 });
  assert.equal(result.pagination.totalPages, 2);
  assert.equal(result.items[0].paymentFeeIdr, null);
  for (const args of [{ page: 0 }, { page: '1.5' }, { page: 1000001 }, { pageSize: 101 }, { workspaceId: 'invalid' }]) {
    await assert.rejects(listPaymentFeeCandidates({}, { workspaceId, ...args }, repo), { status: 400 });
  }
});
