import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublishJob,executePublishJob,pollTikTokPublishJobs,getMp4DurationSeconds } from './tiktokService.mjs';
import { createPhotoPublishJob,executePhotoPublishJob } from './tiktokPhotoPublishing.mjs';
import { videoUploadPlan,uploadChunkEnd,verifiedPhotoUrl,publicPostIds,publishState } from './tiktokPublishMedia.mjs';
const id='11111111-1111-4111-8111-111111111111',imageId='22222222-2222-4222-8222-222222222222';
const env={TIKTOK_ENV:'sandbox',R2_PUBLIC_URL:'https://assets.example.com',R2_BUCKET_NAME:'bucket',R2_ACCOUNT_ID:'account',R2_ACCESS_KEY_ID:'key',R2_SECRET_ACCESS_KEY:'secret',TIKTOK_VERIFIED_MEDIA_PREFIXES:'https://assets.example.com/approved/'};
const json=data=>new Response(JSON.stringify({data,error:{code:'ok'}}));

test('video job insert binds the persisted output asset ID before the mode',async()=>{
  let inserted;
  const pool={query:async(sql,args)=>{
    if(sql.includes('FROM generation_jobs')){assert.match(sql,/g.created_by_user_id=\$2/);return {rows:[{asset_id:imageId,content_type:'video/mp4',size_bytes:40}]};}
    if(sql.includes('SELECT id,granted_scopes'))return {rowCount:1,rows:[{id,granted_scopes:['video.upload']}]};
    inserted=args;return {rows:[{id,status:'queued',request_hash:args[7]}]};
  }};
  await createPublishJob(pool,{workspaceId:id,userId:id,accountId:id,generationId:id,mode:'upload',confirm:true,idempotencyKey:'once'});
  assert.equal(inserted[4],imageId);assert.equal(inserted[5],'upload');assert.equal(inserted.length,15);
});

test('chunk plans merge trailing bytes into the final chunk and match TikTok floor count',()=>{
  const MB=1024*1024;
  for(const size of [40,4*MB,10*MB+1,50_000_123,64*MB+1,500*MB]){
    const plan=videoUploadPlan(size);let start=0,count=0;
    while(start<size){const end=uploadChunkEnd(start,size,plan.chunk_size),length=end-start;assert.ok(length>0&&length<=128*MB);if(end<size)assert.ok(length>=5*MB&&length<=64*MB);start=end;count++;}
    assert.equal(count,plan.total_chunk_count);assert.equal(start,size);
  }
});

test('64-bit movie duration uses version 1 time offsets and rejects truncated data',()=>{
  const bytes=Buffer.alloc(64);bytes.writeUInt32BE(16,0);bytes.write('ftyp',4);bytes.write('isom',8);bytes.writeUInt32BE(48,16);bytes.write('moov',20);bytes.writeUInt32BE(40,24);bytes.write('mvhd',28);bytes[32]=1;bytes.writeUInt32BE(1000,52);bytes.writeBigUInt64BE(5000n,56);
  assert.equal(getMp4DurationSeconds(bytes),5);
  assert.throws(()=>getMp4DurationSeconds(bytes.subarray(0,35)),/invalid/);
  const fake=Buffer.alloc(12);fake.writeUInt32BE(12,0);fake.write('mdat',4);fake.write('mvhd',8);
  assert.equal(getMp4DurationSeconds(Buffer.concat([bytes.subarray(0,16),fake,bytes.subarray(16)])),5);
});

test('verified photo prefixes reject lookalike origins, paths, signed URLs and loopback',()=>{
  assert.equal(verifiedPhotoUrl('https://assets.example.com/approved/image.jpg',env),'https://assets.example.com/approved/image.jpg');
  for(const url of ['https://assets.example.com.evil/approved/a.jpg','https://assets.example.com/approved-other/a.jpg','https://assets.example.com/approved/a.jpg?token=x','http://assets.example.com/approved/a.jpg','https://127.0.0.1/a.jpg'])assert.throws(()=>verifiedPhotoUrl(url,env));
});

test('verified domain ownership covers subdomains with a strict hostname boundary',()=>{
  const domainEnv={TIKTOK_VERIFIED_MEDIA_DOMAINS:'nexoclip.com'};
  assert.equal(verifiedPhotoUrl('https://assets.nexoclip.com/image.jpg',domainEnv),'https://assets.nexoclip.com/image.jpg');
  assert.equal(verifiedPhotoUrl('https://nexoclip.com/image.jpg',domainEnv),'https://nexoclip.com/image.jpg');
  for(const url of ['https://nexoclip.com.evil/image.jpg','https://fakenexoclip.com/image.jpg','https://assets.nexoclip.com:8080/image.jpg'])assert.throws(()=>verifiedPhotoUrl(url,domainEnv));
});

