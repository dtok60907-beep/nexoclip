import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { appendCreditEntry } from '../../src/services/creditService.js';
import { createImageGenerationJobWithReservation } from '../../src/services/generationService.js';
import { captureGenerationCredits, releaseGenerationReservation, refundGenerationReservation } from '../../src/services/generationCreditSettlementService.js';
import { getGenerationCreditRevenue } from '../../src/repositories/creditLotRepository.js';
import { createTopupService } from '../../src/services/topupService.js';

const databaseUrl = process.env.NEXOCLIP_TEST_DATABASE_URL;
const skip = !databaseUrl && 'NEXOCLIP_TEST_DATABASE_URL is required (dedicated test database)';
const migrations = new URL('../../src/db/migrations/', import.meta.url);
const migration = (name) => readFile(new URL(name, migrations), 'utf8');

// Narrow PostgreSQL14-compatible fixture: exercise real admission, grant and
// settlement transactions without the older application's PG15+ FK syntax.
const schemaSql = `
  CREATE TABLE workspaces (id UUID PRIMARY KEY, name TEXT, slug TEXT);
  CREATE TABLE users (id UUID PRIMARY KEY);
  CREATE TABLE assets (id UUID PRIMARY KEY, workspace_id UUID NOT NULL REFERENCES workspaces(id));
  CREATE TABLE generation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL REFERENCES workspaces(id),
    created_by_user_id UUID, project_id UUID, kind TEXT DEFAULT 'image', status TEXT DEFAULT 'queued',
    prompt TEXT, model TEXT, parameters JSONB, result JSONB, error JSONB,
    estimated_cost NUMERIC(20,6), pricing_version_id UUID, reservation_ledger_id UUID,
    settlement_status TEXT DEFAULT 'pending', idempotency_key TEXT, attempt_count INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3, next_attempt_at TIMESTAMPTZ, timeout_at TIMESTAMPTZ,
    vimax_session_id TEXT, provider TEXT, provider_request_id TEXT, progress INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(),
    started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ,
    UNIQUE (workspace_id, idempotency_key)
  );
`;

async function withDatabase(run, beforeLots = async () => {}) {
  const admin = new pg.Pool({ connectionString: databaseUrl });
  const schema = `credit_lots_test_${randomUUID().replaceAll('-', '')}`;
  let pool;
  try {
    const client = await admin.connect();
    try {
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`SET search_path TO ${schema}, public`);
      await client.query(schemaSql);
      for (const filename of ['007_credits.sql', '008_pricing.sql', '013_generation_outputs_usage.sql', '016_generation_limits.sql', '027_credit_topups.sql', '029_generation_pricing_snapshot.sql']) {
        await client.query(await migration(filename));
      }
      const version = (await client.query(`INSERT INTO pricing_versions (version) VALUES (1) RETURNING id`)).rows[0];
      await client.query(`INSERT INTO pricing_rules (pricing_version_id, operation, unit, unit_price) VALUES ($1, 'image_generation', 'image', 1)`, [version.id]);
      await beforeLots(client);
      await client.query(await migration('032_credit_lots.sql'));
    } finally { client.release(); }
    pool = new pg.Pool({ connectionString: databaseUrl, options: `-c search_path=${schema},public`, max: 5 });
    await run(pool);
  } finally {
    if (pool) await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
}

async function workspace(pool) {
  const id = randomUUID();
  await pool.query(`INSERT INTO workspaces (id) VALUES ($1)`, [id]);
  return id;
}

async function grant(pool, workspaceId, credits, amountIdr, idempotencyKey = randomUUID()) {
  return appendCreditEntry(pool, {
    workspaceId, amount: credits, reason: amountIdr === null ? 'adjustment' : 'topup', idempotencyKey,
    creditLot: amountIdr === null ? null : { sourceType: 'paid', amountIdr },
  });
}

async function reserve(pool, workspaceId, credits, idempotencyKey = randomUUID()) {
  return createImageGenerationJobWithReservation(pool, workspaceId, {
    prompt: 'fox', model: 'byteplus/seedream-4-5-251128', idempotencyKey,
  }, { userId: randomUUID(), priceGeneration: async () => ({ credits, usd: credits / 160 }) });
}

async function balance(pool, workspaceId) {
  const row = (await pool.query(`SELECT account.balance, SUM(lot.available_credits) AS available
    FROM credit_accounts account LEFT JOIN credit_lots lot ON lot.workspace_id = account.workspace_id
    WHERE account.workspace_id = $1 GROUP BY account.balance`, [workspaceId])).rows[0];
  assert.equal(row.balance, row.available, 'lot availability must equal spendable account balance');
  return row.balance;
}

