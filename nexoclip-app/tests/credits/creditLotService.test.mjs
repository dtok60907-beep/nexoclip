import test from 'node:test';
import assert from 'node:assert/strict';
import { grantCreditLotInTransaction } from '../../src/services/creditLotService.js';
import { appendCreditEntry } from '../../src/services/creditService.js';

function clientFor() {
  const calls = [];
  return { calls, async query(text, values) { calls.push({ text, values }); return { rows: [] }; } };
}

test('a paid grant divides verified total proceeds across all granted credits including bonuses', async () => {
  const client = clientFor();
  await grantCreditLotInTransaction(client, {
    workspaceId: 'w1', entry: { id: 'ledger1' }, credits: 2200, reason: 'topup',
    creditLot: { sourceType: 'paid', amountIdr: 399000 },
  });
  assert.deepEqual(client.calls[0].values, ['w1', 'ledger1', 2200, 'paid', 399000, null]);
  assert.match(client.calls[0].text, /amount = \$3::numeric\(20, 6\)/);
  assert.match(client.calls[1].text, /assert_credit_lot_balance/);
});

test('a generic grant cannot manufacture paid proceeds from ledger metadata', async () => {
  const client = clientFor();
  await grantCreditLotInTransaction(client, {
    workspaceId: 'w1', entry: { id: 'ledger1', metadata: { amountIdr: 50000 } },
    credits: 50, reason: 'adjustment',
  });
  assert.deepEqual(client.calls[0].values.slice(3), ['unknown', null, null]);
});

test('promotional and sandbox credits carry zero proceeds and zero payment fees', async () => {
  for (const [reason, creditLot, source] of [['grant', null, 'promo'], ['topup', { sourceType: 'sandbox', amountIdr: 50000 }, 'sandbox']]) {
    const client = clientFor();
    await grantCreditLotInTransaction(client, { workspaceId: 'w1', entry: { id: 'ledger1' }, credits: 50, reason, creditLot });
    assert.deepEqual(client.calls[0].values.slice(3), [source, 0, 0]);
  }
});

test('paid grants reject missing, zero, malformed proceeds and unverified fee values', async () => {
  for (const amountIdr of [undefined, null, 0, -1, '', ' ', false, [], Infinity, 'bad']) {
    const client = clientFor();
    await assert.rejects(grantCreditLotInTransaction(client, {
      workspaceId: 'w1', entry: { id: 'ledger1' }, credits: 10, reason: 'topup', creditLot: { sourceType: 'paid', amountIdr },
    }), /acquisition value is invalid/);
    assert.equal(client.calls.length, 0);
  }
});

test('lot drift aborts the enclosing credit ledger transaction', async () => {
  const calls = [];
  const client = {
    async query(text, values) {
      calls.push({ text, values });
      if (/assert_credit_lot_balance/.test(text)) throw new Error('Credit lot balance drift');
      if (/credit_accounts/.test(text)) return { rows: [{ workspace_id: 'w1', balance: '0' }] };
      if (/INSERT INTO credit_ledger/.test(text)) return { rows: [{ id: 'ledger1' }] };
      return { rows: [] };
    },
    release() {},
  };
  await assert.rejects(appendCreditEntry({ connect: async () => client }, {
    workspaceId: 'w1', amount: 10, reason: 'grant', idempotencyKey: 'grant1',
  }), /Credit lot balance drift/);
  assert.equal(calls.at(-1).text, 'ROLLBACK');
});
