import crypto from 'node:crypto';
import { getPool } from '../db/pool.js';
import { pakasirClient } from '../lib/billing/pakasirClient.js';
import * as repository from '../repositories/topupRepository.js';
import { appendCreditEntryInTransaction } from './creditService.js';
import { TOPUP_PACKAGES, findTopupPackage } from './topupPackages.js';

const PROVIDER_KEY = 'pakasir';
const MAX_LIST = 20;

function serviceError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

// Short, URL-safe and unique; Pakasir puts it in the request path.
export function newOrderId(now = new Date()) {
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  return `NXC${date}${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

export function withQuery(url, params) {
  const target = new URL(url);
  for (const [key, value] of Object.entries(params)) if (value) target.searchParams.set(key, value);
  return target.toString();
}

export function toPublicTopup(row) {
  return {
    id: row.id,
    packageCode: row.package_code,
    amountIdr: Number(row.amount_idr),
    credits: Number(row.credits),
    status: row.status,
    paymentUrl: row.status === 'pending' ? row.payment_url : null,
    isSandbox: Boolean(row.is_sandbox),
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

export function createTopupService({ pool = getPool(), gateway = pakasirClient, env = process.env } = {}) {
  const allowSandbox = () => env.PAKASIR_ALLOW_SANDBOX === '1';

  async function withTransaction(work) {
    const client = await pool.connect();
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

  // Grants credits only from Pakasir's authenticated status API, never from a
  // webhook body, so a forged or replayed notification cannot add credits.
  async function settleByTxnId(txnId) {
    if (!txnId) throw serviceError('txn_id is required', 400, 'INVALID_TOPUP');
    const remote = await gateway.getTransactionStatus(txnId);

    return withTransaction(async (client) => {
      const topup = await repository.lockTopupByTxnId(client, PROVIDER_KEY, txnId);
      if (!topup) throw serviceError('Top-up not found', 404, 'TOPUP_NOT_FOUND');
      if (topup.status !== 'pending') return topup;

      if (remote.status === 'canceled') return repository.markTopupClosed(client, topup.id, 'canceled');
      if (remote.status !== 'completed') return topup;

      if (remote.order_id !== topup.order_id || Number(remote.amount) !== Number(topup.amount_idr)) {
        throw serviceError('Payment does not match the top-up order', 409, 'TOPUP_MISMATCH');
      }
      if (remote.is_sandbox && !allowSandbox()) {
        throw serviceError('Sandbox payments are not accepted', 409, 'TOPUP_SANDBOX');
      }

      const entry = await appendCreditEntryInTransaction(client, {
        workspaceId: topup.workspace_id,
        amount: Number(topup.credits),
        reason: 'topup',
        idempotencyKey: `topup:${topup.id}`,
        metadata: { topupId: topup.id, orderId: topup.order_id, txnId, amountIdr: Number(topup.amount_idr), provider: PROVIDER_KEY, sandbox: Boolean(remote.is_sandbox) },
        creditLot: {
          sourceType: remote.is_sandbox ? 'sandbox' : 'paid',
          amountIdr: remote.is_sandbox ? 0 : topup.amount_idr,
          paymentFeeIdr: remote.is_sandbox ? 0 : null,
        },
      });
      return repository.markTopupCompleted(client, topup.id, {
        creditLedgerId: entry.id,
        isSandbox: Boolean(remote.is_sandbox),
        completedAt: remote.completed_at,
      });
    });
  }

  return {
    listPackages() {
      return TOPUP_PACKAGES.map((pkg) => ({ ...pkg }));
    },

    async createTopup({ workspaceId, userId, packageCode, returnUrl }) {
      const pkg = findTopupPackage(packageCode);
      if (!pkg) throw serviceError('Unknown top-up package', 400, 'INVALID_TOPUP');
      if (!gateway.isConfigured()) throw serviceError('Payments are not configured', 503, 'PAYMENTS_DISABLED');

      const topup = await repository.insertTopup(pool, {
        workspaceId, userId, packageCode: pkg.code, amountIdr: pkg.priceIdr, credits: pkg.credits, orderId: newOrderId(),
      });

      let transaction;
      try {
        transaction = await gateway.createTransaction({ orderId: topup.order_id, amount: pkg.priceIdr, method: 'payment_link' });
        if (!transaction.txn_id || !transaction.payment_link) throw serviceError('Payment gateway returned no payment link', 502, 'PAYMENT_GATEWAY_ERROR');
      } catch (error) {
        await repository.markTopupClosed(pool, topup.id, 'failed', error.message);
        throw error;
      }

      const paymentUrl = withQuery(transaction.payment_link, {
        redirect: returnUrl ? withQuery(returnUrl, { topup: topup.id }) : null,
      });
      const updated = await repository.attachProviderTransaction(pool, topup.id, {
        txnId: transaction.txn_id, paymentUrl, isSandbox: Boolean(transaction.is_sandbox),
      });
      return toPublicTopup(updated);
    },

    async listTopups({ workspaceId }) {
      return (await repository.listWorkspaceTopups(pool, workspaceId, MAX_LIST)).map(toPublicTopup);
    },

    // Refreshes a pending top-up from Pakasir so the buyer sees credits even
    // when the webhook is late or never arrives.
    async getTopup({ workspaceId, topupId }) {
      const topup = await repository.findWorkspaceTopup(pool, workspaceId, topupId);
      if (!topup) throw serviceError('Top-up not found', 404, 'TOPUP_NOT_FOUND');
      if (topup.status !== 'pending' || !topup.provider_txn_id) return toPublicTopup(topup);
      try {
        return toPublicTopup(await settleByTxnId(topup.provider_txn_id));
      } catch (error) {
        if (error.code === 'TOPUP_MISMATCH' || error.code === 'TOPUP_SANDBOX') throw error;
        return toPublicTopup(topup); // Gateway hiccup or rate limit: the next poll retries.
      }
    },

    settleByTxnId,
  };
}

let defaultService;
export function topupService() {
  defaultService ??= createTopupService();
  return defaultService;
}