test('paid FIFO lots preserve bonus-adjusted revenue and return unused credits to their original lot under concurrent capture', { skip }, async () => {
  await withDatabase(async (pool) => {
    const workspaceId = await workspace(pool);
    const first = await grant(pool, workspaceId, 10, 1000, 'paid1');
    const second = await grant(pool, workspaceId, 20, 1200, 'paid2');
    await grant(pool, workspaceId, 20, 1200, 'paid2');
    assert.equal((await pool.query(`SELECT COUNT(*) FROM credit_lots WHERE workspace_id = $1`, [workspaceId])).rows[0].count, '2');
    const job = await reserve(pool, workspaceId, 15);
    assert.equal(await balance(pool, workspaceId), '15.000000');
    await Promise.all([1, 2].map(() => captureGenerationCredits(pool, { workspaceId, generationId: job.id, actualCost: 12 })));
    assert.equal(await balance(pool, workspaceId), '18.000000');
    const rows = (await pool.query(`SELECT lot.source_ledger_id, lot.available_credits, allocation.reserved_credits,
        allocation.consumed_credits, allocation.returned_credits, allocation.finalized_at
      FROM generation_credit_allocations allocation JOIN credit_lots lot ON lot.id = allocation.lot_id
      WHERE allocation.generation_job_id = $1 ORDER BY lot.created_at, lot.id`, [job.id])).rows;
    assert.deepEqual(rows.map((row) => [row.source_ledger_id, row.reserved_credits, row.consumed_credits, row.returned_credits, row.available_credits]), [
      [first.id, '10.000000', '10.000000', '0.000000', '0.000000'],
      [second.id, '5.000000', '2.000000', '3.000000', '18.000000'],
    ]);
    assert.ok(rows.every((row) => row.finalized_at));
    const revenue = await getGenerationCreditRevenue(pool, workspaceId, job.id);
    assert.equal(Number(revenue.revenue_idr), 1120);
    assert.equal(revenue.payment_fee_idr, null, 'unverified gateway fees remain unknown');
    assert.equal((await pool.query(`SELECT COUNT(*) FROM credit_ledger WHERE workspace_id = $1 AND reason = 'generation_capture'`, [workspaceId])).rows[0].count, '1');
    // Reapplying migration must not create a second unknown grant/allocation.
    await pool.query(await migration('032_credit_lots.sql'));
    assert.equal(await balance(pool, workspaceId), '18.000000');
    assert.equal((await pool.query(`SELECT COUNT(*) FROM credit_lots WHERE workspace_id = $1`, [workspaceId])).rows[0].count, '2');
  });
});

test('verified sandbox top-ups and promotional grants have zero revenue rather than paid proceeds', { skip }, async () => {
  await withDatabase(async (pool) => {
    const workspaceId = await workspace(pool);
    let order;
    const gateway = {
      isConfigured: () => true,
      async createTransaction(input) { order = input; return { txn_id: 'sandbox-txn', payment_link: 'https://example.test/pay' }; },
      async getTransactionStatus() { return { order_id: order.orderId, amount: order.amount, status: 'completed', is_sandbox: true }; },
    };
    const service = createTopupService({ pool, gateway, env: { PAKASIR_ALLOW_SANDBOX: '1' } });
    await service.createTopup({ workspaceId, userId: null, packageCode: 'topup_399k' });
    await Promise.all([service.settleByTxnId('sandbox-txn'), service.settleByTxnId('sandbox-txn')]);
    const lot = (await pool.query(`SELECT * FROM credit_lots WHERE workspace_id = $1`, [workspaceId])).rows[0];
    assert.equal(lot.source_type, 'sandbox');
    assert.equal(lot.granted_credits, '2200.000000');
    assert.equal(Number(lot.amount_idr), 0);
    assert.equal(Number(lot.payment_fee_idr), 0);
    assert.equal((await pool.query(`SELECT COUNT(*) FROM credit_lots WHERE workspace_id = $1`, [workspaceId])).rows[0].count, '1');
    const job = await reserve(pool, workspaceId, 2);
    await captureGenerationCredits(pool, { workspaceId, generationId: job.id, actualCost: 2 });
    assert.equal(Number((await getGenerationCreditRevenue(pool, workspaceId, job.id)).revenue_idr), 0);
    await appendCreditEntry(pool, { workspaceId, amount: 5, reason: 'grant', idempotencyKey: 'promo' });
    const promo = (await pool.query(`SELECT * FROM credit_lots WHERE workspace_id = $1 AND source_type = 'promo'`, [workspaceId])).rows[0];
    assert.equal(Number(promo.amount_idr), 0);
    assert.equal(await balance(pool, workspaceId), '2203.000000');
  });
});

