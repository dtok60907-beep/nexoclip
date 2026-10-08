import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {createBackofficeRepository} from '../../src/repositories/backofficeRepository.js';
import {createBackofficeService} from '../../src/services/backofficeService.js';

test('account directory paginates all accounts, literal searches and status without membership duplication',{skip:!process.env.BACKOFFICE_TEST_DATABASE_URL},async()=>{
 const root=new pg.Pool({connectionString:process.env.BACKOFFICE_TEST_DATABASE_URL}),schema=`directory_${randomUUID().replaceAll('-','')}`;
 await root.query(`CREATE SCHEMA ${schema}`);
 const pool=new pg.Pool({connectionString:process.env.BACKOFFICE_TEST_DATABASE_URL,options:`-c search_path=${schema},public`});
 try {
  for(const name of ['001_auth_sessions.sql','002_workspaces.sql','048_account_access_management.sql'])await pool.query(await readFile(new URL(`../../src/db/migrations/${name}`,import.meta.url),'utf8'));
  const users=(await pool.query(`INSERT INTO users(email,password_hash,display_name,created_at,suspended_at)
   SELECT 'account-'||i||'@fixture.test','fixture','Customer '||i,'2026-10-01'::timestamptz,CASE WHEN i%3=0 THEN now() ELSE NULL END
   FROM generate_series(1,108) i RETURNING id`)).rows;
  const operator=users[0].id,target=users[1].id;
  const workspaceIds=(await pool.query("INSERT INTO workspaces(name,slug) VALUES('A workspace','a-fixture'),('B workspace','b-fixture') RETURNING id")).rows.map(row=>row.id);
  for(const workspaceId of workspaceIds)await pool.query("INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,'member')",[workspaceId,target]);
  await pool.query("INSERT INTO users(email,password_hash,display_name,created_at) VALUES($1,'fixture','Literal wildcard','2026-10-02')",['literal%_\\@fixture.test']);
  const repository=createBackofficeRepository(pool),service=createBackofficeService({repository,env:{NEXOCLIP_OPERATOR_USER_IDS:operator}});
  const expected=(await pool.query('SELECT id FROM users ORDER BY created_at DESC,id')).rows.map(row=>row.id);
  const seen=[];
  for(let page=1;page<=5;page++) {
   const directory=await service.read({userId:operator,page,pageSize:25});
   assert.equal(directory.pagination.total,109);assert.equal(directory.pagination.pages,5);
   assert.deepEqual(directory.users.map(row=>row.id),expected.slice((page-1)*25,page*25));
   seen.push(...directory.users.map(row=>row.id));
   const member=directory.users.find(row=>row.id===target);if(member)assert.equal(member.workspaces.length,2);
   assert.ok(directory.users.some(row=>row.workspaces.length===0));
   assert.doesNotMatch(JSON.stringify(directory),/password_hash|token_hash/);
  }
  assert.deepEqual(seen,expected);assert.equal(new Set(seen).size,109);
  const active=await service.read({userId:operator,status:'active',pageSize:100});assert.equal(active.pagination.total,73);assert.ok(active.users.every(row=>row.suspended_at===null));
  const suspended=await service.read({userId:operator,status:'suspended',pageSize:100});assert.equal(suspended.pagination.total,36);assert.ok(suspended.users.every(row=>row.suspended_at));
  assert.equal((await service.read({userId:operator,q:'CUSTOMER 108',status:'suspended'})).pagination.total,1);
  assert.equal((await service.read({userId:operator,q:'CUSTOMER 108',status:'active'})).pagination.total,0);
  const literal=await service.read({userId:operator,q:'%_\\'});assert.equal(literal.pagination.total,1);assert.equal(literal.users[0].email,'literal%_\\@fixture.test');
  const empty=await service.read({userId:operator,q:'not-a-fixture'});assert.deepEqual(empty.pagination,{page:1,pageSize:25,total:0,pages:1});assert.deepEqual(empty.users,[]);
  const beyond=await service.read({userId:operator,page:6});assert.equal(beyond.pagination.total,109);assert.deepEqual(beyond.users,[]);
  const billing=await service.read({userId:operator,pageSize:100});assert.equal(billing.users.length,100);assert.equal(billing.truncated,true);assert.equal(billing.workspaces.length,2);
  // Refresh after suspend changes the same filtered total without duplicating memberships.
  await pool.query('UPDATE users SET suspended_at=now() WHERE id=$1',[target]);
  assert.equal((await service.read({userId:operator,status:'suspended',pageSize:100})).pagination.total,37);
  await assert.rejects(service.read({userId:target}),{status:403});
 }finally{await pool.end();await root.query(`DROP SCHEMA ${schema} CASCADE`);await root.end();}
});
