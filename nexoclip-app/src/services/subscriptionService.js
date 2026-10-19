import { getPool } from '../db/pool.js';
import { pakasirClient } from '../lib/billing/pakasirClient.js';
import { appendCreditEntryInTransaction } from './creditService.js';
import { findSubscriptionPlan, SUBSCRIPTION_PLANS, subscriptionsEnabled } from './subscriptionPlans.js';
import { newOrderId, withQuery } from './topupService.js';

const PROVIDER_KEY = 'pakasir';
const fail = (message, status, code) => Object.assign(new Error(message), { status, code });
const roundUpThousand = (idr) => Math.max(1000, Math.ceil(idr / 1000) * 1000);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

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

const isActive = (sub, at) => Boolean(sub && sub.status === 'active' && new Date(sub.current_period_end) > at);

// The month of credits running now: it ends when the next month's credits are due
// (or when the period ends).
export function currentMonth(sub) {
  const end = new Date(sub.next_credit_grant_at || sub.current_period_end);
  return { start: addMonths(end, -1), end };
}

// What buying `plan` does for this subscription now, and what it costs.
//  new       no running subscription: full price, the first month's credits now
//  renew     same plan: full price, the period extends from its end
//  upgrade   a bigger plan of the same interval: the price difference for the rest of the
//            period; the credit difference for the rest of this month arrives now; the
//            renewal date stays
//  switch    monthly to yearly: full yearly price, a new period from now; credits already
//            granted keep their expiry
//  downgrade a smaller plan, or yearly to monthly: full price, starts when the period ends
export function quotePlan(plan, sub, at = new Date()) {
  if (!isActive(sub, at)) return { kind: 'new', amountIdr: plan.priceIdr, creditsNow: plan.monthlyCredits, startsAt: at.toISOString() };
  const current = findSubscriptionPlan(sub.plan_code);
  const end = new Date(sub.current_period_end);
  if (!current || current.code === plan.code) return { kind: 'renew', amountIdr: plan.priceIdr, creditsNow: 0, startsAt: end.toISOString() };
  if (sub.pending_plan_code === plan.code) return { kind: 'scheduled', amountIdr: 0, creditsNow: 0, startsAt: end.toISOString() };
  if (plan.interval === current.interval && plan.monthlyCredits > current.monthlyCredits) {
    const start = new Date(sub.current_period_start);
    const periodLeft = clamp01((end - at) / (end - start));
    const month = currentMonth(sub);
    const monthLeft = clamp01((month.end - at) / (month.end - month.start));
    return {
      kind: 'upgrade',
      amountIdr: roundUpThousand((plan.priceIdr - current.priceIdr) * periodLeft),
      creditsNow: Math.round((plan.monthlyCredits - current.monthlyCredits) * monthLeft * 10) / 10,
      startsAt: at.toISOString(),
      creditsExpireAt: month.end.toISOString(),
    };
  }
  if (current.interval === 'monthly' && plan.interval === 'yearly' && plan.monthlyCredits >= current.monthlyCredits) {
    return { kind: 'switch', amountIdr: plan.priceIdr, creditsNow: plan.monthlyCredits, startsAt: at.toISOString() };
  }
  return { kind: 'downgrade', amountIdr: plan.priceIdr, creditsNow: 0, startsAt: end.toISOString() };
}

export function toPublicSubscription(row, at = new Date()) {
  if (!row) return null;
  const plan = findSubscriptionPlan(row.plan_code);
  const pending = row.pending_plan_code ? findSubscriptionPlan(row.pending_plan_code) : null;
  const active = isActive(row, at);
  const month = active ? currentMonth(row) : null;
  return {
    planCode: row.plan_code, name: plan?.name || row.plan_code, interval: plan?.interval || null,
    monthlyCredits: Number(row.monthly_credits), status: active ? 'active' : row.status === 'active' ? 'past_due' : row.status,
    currentPeriodStart: row.current_period_start, currentPeriodEnd: row.current_period_end,
    monthEndsAt: month?.end.toISOString() || null,
    nextCreditGrantAt: row.next_credit_grant_at,
    pendingPlan: pending ? { code: pending.code, name: pending.name, interval: pending.interval, startsAt: row.current_period_end } : null,
  };
}

