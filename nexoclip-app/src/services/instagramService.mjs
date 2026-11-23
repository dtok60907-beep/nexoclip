import { createHash } from 'node:crypto';
import { metaConfig,metaGet,metaPost,metaError } from '../providers/meta/adapter.mjs';
import { decryptMetaToken } from './metaCrypto.mjs';
import { instagramCredentials,claimInstagramSync,storeInstagramPage,failInstagramSync,insertInstagramJob,claimInstagramJob,saveInstagramJob,instagramJobAssets,storeInstagramContainer,storeInstagramStatus,requestInstagramSync,storeInstagramPublishIntent,storeInstagramPublished,markInstagramIntegrationReconnect } from '../repositories/instagramRepository.mjs';
import { markMetaReconnect } from '../repositories/metaRepository.mjs';
import { createReferenceStorage } from './assetService.js';
import { readTikTokAsset } from './tiktokPublishMedia.mjs';
import { getMp4DurationSeconds } from './tiktokService.mjs';

const uuid=value=>typeof value==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);
const providerId=value=>typeof value==='string'&&/^\d{1,40}$/.test(value);
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function instagramErrorCode(error) {
  if(/^META_[A-Z_]+$/.test(error.code||''))return error.code;
  if(error.mediaPhase){
    if(['NoSuchKey','NotFound','ENOENT'].includes(error.code||error.name))return 'META_MEDIA_NOT_FOUND';
    if(['AccessDenied','InvalidAccessKeyId','SignatureDoesNotMatch'].includes(error.code||error.name)||error.$metadata?.httpStatusCode===403)return 'META_MEDIA_ACCESS_DENIED';
    return 'META_MEDIA_STORAGE_UNAVAILABLE';
  }
  return 'META_OPERATION_FAILED';
}
export function retryableInstagramStorageError(error) {
  return !!error.mediaPhase&&(error.$retryable===true||error.$retryable?.throttling===true
    ||Number(error.$metadata?.httpStatusCode)>=500||error.$metadata?.httpStatusCode===429
    ||['ECONNRESET','ECONNREFUSED','ETIMEDOUT','EAI_AGAIN','ENETUNREACH','EPIPE','TimeoutError','RequestTimeout','NetworkingError','SlowDown'].includes(error.code||error.name));
}
export function instagramToken(account,env,scope='instagram_basic') {
  if(!account)throw fail('Instagram account not found',404);
  if(account.status!=='connected'||account.integration_status!=='connected'||[account.access_expires_at,account.data_access_expires_at].some(d=>d&&new Date(d).getTime()<=Date.now()))throw metaError('META_RECONNECT_REQUIRED',409);
  if(!account.granted_scopes.includes(scope))throw fail(`Reconnect Instagram and allow ${scope}`,403);
  if(account.app_id!==metaConfig(env).appId)throw metaError('META_APP_CHANGED_RECONNECT',409);
  return decryptMetaToken(account.access_token_encrypted,env);
}
const https=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
export function instagramMediaPage(data,previousCursor) {
  if(!Array.isArray(data.data)||data.data.length>25)throw metaError('META_INVALID_MEDIA');
  const cursor=data.paging?.next?data.paging?.cursors?.after:null;
  if(data.paging?.next&&(typeof cursor!=='string'||!cursor||cursor.length>4096||cursor===previousCursor))throw metaError('META_PAGINATION_INVALID');
  const posts=data.data.map(p=>{
    if(!providerId(p.id)||!['IMAGE','VIDEO','CAROUSEL_ALBUM'].includes(p.media_type)||!Number.isFinite(Date.parse(p.timestamp)))throw metaError('META_INVALID_MEDIA');
    const metrics=Object.fromEntries(['like_count','comments_count'].filter(k=>Number.isSafeInteger(p[k])&&p[k]>=0).map(k=>[k,p[k]]));
    const children=(p.children?.data||[]).slice(0,20).map(child=>({id:providerId(child.id)?child.id:null,type:child.media_type,thumbnailUrl:https(child.thumbnail_url|| (child.media_type==='IMAGE'?child.media_url:null))}));
    return {id:p.id,caption:typeof p.caption==='string'?p.caption.slice(0,2200):'',coverUrl:https(p.thumbnail_url||(p.media_type==='IMAGE'?p.media_url:null))||children[0]?.thumbnailUrl||null,shareUrl:https(p.permalink),timestamp:p.timestamp,metrics,details:{type:p.media_type,productType:p.media_product_type||null,children}};
  });
  return {posts,cursor};
}
export async function syncDueInstagramPosts(pool,env=process.env,fetcher=fetch) {
  const account=await claimInstagramSync(pool);if(!account)return;
  try {
    const credentials=await instagramCredentials(pool,{accountId:account.id,workspaceId:account.workspace_id,userId:account.user_id});
    const token=instagramToken(credentials,env);
    const page=await metaGet(`/${account.provider_account_id}/media`,token,{fields:'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,children{id,media_type,media_url,thumbnail_url}',limit:'25',...(account.instagram_sync_cursor?{after:account.instagram_sync_cursor}:{})},env,fetcher);
    await storeInstagramPage(pool,account,instagramMediaPage(page,account.instagram_sync_cursor));
  }catch(error){
    if(error.code==='META_RECONNECT_REQUIRED')await markMetaReconnect(pool,account.meta_integration_id);
    await failInstagramSync(pool,account,instagramErrorCode(error));
  }
}
export function validateInstagramPublish(input) {
  if(input.confirm!==true)throw fail('Review and confirm your Instagram post first');
  if(!uuid(input.accountId)||!['video','photo'].includes(input.mediaType)||!Array.isArray(input.assetIds)||input.assetIds.length<1||input.assetIds.length>(input.mediaType==='video'?1:20)||input.assetIds.some(id=>!uuid(id))||new Set(input.assetIds).size!==input.assetIds.length)throw fail('Select one video or 1–20 distinct workspace photos');
  if(input.mediaType==='video'&&!uuid(input.generationId))throw fail('Select a completed generated video');
  if(typeof input.caption!=='string'||[...input.caption].length>2200||(input.caption.match(/#[\p{L}\p{N}_]+/gu)||[]).length>30||(input.caption.match(/@[\p{L}\p{N}_.]+/gu)||[]).length>20)throw fail('Use a caption up to 2,200 characters, 30 hashtags and 20 mentions');
  if(typeof input.idempotencyKey!=='string'||!input.idempotencyKey||input.idempotencyKey.length>128)throw fail('A valid idempotency key is required');
  return createHash('sha256').update(JSON.stringify({provider:'instagram',accountId:input.accountId,assetIds:input.assetIds,mediaType:input.mediaType,generationId:input.generationId||null,caption:input.caption})).digest('hex');
}
export async function createInstagramPublishJob(pool,input,env=process.env) {
  const hash=validateInstagramPublish(input);
  instagramToken(await instagramCredentials(pool,input),env,'instagram_content_publish');
  return insertInstagramJob(pool,input,hash);
}
export async function instagramJpeg(bytes) {
  const {default:sharp}=await import('sharp');
  const image=sharp(bytes,{limitInputPixels:40_000_000}),metadata=await image.metadata();
  if(!['png','jpeg','webp'].includes(metadata.format))throw fail('Unsupported image format');
  const output=await image.rotate().flatten({background:'#fff'}).resize(1080,1080,{fit:'contain',background:'#fff'}).toColourspace('srgb').jpeg({quality:90}).toBuffer();
  if(output.length>8*1024*1024)throw fail('Prepared photo exceeds Instagram’s 8 MB limit');
  return output;
}
export async function prepareInstagramMedia(storage,target,job,assets,convert=instagramJpeg) {
  if(!https(target.publicUrl))throw fail('Configure public HTTPS R2 media storage before publishing',409);
  const urls=[];
  for(const asset of assets){
    const original=await readTikTokAsset(storage,asset.storage_key).catch(error=>{error.mediaPhase='read_media';throw error;}),bytes=Buffer.from(original.body);
    if(bytes.length!==Number(asset.size_bytes)||bytes.length>(job.media_type==='video'?250*1024*1024:20*1024*1024))throw fail('Media size validation failed');
    let body,type,extension;
    if(job.media_type==='video'){
      if(!['video/mp4','video/quicktime'].includes(asset.content_type))throw fail('Video must be MP4 or MOV');
      const duration=getMp4DurationSeconds(bytes);if(duration<3||duration>900)throw fail('Instagram Reels must be 3 seconds to 15 minutes');
      body=bytes;type=asset.content_type;extension=type==='video/mp4'?'mp4':'mov';
    }else{body=await convert(bytes);type='image/jpeg';extension='jpg';}
    const url=await target.put(`${job.workspace_id}/social/instagram/${job.id}/${urls.length}.${extension}`,body,type).catch(error=>{error.mediaPhase='upload_media';throw error;});
    if(!https(url))throw fail('Instagram media URL is not public HTTPS',409);urls.push(url);
  }
  return urls;
}
// One durable step per scan. Ambiguous POST responses are never blindly repeated.
export async function processInstagramJob(pool,storage,env=process.env,fetcher=fetch,options={}) {
  const job=await claimInstagramJob(pool);
  if(!job)return;
  let posting=false,stage=job.provider_state||{};
  const save=(status,error=null,delay=30)=>{if(!error)stage.failures=0;return saveInstagramJob(pool,job.id,stage,status,error,delay);};
  try {
    const account=await instagramCredentials(pool,{accountId:job.social_account_id,workspaceId:job.workspace_id,userId:job.user_id});
    const token=instagramToken(account,env,'instagram_content_publish');
    const get=(path,params)=>metaGet(path,token,params,env,fetcher);
    const post=async(path,params)=>{posting=true;const result=await metaPost(path,token,params,env,fetcher);if(!providerId(result.id))throw metaError('META_INVALID_RESPONSE');posting=false;return result.id;};
    stage.phase='prepare_media';
    if(!stage.urls){
      const assets=await instagramJobAssets(pool,job);
      if(!assets.length||assets.length>(job.media_type==='video'?1:20))throw fail('Publishing assets unavailable');
      stage.urls=await prepareInstagramMedia(storage,options.targetStorage||createReferenceStorage(env,storage),job,assets,options.convert);
      await save('processing');return;
    }
    stage.phase='create_container';
    if(!job.provider_publish_id){
      const children=stage.children||[];
      if(stage.urls.length>1&&children.length<stage.urls.length){
        const id=await post(`/${account.provider_account_id}/media`,{image_url:stage.urls[children.length],is_carousel_item:'true'});
        stage.children=[...children,id];await save('processing');return;
      }
      if(stage.children){
        const statuses=await Promise.all(stage.children.map(id=>get(`/${id}`,{fields:'status_code'})));
        if(statuses.some(s=>['ERROR','EXPIRED'].includes(s.status_code)))throw fail('Instagram could not prepare a carousel image');
        if(statuses.some(s=>s.status_code!=='FINISHED')){await save('processing');return;}
      }
      const params={caption:job.caption,is_ai_generated:'true',...(stage.urls.length>1?{media_type:'CAROUSEL',children:stage.children.join(',')}:job.media_type==='video'?{media_type:'REELS',video_url:stage.urls[0],share_to_feed:'true'}:{image_url:stage.urls[0]})};
      const container=await post(`/${account.provider_account_id}/media`,params);
      await storeInstagramContainer(pool,job.id,container,stage);return;
    }
    stage.phase='check_container';
    const result=await get(`/${job.provider_publish_id}`,{fields:'status_code'});
    await storeInstagramStatus(pool,job.id,result.status_code);
    if(result.status_code==='PUBLISHED'){
      await save('published');await requestInstagramSync(pool,account.id);return;
    }
    if(['ERROR','EXPIRED'].includes(result.status_code))throw fail(`Instagram container ${result.status_code.toLowerCase()}`);
    if(result.status_code!=='FINISHED'){
      if(result.status_code!=='IN_PROGRESS')throw metaError('META_INVALID_RESPONSE');
      if(Date.now()-new Date(job.created_at).getTime()>23*3600_000)throw fail('Instagram processing timed out');
      await save('processing');return;
    }
    if(stage.publishAttempted){await save('needs_review','META_PUBLISH_UNCONFIRMED');return;}
    instagramToken(await instagramCredentials(pool,{accountId:job.social_account_id,workspaceId:job.workspace_id,userId:job.user_id}),env,'instagram_content_publish');
    // Persist intent before publishing; a crash cannot submit a second media_publish.
    stage.phase='publish';
    stage.publishAttempted=true;
    await storeInstagramPublishIntent(pool,job.id,stage);
    const id=await post(`/${account.provider_account_id}/media_publish`,{creation_id:job.provider_publish_id});
    await storeInstagramPublished(pool,job.id,id);
    await requestInstagramSync(pool,account.id);
  }catch(error){
    const code=instagramErrorCode(error);
    if(error.mediaPhase)stage.phase=error.mediaPhase;
    stage.errorHttpStatus=Number.isInteger(error.$metadata?.httpStatusCode)?error.$metadata.httpStatusCode:null;
    if(error.code==='META_RECONNECT_REQUIRED')await markInstagramIntegrationReconnect(pool,job.social_account_id);
    const limited=error.code==='META_RATE_LIMITED';
    if(limited)stage.publishAttempted=false;
    const ambiguous=posting&&!limited&&(error.status>=500||!error.status);
    const retry=limited||!posting&&(error.status>=500||retryableInstagramStorageError(error));
    stage.failures=(Number.isSafeInteger(stage.failures)?stage.failures:0)+1;
    await save(ambiguous?(job.provider_publish_id?'processing':'needs_review'):retry&&stage.failures<5?'processing':'failed',code,limited?300:60);
  }
}