function photoPool({missing=false}={}){
  const calls=[];
  const query=async(sql,args=[])=>{
    calls.push({sql,args});
    if(sql.includes('SELECT granted_scopes'))return {rowCount:1,rows:[{granted_scopes:['video.upload']}]};
    if(sql.startsWith('SELECT id,content_type'))return {rowCount:missing?0:2,rows:missing?[]:[{id,content_type:'image/png',size_bytes:4},{id:imageId,content_type:'image/webp',size_bytes:4}]};
    if(sql.includes('INSERT INTO social_publish_jobs'))return {rows:[{id,status:'queued',request_hash:args[6]}]};
    return {rows:[],rowCount:1};
  };
  return {calls,pool:{query,connect:async()=>({query,release(){}})}};
}
const photoInput={workspaceId:id,userId:id,accountId:id,assetIds:[id,imageId],mode:'upload',confirm:true,idempotencyKey:'photos'};
test('photo queue preserves carousel order with tenant-scoped asset lookup',async()=>{
  const {calls,pool}=photoPool();const readyEnv={...env,TIKTOK_VERIFIED_MEDIA_PREFIXES:'https://assets.example.com/'};
  await createPhotoPublishJob(pool,photoInput,readyEnv);
  const lookup=calls.find(c=>c.sql.startsWith('SELECT id,content_type'));assert.deepEqual(lookup.args,[id,[id,imageId]]);
  assert.deepEqual(calls.filter(c=>c.sql.includes('INSERT INTO social_publish_media')).map(c=>[c.args[2],c.args[3]]),[[id,0],[imageId,1]]);
  assert.equal(calls.at(-1).sql,'COMMIT');
});
test('photos reject unavailable media, duplicate selections and unverified domains before posting',async()=>{
  const readyEnv={...env,TIKTOK_VERIFIED_MEDIA_PREFIXES:'https://assets.example.com/'};
  await assert.rejects(createPhotoPublishJob(photoPool().pool,{...photoInput,assetIds:[id,id]},readyEnv),e=>e.status===400);
  const missing=photoPool({missing:true});await assert.rejects(createPhotoPublishJob(missing.pool,photoInput,readyEnv),e=>e.status===400);assert.equal(missing.calls.at(-1).sql,'ROLLBACK');
  await assert.rejects(createPhotoPublishJob(photoPool().pool,photoInput,env),e=>e.status===409);
});
test('photo worker uses documented PHOTO endpoint and stores provider ID without a video upload',async()=>{
  const calls=[],writes=[];
  const job={id,workspace_id:id,mode:'upload',photo_title:'Photos',caption:'Caption',photo_cover_index:1};
  const pool={query:async(sql,args)=>{writes.push({sql,args});return {rows:sql.includes('FROM social_publish_media')?[{storage_key:'one',size_bytes:4,position:0},{storage_key:'two',size_bytes:4,position:1}]:[]};}};
  const source={createDownloadUrl:async({key})=>({url:`local://${key}`}),get:async(url)=>{assert.match(url,/^local:/);return {body:Buffer.from('data')};}};
  const exporter={publicUrl:'https://assets.example.com/approved',put:async(key,body,type)=>{assert.equal(type,'image/jpeg');return `https://assets.example.com/approved/${key}`;}};
  await executePhotoPublishJob(pool,source,job,'private',env,async(url,options)=>{calls.push({url,options});return options.method==='HEAD'?new Response(null,{status:200}):json({publish_id:'photo-publish'});},{photoStorage:exporter,convert:async()=>Buffer.from('jpeg')});
  const request=calls.find(c=>c.url.includes('/content/init/'));
  const body=JSON.parse(request.options.body);assert.equal(body.media_type,'PHOTO');assert.equal(body.post_mode,'MEDIA_UPLOAD');assert.equal(body.source_info.photo_images.length,2);assert.equal(body.source_info.photo_cover_index,1);assert.equal(body.post_info.description,'Caption');
  assert.equal(writes.at(-1).args[1],'photo-publish');assert.equal(calls.some(c=>c.options.method==='PUT'),false);
});

test('a recovered video publish ID is polled rather than initialized a second time',async()=>{
  const calls=[],writes=[];
  const job={id,workspace_id:id,social_account_id:id,mode:'direct',provider_publish_id:'existing',upload_url_encrypted:null};
  const pool={query:async(sql,args)=>{writes.push({sql,args});return {rows:sql.includes("SET status='uploading'")?[job]:[]};}};
  await executePublishJob(pool,{},id,{},async(url)=>{calls.push(url);return json({status:'PUBLISH_COMPLETE'});},async()=> 'private');
  assert.equal(calls.length,1);assert.match(calls[0],/status\/fetch/);assert.equal(writes.at(-1).args[1],'published');
});

test('documented inbox and private/public completion statuses remain distinct',async()=>{
  assert.equal(publishState({status:'SEND_TO_USER_INBOX'},'upload'),'awaiting_creator');
  assert.equal(publishState({status:'PUBLISH_COMPLETE'},'direct'),'published');
  assert.throws(()=>publishState({status:'UNKNOWN'},'direct'),/unknown/);
  assert.deepEqual(publicPostIds({publicaly_available_post_id:['9999999999999999999',9007199254740992]}),['9999999999999999999']);
  const writes=[];
  const pool={query:async(sql,args)=>{writes.push({sql,args});return {rows:sql.startsWith('WITH due')?[{id,mode:'upload',provider_publish_id:'p',social_account_id:id}]:[]};}};
  await pollTikTokPublishJobs(pool,{},async()=>json({status:'SEND_TO_USER_INBOX'}),async()=> 'private');
  assert.equal(writes.at(-1).args[1],'awaiting_creator');assert.equal(writes.at(-1).args[4],60);
});
