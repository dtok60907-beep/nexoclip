import test from 'node:test';
import assert from 'node:assert/strict';
import { queryTikTokVideos } from './tiktokVideoQuery.mjs';
const id='11111111-1111-4111-8111-111111111111';
const input={accountId:id,workspaceId:'workspace',userId:'user',videoIds:['9999999999999999999']};
const json=videos=>new Response(JSON.stringify({data:{videos},error:{code:'ok'}}));
test('video/query uses exact string IDs, scoped credentials, and metadata upserts',async()=>{
  const calls=[];let request;
  const query=async(sql,args)=>{calls.push({sql,args});return {rowCount:1,rows:sql.startsWith('SELECT posts_sync_run_id')?[{}]:[{id}]};};
  const pool={query,connect:async()=>({query,release(){}})};
  const result=await queryTikTokVideos(pool,input,{},async(url,options)=>{request={url,body:JSON.parse(options.body)};return json([{id:input.videoIds[0],create_time:1700000000,title:'Updated',view_count:200}]);},async()=> 'private-token');
  assert.match(request.url,/\/v2\/video\/query\//);assert.deepEqual(request.body,{filters:{video_ids:input.videoIds}});
  assert.deepEqual(calls[0].args,[id,'workspace','user']);assert.match(calls[0].sql,/workspace_id=\$2 AND user_id=\$3/);
  const write=calls.find(c=>c.sql.includes('INSERT INTO social_posts'));assert.equal(JSON.parse(write.args[11]).view_count,200);assert.equal(JSON.stringify(calls).includes('private-token'),false);
  assert.deepEqual(result.refreshedIds,input.videoIds);
});
test('video queries reject more than 20 IDs, numeric IDs, unowned accounts, or unexpected provider IDs',async()=>{
  for(const videoIds of [[],Array(21).fill('1'),[123]])await assert.rejects(queryTikTokVideos({}, {...input,videoIds}),e=>e.status===400);
  await assert.rejects(queryTikTokVideos({query:async()=>({rowCount:0})},input),e=>e.status===404);
  await assert.rejects(queryTikTokVideos({query:async()=>({rowCount:1})},input,{},async()=>json([{id:'different',create_time:1700000000}]),async()=> 'private'),e=>e.status===502);
});
