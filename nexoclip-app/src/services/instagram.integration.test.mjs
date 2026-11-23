import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { migrate } from '../db/migrate.js';
import { closePool } from '../db/pool.js';
import { persistMetaConnection,disconnectMetaConnection } from '../repositories/metaRepository.mjs';
import { claimInstagramSync,storeInstagramPage,listInstagramPosts,queueInstagramSync,failInstagramSync } from '../repositories/instagramRepository.mjs';
import { createInstagramPublishJob,processInstagramJob } from './instagramService.mjs';
import { listTikTokPosts } from '../repositories/tiktokPostsRepository.mjs';
import { listSocialPublishJobs } from '../repositories/socialPublishRepository.mjs';
import { encryptMetaToken } from './metaCrypto.mjs';

test('Instagram PostgreSQL integration',{skip:!process.env.TEST_META_DATABASE_URL},async t=>{
  const url=new URL(process.env.TEST_META_DATABASE_URL);assert.match(url.pathname,/^\/nexoclip_meta_test_[a-z\d_]+$/);assert.equal(process.env.DATABASE_URL,url.href);
  const pool=new pg.Pool({connectionString:url.href});t.after(async()=>{await pool.end();await closePool();});
  await t.test('migrates an empty database and reruns safely',async()=>{await migrate();await migrate();assert.equal((await pool.query("SELECT count(*)::int AS n FROM schema_migrations WHERE filename='073_instagram_publishing.sql'")).rows[0].n,1);});
  const workspaceId=randomUUID(),userId=randomUUID(),otherId=randomUUID(),assetId=randomUUID();
  await pool.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'test'),($3,$4,'test')",[userId,`${userId}@example.test`,otherId,`${otherId}@example.test`]);
  await pool.query("INSERT INTO workspaces(id,name,slug) VALUES($1,'Instagram test',$1::uuid::text)",[workspaceId]);
  await pool.query("INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'member')",[workspaceId,userId,otherId]);
  const env={META_APP_ID:'123',META_LOGIN_CONFIG_ID:'456',META_APP_SECRET:'test-secret',META_REDIRECT_URI:'https://dev.example/auth/meta/callback',META_TOKEN_ENCRYPTION_KEY:'c'.repeat(64)};
  const snapshot={config:{appId:'123',configId:'456'},clientBusinessId:'888',systemUserId:'999',scopes:['instagram_basic','instagram_content_publish'],accessExpiresAt:null,dataAccessExpiresAt:null,instagram:[{id:'777',username:'creator'}],adAccounts:[]};
  const owner={workspaceId,userId},integrationId=await persistMetaConnection(pool,{...owner,snapshot,encryptedToken:encryptMetaToken('fake',env)});
  const accountId=(await pool.query("SELECT id FROM social_accounts WHERE provider='instagram' AND user_id=$1",[userId])).rows[0].id;
  let account;
  const post={id:'12345678901234567890',caption:'Photo from phone',coverUrl:'https://cdn.example/image.jpg',shareUrl:'https://www.instagram.com/p/example/',timestamp:new Date().toISOString(),metrics:{like_count:2},details:{type:'IMAGE'}};
  await t.test('concurrent claims never duplicate a sync lease',async()=>{const claims=await Promise.all(Array.from({length:4},()=>claimInstagramSync(pool)));assert.equal(claims.filter(Boolean).length,1);account=claims.find(Boolean);});
  await t.test('posts upsert by provider ID and never leak into TikTok or another user',async()=>{
    await storeInstagramPage(pool,account,{posts:[post],cursor:'next'});
    const next=await claimInstagramSync(pool);assert.equal(next.instagram_sync_cursor,'next');await storeInstagramPage(pool,next,{posts:[{...post,caption:'Updated'}],cursor:null});
    const result=await listInstagramPosts(pool,owner);assert.equal(result.posts.length,1);assert.equal(result.posts[0].caption,'Updated');assert.equal(result.posts[0].provider_post_id,post.id);
    assert.equal((await listTikTokPosts(pool,owner)).posts.length,0);assert.equal((await listInstagramPosts(pool,{workspaceId,userId:otherId})).posts.length,0);
    await assert.rejects(queueInstagramSync(pool,{workspaceId,userId:otherId,accountId}),e=>e.status===409);
  });
  await t.test('failed pages preserve cursor and sanitized error; reconnect invalidates stale writes',async()=>{
    await pool.query('UPDATE social_accounts SET posts_next_sync_at=now() WHERE id=$1',[accountId]);const before=await claimInstagramSync(pool);await storeInstagramPage(pool,before,{posts:[],cursor:'resume'});
    const failed=await claimInstagramSync(pool);await failInstagramSync(pool,failed,'META_RATE_LIMITED');const raw=(await pool.query('SELECT * FROM social_accounts WHERE id=$1',[accountId])).rows[0];assert.equal(raw.instagram_sync_cursor,'resume');assert.equal(raw.posts_sync_error,'META_RATE_LIMITED');
    await pool.query('UPDATE social_accounts SET posts_next_sync_at=now() WHERE id=$1',[accountId]);const stale=await claimInstagramSync(pool);
    await persistMetaConnection(pool,{...owner,snapshot,encryptedToken:encryptMetaToken('new',env)});await storeInstagramPage(pool,stale,{posts:[{...post,caption:'Stale write'}],cursor:null});assert.equal((await listInstagramPosts(pool,owner)).posts[0].caption,'Updated');
  });
  const input={...owner,accountId,assetIds:[assetId],mediaType:'photo',caption:'Test publish',confirm:true,idempotencyKey:randomUUID()};let jobId;
  await pool.query("INSERT INTO assets(id,workspace_id,storage_key,filename,content_type,size_bytes) VALUES($1,$2,$1::uuid::text,'photo.png','image/png',10)",[assetId,workspaceId]);
  await t.test('publishing is owned, transactional, idempotent and isolated from TikTok',async()=>{
    const results=await Promise.all([createInstagramPublishJob(pool,input,env),createInstagramPublishJob(pool,input,env)]);jobId=results[0].id;assert.equal(jobId,results[1].id);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM social_publish_media WHERE social_publish_job_id=$1',[jobId])).rows[0].n,1);
    await assert.rejects(createInstagramPublishJob(pool,{...input,caption:'Different'},env),e=>e.status===409);
    await assert.rejects(createInstagramPublishJob(pool,{...input,userId:otherId},env),e=>e.status===404);
    assert.equal((await listSocialPublishJobs(pool,owner)).length,0);
  });
  await t.test('worker persists container, polls, publishes once and duplicate ticks do not post again',async()=>{
    await pool.query(`UPDATE social_publish_jobs SET provider_state=$2::jsonb WHERE id=$1`,[jobId,JSON.stringify({urls:['https://cdn.example/photo.jpg']})]);
    const calls=[];const fetcher=async(url,options)=>{calls.push({url,method:options.method});return new Response(JSON.stringify(options.method==='GET'?{status_code:'FINISHED'}:{id:url.endsWith('media_publish')?'999':'555'}));};
    await Promise.all([processInstagramJob(pool,{},env,fetcher),processInstagramJob(pool,{},env,fetcher)]);
    assert.equal(calls.length,1);let row=(await pool.query('SELECT * FROM social_publish_jobs WHERE id=$1',[jobId])).rows[0];assert.equal(row.provider_publish_id,'555');assert.equal(row.status,'processing');
    await pool.query('UPDATE social_publish_jobs SET next_poll_at=now() WHERE id=$1',[jobId]);await processInstagramJob(pool,{},env,fetcher);await processInstagramJob(pool,{},env,fetcher);
    row=(await pool.query('SELECT * FROM social_publish_jobs WHERE id=$1',[jobId])).rows[0];assert.equal(row.status,'published');assert.deepEqual(row.public_post_ids,['999']);assert.equal(calls.filter(c=>c.url.endsWith('media_publish')).length,1);
  });
  await t.test('disconnect blocks future publication and discards in-flight sync writes',async()=>{
    await pool.query('UPDATE social_accounts SET posts_next_sync_at=now() WHERE id=$1',[accountId]);const stale=await claimInstagramSync(pool);
    await disconnectMetaConnection(pool,{...owner,integrationId});await storeInstagramPage(pool,stale,{posts:[{...post,caption:'After disconnect'}],cursor:null});
    assert.equal((await listInstagramPosts(pool,owner)).posts.length,0);assert.equal((await pool.query('SELECT caption FROM social_posts WHERE social_account_id=$1',[accountId])).rows[0].caption,'Updated');
    await assert.rejects(createInstagramPublishJob(pool,{...input,idempotencyKey:randomUUID()},env),e=>e.code==='META_RECONNECT_REQUIRED');
  });
});
