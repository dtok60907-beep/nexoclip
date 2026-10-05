import test from 'node:test';
import assert from 'node:assert/strict';
import { createTopupService } from '../../src/services/topupService.js';

// In-memory stand-in for the credit_topups, credit_accounts and credit_ledger
// tables, matched on the SQL each repository function sends.
function fakeDatabase() {
  const state = { topups: new Map(), balance: 0, ledger: [] };
  const query = async (text, values = []) => {
    if (text.includes('INSERT INTO credit_topups')) {
      const [workspace_id, user_id, package_code, amount_idr, credits, order_id] = values;
      const row = { id: `topup-${state.topups.size + 1}`, workspace_id, user_id, package_code, amount_idr, credits: String(credits), provider_key: 'pakasir', order_id, provider_txn_id: null, payment_url: null, status: 'pending', is_sandbox: false, completed_at: null, created_at: new Date() };
      state.topups.set(row.id, row);
      return { rows: [row] };
    }
    if (text.includes('SET provider_txn_id')) {
      const row = state.topups.get(values[0]);
      Object.assign(row, { provider_txn_id: values[1], payment_url: values[2], is_sandbox: values[3] });
      return { rows: [row] };
    }
    if (text.includes('FROM credit_topups WHERE workspace_id = $1 AND id = $2')) {
      const row = state.topups.get(values[1]);
      return { rows: row && row.workspace_id === values[0] ? [row] : [] };
    }
    if (text.includes('provider_txn_id = $2 FOR UPDATE')) {
      return { rows: [...state.topups.values()].filter((row) => row.provider_txn_id === values[1]) };
    }
    if (text.includes("SET status = 'completed'")) {
      const row = state.topups.get(values[0]);
      Object.assign(row, { status: 'completed', credit_ledger_id: values[1], is_sandbox: values[2], completed_at: values[3] });
      return { rows: [row] };
    }
    if (text.includes('SET status = $2')) {
      const row = state.topups.get(values[0]);
      if (row.status !== 'pending') return { rows: [] };
      Object.assign(row, { status: values[1], failure_reason: values[2] });
      return { rows: [row] };
    }
    if (text.includes('INSERT INTO credit_accounts')) return { rows: [{ workspace_id: values[0], balance: String(state.balance) }] };
    if (text.includes('FROM credit_ledger')) return { rows: state.ledger.filter((entry) => entry.idempotency_key === values[1]) };
    if (text.includes('FROM credit_accounts')) return { rows: [{ workspace_id: values[0], balance: String(state.balance) }] };
    if (text.includes('UPDATE credit_accounts')) { state.balance = values[1]; return { rows: [{ balance: String(values[1]) }] }; }
    if (text.includes('INSERT INTO credit_ledger')) {
      const entry = { id: `ledger-${state.ledger.length + 1}`, amount: values[1], idempotency_key: values[4], metadata: JSON.parse(values[5]) };
      state.ledger.push(entry);
      return { rows: [entry] };
    }
    return { rows: [] };
  };
  const pool = { query, async connect() { return { query, release() {} }; } };
  return { state, pool };
}

function fakeGateway(remote = {}) {
  const calls = { create: [], status: [] };
  return {
    calls,
    remote,
    isConfigured: () => true,
    async createTransaction(args) {
      calls.create.push(args);
      return { txn_id: 'txn-1', payment_link: 'https://app.pakasir.com/pay-v2/txn-1' };
    },
    async getTransactionStatus(txnId) {
      calls.status.push(txnId);
      return { txn_id: txnId, ...this.remote };
    },
  };
}

async function pendingTopup({ env = {}, remote } = {}) {
  const db = fakeDatabase();
  const gateway = fakeGateway(remote);
  const service = createTopupService({ pool: db.pool, gateway, env });
  const topup = await service.createTopup({ workspaceId: 'w1', userId: 'u1', packageCode: 'topup_149k', returnUrl: 'https://app.example/studio/billing' });
  return { db, gateway, service, topup, row: db.state.topups.get(topup.id) };
}

test('creates a pending top-up with a payment link that returns to the studio', async () => {
  const { gateway, topup, row } = await pendingTopup();
  assert.equal(topup.status, 'pending');
  assert.equal(topup.amountIdr, 149000);
  assert.equal(topup.credits, 750);
  assert.deepEqual(gateway.calls.create[0], { orderId: row.order_id, amount: 149000, method: 'payment_link' });
  const url = new URL(topup.paymentUrl);
  assert.equal(url.origin + url.pathname, 'https://app.pakasir.com/pay-v2/txn-1');
  assert.equal(url.searchParams.get('redirect'), `https://app.example/studio/billing?topup=${topup.id}`);
  assert.equal(row.provider_txn_id, 'txn-1');
});