test('release and refund restore the same FIFO sources and replay cannot grant extra credits', { skip }, async () => {
  await withDatabase(async (pool) => {
    const workspaceId = await workspace(pool);
    await grant(pool, workspaceId, 4, 400);
    await grant(pool, workspaceId, 6, 300);
    for (const settle of [releaseGenerationReservation, refundGenerationReservation]) {
      const job = await reserve(pool, workspaceId, 8);
      await pool.query(`UPDATE generation_jobs SET status = 'failed' WHERE id = $1`, [job.id]);
      await Promise.all([settle(pool, { workspaceId, generationId: job.id }), settle(pool, { workspaceId, generationId: job.id })]);
      assert.equal(await balance(pool, workspaceId), '10.000000');
      const allocation = (await pool.query(`SELECT SUM(consumed_credits) AS consumed, SUM(returned_credits) AS returned FROM generation_credit_allocations WHERE generation_job_id = $1`, [job.id])).rows[0];
      assert.equal(allocation.consumed, '0.000000');
      assert.equal(allocation.returned, '8.000000');
      assert.equal(Number((await getGenerationCreditRevenue(pool, workspaceId, job.id)).revenue_idr), 0);
    }
    const amounts = (await pool.query(`SELECT available_credits FROM credit_lots WHERE workspace_id = $1 ORDER BY created_at, id`, [workspaceId])).rows;
    assert.deepEqual(amounts.map((row) => row.available_credits), ['4.000000', '6.000000']);
  });
});

test('migration backfills pending legacy reservations with unknown provenance without inventing historical revenue', { skip }, async () => {
  const workspaceId = randomUUID();
  const pendingId = randomUUID();
  const historicalId = randomUUID();
  await withDatabase(async (pool) => {
    const lot = (await pool.query(`SELECT * FROM credit_lots WHERE workspace_id = $1`, [workspaceId])).rows[0];
    assert.equal(lot.source_type, 'legacy');
    assert.equal(lot.source_ledger_id, null);
    assert.equal(lot.granted_credits, '10.000000');
    assert.equal(lot.available_credits, '4.000000');
    await captureGenerationCredits(pool, { workspaceId, generationId: pendingId, actualCost: 3 });
    assert.equal(await balance(pool, workspaceId), '7.000000');
    assert.equal((await getGenerationCreditRevenue(pool, workspaceId, pendingId)).revenue_idr, null);
    assert.equal((await getGenerationCreditRevenue(pool, workspaceId, historicalId)).revenue_idr, null);
    assert.equal((await pool.query(`SELECT COUNT(*) FROM generation_credit_allocations WHERE generation_job_id = $1`, [historicalId])).rows[0].count, '0');
  }, async (client) => {
    await client.query(`INSERT INTO workspaces (id) VALUES ($1)`, [workspaceId]);
    await client.query(`INSERT INTO credit_accounts (workspace_id, balance) VALUES ($1, 4)`, [workspaceId]);
    const ledger = (await client.query(`INSERT INTO credit_ledger (workspace_id, amount, balance_after, reason, idempotency_key)
      VALUES ($1, -6, 4, 'generation_reservation', 'old-reserve') RETURNING id`, [workspaceId])).rows[0];
    await client.query(`INSERT INTO generation_jobs (id, workspace_id, estimated_cost, reservation_ledger_id, status) VALUES ($1, $2, 6, $3, 'succeeded')`, [pendingId, workspaceId, ledger.id]);
    await client.query(`INSERT INTO generation_jobs (id, workspace_id, estimated_cost, settlement_status, status) VALUES ($1, $2, 2, 'captured', 'succeeded')`, [historicalId, workspaceId]);
  });
});