const toPublicOrder = (row) => ({
  id: row.id, planCode: row.plan_code, kind: row.kind, amountIdr: Number(row.amount_idr), status: row.status,
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
    return isActive(await current(workspaceId), now());
  }

  async function overview({ workspaceId }) {
    const at = now();
    const [row, orders, lots] = await Promise.all([
      current(workspaceId),
      db().query('SELECT * FROM subscription_orders WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 10', [workspaceId]),
      db().query('SELECT COALESCE(SUM(available_credits), 0) AS credits, MIN(expires_at) AS expires_at FROM credit_lots WHERE workspace_id = $1 AND expires_at > $2 AND available_credits > 0', [workspaceId, at.toISOString()]),
    ]);
    return {
      enabled: subscriptionsEnabled(env),
      plans: SUBSCRIPTION_PLANS.map((plan) => ({ ...plan, quote: quotePlan(plan, row, at) })),
      subscription: toPublicSubscription(row, at),
      expiringCredits: { credits: Number(lots.rows[0].credits), nextExpiresAt: lots.rows[0].expires_at },
      orders: orders.rows.map(toPublicOrder),
    };
  }

  async function createOrder({ workspaceId, userId, planCode, returnUrl }) {
    if (!subscriptionsEnabled(env)) throw fail('Subscriptions are not available yet', 404, 'SUBSCRIPTIONS_DISABLED');
    const plan = findSubscriptionPlan(planCode);
    if (!plan) throw fail('Unknown plan', 400, 'INVALID_PLAN');
    if (!gateway.isConfigured()) throw fail('Payments are not configured', 503, 'PAYMENTS_DISABLED');
    const sub = await current(workspaceId);
    const quote = quotePlan(plan, sub, now());
    if (quote.kind === 'scheduled') throw fail(`${plan.name} already starts when your current plan ends`, 409, 'PLAN_ALREADY_SCHEDULED');
    const order = (await db().query(
      `INSERT INTO subscription_orders (workspace_id, user_id, plan_code, months, monthly_credits, amount_idr, order_id, kind, from_plan_code, prorated_credits)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [workspaceId, userId, plan.code, plan.months, plan.monthlyCredits, quote.amountIdr, newOrderId().replace(/^NXC/, 'NXS'),
        quote.kind, sub?.plan_code || null, quote.kind === 'upgrade' ? quote.creditsNow : 0],
    )).rows[0];
    let remote;
    try {
      remote = await gateway.createTransaction({ orderId: order.order_id, amount: quote.amountIdr, method: 'payment_link' });
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

  const lotFor = (valueIdr, expiresAt, sandbox) => (sandbox || !(Number(valueIdr) > 0)
    ? { sourceType: 'sandbox', expiresAt }
    : { sourceType: 'paid', amountIdr: Number(valueIdr), expiresAt });

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
        creditLot: lotFor(subscription.monthly_value_idr, expiresAt.toISOString(), sandbox),
      });
      granted += 1;
      next = expiresAt;
    }
    await client.query('UPDATE workspace_subscriptions SET next_credit_grant_at = $2, updated_at = now() WHERE id = $1', [subscription.id, next && next < end ? next.toISOString() : null]);
    return granted;
  }

  async function ensureBillingPlan(client, plan) {
    return (await client.query(
      `INSERT INTO billing_plans (code, name, description, monthly_credits, metadata) VALUES ($1, $2, '', $3, $4)
       ON CONFLICT (code) DO UPDATE SET monthly_credits = EXCLUDED.monthly_credits, updated_at = now() RETURNING id`,
      [plan.code, `${plan.name} (${plan.interval})`, plan.monthlyCredits, JSON.stringify({ months: plan.months, priceIdr: plan.priceIdr })],
    )).rows[0].id;
  }

  // Starts `plan` as a fresh period at `start` (a new subscription, a switch, a lapsed one).
  async function startPeriod(client, workspaceId, plan, start, valueIdr, orderId) {
    const billingPlanId = await ensureBillingPlan(client, plan);
    return (await client.query(
      `INSERT INTO workspace_subscriptions (workspace_id, billing_plan_id, status, provider_key, current_period_start, current_period_end, plan_code, monthly_credits, monthly_value_idr, next_credit_grant_at, metadata)
       VALUES ($1, $2, 'active', $3, $4, $5, $6, $7, $8, $4, $9)
       ON CONFLICT (workspace_id) DO UPDATE SET billing_plan_id = EXCLUDED.billing_plan_id, status = 'active', provider_key = EXCLUDED.provider_key,
         current_period_start = EXCLUDED.current_period_start, current_period_end = EXCLUDED.current_period_end, plan_code = EXCLUDED.plan_code,
         monthly_credits = EXCLUDED.monthly_credits, monthly_value_idr = EXCLUDED.monthly_value_idr, next_credit_grant_at = EXCLUDED.next_credit_grant_at,
         pending_plan_code = NULL, pending_months = NULL, pending_monthly_credits = NULL, pending_monthly_value_idr = NULL,
         metadata = EXCLUDED.metadata, updated_at = now()
       RETURNING *`,
      [workspaceId, billingPlanId, PROVIDER_KEY, start.toISOString(), addMonths(start, plan.months).toISOString(), plan.code, plan.monthlyCredits, valueIdr, JSON.stringify({ lastOrderId: orderId })],
    )).rows[0];
  }

  // Applies a paid order to the subscription as it stands now.
  async function applyOrder(client, order, sandbox) {
    const plan = findSubscriptionPlan(order.plan_code);
    if (!plan) throw fail('Unknown plan', 409, 'INVALID_PLAN');
    const at = now();
    const sub = (await client.query('SELECT * FROM workspace_subscriptions WHERE workspace_id = $1 FOR UPDATE', [order.workspace_id])).rows[0];
    const active = isActive(sub, at);
    const monthValue = sandbox ? 0 : plan.priceIdr / plan.months;

    if (order.kind === 'upgrade') {
      // Paid the difference for the rest of the period: credits for the rest of this
      // month now, the bigger plan's credits every month after.
      if (active) {
        const month = currentMonth(sub);
        await client.query(
          `UPDATE workspace_subscriptions SET plan_code = $2, monthly_credits = $3, monthly_value_idr = $4, billing_plan_id = $5,
             pending_plan_code = NULL, pending_months = NULL, pending_monthly_credits = NULL, pending_monthly_value_idr = NULL, updated_at = now()
           WHERE id = $1`,
          [sub.id, plan.code, plan.monthlyCredits, monthValue, await ensureBillingPlan(client, plan)],
        );
        if (Number(order.prorated_credits) > 0) {
          await appendCreditEntryInTransaction(client, {
            workspaceId: order.workspace_id, amount: Number(order.prorated_credits), reason: 'subscription_credits',
            idempotencyKey: `subscription-upgrade:${order.id}`,
            metadata: { planCode: plan.code, upgradeFrom: order.from_plan_code, orderId: order.id, expiresAt: month.end.toISOString() },
            creditLot: lotFor(sandbox ? 0 : order.amount_idr, month.end.toISOString(), sandbox),
          });
        }
        return;
      }
      // The plan lapsed before the payment cleared: keep the credits paid for, for a month.
      if (Number(order.prorated_credits) > 0) {
        const expiresAt = addMonths(at, 1).toISOString();
        await appendCreditEntryInTransaction(client, {
          workspaceId: order.workspace_id, amount: Number(order.prorated_credits), reason: 'subscription_credits',
          idempotencyKey: `subscription-upgrade:${order.id}`, metadata: { planCode: plan.code, orderId: order.id, lapsed: true, expiresAt },
          creditLot: lotFor(sandbox ? 0 : order.amount_idr, expiresAt, sandbox),
        });
      }
      return;
    }

    if (order.kind === 'downgrade' && active) {
      await client.query(
        `UPDATE workspace_subscriptions SET pending_plan_code = $2, pending_months = $3, pending_monthly_credits = $4, pending_monthly_value_idr = $5, updated_at = now()
         WHERE id = $1`,
        [sub.id, plan.code, plan.months, plan.monthlyCredits, monthValue],
      );
      return;
    }

    if (order.kind === 'renew' && active && sub.plan_code === plan.code) {
      await client.query(
        `UPDATE workspace_subscriptions SET current_period_end = $2, next_credit_grant_at = COALESCE(next_credit_grant_at, current_period_end),
           pending_plan_code = NULL, pending_months = NULL, pending_monthly_credits = NULL, pending_monthly_value_idr = NULL, updated_at = now()
         WHERE id = $1`,
        [sub.id, addMonths(new Date(sub.current_period_end), plan.months).toISOString()],
      );
      return;
    }

    // new, switch, or a renewal/downgrade of a plan that has already ended.
    const started = await startPeriod(client, order.workspace_id, plan, at, monthValue, order.id);
    await grantDueMonths(client, started, sandbox);
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
      await applyOrder(client, locked, Boolean(remote.is_sandbox));
      return toPublicOrder((await client.query(
        "UPDATE subscription_orders SET status = 'completed', completed_at = $2, is_sandbox = $3, updated_at = now() WHERE id = $1 RETURNING *",
        [locked.id, remote.completed_at || now().toISOString(), Boolean(remote.is_sandbox)],
      )).rows[0]);
    });
  }

  async function getOrder({ workspaceId, orderId }) {
    const order = (await db().query('SELECT * FROM subscription_orders WHERE workspace_id = $1 AND id = $2', [workspaceId, orderId])).rows[0];
    if (!order) throw fail('Order not found', 404, 'ORDER_NOT_FOUND');
    if (order.status !== 'pending' || !order.provider_txn_id) return toPublicOrder(order);
    try { return (await settleByTxnId(order.provider_txn_id)) || toPublicOrder(order); } catch { return toPublicOrder(order); }
  }

  // Periodic: grant the months now due, start paid downgrades when a period ends, end
  // lapsed subscriptions, expire old credits.
  async function runDue() {
    const due = (await db().query(
      `SELECT id FROM workspace_subscriptions WHERE status = 'active'
         AND ((next_credit_grant_at IS NOT NULL AND next_credit_grant_at <= $1) OR current_period_end <= $1)`,
      [now().toISOString()],
    )).rows;
    let granted = 0;
    for (const { id } of due) {
      granted += await transaction(async (client) => {
        let sub = (await client.query('SELECT * FROM workspace_subscriptions WHERE id = $1 FOR UPDATE', [id])).rows[0];
        if (!sub || sub.status !== 'active') return 0;
        let count = await grantDueMonths(client, sub);
        if (new Date(sub.current_period_end) <= now()) {
          const pending = sub.pending_plan_code && findSubscriptionPlan(sub.pending_plan_code);
          if (pending) {
            const start = new Date(sub.current_period_end);
            sub = (await client.query(
              `UPDATE workspace_subscriptions SET plan_code = $2, monthly_credits = $3, monthly_value_idr = $4, billing_plan_id = $5,
                 current_period_start = $6, current_period_end = $7, next_credit_grant_at = $6,
                 pending_plan_code = NULL, pending_months = NULL, pending_monthly_credits = NULL, pending_monthly_value_idr = NULL, updated_at = now()
               WHERE id = $1 RETURNING *`,
              [id, pending.code, sub.pending_monthly_credits, sub.pending_monthly_value_idr, await ensureBillingPlan(client, pending),
                start.toISOString(), addMonths(start, sub.pending_months).toISOString()],
            )).rows[0];
            count += await grantDueMonths(client, sub);
          } else {
            await client.query("UPDATE workspace_subscriptions SET status = 'past_due', updated_at = now() WHERE id = $1", [id]);
          }
        }
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
