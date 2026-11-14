import test from 'node:test';
import assert from 'node:assert/strict';
import { tikTokUserInfo } from './tiktokApi.mjs';
import { syncDueTikTokProfiles } from './tiktokProfileSync.mjs';
import { queueTikTokProfileSync } from '../repositories/tiktokProfileRepository.mjs';
import { createPublishJob } from './tiktokService.mjs';

const profile={open_id:'owner',display_name:'Creator',username:'creator',bio_description:'Bio',profile_deep_link:'https://www.tiktok.com/@creator',is_verified:true,follower_count:100,following_count:0,likes_count:250,video_count:5};
const response=()=>new Response(JSON.stringify({data:{user:{...profile,access_token:'never-return'}},error:{code:'ok'}}));

test('basic-only consent requests and returns no ungranted profile or statistical fields',async()=>{
  let requested;
  const result=await tikTokUserInfo('private',async(url)=>{requested=new URL(url);return response();});
  assert.deepEqual(requested.searchParams.get('fields').split(','),['open_id','avatar_url','display_name']);
  assert.deepEqual(result,{open_id:'owner',display_name:'Creator'});
});

test('extended profile and statistics use granted scopes and whitelist provider response',async()=>{
  let requested;
  const result=await tikTokUserInfo('private',async(url)=>{requested=new URL(url);return response();},['user.info.basic','user.info.profile','user.info.stats']);
  assert.ok(requested.searchParams.get('fields').includes('follower_count'));
  assert.ok(requested.searchParams.get('fields').includes('profile_deep_link'));
  assert.equal(result.follower_count,100);assert.equal(result.following_count,0);assert.equal(result.is_verified,true);
  assert.equal(result.access_token,undefined);
});

test('missing, negative, or invalid counters are not presented as valid statistics',async()=>{
  const result=await tikTokUserInfo('private',async()=>new Response(JSON.stringify({data:{user:{open_id:'owner',follower_count:-1,following_count:'12',likes_count:0}}})),['user.info.stats']);
  assert.equal(result.follower_count,undefined);assert.equal(result.following_count,undefined);assert.equal(result.video_count,undefined);assert.equal(result.likes_count,0);
});

test('profile sync checks account identity before persisting and sanitizes failure data',async()=>{
  for(const id of ['owner','different-owner']){
    const calls=[];
    const pool={query:async(sql,args)=>{calls.push({sql,args});return {rows:sql.startsWith('WITH due')?[{id:'a',provider_account_id:id,granted_scopes:['user.info.profile'],profile_sync_lease_id:'lease'}]:[]};}};
    await syncDueTikTokProfiles(pool,{},async()=>response(),async()=> 'private-token');
    assert.equal(calls.some(c=>c.sql.includes('SET profile_data')),id==='owner');
    if(id!=='owner')assert.equal(calls.at(-1).args[2],'INVALID_PROFILE');
    assert.equal(JSON.stringify(calls).includes('private-token'),false);
    assert.equal(JSON.stringify(calls).includes('never-return'),false);
  }
});

test('manual profile refresh enforces both workspace and account owner',async()=>{
  const pool={query:async(sql,args)=>{assert.match(sql,/workspace_id=\$2 AND user_id=\$3/);assert.deepEqual(args,['a','foreign','user']);return {rowCount:0};}};
  await assert.rejects(queueTikTokProfileSync(pool,{accountId:'a',workspaceId:'foreign',userId:'user'}),error=>error.status===404);
});

test('read-only profile consent never authorizes upload or direct publishing',async()=>{
  const id='11111111-1111-4111-8111-111111111111';
  for(const mode of ['upload','direct']){
    const pool={query:async(sql)=>sql.includes('FROM generation_jobs')?{rows:[{content_type:'video/mp4',size_bytes:40,parameters:{duration:5}}]}:{rowCount:1,rows:[{id,granted_scopes:['user.info.basic','user.info.profile','user.info.stats']}]}};
    await assert.rejects(createPublishJob(pool,{workspaceId:id,userId:id,accountId:id,generationId:id,mode,privacyLevel:'SELF_ONLY',confirm:true,idempotencyKey:'test'}),error=>error.status===403);
  }
});
