import test from 'node:test';
import assert from 'node:assert/strict';
import { syncDueTikTokPosts } from './tiktokPostSync.mjs';
import { queueTikTokPostSync, listTikTokPosts } from '../repositories/tiktokPostsRepository.mjs';

const account={id:'a',workspace_id:'w',user_id:'u',posts_sync_lease_id:'lease',posts_sync_run_id:'run',posts_sync_cursor:null};
function fixture(value=account) {
  const calls=[];
  const query=async(sql,args=[])=>{
    calls.push({sql,args});
    if(sql.startsWith('WITH due'))return {rows:value?[value]:[],rowCount:value?1:0};
    if(sql.startsWith('SELECT id FROM social_accounts'))return {rows:[{id:'a'}],rowCount:1};
    return {rows:[],rowCount:1};
  };
  return {calls,pool:{query,connect:async()=>({query,release(){}})}};
}
const response=data=>new Response(JSON.stringify({data,error:{code:'ok'}}));

test('sync saves phone posts using account ownership and queues the next cursor',async()=>{
  const {pool,calls}=fixture();let sent;
  await syncDueTikTokPosts(pool,{},async(url,options)=>{
    sent={url,body:JSON.parse(options.body)};
    return response({videos:[{id:'9999999999999999999',title:'From phone',create_time:1700000000}],has_more:true,cursor:123});
  },async()=> 'secret-access');
  assert.match(sent.url,/\/v2\/video\/list\/\?fields=/);
  assert.deepEqual(sent.body,{max_count:20});
  const insert=calls.find(c=>c.sql.startsWith('INSERT INTO social_posts'));
  assert.deepEqual(insert.args.slice(0,4),['w','u','a','9999999999999999999']);
  assert.match(insert.sql,/ON CONFLICT\(social_account_id,provider_post_id\)/);
  assert.equal(calls.find(c=>c.sql.startsWith('UPDATE social_accounts SET posts_sync_cursor')).args[2],123);
  assert.equal(calls.some(c=>c.sql.includes('SET is_available=false')),false);
  assert.equal(JSON.stringify(calls).includes('secret-access'),false);
});

test('final page refreshes public availability only after a successful full crawl',async()=>{
  const {pool,calls}=fixture({...account,posts_sync_cursor:'123'});
  await syncDueTikTokPosts(pool,{},async(url,options)=>{
    assert.equal(JSON.parse(options.body).cursor,123);
    return response({videos:[],has_more:false,cursor:0});
  },async()=> 'token');
  assert.ok(calls.find(c=>c.sql.includes('SET is_available=false')));
  assert.equal(calls.at(-1).sql,'COMMIT');
});

test('rate limits and broken pagination preserve the cursor and retry without marking posts unavailable',async()=>{
  for(const rateLimit of [true,false]){
    const {pool,calls}=fixture({...account,posts_sync_cursor:'123'});
    await syncDueTikTokPosts(pool,{},async()=>rateLimit
      ?new Response(JSON.stringify({error:{code:'rate_limit_exceeded',message:'private provider details'}}),{status:429,headers:{'retry-after':'120'}})
      :response({videos:[],has_more:true,cursor:123}),async()=> 'token');
    const failure=calls.find(c=>c.sql.includes('SET posts_sync_error'));
    assert.equal(failure.args[2],rateLimit?'rate_limit_exceeded':'INVALID_VIDEO_LIST');
    assert.equal(failure.args[3],rateLimit?120:300);
    assert.equal(calls.some(c=>c.sql.includes('SET is_available=false')),false);
    assert.equal(JSON.stringify(calls).includes('private provider details'),false);
  }
});

test('manual sync cannot queue another tenant account; missing permission requests reconnect',async()=>{
  for(const exists of [false,true]){
    const calls=[];
    const pool={query:async(sql,args)=>{calls.push({sql,args});return {rows:[],rowCount:sql.startsWith('SELECT')&&exists?1:0};}};
    await assert.rejects(queueTikTokPostSync(pool,{accountId:'a',workspaceId:'other-workspace',userId:'other-user'}),error=>error.status===(exists?409:404));
    for(const call of calls){assert.match(call.sql,/workspace_id=\$2 AND user_id=\$3/);assert.deepEqual(call.args,['a','other-workspace','other-user']);}
  }
});

test('post reads are scoped by workspace and user with bounded pages',async()=>{
  let requested;
  const result=await listTikTokPosts({query:async(sql,args)=>{requested={sql,args};return {rows:Array.from({length:51},(_,id)=>({id}))};}},{workspaceId:'w',userId:'u',offset:50});
  assert.match(requested.sql,/p.workspace_id=\$1 AND p.user_id=\$2/);
  assert.deepEqual(requested.args,['w','u',50]);
  assert.equal(result.posts.length,50);assert.equal(result.nextOffset,100);
});
