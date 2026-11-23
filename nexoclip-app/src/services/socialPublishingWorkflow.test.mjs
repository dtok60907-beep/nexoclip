import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSocialSchedule } from '../lib/socialSchedule.mjs';
import { actOnSocialPublishJob } from './socialPublishActions.mjs';
import { normalizeSocialDraft, saveSocialPublishDraft, getSocialPublishDraft, deleteSocialPublishDraft } from './socialPublishDrafts.mjs';
import { createPublishJob, executePublishJob } from './tiktokService.mjs';
import { encryptTikTokSecret } from './tiktokCrypto.mjs';

const id='11111111-1111-4111-8111-111111111111';
const env={TIKTOK_TOKEN_ENCRYPTION_KEY:'a'.repeat(64),TIKTOK_ENV:'sandbox'};
const owner={workspaceId:id,userId:id};
const json=data=>new Response(JSON.stringify({data,error:{code:'ok'}}));
const content={mediaType:'video',generationId:id,mode:'upload',caption:'Draft',photoCoverIndex:0,
  disableComment:true,disableDuet:true,disableStitch:true,brandContentToggle:false,brandOrganicToggle:false,
  autoAddMusic:false,isAigc:true,scheduleEnabled:false};

test('schedules require an offset, valid zone and a future time within 30 days',()=>{
  const now=Date.parse('2026-11-15T00:00:00Z');
  assert.deepEqual(validateSocialSchedule('2026-11-15T08:00:00+07:00','Asia/Jakarta',now),{scheduledAt:'2026-11-15T01:00:00.000Z',timeZone:'Asia/Jakarta'});
  for(const [date,zone] of [['2026-11-15T08:00','Asia/Jakarta'],['invalid','UTC'],['2026-11-15T00:00:10Z','UTC'],['2027-01-15T00:00:00Z','UTC'],['2026-11-15T01:00:00Z','Moon/Base']])assert.throws(()=>validateSocialSchedule(date,zone,now));
  assert.deepEqual(validateSocialSchedule(null,null,now),{scheduledAt:null,timeZone:null});
});

test('video schedules bind UTC and timezone and keep scheduling in the idempotency hash',async()=>{
  const writes=[];let firstHash;
  const pool={query:async(sql,args)=>{
    if(sql.includes('FROM generation_jobs'))return {rows:[{asset_id:id,content_type:'video/mp4',size_bytes:52}]};
    if(sql.includes('SELECT id,granted_scopes'))return {rowCount:1,rows:[{granted_scopes:['video.upload']}]};
    writes.push(args);firstHash??=args[7];return {rows:[{id,status:args[15],request_hash:firstHash}]};
  }};
  const input={...owner,accountId:id,generationId:id,mode:'upload',confirm:true,idempotencyKey:'scheduled',scheduledAt:new Date(Date.now()+3600000).toISOString(),timeZone:'Asia/Jakarta'};
  assert.equal((await createPublishJob(pool,input)).status,'scheduled');
  assert.equal(writes[0][16],input.scheduledAt);assert.equal(writes[0][17],'Asia/Jakarta');
  await assert.rejects(createPublishJob(pool,{...input,scheduledAt:new Date(Date.now()+7200000).toISOString()}),e=>e.status===409);
});

test('draft normalization strips consent, URLs, tokens and arbitrary properties',()=>{
  const normalized=normalizeSocialDraft({...content,confirm:true,idempotencyKey:'sent',access_token:'do-not-store',url:'https://evil.example'});
  for(const key of ['confirm','idempotencyKey','access_token','url'])assert.equal(key in normalized,false);
  assert.throws(()=>normalizeSocialDraft({...content,assetIds:[id,id],mediaType:'photo'}));
  assert.throws(()=>normalizeSocialDraft({...content,caption:'x'.repeat(2201)}));
});

test('draft ownership and optimistic versions are enforced before updating or deleting',async()=>{
  const queries=[];
  const pool={query:async(sql,args)=>{queries.push([sql,args]);if(sql.includes('FROM generation_jobs'))return {rows:[{id,asset_id:id}]};return {rows:[],rowCount:0};}};
  await assert.rejects(saveSocialPublishDraft(pool,owner,{id,version:1,content}),e=>e.status===409);
  assert.deepEqual(queries.at(-1)[1].slice(0,3),[id,id,id]);assert.equal(queries.at(-1)[1][4],1);
  await assert.rejects(getSocialPublishDraft(pool,owner,id),e=>e.status===404);
  await assert.rejects(deleteSocialPublishDraft(pool,owner,id,1),e=>e.status===409);
  assert.match(queries.at(-1)[0],/workspace_id=\$2 AND user_id=\$3 AND version=\$4/);
});

test('scheduled cancellation is conditional on state and never calls TikTok',async()=>{
  const queries=[];
  const pool={query:async(sql,args)=>{queries.push([sql,args]);return {rows:[{id,status:'cancelled'}],rowCount:1};}};
  assert.equal((await actOnSocialPublishJob(pool,{...owner,jobId:id,action:'cancel'},{fetcher:()=>assert.fail('No TikTok call')})).status,'cancelled');
  assert.match(queries[0][0],/status='scheduled' AND provider_publish_id IS NULL/);
  assert.deepEqual(queries[0][1].slice(0,3),[id,id,id]);
});

