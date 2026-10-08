import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile,readdir } from 'node:fs/promises';
import pg from 'pg';
import { createBackofficeRepository } from '../../src/repositories/backofficeRepository.js';
import { createBackofficeService } from '../../src/services/backofficeService.js';
test('fresh migrations, custom sales, concurrent settlement/grants, rollback, audit and account isolation', {skip:!process.env.BACKOFFICE_TEST_DATABASE_URL},async()=>{
 const root=new pg.Pool({connectionString:process.env.BACKOFFICE_TEST_DATABASE_URL});const schema=`backoffice_${randomUUID().replaceAll('-','')}`;
 await root.query(`CREATE SCHEMA ${schema}`);
 const pool=new pg.Pool({connectionString:process.env.BACKOFFICE_TEST_DATABASE_URL,options:`-c search_path=${schema},public`});
 try {
  const migrationDir=new URL('../../src/db/migrations/',import.meta.url);
  const version=Number((await pool.query('SHOW server_version_num')).rows[0].server_version_num);
  for(const file of (await readdir(migrationDir)).filter(f=>f.endsWith('.sql')).sort()){try{let sql=await readFile(new URL(file,migrationDir),'utf8');
   // Existing migration 006 requires PG15. PG14 fixture substitutes RESTRICT; no project deletes are tested.
   if(version<150000&&file==='006_generation_jobs.sql')sql=sql.replace('ON DELETE SET NULL (project_id)','ON DELETE RESTRICT');
   await pool.query(sql);}catch(e){throw new Error(`Migration ${file}: ${e.message}`,{cause:e});}}
  const users=(await pool.query("INSERT INTO users(email,password_hash) VALUES('operator@fixture.test','test'),('buyer@fixture.test','test'),('other@fixture.test','test') RETURNING id")).rows;
  const [operator,buyer,other]=users.map(u=>u.id);
  const workspaces=(await pool.query("INSERT INTO workspaces(name,slug) VALUES('Business fixture','business'),('Other fixture','other') RETURNING id")).rows;
  const [workspaceId,otherWorkspace]=workspaces.map(w=>w.id);
  await pool.query("INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,'owner'),($3,$4,'owner')",[workspaceId,buyer,otherWorkspace,other]);
  const repository=createBackofficeRepository(pool),service=createBackofficeService({repository,env:{NEXOCLIP_OPERATOR_USER_IDS:operator}});
  const input={action:'create',requestKey:randomUUID(),customerId:buyer,company:'Fixture buyer',credits:1000,bonus:100,amount:150000,notes:'custom price'};
  const created=await service.mutate({userId:operator,workspaceId,input});
  assert.equal((await service.mutate({userId:operator,workspaceId,input})).order.id,created.order.id);
  await assert.rejects(service.mutate({userId:operator,workspaceId,input:{...input,amount:10}}),{status:409});
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM credit_ledger')).rows[0].n,0);
  const settle={action:'settle',customerId:buyer,requestKey:randomUUID(),orderId:created.order.id,reference:'BANK-TEST-1',paidAt:'2026-01-01T00:00:00Z',fee:'1000'};
  const results=await Promise.all(Array.from({length:4},()=>service.mutate({userId:operator,workspaceId,input:settle})));
  assert.ok(results.every(r=>r.order.status==='completed'));
  assert.equal((await pool.query('SELECT balance::text FROM credit_accounts WHERE workspace_id=$1',[workspaceId])).rows[0].balance,'1100.000000');
  let lot=(await pool.query('SELECT source_type,amount_idr,granted_credits,payment_fee_idr FROM credit_lots')).rows[0];
  assert.equal(lot.source_type,'paid');assert.equal(Number(lot.amount_idr),150000);assert.equal(Number(lot.granted_credits),1100);assert.equal(Number(lot.payment_fee_idr),1000);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM credit_topups')).rows[0].n,1);
  const topup=(await pool.query('SELECT amount_idr,credits,provider_key FROM credit_topups')).rows[0];assert.equal(topup.provider_key,'manual_business');assert.equal(Number(topup.credits),1100);
  const grant={action:'grant',customerId:buyer,requestKey:randomUUID(),credits:50,type:'compensation',reason:'approved test'};
  await Promise.all(Array.from({length:4},()=>service.mutate({userId:operator,workspaceId,input:grant})));
  assert.equal((await pool.query('SELECT balance::text FROM credit_accounts WHERE workspace_id=$1',[workspaceId])).rows[0].balance,'1150.000000');
  await assert.rejects(service.mutate({userId:operator,workspaceId,input:{...grant,credits:100}}),{status:409});
  await assert.rejects(service.mutate({userId:operator,workspaceId:otherWorkspace,input:{...grant,requestKey:randomUUID()}}),{status:404});
  assert.equal(await repository.profile(otherWorkspace,buyer),null);
  const profile=await service.read({userId:operator,workspaceId,customerId:buyer});assert.equal(profile.audit.length,3);assert.equal(profile.payments.length,1);assert.ok(!JSON.stringify(profile).includes('password_hash'));
  const dir=await service.read({userId:operator});assert.equal(dir.users.length,3);assert.ok(!JSON.stringify(dir).includes('password_hash'));
  // A duplicate payment reference rolls back the credit grant as well.
  const second=await service.mutate({userId:operator,workspaceId,input:{...input,requestKey:randomUUID()}});
  await assert.rejects(service.mutate({userId:operator,workspaceId,input:{...settle,orderId:second.order.id}}),{code:'23505'});
  assert.equal((await pool.query('SELECT balance::text FROM credit_accounts WHERE workspace_id=$1',[workspaceId])).rows[0].balance,'1150.000000');
  const cancel={action:'cancel',requestKey:randomUUID(),customerId:buyer,orderId:second.order.id,reason:'test cancellation'};
  await service.mutate({userId:operator,workspaceId,input:cancel});await service.mutate({userId:operator,workspaceId,input:cancel});
  await assert.rejects(service.mutate({userId:operator,workspaceId,input:{...settle,orderId:second.order.id}}),{status:409});
  const third=await service.mutate({userId:operator,workspaceId:otherWorkspace,input:{...input,customerId:other,requestKey:randomUUID()}});
  await assert.rejects(service.mutate({userId:operator,workspaceId:otherWorkspace,input:{...settle,customerId:other,orderId:third.order.id}}),{code:'23505'});
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM credit_ledger WHERE workspace_id=$1',[otherWorkspace])).rows[0].n,0);
  await assert.rejects(pool.query('UPDATE business_credit_orders SET amount_idr=1 WHERE id=$1',[created.order.id]),/immutable/);
  await assert.rejects(pool.query('DELETE FROM admin_account_events'),/append-only/);
  const session=(await pool.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,decode('aabb','hex'),now()+interval '1 day') RETURNING id",[buyer])).rows[0];
  await pool.query('UPDATE sessions SET revoked_at=now() WHERE id=$1',[session.id]);
  const log=(await repository.profile(workspaceId,buyer)).sessions;assert.equal(log.length,2);assert.deepEqual(new Set(log.map(l=>l.action)),new Set(['session_created','session_revoked']));assert.ok(!JSON.stringify(log).includes('token'));
 }finally{await pool.end();await root.query(`DROP SCHEMA ${schema} CASCADE`);await root.end();}
});
