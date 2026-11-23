import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { instagramToken,instagramMediaPage,validateInstagramPublish,instagramJpeg,processInstagramJob,prepareInstagramMedia,instagramErrorCode,retryableInstagramStorageError } from './instagramService.mjs';
import { metaPost,metaGet } from '../providers/meta/adapter.mjs';
import { encryptMetaToken } from './metaCrypto.mjs';
import { instagramHandler } from './instagramRoutes.mjs';
const env={META_APP_ID:'123',META_LOGIN_CONFIG_ID:'456',META_APP_SECRET:'test-secret',META_REDIRECT_URI:'https://dev.example/auth/meta/callback',META_TOKEN_ENCRYPTION_KEY:'c'.repeat(64)};
const id=randomUUID(),workspaceId=randomUUID(),userId=randomUUID(),assetId=randomUUID();
const account={id,workspace_id:workspaceId,user_id:userId,provider_account_id:'777',app_id:'123',granted_scopes:['instagram_basic','instagram_content_publish'],status:'connected',integration_status:'connected',access_token_encrypted:encryptMetaToken('test-token',env)};
const input={accountId:id,workspaceId,userId,mediaType:'photo',assetIds:[assetId],caption:'Test',confirm:true,idempotencyKey:'test-key'};
const json=data=>new Response(JSON.stringify(data));
test('Instagram validates confirmation, caption, media IDs, counts, distinctness and idempotency',()=>{
  assert.equal(validateInstagramPublish(input),validateInstagramPublish({...input}));
  for(const patch of [{confirm:false},{assetIds:[]},{assetIds:[assetId,assetId]},{assetIds:Array.from({length:21},()=>randomUUID())},{caption:'a'.repeat(2201)},{caption:Array(31).fill('#tag').join(' ')},{mediaType:'video'},{idempotencyKey:''},{accountId:'not-an-id'}])assert.throws(()=>validateInstagramPublish({...input,...patch}));
  assert.notEqual(validateInstagramPublish(input),validateInstagramPublish({...input,caption:'Changed'}));
});
test('Instagram credentials require current consent, connection, matching app and unexpired access',()=>{
  assert.equal(instagramToken(account,env,'instagram_content_publish'),'test-token');
  for(const patch of [{status:'disconnected'},{integration_status:'disconnected'},{granted_scopes:['instagram_basic']},{app_id:'other'},{access_expires_at:new Date(0)}])assert.throws(()=>instagramToken({...account,...patch},env,'instagram_content_publish'));
});
test('Instagram page keeps IDs as strings, handles missing video URLs/counters and rejects bad cursors',()=>{
  const p={id:'99999999999999999999',media_type:'VIDEO',media_product_type:'REELS',timestamp:'2026-11-17T01:00:00Z',permalink:'https://www.instagram.com/reel/example/',like_count:4};
  const page=instagramMediaPage({data:[p]},null);assert.equal(page.posts[0].id,p.id);assert.equal(page.posts[0].coverUrl,null);assert.deepEqual(page.posts[0].metrics,{like_count:4});
  assert.equal(instagramMediaPage({data:[{...p,media_type:'CAROUSEL_ALBUM',children:{data:[{id:'123',media_type:'IMAGE',media_url:'https://cdn.example/photo.jpg'}]}}]},null).posts[0].coverUrl,'https://cdn.example/photo.jpg');
  for(const data of [{data:[{...p,id:123}]},{data:[{...p,timestamp:'wrong'}]},{data:[],paging:{next:'https://evil.example/token'}},{data:[],paging:{next:'https://evil',cursors:{after:'same'}}}])assert.throws(()=>instagramMediaPage(data,'same'));
});
test('Meta POST keeps credentials out of URLs and safely distinguishes personal accounts from permission errors',async()=>{
  await metaPost('/777/media','test-token',{caption:'Hello',image_url:'https://cdn.example/image.jpg'},env,async(url,options)=>{
    assert.equal(url,'https://graph.facebook.com/v27.0/777/media');assert.equal(options.method,'POST');assert.equal(options.headers.authorization,'Bearer test-token');assert.equal(new URLSearchParams(options.body).get('caption'),'Hello');assert.ok(new URLSearchParams(options.body).get('appsecret_proof'));return json({id:'123'});
  });
  await assert.rejects(metaGet('/777','test-token',{},env,async()=>json({error:{code:10,message:'Access is denied because instagram account type is not business or creator.'}})),e=>e.code==='META_PROFESSIONAL_REQUIRED');
  await assert.rejects(metaGet('/777','test-token',{},env,async()=>json({error:{code:10,message:'Missing another permission'}})),e=>e.code==='META_PERMISSION_REQUIRED');
});
test('photo conversion preserves content within a compliant sRGB square JPEG',async()=>{
  const {default:sharp}=await import('sharp');const bytes=await sharp({create:{width:240,height:600,channels:4,background:'#123456'}}).png().toBuffer();
  const image=await instagramJpeg(bytes),meta=await sharp(image).metadata();assert.equal(meta.format,'jpeg');assert.equal(meta.width,1080);assert.equal(meta.height,1080);assert.ok(image.length<8*1024*1024);
  await assert.rejects(prepareInstagramMedia({}, {publicUrl:'http://localhost'}, {media_type:'photo'}, []));
});
function fixture({container=null,state={urls:['https://cdn.example/1.jpg']},status='FINISHED'}={}){
  const job={id:randomUUID(),workspace_id:workspaceId,user_id:userId,social_account_id:id,media_type:'photo',provider_publish_id:container,provider_state:state,caption:'Test',attempts:1,created_at:new Date()},queries=[],calls=[];
  const pool={query:async(sql,args)=>{queries.push({sql,args});if(sql.includes('RETURNING j.*'))return {rows:[job]};if(sql.includes('access_token_encrypted'))return {rows:[account]};return {rows:[],rowCount:1};}};
  const fetcher=async(url,options)=>{const u=new URL(url);calls.push({url:u,options});return options.method==='POST'?json({id:'888'}):json({status_code:status});};
  return {pool,queries,calls,fetcher,job};
}
test('durable publish creates a container before publishing and persists its ID',async()=>{
  const f=fixture();await processInstagramJob(f.pool,{},env,f.fetcher);assert.equal(f.calls.length,1);assert.match(f.calls[0].url.pathname,/\/777\/media$/);assert.ok(f.queries.some(q=>q.sql.includes('provider_publish_id=$2')&&q.args[1]==='888'));assert.ok(!f.calls.some(c=>c.url.pathname.endsWith('media_publish')));
});
test('ready container publishes once after durable intent and queues post sync',async()=>{
  const f=fixture({container:'123'});await processInstagramJob(f.pool,{},env,f.fetcher);assert.equal(f.calls.filter(c=>c.options.method==='POST').length,1);const intent=f.queries.findIndex(q=>q.sql.includes('provider_state=$2::jsonb'));const result=f.queries.findIndex(q=>q.sql.includes('public_post_ids=ARRAY'));assert.ok(intent>=0&&result>intent);assert.ok(f.queries.some(q=>q.sql.includes('posts_next_sync_at=now()')));
});
test('ambiguous media_publish only polls the original container and never sends a second post',async()=>{
  const f=fixture({container:'123'});await processInstagramJob(f.pool,{},env,async(url,options)=>{if(options.method==='POST')throw new Error('Lost response with secret');return json({status_code:'FINISHED'});});
  const saved=f.queries.filter(q=>q.sql.includes('status=$2,provider_state')).at(-1);assert.equal(saved.args[1],'processing');assert.equal(JSON.parse(saved.args[2]).publishAttempted,true);assert.equal(saved.args[3],'META_NETWORK_ERROR');
  const resumed=fixture({container:'123',state:{urls:['https://cdn.example/1.jpg'],publishAttempted:true}});await processInstagramJob(resumed.pool,{},env,resumed.fetcher);assert.equal(resumed.calls.filter(c=>c.options.method==='POST').length,0);assert.equal(resumed.queries.at(-1).args[1],'needs_review');
  const published=fixture({container:'123',state:{publishAttempted:true,urls:['https://cdn.example/1.jpg']},status:'PUBLISHED'});await processInstagramJob(published.pool,{},env,published.fetcher);assert.equal(published.calls.length,1);assert.ok(published.queries.some(q=>q.args?.[1]==='published'));
});
test('ambiguous container creation needs review, definitive rate limits back off, terminal provider errors fail',async()=>{
  for(const [fetcher,expected,code] of [[async()=>{throw new Error('Lost response');},'needs_review','META_NETWORK_ERROR'],[async()=>new Response(JSON.stringify({error:{code:613,message:'secret'}}),{status:429}),'processing','META_RATE_LIMITED']]){
    const f=fixture();f.job.attempts=40;await processInstagramJob(f.pool,{},env,fetcher);const saved=f.queries.at(-1).args;assert.equal(saved[1],expected);assert.equal(saved[3],code);
  }
  const f=fixture({container:'123',status:'ERROR'});await processInstagramJob(f.pool,{},env,f.fetcher);assert.equal(f.queries.at(-1).args[1],'failed');
});
test('carousel creates ordered child containers then the parent with their IDs',async()=>{
  const child=fixture({state:{urls:['https://cdn.example/1.jpg','https://cdn.example/2.jpg'],children:['111']}});await processInstagramJob(child.pool,{},env,child.fetcher);assert.equal(new URLSearchParams(child.calls[0].options.body).get('image_url'),'https://cdn.example/2.jpg');assert.deepEqual(JSON.parse(child.queries.at(-1).args[2]).children,['111','888']);
  const parent=fixture({state:{urls:['https://cdn.example/1.jpg','https://cdn.example/2.jpg'],children:['111','222']}});await processInstagramJob(parent.pool,{},env,parent.fetcher);assert.equal(parent.calls.length,3);const body=new URLSearchParams(parent.calls.at(-1).options.body);assert.equal(body.get('media_type'),'CAROUSEL');assert.equal(body.get('children'),'111,222');
});
test('Instagram HTTP rejects CSRF, missing sessions, read-only impersonation; owner comes from server',async()=>{
  const req=(origin='http://localhost')=>Object.assign(new Request('http://localhost/api/meta/publish',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({...input,workspaceId:randomUUID(),userId:randomUUID()})}),{cookies:{get:()=>undefined}});
  const owner={user:{id:userId},workspace:{id:workspaceId}};
  const deps={resolveTenant:async()=>owner,pool:()=>({}),publish:async(pool,data)=>{assert.equal(data.workspaceId,workspaceId);assert.equal(data.userId,userId);return {id,status:'queued'};}};
  assert.equal((await instagramHandler('publish',deps)(req('https://evil.example'))).status,403);
  assert.equal((await instagramHandler('publish',{...deps,resolveTenant:async()=>{throw new Error('Authentication required');}})(req())).status,401);
  assert.equal((await instagramHandler('publish',{...deps,resolveTenant:async()=>({...owner,impersonation:{readOnly:true}})})(req())).status,403);
  assert.equal((await instagramHandler('publish',deps)(req())).status,202);
});

