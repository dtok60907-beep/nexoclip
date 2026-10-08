import test from 'node:test';
import assert from 'node:assert/strict';
import { captureGenerationCredits, recoverUnreservedGenerations, releaseGenerationReservation, refundGenerationReservation, settleUnreservedGeneration } from '../../src/services/generationCreditSettlementService.js';

function poolFor({ generationStatus = 'succeeded', settlementStatus = 'pending', estimatedCost = '10', balance = '0', existingEntries = [], reservationLedgerId = 'reserve-1', recoveryCandidates = [] } = {}) {
  const calls = [];
  const generation = { id: 'g1', workspace_id: 'w1', status: generationStatus, settlement_status: settlementStatus, estimated_cost: estimatedCost, reservation_ledger_id: reservationLedgerId };
  const client = {
    async query(text, values) {
      calls.push({ text, values });
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
      if (/FROM generation_jobs/.test(text) && /FOR UPDATE/.test(text)) return { rows: [generation] };
      if (/FROM generation_jobs/.test(text) && /settlement_status = 'pending'/.test(text)) return { rows: recoveryCandidates };
      if (/INSERT INTO credit_accounts/.test(text)) return { rows: [{ workspace_id: 'w1', balance }] };
      if (/FROM credit_accounts/.test(text) && /FOR UPDATE/.test(text)) return { rows: [{ workspace_id: 'w1', balance }] };
      if (/FROM credit_ledger/.test(text)) return { rows: existingEntries.filter((entry) => entry.idempotency_key === values[1]) };
      if (/UPDATE credit_accounts/.test(text)) return { rows: [{ workspace_id: 'w1', balance: '7' }] };
      if (/INSERT INTO credit_ledger/.test(text)) return { rows: [{ id: 'settlement-1', amount: values[1], reason: values[3] }] };
      if (/UPDATE generation_jobs/.test(text)) { generation.settlement_status = values[3]; return { rows: [generation] }; }
      return { rows: [] };
    },
    release() {},
  };
  return { calls, query: client.query, async connect() { return client; } };
}

test('settles an unreserved generation without credit account or ledger writes', async () => {
  const pool = poolFor({ estimatedCost: '0', reservationLedgerId: null });
  const result = await settleUnreservedGeneration(pool, { workspaceId: 'w1', generationId: 'g1', status: 'succeeded' });

  assert.equal(result.settlement_status, 'captured');
  assert.equal(pool.calls.filter(({ text }) => /credit_accounts|credit_ledger/.test(text)).length, 0);
  assert.equal(pool.calls.at(-1).text, 'COMMIT');
});

test('recovers terminal unreserved generations without credit account or ledger writes', async () => {
  const pool = poolFor({
    estimatedCost: '0',
    reservationLedgerId: null,
    recoveryCandidates: [{ id: 'g1', workspace_id: 'w1', status: 'succeeded' }],
  });

  const recovered = await recoverUnreservedGenerations(pool);

  assert.deepEqual(recovered.map(({ id, settlement_status }) => ({ id, settlement_status })), [{ id: 'g1', settlement_status: 'captured' }]);
  assert.equal(pool.calls.filter(({ text }) => /credit_accounts|credit_ledger/.test(text)).length, 0);
});

test('recovers failed terminal unreserved generations without ledger writes', async () => {
  const pool = poolFor({
    generationStatus: 'failed',
    estimatedCost: '0',
    reservationLedgerId: null,
    recoveryCandidates: [{ id: 'g1', workspace_id: 'w1', status: 'failed', reservation_ledger_id: null }],
  });

  const [recovered] = await recoverUnreservedGenerations(pool);

  assert.equal(recovered.settlement_status, 'released');
  assert.equal(pool.calls.filter(({ text }) => /credit_accounts|credit_ledger/.test(text)).length, 0);
});

test('releases failed unreserved generations idempotently', async () => {
  const pool = poolFor({ generationStatus: 'failed', estimatedCost: '0', reservationLedgerId: null });
  const result = await settleUnreservedGeneration(pool, { workspaceId: 'w1', generationId: 'g1', status: 'failed' });
  const repeated = await settleUnreservedGeneration(pool, { workspaceId: 'w1', generationId: 'g1', status: 'failed' });

  assert.equal(result.settlement_status, 'released');
  assert.equal(repeated.settlement_status, 'released');
  assert.equal(pool.calls.filter(({ text }) => /UPDATE generation_jobs/.test(text)).length, 1);
  assert.equal(pool.calls.filter(({ text }) => /credit_accounts|credit_ledger/.test(text)).length, 0);
});

test('captures actual cost once and releases the unused reservation atomically', async () => {
  const pool = poolFor({ estimatedCost: '10', balance: '0' });
  const result = await captureGenerationCredits(pool, { workspaceId: 'w1', generationId: 'g1', actualCost: 7 });
  assert.equal(result.settlement_status, 'captured');
  assert.equal(pool.calls.filter(({ text }) => /INSERT INTO credit_ledger/.test(text)).length, 1);
  assert.equal(pool.calls.at(-1).text, 'COMMIT');
  assert.equal(pool.calls.find(({ text }) => /INSERT INTO credit_ledger/.test(text)).values[1], 3);
  assert.match(pool.calls.find(({ text }) => /INSERT INTO credit_ledger/.test(text)).values[3], /capture/);
});

test('repeated capture is idempotent and does not mutate the ledger again', async () => {
  const pool = poolFor({ settlementStatus: 'captured', existingEntries: [{ idempotency_key: 'generation:settlement:capture:g1' }] });
  const result = await captureGenerationCredits(pool, { workspaceId: 'w1', generationId: 'g1', actualCost: 7 });
  assert.equal(result.settlement_status, 'captured');
  assert.equal(pool.calls.filter(({ text }) => /INSERT INTO credit_ledger/.test(text)).length, 0);
});

test('invalid or unknown settlement amounts cannot silently refund a customer generation', async () => {
  for (const actualCost of [null, '', ' ', false, [], -1, Infinity, NaN]) {
    const pool = poolFor();
    await assert.rejects(captureGenerationCredits(pool, { workspaceId: 'w1', generationId: 'g1', actualCost }), /Settlement amount is invalid/);
    assert.equal(pool.calls.filter(({ text }) => /INSERT INTO credit_ledger|UPDATE credit_accounts|finalize_generation_credit_lots/.test(text)).length, 0);
    assert.equal(pool.calls.at(-1).text, 'ROLLBACK');
  }
});

test('failed generation releases the reservation and timeout refund is idempotent', async () => {
  const releasePool = poolFor({ generationStatus: 'failed', estimatedCost: '10' });
  await releaseGenerationReservation(releasePool, { workspaceId: 'w1', generationId: 'g1' });
  assert.equal(releasePool.calls.find(({ text }) => /INSERT INTO credit_ledger/.test(text)).values[1], 10);

  const refundPool = poolFor({ generationStatus: 'failed', estimatedCost: '10' });
  const result = await refundGenerationReservation(refundPool, { workspaceId: 'w1', generationId: 'g1' });
  assert.equal(result.settlement_status, 'refunded');
  assert.match(refundPool.calls.find(({ text }) => /INSERT INTO credit_ledger/.test(text)).values[3], /refund/);
});
