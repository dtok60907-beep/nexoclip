import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {createAccountAccessRepository} from '../../src/repositories/accountAccessRepository.js';
import {createAccountAccessService} from '../../src/services/accountAccessService.js';
import {createSessionRecord,findActiveSession} from '../../src/repositories/sessionRepository.js';
import {hashPassword} from '../../src/lib/auth/password.js';
import {hashSessionToken} from '../../src/lib/auth/session.js';
import {loginUser,loginWithGoogle,createSession,getCurrentSession} from '../../src/services/authService.js';
import {closePool} from '../../src/db/pool.js';
test('account lifecycle blocks password/OAuth/system sessions, serializes races, revokes atomically and keeps immutable audit',{skip:!process.env.NEXOCLIP_TEST_DATABASE_URL},async()=>{
 const root=new pg.Pool({connectionString:process.env.NEXOCLIP_TEST_DATABASE_URL}),schema=`access_${randomUUID().replaceAll('-','')}`;
 await root.query(`CREATE SCHEMA ${schema}`);
 const pool=new pg.Pool({connectionString:process.env.NEXOCLIP_TEST_DATABASE_URL,options:`-c search_path=${schema},public`});
 const oldUrl=process.env.DATABASE_URL,connection=new URL(process.env.NEXOCLIP_TEST_DATABASE_URL);connection.searchParams.set('options',`-c search_path=${schema},public`);process.env.DATABASE_URL=connection.toString();
 try {
  for(const name of ['001_auth_sessions.sql','048_account_access_management.sql'])await pool.query(await readFile(new URL(`../../src/db/migrations/${name}`,import.meta.url),'utf8'));
  const password='CorrectPassword123!',hash=await hashPassword(password);
  const users=(await pool.query("INSERT INTO users(email,password_hash) VALUES('operator@fixture.test',$1),('customer@fixture.test',$1),('other@fixture.test',$1) RETURNING id",[hash])).rows;
  const [operator,target,other]=users.map(row=>row.id),repository=createAccountAccessRepository(pool),service=createAccountAccessService({repository,env:{NEXOCLIP_OPERATOR_USER_IDS:operator}});
  const login=await loginUser({email:'customer@fixture.test',password});assert.equal((await getCurrentSession(login.token)).user_id,target);
  const otherLogin=await loginUser({email:'other@fixture.test',password});
  const suspend={targetUserId:target,action:'suspend',expectedVersion:'0',requestKey:randomUUID(),reason:'Investigate synthetic account access'};
  const results=await Promise.all([service.mutate({userId:operator,input:suspend}),service.mutate({userId:operator,input:suspend})]);assert.equal(results.filter(result=>result.replayed).length,1);
  assert.equal(await getCurrentSession(login.token),null);assert.ok(await getCurrentSession(otherLogin.token));
  await assert.rejects(loginUser({email:'customer@fixture.test',password}),{code:'42501'});
  await assert.rejects(loginWithGoogle({email:'customer@fixture.test',displayName:'Customer'}),{code:'42501'});
  await assert.rejects(createSession({userId:target}),{code:'42501'});
  assert.equal((await service.read({userId:operator,targetUserId:target})).account.active_sessions,0);
  const activate={...suspend,action:'activate',expectedVersion:'1',requestKey:randomUUID(),reason:'Restore access after investigation'};
  await service.mutate({userId:operator,input:activate});assert.equal(await getCurrentSession(login.token),null);
  const restored=await loginUser({email:'customer@fixture.test',password});assert.ok(await getCurrentSession(restored.token));
  // Retrying the original suspension after activation cannot revoke new sessions.
  assert.equal((await service.mutate({userId:operator,input:suspend})).replayed,true);assert.ok(await getCurrentSession(restored.token));
  await assert.rejects(service.mutate({userId:operator,input:{...suspend,requestKey:randomUUID()}}),{status:409});
  const revoke={...suspend,action:'revoke_sessions',expectedVersion:'2',requestKey:randomUUID(),reason:'Logout all devices for security'};
  await service.mutate({userId:operator,input:revoke});assert.equal(await getCurrentSession(restored.token),null);
  assert.equal((await service.read({userId:operator,targetUserId:target})).account.suspended_at,null);
  const fresh=await loginUser({email:'customer@fixture.test',password});assert.ok(await getCurrentSession(fresh.token));
  // Session creation that commits before suspension is included in revocation.
  const db=await pool.connect();let racing;
  try {await db.query('BEGIN');await db.query('SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE',[target]);await createSessionRecord(db,{userId:target,tokenHash:hashSessionToken('racing'),expiresAt:new Date(Date.now()+100000)});
   racing=service.mutate({userId:operator,input:{...suspend,expectedVersion:'3',requestKey:randomUUID()}});await db.query('COMMIT');await racing;
  }finally{db.release();}
  assert.equal(await findActiveSession(pool,hashSessionToken('racing')),null);assert.equal(await getCurrentSession(fresh.token),null);
  await service.mutate({userId:operator,input:{...activate,expectedVersion:'4',requestKey:randomUUID()}});
  const before=await loginUser({email:'customer@fixture.test',password});
  const failing=createAccountAccessService({env:{NEXOCLIP_OPERATOR_USER_IDS:operator},repository:{...repository,audit:async()=>{throw new Error('Synthetic audit failure');}}});
  await assert.rejects(failing.mutate({userId:operator,input:{...suspend,expectedVersion:'5',requestKey:randomUUID()}}),/Synthetic audit/);
  assert.ok(await getCurrentSession(before.token));assert.equal((await service.read({userId:operator,targetUserId:target})).account.access_version,'5');
  await assert.rejects(pool.query('DELETE FROM account_access_events'),/append-only/);
  const profile=await service.read({userId:operator,targetUserId:target});assert.equal(profile.audit.length,5);assert.ok(!JSON.stringify(profile).includes('token_hash'));assert.ok(!JSON.stringify(profile).includes('password_hash'));
  await assert.rejects(service.mutate({userId:other,input:{...suspend,expectedVersion:'5'}}),{status:403});
 }finally{await closePool();if(oldUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=oldUrl;await pool.end();await root.query(`DROP SCHEMA ${schema} CASCADE`);await root.end();}
});
