import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createAdminConsoleRepository } from '../../src/repositories/adminConsoleRepository.js';
import { consoleFilters } from '../../src/services/adminConsoleService.js';

test('console SQL handles UTC boundaries, sandbox sales, tenant isolation, pagination and safe fields', { skip: !process.env.ADMIN_CONSOLE_TEST_DATABASE_URL }, async () => {
 const pool = new pg.Pool({ connectionString: process.env.ADMIN_CONSOLE_TEST_DATABASE_URL });
 const client = await pool.connect();
 try {
  await client.query('BEGIN'); await client.query("SET LOCAL TIME ZONE 'Asia/Jakarta'");
  const w = (await client.query("INSERT INTO workspaces(name,slug) VALUES ('Console test',gen_random_uuid()::text),('Other test',gen_random_uuid()::text) RETURNING id")).rows;
  const ids = w.map(x => x.id);
  const user = (await client.query("INSERT INTO users(email,password_hash,display_name) VALUES (gen_random_uuid()::text || '@test.local','test-only','Customer %_') RETURNING id")).rows[0];
  await client.query("INSERT INTO workspace_memberships(workspace_id,user_id,role,created_at) VALUES ($1,$2,'owner','2026-10-07T00:00:00Z')", [ids[0],user.id]);
  for (const [id, sandbox, time] of [[ids[0], false, '2026-10-07T00:00:00Z'], [ids[0], true, '2026-10-07T23:59:59Z'], [ids[1], false, '2026-10-07T12:00:00Z'], [ids[0], false, '2026-10-08T00:00:00Z']]) await client.query("INSERT INTO credit_topups(workspace_id,package_code,amount_idr,credits,order_id,status,is_sandbox,created_at) VALUES ($1,'test',1000,10,gen_random_uuid()::text,'completed',$2,$3)",[id,sandbox,time]);
  await client.query("INSERT INTO generation_jobs(workspace_id,model,prompt,status,created_at) SELECT $1,'test-model','private prompt','failed','2026-10-07T12:00:00Z' FROM generate_series(1,26)",[ids[0]]);
  await client.query("INSERT INTO credit_ledger(workspace_id,amount,balance_after,reason,idempotency_key,metadata,created_at) VALUES ($1,10,10,'grant','console-test','{\"secret\":\"hidden\"}','2026-10-07T12:00:00Z')",[ids[0]]);
  const repo = createAdminConsoleRepository(client);
  const filters = consoleFilters({ from:'2026-10-07',to:'2026-10-07' });
  const workspace = await repo.workspace(ids[0]); assert.equal(workspace.id, ids[0]); assert.equal(workspace.name, 'Console test');
  const overview = await repo.overview(ids[0],filters);
  assert.equal(overview.members,1); assert.equal(overview.paid_topups,1); assert.equal(overview.sales_idr,'1000'); assert.equal(overview.failed,26);
  const transactions=await repo.list(ids[0],'transactions',filters); assert.equal(transactions.items.length,2); assert.ok(transactions.items.every(x=>!('payment_url' in x)));
  const jobs=await repo.list(ids[0],'jobs',filters); assert.equal(jobs.items.length,25); assert.equal(jobs.pagination.totalPages,2); assert.ok(jobs.items.every(x=>!('prompt' in x)));
  assert.equal((await repo.list(ids[0],'jobs',{...filters,page:2})).items.length,1);
  assert.equal((await repo.list(ids[0],'customers',{...filters,q:'%_'})).items.length,1);
  assert.equal((await repo.list(ids[1],'customers',filters)).items.length,0);
  const ledger=await repo.list(ids[0],'credits',filters); assert.equal(ledger.items.length,1); assert.ok(!('metadata' in ledger.items[0]));
 } finally { await client.query('ROLLBACK'); client.release(); await pool.end(); }
});
