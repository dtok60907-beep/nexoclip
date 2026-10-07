import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { listPaymentFeeCandidates, reconcilePaymentFee } from '../../src/services/paymentFeeService.js';

const databaseUrl = process.env.NEXOCLIP_TEST_DATABASE_URL;
const skip = !databaseUrl && 'NEXOCLIP_TEST_DATABASE_URL is required (dedicated test database)';
const migrations = new URL('../../src/db/migrations/', import.meta.url);

test('fee reconciliation preserves corrections, replay safety, tenant isolation and append-only evidence in PostgreSQL', { skip }, async () => {
  const schema = `payment_fee_test_${randomUUID().replaceAll('-', '')}`;
  const pool = new pg.Pool({ connectionString: databaseUrl, options: `-c search_path=${schema},public`, max: 2 });
  try {
    await pool.query(`CREATE SCHEMA ${schema}`);
    await pool.query(`CREATE TABLE workspaces(id UUID PRIMARY KEY);
      CREATE TABLE users(id UUID PRIMARY KEY);
      CREATE TABLE generation_jobs(id UUID PRIMARY KEY, workspace_id UUID NOT NULL REFERENCES workspaces(id),
        reservation_ledger_id UUID, settlement_status TEXT, UNIQUE(workspace_id,id));
      CREATE TABLE credit_topups(id UUID PRIMARY KEY, workspace_id UUID NOT NULL REFERENCES workspaces(id),
        credit_ledger_id UUID, status TEXT, is_sandbox BOOLEAN NOT NULL DEFAULT false,
        package_code TEXT DEFAULT 'starter', amount_idr NUMERIC(20,8) DEFAULT 10000, completed_at TIMESTAMPTZ DEFAULT now());`);
    for (const name of ['007_credits.sql', '032_credit_lots.sql', '033_payment_fee_reconciliation.sql']) {
      await pool.query(await readFile(new URL(name, migrations), 'utf8'));
    }
    const workspaceId = randomUUID();
    const otherWorkspace = randomUUID();
    const userId = randomUUID();
    const topupId = randomUUID();
    await pool.query('INSERT INTO workspaces(id) VALUES($1),($2)', [workspaceId, otherWorkspace]);
    await pool.query('INSERT INTO users(id) VALUES($1)', [userId]);
    const ledger = (await pool.query(`INSERT INTO credit_ledger(workspace_id,amount,balance_after,reason,idempotency_key)
      VALUES($1,100,100,'topup',$2) RETURNING id`, [workspaceId, randomUUID()])).rows[0].id;
    const lot = (await pool.query(`INSERT INTO credit_lots(workspace_id,source_ledger_id,source_type,granted_credits,available_credits,amount_idr)
      VALUES($1,$2,'paid',100,100,10000) RETURNING id`, [workspaceId, ledger])).rows[0].id;
    await pool.query(`INSERT INTO credit_topups(id,workspace_id,credit_ledger_id,status) VALUES($1,$2,$3,'completed')`, [topupId, workspaceId, ledger]);
    const olderTopupId = randomUUID();
    const olderLedger = (await pool.query(`INSERT INTO credit_ledger(workspace_id,amount,balance_after,reason,idempotency_key)
      VALUES($1,100,200,'topup',$2) RETURNING id`, [workspaceId, randomUUID()])).rows[0].id;
    await pool.query(`INSERT INTO credit_lots(workspace_id,source_ledger_id,source_type,granted_credits,available_credits,amount_idr)
      VALUES($1,$2,'paid',100,100,10000)`, [workspaceId, olderLedger]);
    await pool.query(`INSERT INTO credit_topups(id,workspace_id,credit_ledger_id,status,completed_at)
      VALUES($1,$2,$3,'completed','2020-01-01T00:00:00Z')`, [olderTopupId, workspaceId, olderLedger]);
    const candidates = await listPaymentFeeCandidates(pool, { workspaceId, page: 2, pageSize: 1 });
    assert.equal(candidates.pagination.total, 2);
    assert.equal(candidates.items[0].id, olderTopupId);
    assert.equal(candidates.items[0].paymentFeeIdr, null);
    assert.equal((await listPaymentFeeCandidates(pool, { workspaceId: otherWorkspace })).pagination.total, 0);
    const input = { workspaceId, userId, topupId, feeIdr: '250.00000001', reconciliationKey: 'invoice-1', evidenceReference: 'gateway invoice 1' };
    assert.equal((await reconcilePaymentFee(pool, input)).feeIdr, '250.00000001');
    assert.equal((await reconcilePaymentFee(pool, { ...input, reconciliationKey: 'invoice-2', evidenceReference: 'corrected invoice', feeIdr: '300' })).feeIdr, '300.00000000');
    const replay = await reconcilePaymentFee(pool, input);
    assert.equal(replay.replayed, true);
    assert.equal(replay.feeIdr, '300.00000000');
    await assert.rejects(reconcilePaymentFee(pool, { ...input, feeIdr: '999' }), { status: 409 });
    await assert.rejects(reconcilePaymentFee(pool, { ...input, workspaceId: otherWorkspace }), { status: 404 });
    assert.equal((await pool.query('SELECT COUNT(*)::integer AS count FROM payment_fee_observations')).rows[0].count, 2);
    assert.equal((await pool.query('SELECT payment_fee_idr FROM credit_lots WHERE id=$1', [lot])).rows[0].payment_fee_idr, '300.00000000');
    await assert.rejects(pool.query('UPDATE payment_fee_observations SET fee_idr=0'), { code: '23514' });
    await assert.rejects(pool.query('DELETE FROM payment_fee_observations'), { code: '23514' });
    await pool.query(await readFile(new URL('033_payment_fee_reconciliation.sql', migrations), 'utf8'));
    assert.equal((await reconcilePaymentFee(pool, { ...input, reconciliationKey: 'invoice-3', evidenceReference: 'fee waived', feeIdr: '0' })).feeIdr, '0.00000000');
  } finally {
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.end();
  }
});
