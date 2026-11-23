import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { migrate } from '../db/migrate.js';
import { closePool } from '../db/pool.js';
import { encryptMetaToken,decryptMetaToken } from './metaCrypto.mjs';
import { readMetaAdInsights } from './metaService.mjs';
import { persistMetaConnection,listMetaConnections,listMetaAdAccounts,disconnectMetaConnection,storeMetaOAuthState,consumeMetaOAuthState } from '../repositories/metaRepository.mjs';
import { hashSessionToken } from '../lib/auth/session.js';

test('Meta PostgreSQL integration',{skip:!process.env.TEST_META_DATABASE_URL},async t=>{
  const url=new URL(process.env.TEST_META_DATABASE_URL);assert.match(url.pathname,/^\/nexoclip_meta_test_[a-z\d_]+$/);assert.equal(process.env.DATABASE_URL,url.href);
  const pool=new pg.Pool({connectionString:url.href});t.after(async()=>{await pool.end();await closePool();});
  await t.test('all migrations apply on an empty database and can be rerun',async()=>{await migrate();await migrate();assert.equal((await pool.query("SELECT count(*)::int AS count FROM schema_migrations WHERE filename='072_meta_unified_login.sql'")).rows[0].count,1);});
  const userId=randomUUID(),workspaceId=randomUUID(),otherUser=randomUUID(),otherWorkspace=randomUUID();
  await pool.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'test'),($3,$4,'test')",[userId,`${userId}@example.test`,otherUser,`${otherUser}@example.test`]);
  await pool.query("INSERT INTO workspaces(id,name,slug) VALUES($1,'Meta test',$1::uuid::text),($2,'Other',$2::uuid::text)",[workspaceId,otherWorkspace]);
  await pool.query("INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,'owner'),($3,$4,'owner')",[workspaceId,userId,otherWorkspace,otherUser]);
  const owner={workspaceId,userId},other={workspaceId:otherWorkspace,userId:otherUser};
  const env={META_APP_ID:'123',META_APP_SECRET:'test-secret',META_LOGIN_CONFIG_ID:'456',META_REDIRECT_URI:'https://test.example/auth/meta/callback',META_TOKEN_ENCRYPTION_KEY:'c'.repeat(64)};
  const snapshot={config:{appId:'123',configId:'456'},clientBusinessId:'888',systemUserId:'999',scopes:['instagram_basic','ads_read'],accessExpiresAt:null,dataAccessExpiresAt:null,instagram:[{id:'777',username:'test_creator'}],adAccounts:[{id:'act_666',name:'Test ads',currency:'IDR',timezone_name:'Asia/Jakarta',account_status:1}]};
  let integrationId,accountId;
  await t.test('encrypted connection persists with tenant-scoped IG and ad assets',async()=>{
    integrationId=await persistMetaConnection(pool,{...owner,snapshot,encryptedToken:encryptMetaToken('fake-access',env)});
    const accounts=await listMetaConnections(pool,owner);assert.equal(accounts.accounts.length,1);assert.equal(accounts.accounts[0].display_name,'test_creator');assert.equal(accounts.integrations[0].access_token_encrypted,undefined);
    const raw=(await pool.query('SELECT access_token_encrypted FROM meta_integrations WHERE id=$1',[integrationId])).rows[0];assert.equal(decryptMetaToken(raw.access_token_encrypted,env),'fake-access');
    assert.equal((await listMetaConnections(pool,other)).accounts.length,0);assert.equal((await listMetaAdAccounts(pool,other)).length,0);
    accountId=(await listMetaAdAccounts(pool,owner))[0].id;
    await assert.rejects(pool.query("INSERT INTO social_accounts(workspace_id,user_id,provider,provider_account_id,meta_integration_id) VALUES($1,$2,'instagram','other',$3)",[otherWorkspace,otherUser,integrationId]),e=>e.code==='23503');
  });
  await t.test('OAuth state is consumed only once by the original live session',async()=>{
    const token=randomUUID(),sessionHash=hashSessionToken(token);
    await pool.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",[userId,sessionHash]);
    await storeMetaOAuthState(pool,{...owner,stateHash:'test-state',sessionHash,config:{appId:'123',configId:'456',redirectUri:env.META_REDIRECT_URI}});
    assert.equal(await consumeMetaOAuthState(pool,{stateHash:'test-state',sessionHash:hashSessionToken('other')}),null);
    assert.equal((await consumeMetaOAuthState(pool,{stateHash:'test-state',sessionHash})).user_id,userId);
    assert.equal(await consumeMetaOAuthState(pool,{stateHash:'test-state',sessionHash}),null);
  });
  await t.test('insights cannot read another owner and preserve money as decimal strings',async()=>{
    const fetcher=async()=>new Response(JSON.stringify({data:[{account_id:'666',spend:'123456.78',account_currency:'IDR',clicks:'12'}]}));
    const report=await readMetaAdInsights(pool,{...owner,accountId,period:'last_7d'},env,fetcher);assert.equal(report.rows[0].spend,'123456.78');
    await assert.rejects(readMetaAdInsights(pool,{...other,accountId,period:'last_7d'},env,()=>assert.fail('No cross-tenant API call')),e=>e.status===404);
  });
  await t.test('reconnect updates scopes and removes withdrawn assets only after a complete snapshot',async()=>{
    const id=await persistMetaConnection(pool,{...owner,snapshot:{...snapshot,scopes:['instagram_basic'],adAccounts:[]},encryptedToken:encryptMetaToken('rotated',env)});assert.equal(id,integrationId);
    assert.equal((await listMetaAdAccounts(pool,owner)).length,0);assert.equal((await listMetaConnections(pool,owner)).accounts.length,1);
    await persistMetaConnection(pool,{...owner,snapshot,encryptedToken:encryptMetaToken('fake-access',env)});
  });
  await t.test('local disconnect clears token and hides assets without affecting another owner',async()=>{
    assert.equal(await disconnectMetaConnection(pool,{...other,integrationId}),false);
    assert.equal((await listMetaConnections(pool,owner)).accounts.length,1);
    assert.equal(await disconnectMetaConnection(pool,{...owner,integrationId}),true);
    assert.equal((await pool.query('SELECT access_token_encrypted FROM meta_integrations WHERE id=$1',[integrationId])).rows[0].access_token_encrypted,'');
    assert.equal((await listMetaConnections(pool,owner)).accounts.length,0);assert.equal((await listMetaAdAccounts(pool,owner)).length,0);
  });
});