test('storage failures retain a safe phase/code and only temporary failures are retryable',async()=>{
  const job={workspace_id:workspaceId,id,media_type:'photo'};
  const assets=[{storage_key:'owned-key',size_bytes:3,content_type:'image/jpeg'}];
  const reset=Object.assign(new Error('private storage details'),{code:'ECONNRESET'});
  const storage={createDownloadUrl:async()=>({url:'local://owned'}),get:async()=>{throw reset;}};
  await assert.rejects(prepareInstagramMedia(storage,{publicUrl:'https://cdn.example'},job,assets),error=>{
    assert.equal(error.mediaPhase,'read_media');assert.equal(instagramErrorCode(error),'META_MEDIA_STORAGE_UNAVAILABLE');assert.equal(retryableInstagramStorageError(error),true);return true;
  });
  const available={createDownloadUrl:async()=>({url:'local://owned'}),get:async()=>({body:Buffer.from('abc')})};
  const denied=Object.assign(new Error('private bucket details'),{name:'AccessDenied',$metadata:{httpStatusCode:403}});
  await assert.rejects(prepareInstagramMedia(available,{publicUrl:'https://cdn.example',put:async()=>{throw denied;}},job,assets,async()=>Buffer.from('jpeg')),error=>{
    assert.equal(error.mediaPhase,'upload_media');assert.equal(instagramErrorCode(error),'META_MEDIA_ACCESS_DENIED');assert.equal(retryableInstagramStorageError(error),false);return true;
  });
  assert.equal(instagramErrorCode({mediaPhase:'read_media',code:'ENOENT'}),'META_MEDIA_NOT_FOUND');
  assert.equal(retryableInstagramStorageError({mediaPhase:'upload_media',$metadata:{httpStatusCode:503}}),true);
  assert.equal(retryableInstagramStorageError({code:'ECONNRESET'}),false);
});
test('temporary media storage failure stays processing with its safe cause and never calls Meta',async()=>{
  const f=fixture({state:{}}),query=f.pool.query;
  f.pool.query=async(sql,args)=>sql.includes('SELECT a.storage_key')?{rows:[{storage_key:'owned',size_bytes:3,content_type:'image/jpeg'}]}:query(sql,args);
  const storage={createDownloadUrl:async()=>({url:'local://owned'}),get:async()=>{throw Object.assign(new Error('private storage address'),{code:'ECONNRESET'});}};
  await processInstagramJob(f.pool,storage,env,()=>assert.fail('No Meta call during preparation'),{targetStorage:{publicUrl:'https://cdn.example'}});
  const args=f.queries.at(-1).args;assert.equal(args[1],'processing');assert.equal(args[3],'META_MEDIA_STORAGE_UNAVAILABLE');assert.equal(JSON.parse(args[2]).phase,'read_media');assert.equal(JSON.stringify(args).includes('private storage address'),false);
});