test('concurrent admission is FIFO and idempotent, while credit-lot drift rolls back job and ledger writes', { skip }, async () => {
  await withDatabase(async (pool) => {
    const workspaceId = await workspace(pool);
    await grant(pool, workspaceId, 10, 1000);
    const same = await Promise.all([reserve(pool, workspaceId, 8, 'same'), reserve(pool, workspaceId, 8, 'same')]);
    assert.equal(same[0].id, same[1].id);
    assert.equal(await balance(pool, workspaceId), '2.000000');
    const rejected = await Promise.allSettled([reserve(pool, workspaceId, 2, 'last'), reserve(pool, workspaceId, 2, 'overdraw')]);
    assert.equal(rejected.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(await balance(pool, workspaceId), '0.000000');

    const driftWorkspace = await workspace(pool);
    await grant(pool, driftWorkspace, 5, 500);
    await pool.query(`UPDATE credit_accounts SET balance = 6 WHERE workspace_id = $1`, [driftWorkspace]);
    await assert.rejects(reserve(pool, driftWorkspace, 2, 'drift'), /Credit lot balance drift/);
    await assert.rejects(appendCreditEntry(pool, { workspaceId: driftWorkspace, amount: 1, reason: 'grant', idempotencyKey: 'drift-grant' }), /Credit lot balance drift/);
    assert.equal((await pool.query(`SELECT COUNT(*) FROM generation_jobs WHERE workspace_id = $1`, [driftWorkspace])).rows[0].count, '0');
    assert.equal((await pool.query(`SELECT COUNT(*) FROM credit_ledger WHERE workspace_id = $1`, [driftWorkspace])).rows[0].count, '1');
    assert.equal((await pool.query(`SELECT COUNT(*) FROM credit_lots WHERE workspace_id = $1`, [driftWorkspace])).rows[0].count, '1');
    assert.equal((await pool.query(`SELECT balance FROM credit_accounts WHERE workspace_id = $1`, [driftWorkspace])).rows[0].balance, '6.000000');
  });
});

test('acquisition values cannot be edited and cross-tenant lot allocations are denied', { skip }, async () => {
  await withDatabase(async (pool) => {
    const workspaceId = await workspace(pool);
    const another = await workspace(pool);
    await grant(pool, workspaceId, 10, 1000);
    await grant(pool, another, 10, 1000);
    const lot = (await pool.query(`SELECT * FROM credit_lots WHERE workspace_id = $1`, [workspaceId])).rows[0];
    await assert.rejects(pool.query(`UPDATE credit_lots SET amount_idr = 2000 WHERE id = $1`, [lot.id]), (error) => error.code === '23514');
    await assert.rejects(pool.query(`UPDATE credit_lots SET granted_credits = 20 WHERE id = $1`, [lot.id]), (error) => error.code === '23514');
    await pool.query(`UPDATE credit_lots SET payment_fee_idr = 20 WHERE id = $1`, [lot.id]);
    for (const [source, amount, fee] of [['paid', null, null], ['promo', null, 0], ['sandbox', 0, null]]) {
      await assert.rejects(pool.query(`INSERT INTO credit_lots
        (workspace_id, source_ledger_id, source_type, granted_credits, available_credits, amount_idr, payment_fee_idr)
        VALUES ($1, $2, $3, 1, 1, $4, $5)`, [workspaceId, lot.source_ledger_id, source, amount, fee]), (error) => error.code === '23514');
    }
    const job = await reserve(pool, another, 2);
    for (const reserved of [null, -1, 0, 'NaN']) {
      await assert.rejects(pool.query(`SELECT finalize_generation_credit_lots($1, $2, $3::numeric, 0)`, [another, job.id, reserved]), (error) => error.code === '23514');
    }
    await assert.rejects(pool.query(`INSERT INTO generation_credit_allocations (workspace_id, generation_job_id, lot_id, reserved_credits) VALUES ($1, $2, $3, 1)`, [another, job.id, lot.id]), (error) => error.code === '23503');
    assert.equal(await balance(pool, workspaceId), '10.000000');
    assert.equal(await balance(pool, another), '8.000000');
  });
});

test('fractional credit lots and non-generation debits preserve exact NUMERIC balances without creating revenue grants', { skip }, async () => {
  await withDatabase(async (pool) => {
    const workspaceId = await workspace(pool);
    await grant(pool, workspaceId, 1.234567, 500);
    const job = await reserve(pool, workspaceId, 0.334567);
    await captureGenerationCredits(pool, { workspaceId, generationId: job.id, actualCost: 0.234567 });
    assert.equal(await balance(pool, workspaceId), '1.000000');
    await appendCreditEntry(pool, { workspaceId, amount: -0.1, reason: 'adjustment', idempotencyKey: 'debit' });
    await appendCreditEntry(pool, { workspaceId, amount: -0.1, reason: 'adjustment', idempotencyKey: 'debit' });
    assert.equal(await balance(pool, workspaceId), '0.900000');
    assert.equal((await pool.query(`SELECT COUNT(*) FROM credit_lots WHERE workspace_id = $1`, [workspaceId])).rows[0].count, '1');
    const revenue = await getGenerationCreditRevenue(pool, workspaceId, job.id);
    assert.equal(revenue.consumed_credits, '0.234567');
    assert.ok(Math.abs(Number(revenue.revenue_idr) - 500 * 0.234567 / 1.234567) < 1e-10);
  });
});
