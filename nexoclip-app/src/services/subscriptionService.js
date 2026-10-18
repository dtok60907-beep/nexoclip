import { getPool } from '../db/pool.js';
import { pakasirClient } from '../lib/billing/pakasirClient.js';
import { appendCreditEntryInTransaction } from './creditService.js';
import { findSubscriptionPlan, SUBSCRIPTION_PLANS, subscriptionsEnabled } from './subscriptionPlans.js';
import { newOrderId, withQuery } from './topupService.js';

const PROVIDER_KEY = 'pakasir';
const fail = (message, status, code) => Object.assign(new Error(message), { status, code });

// Calendar months, clamped to the month's last day (31 Jan + 1 month = 28/29 Feb).
export function addMonths(date, months) {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

export function toPublicSubscription(row) {
  if (!row) return null;
  const plan = findSubscriptionPlan(row.plan_code);
  return {
    planCode: row.plan_code, name: plan?.name || row.plan_code, interval: plan?.interval || null,
    monthlyCredits: Number(row.monthly_credits), status: row.status,
    currentPeriodStart: row.current_period_start, currentPeriodEnd: row.current_period_end,
    nextCreditGrantAt: row.next_credit_grant_at,
  };
}

const toPublicOrder = (row) => ({
  id: row.id, planCode: row.plan_code, amountIdr: Number(row.amount_idr), status: row.status,
  paymentUrl: row.status === 'pending' ? row.payment_url : null, completedAt: row.completed_at, createdAt: row.created_at,
});

export function createSubscriptionService({ pool = null, gateway = pakasirClient, env = process.env, now = () => new Date() } = {}) {
  const db = () => pool || getPool();
  const allowSandbox = () => env.PAKASIR_ALLOW_SANDBOX === '1';

  async function transaction(work) {
    const client = await db().connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function current(workspaceId, client = db()) {
    return (await client.query('SELECT * FROM workspace_subscriptions WHERE workspace_id = $1', [workspaceId])).rows[0] || null;
  }

  async function hasActiveSubscription(workspaceId) {
    const row = await current(workspaceId);
    return Boolean(row && row.status === 'active' && new Date(row.current_period_end) > now());
  }

  async function overview({ workspaceId }) {
    const [row, orders] = await Promise.all([
      current(workspaceId),
      db().query('SELECT * FROM subscription_orders WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 10', [workspaceId]),
    ]);
    return { enabled: subscriptionsEnabled(env), plans: SUBSCRIPTION_PLANS, subscription: toPublicSubscription(row), orders: orders.rows.map(toPublicOrder) };
  }

  async function createOrder({ workspaceId, userId, planCode, returnUrl }) {
    if (!subscriptionsEnabled(env)) throw fail('Subscriptions are not available yet', 404, 'SUBSCRIPTIONS_DISABLED');
    const plan = findSubscriptionPlan(planCode);
    if (!plan) throw fail('Unknown plan', 400, 'INVALID_PLAN');
    if (!gateway.isConfigured()) throw fail('Payments are not configured', 503, 'PAYMENTS_DISABLED');
    const order = (await db().query(
      `INSERT INTO subscription_orders (workspace_id, user_id, plan_code, months, monthly_credits, amount_idr, order_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [workspaceId, userId, plan.code, plan.months, plan.monthlyCredits, plan.priceIdr, newOrderId().replace(/^NXC/, 'NXS')],
    )).rows[0];
    let remote;
    try {
      remote = await gateway.createTransaction({ orderId: order.order_id, amount: plan.priceIdr, method: 'payment_link' });
      if (!remote.txn_id || !remote.payment_link) throw fail('Payment gateway returned no payment link', 502, 'PAYMENT_GATEWAY_ERROR');
    } catch (error) {
      await db().query("UPDATE subscription_orders SET status = 'failed', failure_reason = $2, updated_at = now() WHERE id = $1", [order.id, String(error.message).slice(0, 500)]);
      throw error;
    }
    const paymentUrl = withQuery(remote.payment_link, { redirect: returnUrl ? withQuery(returnUrl, { subscription: order.id }) : null });
    const updated = (await db().query(
      'UPDATE subscription_orders SET provider_txn_id = $2, payment_url = $3, is_sandbox = $4, updated_at = now() WHERE id = $1 RETURNING *',
      [order.id, remote.txn_id, paymentUrl, Boolean(remote.is_sandbox)],
    )).rows[0];
    return toPublicOrder(updated);
  }

  // Grants the credits due now: one month at a time, each expiring a month later.
  async function grantDueMonths(client, subscription, sandbox = false) {
    let next = subscription.next_credit_grant_at && new Date(subscription.next_credit_grant_at);
    const end = new Date(subscription.current_period_end);
    let granted = 0;
    while (next && next <= now() && next < end) {
      const expiresAt = addMonths(next, 1);
      await appendCreditEntryInTransaction(client, {
        workspaceId: subscription.workspace_id,
        amount: Number(subscription.monthly_credits),
        reason: 'subscription_credits',
        idempotencyKey: `subscription:${subscription.id}:${next.toISOString()}`,
        metadata: { planCode: subscription.plan_code, month: next.toISOString(), expiresAt: expiresAt.toISOString() },
        // Each month carries its share of what the period was paid.
        creditLot: sandbox || !(Number(subscription.monthly_value_idr) > 0)
          ? { sourceType: 'sandbox', expiresAt: expiresAt.toISOString() }
          : { sourceType: 'paid', amountIdr: Number(subscription.monthly_value_idr), expiresAt: expiresAt.toISOString() },
      });
      granted += 1;
      next = expiresAt;
    }
    await client.query('UPDATE workspace_subscriptions SET next_credit_grant_at = $2, updated_at = now() WHERE id = $1', [subscription.id, next < end ? next.toISOString() : null]);
    return granted;
  }

  // Only Pakasir's status API decides a payment, never the webhook body.
  async function settleByTxnId(txnId) {
    const order = (await db().query('SELECT * FROM subscription_orders WHERE provider_key = $1 AND provider_txn_id = $2', [PROVIDER_KEY, txnId])).rows[0];
    if (!order) return null;
    if (order.status !== 'pending') return toPublicOrder(order);
    const remote = await gateway.getTransactionStatus(txnId);
    return transaction(async (client) => {
      const locked = (await client.query('SELECT * FROM subscription_orders WHERE id = $1 FOR UPDATE', [order.id])).rows[0];
      if (locked.status !== 'pending') return toPublicOrder(locked);
      if (remote.status === 'canceled') return toPublicOrder((await client.query("UPDATE subscription_orders SET status = 'canceled', updated_at = now() WHERE id = $1 RETURNING *", [order.id])).rows[0]);
      if (remote.status !== 'completed') return toPublicOrder(locked);
      if (remote.order_id !== locked.order_id || Number(remote.amount) !== Number(locked.amount_idr)) throw fail('Payment does not match the subscription order', 409, 'SUBSCRIPTION_MISMATCH');
      if (remote.is_sandbox && !allowSandbox()) throw fail('Sandbox payments are not accepted', 409, 'SUBSCRIPTION_SANDBOX');

      const plan = findSubscriptionPlan(locked.plan_code);
      const billingPlan = (await client.query(
        `INSERT INTO billing_plans (code, name, description, monthly_credits, metadata) VALUES ($1, $2, '', $3, $4)
         ON CONFLICT (code) DO UPDATE SET monthly_credits = EXCLUDED.monthly_credits, updated_at = now() RETURNING id`,
        [locked.plan_code, `${plan?.name || locked.plan_code} (${plan?.interval || ''})`, locked.monthly_credits, JSON.stringify({ months: locked.months, priceIdr: Number(locked.amount_idr) })],
      )).rows[0];
      const existing = (await client.query('SELECT * FROM workspace_subscriptions WHERE workspace_id = $1 FOR UPDATE', [locked.workspace_id])).rows[0];
      const paidAt = now();
      // Renewing the same plan before it ends extends it; anything else starts now.
      const extend = existing && existing.status === 'active' && existing.plan_code === locked.plan_code && new Date(existing.current_period_end) > paidAt;
      const start = extend ? new Date(existing.current_period_start) : paidAt;
      const end = addMonths(extend ? new Date(existing.current_period_end) : paidAt, locked.months);
      const nextGrant = extend ? (existing.next_credit_grant_at ? new Date(existing.next_credit_grant_at) : new Date(existing.current_period_end)) : paidAt;
      const subscription = (await client.query(
        `INSERT INTO workspace_subscriptions (workspace_id, billing_plan_id, status, provider_key, current_period_start, current_period_end, plan_code, monthly_credits, monthly_value_idr, next_credit_grant_at, metadata)
         VALUES ($1, $2, 'active', $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (workspace_id) DO UPDATE SET billing_plan_id = EXCLUDED.billing_plan_id, status = 'active', provider_key = EXCLUDED.provider_key,
           current_period_start = EXCLUDED.current_period_start, current_period_end = EXCLUDED.current_period_end, plan_code = EXCLUDED.plan_code,
           monthly_credits = EXCLUDED.monthly_credits, monthly_value_idr = EXCLUDED.monthly_value_idr,
           next_credit_grant_at = EXCLUDED.next_credit_grant_at, metadata = EXCLUDED.metadata, updated_at = now()
         RETURNING *`,
        [locked.workspace_id, billingPlan.id, PROVIDER_KEY, start.toISOString(), end.toISOString(), locked.plan_code, locked.monthly_credits,
          remote.is_sandbox ? 0 : Number(locked.amount_idr) / locked.months, nextGrant.toISOString(), JSON.stringify({ lastOrderId: locked.id })],
      )).rows[0];
      await grantDueMonths(client, subscription, Boolean(remote.is_sandbox));
      return toPublicOrder((await client.query(
        "UPDATE subscription_orders SET status = 'completed', completed_at = $2, is_sandbox = $3, updated_at = now() WHERE id = $1 RETURNING *",
        [locked.id, remote.completed_at || paidAt.toISOString(), Boolean(remote.is_sandbox)],
      )).rows[0]);
    });
  }

  async function getOrder({ workspaceId, orderId }) {
    const order = (await db().query('SELECT * FROM subscription_orders WHERE workspace_id = $1 AND id = $2', [workspaceId, orderId])).rows[0];
    if (!order) throw fail('Order not found', 404, 'ORDER_NOT_FOUND');
    if (order.status !== 'pending' || !order.provider_txn_id) return toPublicOrder(order);
    try { return (await settleByTxnId(order.provider_txn_id)) || toPublicOrder(order); } catch { return toPublicOrder(order); }
  }

  // Periodic: grant the months now due, end lapsed subscriptions, expire old credits.
  async function runDue() {
    const due = (await db().query(
      `SELECT id FROM workspace_subscriptions WHERE status = 'active'
         AND ((next_credit_grant_at IS NOT NULL AND next_credit_grant_at <= $1) OR current_period_end <= $1)`,
      [now().toISOString()],
    )).rows;
    let granted = 0;
    for (const { id } of due) {
      granted += await transaction(async (client) => {
        const sub = (await client.query('SELECT * FROM workspace_subscriptions WHERE id = $1 FOR UPDATE', [id])).rows[0];
        if (!sub || sub.status !== 'active') return 0;
        const count = await grantDueMonths(client, sub);
        if (new Date(sub.current_period_end) <= now()) await client.query("UPDATE workspace_subscriptions SET status = 'past_due', updated_at = now() WHERE id = $1", [id]);
        return count;
      });
    }
    return { granted, expired: await expireCredits() };
  }

  // Unspent credits of expired lots leave the balance through the ledger.
  async function expireCredits() {
    const lots = (await db().query(
      'SELECT workspace_id, id, available_credits FROM credit_lots WHERE expires_at <= $1 AND available_credits > 0 ORDER BY expires_at LIMIT 200',
      [now().toISOString()],
    )).rows;
    let expired = 0;
    for (const lot of lots) {
      await transaction(async (client) => {
        const fresh = (await client.query('SELECT available_credits FROM credit_lots WHERE workspace_id = $1 AND id = $2 FOR UPDATE', [lot.workspace_id, lot.id])).rows[0];
        const amount = Number(fresh?.available_credits || 0);
        if (amount <= 0) return;
        // Debits take the soonest-expiring lot first, which is this one.
        await appendCreditEntryInTransaction(client, {
          workspaceId: lot.workspace_id, amount: -amount, reason: 'credit_expired',
          idempotencyKey: `expire:${lot.id}:${amount}`, metadata: { lotId: lot.id },
        });
        expired += amount;
      });
    }
    return expired;
  }

  return { overview, createOrder, settleByTxnId, getOrder, hasActiveSubscription, runDue, expireCredits };
}

let defaultService;
export function subscriptionService() {
  defaultService ??= createSubscriptionService();
  return defaultService;
}
