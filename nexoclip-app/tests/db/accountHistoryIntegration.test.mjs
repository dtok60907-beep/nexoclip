import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import {createBackofficeRepository} from '../../src/repositories/backofficeRepository.js';
import {createBackofficeService} from '../../src/services/backofficeService.js';

test('history pages cover older activity, preserve exact credit values and enforce account/workspace boundaries',{skip:!process.env.BACKOFFICE_TEST_DATABASE_URL},async()=>{
 const root=new pg.Pool({connectionString:process.env.BACKOFFICE_TEST_DATABASE_URL}),schema=`history_${randomUUID().replaceAll('-','')}`;
 await root.query(`CREATE SCHEMA ${schema}`);
 const pool=new pg.Pool({connectionString:process.env.BACKOFFICE_TEST_DATABASE_URL,options:`-c search_path=${schema},public`});
 try {
  const migrationDir=new URL('../../src/db/migrations/',import.meta.url),version=Number((await pool.query('SHOW server_version_num')).rows[0].server_version_num);
  for(const name of (await readdir(migrationDir)).filter(file=>file.endsWith('.sql')).sort()){
   let sql=await readFile(new URL(name,migrationDir),'utf8');if(version<150000&&name==='006_generation_jobs.sql')sql=sql.replace('ON DELETE SET NULL (project_id)','ON DELETE RESTRICT');await pool.query(sql);
  }
  const users=(await pool.query("INSERT INTO users(email,password_hash) VALUES('operator@history.test','fixture'),('target@history.test','fixture'),('other@history.test','fixture') RETURNING id")).rows;
  const [operator,target,other]=users.map(row=>row.id),workspaces=(await pool.query("INSERT INTO workspaces(name,slug) VALUES('Shared','shared-history'),('Other','other-history'),('Empty','empty-history') RETURNING id")).rows.map(row=>row.id);
  const [workspaceId,otherWorkspace,emptyWorkspace]=workspaces;
  await pool.query("INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,'member'),($1,$3,'owner'),($4,$3,'owner'),($5,$2,'member')",[workspaceId,target,other,otherWorkspace,emptyWorkspace]);
  await pool.query("INSERT INTO account_session_events(user_id,action,created_at) SELECT $1,'session_created','2026-10-01T00:00:00Z'::timestamptz FROM generate_series(1,63)",[target]);
  await pool.query("INSERT INTO account_session_events(user_id,action,created_at) SELECT $1,'session_revoked','2026-10-02T00:00:00Z'::timestamptz FROM generate_series(1,7)",[other]);
  for(const ws of [workspaceId,otherWorkspace]){
   await pool.query(`INSERT INTO credit_topups(workspace_id,user_id,package_code,amount_idr,credits,provider_key,order_id,status,created_at)
    SELECT $1::uuid,$2::uuid,'fixture',149000,750.123456,'manual_business',$1::uuid::text||'-order-'||i,'pending','2026-10-01T00:00:00Z'::timestamptz FROM generate_series(1,63) i`,[ws,other]);
   await pool.query(`INSERT INTO credit_ledger(workspace_id,amount,balance_after,reason,idempotency_key,created_at)
    SELECT $1,1.234567,99999999999999.123456,'fixture grant','entry-'||i,'2026-10-01T00:00:00Z'::timestamptz FROM generate_series(1,63) i`,[ws]);
  }
  const repository=createBackofficeRepository(pool),service=createBackofficeService({repository,env:{NEXOCLIP_OPERATOR_USER_IDS:operator}});
  for(const history of ['sessions','payments','ledger']){
   const table=history==='sessions'?'account_session_events':history==='payments'?'credit_topups':'credit_ledger';
   const scope=history==='sessions'?'user_id':'workspace_id',scopeId=history==='sessions'?target:workspaceId;
   const expected=(await pool.query(`SELECT id FROM ${table} WHERE ${scope}=$1 ORDER BY created_at DESC,id DESC`,[scopeId])).rows.map(row=>row.id);
   const ids=[];
   for(let page=1;page<=3;page++){
    const report=await service.read({userId:operator,workspaceId,customerId:target,history,page,pageSize:25});
    assert.equal(report.pagination.total,63);assert.equal(report.pagination.pages,3);assert.deepEqual(report.rows.map(row=>row.id),expected.slice((page-1)*25,page*25));ids.push(...report.rows.map(row=>row.id));
    assert.equal(report.scope,history==='sessions'?'account':'workspace');assert.doesNotMatch(JSON.stringify(report),/token_hash|password_hash|payment_url|metadata/);
    if(history==='ledger')assert.ok(report.rows.every(row=>row.amount==='1.234567'&&row.balance_after==='99999999999999.123456'));
    if(history==='payments')assert.ok(report.rows.every(row=>row.credits==='750.123456'&&row.user_id===other), 'workspace transactions must include other members');
   }
   assert.deepEqual(ids,expected);assert.equal(new Set(ids).size,63);
   const beyond=await service.read({userId:operator,workspaceId,customerId:target,history,page:4});assert.equal(beyond.pagination.total,63);assert.deepEqual(beyond.rows,[]);
   await assert.rejects(service.read({userId:operator,workspaceId:otherWorkspace,customerId:target,history}),{status:404});
  }
  assert.equal((await service.read({userId:operator,workspaceId,customerId:other,history:'sessions'})).pagination.total,7);
  const empty=await service.read({userId:operator,workspaceId:emptyWorkspace,customerId:target,history:'ledger'});assert.deepEqual(empty.rows,[]);assert.deepEqual(empty.pagination,{page:1,pageSize:25,total:0,pages:1});
  // Global account session history is unchanged when selecting another legitimate workspace.
  assert.equal((await service.read({userId:operator,workspaceId:emptyWorkspace,customerId:target,history:'sessions'})).pagination.total,63);
  const profile=await service.read({userId:operator,workspaceId,customerId:target});
  for(const history of ['sessions','payments','ledger']){assert.equal(profile[history].length,25);assert.equal(profile.historyPagination[history].total,63);}
  for(const history of ['sessions','payments','ledger']){
   const october=await service.read({userId:operator,workspaceId,customerId:target,history,page:2,from:'2026-10-01',to:'2026-10-01'});
   assert.equal(october.pagination.total,63);assert.equal(october.rows.length,25);
   assert.equal(october.period.until,'2026-10-02T00:00:00.000Z');
  }
  const timestamps=['2024-02-28T23:59:59.999999Z','2024-02-29T00:00:00Z','2024-02-29T12:00:00Z','2024-02-29T23:59:59.999999Z','2024-03-01T00:00:00Z'];
  for(const [index,timestamp] of timestamps.entries()){
   await pool.query("INSERT INTO account_session_events(user_id,action,created_at) VALUES($1,'session_created',$2)",[target,timestamp]);
   await pool.query("INSERT INTO credit_topups(workspace_id,user_id,package_code,amount_idr,credits,order_id,status,created_at,completed_at) VALUES($1,$2,'date-fixture',100,1,$3,'completed',$4,'2026-10-07')",[workspaceId,target,`date-order-${index}`,timestamp]);
   await pool.query("INSERT INTO credit_ledger(workspace_id,amount,balance_after,reason,idempotency_key,created_at) VALUES($1,1,10,'date fixture',$2,$3)",[workspaceId,`date-entry-${index}`,timestamp]);
  }
  for(const history of ['sessions','payments','ledger']){
   const csv=await service.exportHistory({userId:operator,workspaceId,customerId:target,history});
   assert.equal(csv.csv.split('\r\n').length,71,'header, summary, 68 entries and final newline');
   const filteredCsv=await service.exportHistory({userId:operator,workspaceId,customerId:target,history,from:'2024-02-29',to:'2024-02-29'});
   assert.equal(filteredCsv.csv.split('\r\n').length,6);
   await assert.rejects(service.exportHistory({userId:operator,workspaceId:otherWorkspace,customerId:target,history}),{status:404});
   const leap=await service.read({userId:operator,workspaceId,customerId:target,history,from:'2024-02-29',to:'2024-02-29'});
   assert.equal(leap.pagination.total,3);assert.equal(leap.rows.length,3);assert.ok(leap.rows.every(row=>new Date(row.created_at).toISOString().startsWith('2024-02-29')));
   assert.equal((await service.read({userId:operator,workspaceId,customerId:target,history,to:'2024-02-29'})).pagination.total,4);
   assert.equal((await service.read({userId:operator,workspaceId,customerId:target,history,from:'2024-03-01'})).pagination.total,64);
   assert.equal((await service.read({userId:operator,workspaceId,customerId:target,history,from:'',to:''})).pagination.total,68);
   const emptyDate=await service.read({userId:operator,workspaceId,customerId:target,history,from:'2025-01-01',to:'2025-01-01'});assert.equal(emptyDate.pagination.total,0);assert.deepEqual(emptyDate.rows,[]);
   await assert.rejects(service.read({userId:operator,workspaceId:otherWorkspace,customerId:target,history,from:'2024-02-29',to:'2024-02-29'}),{status:404});
  }
  for(const [history,category,total] of [['sessions','session_created',68],['sessions','session_revoked',0],['payments','pending',63],['payments','completed',5],['payments','failed',0],['payments','canceled',0],['ledger','FIXTURE',68],['ledger','fixture%',0],['ledger','fixture_',0]]){
   const filtered=await service.read({userId:operator,workspaceId,customerId:target,history,category,pageSize:10});assert.equal(filtered.pagination.total,total);assert.equal(filtered.rows.length,Math.min(10,total));
   const csv=await service.exportHistory({userId:operator,workspaceId,customerId:target,history,category});assert.equal(csv.csv.split('\r\n').length,total+3);assert.ok(csv.csv.includes('"category_filter"'));assert.ok(csv.csv.includes(`"${category}"`));
  }
  const combined=await service.read({userId:operator,workspaceId,customerId:target,history:'payments',category:'completed',from:'2024-02-29',to:'2024-02-29'});assert.equal(combined.pagination.total,3);
  const noMatch=await service.read({userId:operator,workspaceId,customerId:target,history:'payments',category:'pending',from:'2024-02-29',to:'2024-02-29'});assert.equal(noMatch.pagination.total,0);
  await assert.rejects(service.exportHistory({userId:other,workspaceId,customerId:target,history:'payments',category:'completed'}),{status:403});
  await pool.query('DELETE FROM workspace_memberships WHERE workspace_id=$1 AND user_id=$2',[workspaceId,target]);
  await assert.rejects(service.read({userId:operator,workspaceId,customerId:target,history:'payments'}),{status:404});
  await assert.rejects(service.read({userId:other,workspaceId,customerId:target,history:'sessions'}),{status:403});
 }finally{await pool.end();await root.query(`DROP SCHEMA ${schema} CASCADE`);await root.end();}
});