test('manual review with no publish ID refuses to resend or touch TikTok',async()=>{
  const pool={query:async sql=>({rows:sql.includes('RETURNING *')?[]:[{id,status:'needs_review',can_check_status:false}]})};
  await assert.rejects(actOnSocialPublishJob(pool,{...owner,jobId:id,action:'resume'},{fetcher:()=>assert.fail('No init')}),e=>e.status===409&&/cannot be safely resent/.test(e.message));
});

test('manual status check preserves incomplete video upload; resume queues the same request',async()=>{
  for(const [action,expected] of [['check','needs_review'],['resume','queued']]){
    const writes=[],calls=[];
    const pool={query:async(sql,args)=>{
      if(sql.includes('RETURNING *'))return {rows:[{id,mode:'direct',provider_publish_id:'existing',upload_url_encrypted:'encrypted',next_poll_at:'lease'}]};
      writes.push([sql,args]);return {rows:[{id,status:expected}]};
    }};
    await actOnSocialPublishJob(pool,{...owner,jobId:id,action},{getToken:async()=> 'private',fetcher:async url=>{calls.push(url);return json({status:'PROCESSING_UPLOAD',uploaded_bytes:10});}});
    assert.equal(calls.length,1);assert.match(calls[0],/status\/fetch/);assert.equal(writes[0][1][1],expected);
    assert.match(writes[0][0],/status='needs_review' AND next_poll_at=\$6/);
  }
});

test('manual review resolves completed posts; expired status checks preserve review and sanitize errors',async()=>{
  const writes=[];
  const pool={query:async(sql,args)=>{if(sql.includes('RETURNING *'))return {rows:[{id,mode:'direct',provider_publish_id:'existing',next_poll_at:'lease'}]};writes.push([sql,args]);return {rows:[{id}]};}};
  await actOnSocialPublishJob(pool,{...owner,jobId:id,action:'check'},{getToken:async()=> 'private',fetcher:async()=>json({status:'PUBLISH_COMPLETE',publicaly_available_post_id:['9999999999999999999']})});
  assert.equal(writes[0][1][1],'published');assert.deepEqual(writes[0][1][4],['9999999999999999999']);
  await assert.rejects(actOnSocialPublishJob(pool,{...owner,jobId:id,action:'check'},{getToken:async()=>{throw new Error('unavailable https://private.example/token');}}),e=>e.status===502);
  assert.equal(JSON.stringify(writes).includes('private.example'),false);
});

function movie(size){
  const bytes=Buffer.alloc(size);bytes.writeUInt32BE(16,0);bytes.write('ftyp',4);bytes.write('isom',8);
  bytes.writeUInt32BE(36,16);bytes.write('moov',20);bytes.writeUInt32BE(28,24);bytes.write('mvhd',28);bytes.writeUInt32BE(1000,44);bytes.writeUInt32BE(5000,48);
  if(size>52){bytes.writeUInt32BE(size-52,52);bytes.write('mdat',56);}return bytes;
}
test('multipart recovery uploads only the remaining bytes of the existing TikTok request',async()=>{
  const bytes=movie(25*1024*1024+123),chunk=10*1024*1024,calls=[],writes=[];
  const job={id,workspace_id:id,user_id:id,social_account_id:id,generation_job_id:id,asset_id:id,mode:'upload',provider_publish_id:'existing',upload_url_encrypted:encryptTikTokSecret('https://open-upload.tiktokapis.com/video/?upload_token=private',env)};
  const pool={query:async(sql,args)=>{writes.push([sql,args]);if(sql.includes("SET status='uploading'"))return {rows:[job]};if(sql.includes('FROM assets'))return {rows:[{storage_key:'video',size_bytes:bytes.length,content_type:'video/mp4'}]};return {rows:[]};}};
  await executePublishJob(pool,{createDownloadUrl:async()=>({url:'local://video'}),get:async()=>({body:bytes})},id,env,async(url,options)=>{
    calls.push([url,options]);if(url.includes('/status/fetch/'))return json({status:'PROCESSING_UPLOAD',uploaded_bytes:chunk});
    assert.equal(options.method,'PUT');assert.equal(options.headers['content-range'],`bytes ${chunk}-${bytes.length-1}/${bytes.length}`);assert.equal(options.body.length,bytes.length-chunk);return new Response(null,{status:201});
  },async()=> 'private');
  assert.equal(calls.length,2);assert.equal(calls.some(([url])=>url.includes('/init/')),false);
  assert.match(writes.at(-1)[0],/status='processing'/);
});

test('scheduled worker rejects lost permissions before storage access or submission',async()=>{
  const writes=[];
  const pool={query:async(sql,args)=>{writes.push([sql,args]);return {rows:sql.includes("SET status='uploading'")?[{id,workspace_id:id,user_id:id,social_account_id:id,mode:'upload'}]:[]};}};
  await executePublishJob(pool,{get:()=>assert.fail('No media read')},id,env,()=>assert.fail('No API call'),()=>assert.fail('No token read'));
  assert.equal(writes.at(-1)[1][1],'failed');assert.match(writes.at(-1)[1][2],/Reconnect/);
});