test('rejects an unknown package before contacting the gateway', async () => {
  const db = fakeDatabase();
  const gateway = fakeGateway();
  const service = createTopupService({ pool: db.pool, gateway, env: {} });
  await assert.rejects(() => service.createTopup({ workspaceId: 'w1', userId: 'u1', packageCode: 'free_money' }), (error) => error.status === 400);
  assert.equal(gateway.calls.create.length, 0);
});

test('grants credits once when Pakasir confirms the payment', async () => {
  const { db, gateway, service, row } = await pendingTopup();
  gateway.remote = { order_id: row.order_id, amount: 149000, status: 'completed', is_sandbox: false, completed_at: '2026-10-05T01:00:00Z' };
  const settled = await service.settleByTxnId('txn-1');
  assert.equal(settled.status, 'completed');
  assert.equal(db.state.balance, 750);
  assert.equal(db.state.ledger.length, 1);
  assert.equal(db.state.ledger[0].idempotency_key, `topup:${row.id}`);

  // A repeated webhook or poll does not add credits again.
  await service.settleByTxnId('txn-1');
  assert.equal(db.state.balance, 750);
  assert.equal(db.state.ledger.length, 1);
});

test('does not grant credits while the payment is still pending', async () => {
  const { db, gateway, service, row } = await pendingTopup();
  gateway.remote = { order_id: row.order_id, amount: 149000, status: 'pending', is_sandbox: false };
  const result = await service.getTopup({ workspaceId: 'w1', topupId: row.id });
  assert.equal(result.status, 'pending');
  assert.equal(db.state.balance, 0);
});

test('refuses a confirmed payment whose amount does not match the order', async () => {
  const { db, gateway, service, row } = await pendingTopup();
  gateway.remote = { order_id: row.order_id, amount: 500, status: 'completed', is_sandbox: false };
  await assert.rejects(() => service.settleByTxnId('txn-1'), (error) => error.code === 'TOPUP_MISMATCH');
  assert.equal(db.state.balance, 0);
  assert.equal(row.status, 'pending');
});

test('refuses sandbox payments unless explicitly allowed', async () => {
  const { db, gateway, service, row } = await pendingTopup();
  gateway.remote = { order_id: row.order_id, amount: 149000, status: 'completed', is_sandbox: true };
  await assert.rejects(() => service.settleByTxnId('txn-1'), (error) => error.code === 'TOPUP_SANDBOX');
  assert.equal(db.state.balance, 0);

  const allowed = createTopupService({ pool: db.pool, gateway, env: { PAKASIR_ALLOW_SANDBOX: '1' } });
  const settled = await allowed.settleByTxnId('txn-1');
  assert.equal(settled.status, 'completed');
  assert.equal(settled.is_sandbox, true);
  assert.equal(db.state.balance, 750);
});

test('marks a top-up canceled when Pakasir cancels it', async () => {
  const { db, gateway, service, row } = await pendingTopup();
  gateway.remote = { order_id: row.order_id, amount: 149000, status: 'canceled', is_sandbox: false };
  const result = await service.getTopup({ workspaceId: 'w1', topupId: row.id });
  assert.equal(result.status, 'canceled');
  assert.equal(result.paymentUrl, null);
  assert.equal(db.state.balance, 0);
});

test('hides another workspace top-up', async () => {
  const { service, row } = await pendingTopup();
  await assert.rejects(() => service.getTopup({ workspaceId: 'w2', topupId: row.id }), (error) => error.status === 404);
});

test('marks the order failed when the gateway rejects it', async () => {
  const db = fakeDatabase();
  const gateway = { ...fakeGateway(), async createTransaction() { throw Object.assign(new Error('Payment gateway request failed (500)'), { status: 502 }); } };
  const service = createTopupService({ pool: db.pool, gateway, env: {} });
  await assert.rejects(() => service.createTopup({ workspaceId: 'w1', userId: 'u1', packageCode: 'topup_399k' }), (error) => error.status === 502);
  assert.equal([...db.state.topups.values()][0].status, 'failed');
});
