import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptTikTokSecret,decryptTikTokSecret,hashTikTokValue,matchesTikTokOAuthState,createTikTokPkce } from './tiktokCrypto.mjs';
import { exchangeTikTokCode,refreshTikTokToken,verifyTikTokWebhook } from './tiktokApi.mjs';
import { executePublishJob,processTikTokWebhook,validateTikTokVideo } from './tiktokService.mjs';
import { createHash, createHmac } from 'node:crypto';

const env={TIKTOK_CLIENT_KEY:'client',TIKTOK_CLIENT_SECRET:'secret',TIKTOK_TOKEN_ENCRYPTION_KEY:'a'.repeat(64),TIKTOK_ENV:'sandbox'};
const json=(data)=>new Response(JSON.stringify({data,error:{code:'ok',message:''}}),{status:200});
function mp4(){const bytes=Buffer.alloc(52);bytes.writeUInt32BE(16,0);bytes.write('ftyp',4);bytes.write('isom',8);bytes.writeUInt32BE(36,16);bytes.write('moov',20);bytes.writeUInt32BE(28,24);bytes.write('mvhd',28);bytes.writeUInt32BE(1000,44);bytes.writeUInt32BE(5000,48);return bytes;}

test('OAuth exchanges and refreshes credentials server-side using TikTok token endpoint',async()=>{
  const calls=[];const fetcher=async(url,options)=>{calls.push([url,new URLSearchParams(options.body)]);return new Response(JSON.stringify({access_token:'a',refresh_token:'r',open_id:'u',expires_in:3600,refresh_expires_in:10000,scope:'video.upload'}),{status:200});};
  assert.equal((await exchangeTikTokCode('code','https://app/callback',env,fetcher,'desktop-verifier')).access_token,'a');
  assert.equal((await refreshTikTokToken('old',env,fetcher)).refresh_token,'r');
  assert.equal(calls[0][0],'https://open.tiktokapis.com/v2/oauth/token/');
  assert.equal(calls[0][1].get('grant_type'),'authorization_code');
  assert.equal(calls[0][1].get('code_verifier'),'desktop-verifier');
  assert.equal(calls[1][1].get('grant_type'),'refresh_token');
});

test('OAuth state must match the HttpOnly state cookie',()=>{
  assert.equal(matchesTikTokOAuthState('csrf-state','csrf-state'),true);
  assert.equal(matchesTikTokOAuthState('csrf-state','other'),false);
  assert.equal(matchesTikTokOAuthState('csrf-state',undefined),false);
});

test('Desktop OAuth PKCE uses TikTok hex-encoded SHA256 challenge',()=>{
  const {verifier,challenge}=createTikTokPkce();
  assert.match(verifier,/^[A-Za-z0-9._~-]{43,128}$/);
  assert.match(challenge,/^[a-f0-9]{64}$/);
  assert.equal(challenge,createHash('sha256').update(verifier).digest('hex'));
});

test('TikTok token envelope encrypts at rest and authenticates tampering',()=>{
  const token=encryptTikTokSecret('private-token',env);assert.equal(decryptTikTokSecret(token,env),'private-token');
  assert.throws(()=>decryptTikTokSecret(`${token.slice(0,-2)}xx`,env));
});

test('publish validation checks MP4/MOV signature and actual duration',()=>{
  const bytes=mp4();
  assert.equal(validateTikTokVideo(bytes,'video/mp4',10),5);
  assert.throws(()=>validateTikTokVideo(bytes,'video/mp4',4),/longer/);
  assert.throws(()=>validateTikTokVideo(Buffer.alloc(20,'x'),'video/mp4',10),/valid MP4/);
});

test('webhook signature rejects tampered and stale callbacks',async()=>{
  const body='{"event":"post.publish.complete"}',timestamp=String(Math.floor(Date.now()/1000));
  const sig=createHmac('sha256','secret').update(`${timestamp}.${body}`).digest('hex');
  assert.equal(await verifyTikTokWebhook(body,`t=${timestamp},s=${sig}`,'secret'),true);
  assert.equal(await verifyTikTokWebhook(body+' ',`t=${timestamp},s=${sig}`,'secret'),false);
  assert.equal(await verifyTikTokWebhook(body,`t=1,s=${sig}`,'secret'),false);
});

test('publish worker retries a transient TikTok upload failure without exposing credentials',async()=>{
  const updates=[];
  const job={id:'j',workspace_id:'w',social_account_id:'s',generation_job_id:'g',asset_id:'a',mode:'upload',attempts:0,caption:'',provider_publish_id:null,upload_url_encrypted:null};
  const pool={async query(sql,values){
    if(sql.includes("SET status='uploading'"))return {rows:[job]};
    if(sql.includes('FROM assets'))return {rows:[{storage_key:'key',content_type:'video/mp4',size_bytes:52}]};
    if(sql.includes('SELECT provider_publish_id'))return {rows:[{provider_publish_id:'p'}]};
    updates.push([sql,values]);return {rows:[]};
  }};
  const bytes=mp4();
  const calls=[];const fetcher=async(url,options)=>{calls.push([url,options]);return options.method==='PUT'?new Response('',{status:503,headers:{'retry-after':'1'}}):json({publish_id:'p',upload_url:'https://open-upload.tiktokapis.com/upload?id=x'});};
  await executePublishJob(pool,{createDownloadUrl:async()=>({url:'local://download'}),get:async()=>({body:bytes})},'j',env,fetcher,async()=> 'access');
  assert.equal(calls.length,2);assert.equal(calls[1][1].headers['content-range'],'bytes 0-51/52');
  assert.equal(updates.at(-1)[1][1],'queued');
  assert.equal(JSON.stringify(updates).includes('access'),false);
});

test('webhook delivery deduplicates repeated event payloads',async()=>{
  const seen=new Set();let inserted=0;
  const pool={async connect(){return {async query(sql,args=[]){
    if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK')return {rows:[]};
    if(sql.includes('SELECT id FROM social_publish_events')){const rows=seen.has(args[0])?[{id:'e'}]:[];return {rows,rowCount:rows.length};}
    if(sql.includes('SELECT id FROM social_accounts'))return {rows:[]};
    if(sql.includes('SELECT id,social_account_id FROM social_publish_jobs'))return {rows:[]};
    if(sql.includes('INSERT INTO social_publish_events')){seen.add(args[3]);inserted++;return {rows:[]};}
    return {rows:[]};
  },release(){}};}};
  const event={event:'post.publish.complete',content:{publish_id:'p'}};const raw=JSON.stringify(event);
  assert.deepEqual(await processTikTokWebhook(pool,event,raw),{duplicate:false});
  assert.deepEqual(await processTikTokWebhook(pool,event,raw),{duplicate:true});
  assert.equal(inserted,1);assert.equal(hashTikTokValue(raw),[...seen][0]);
});
