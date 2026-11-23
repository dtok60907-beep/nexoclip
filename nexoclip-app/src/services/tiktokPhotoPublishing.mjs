import { validateSocialSchedule } from '../lib/socialSchedule.mjs';
import { hashTikTokValue } from './tiktokCrypto.mjs';
import { creatorInfo } from './tiktokService.mjs';
import { tikTokJson } from './tiktokApi.mjs';
import { createReferenceStorage } from './assetService.js';
import { verifiedPhotoUrl,readTikTokAsset,publishState,publicPostIds } from './tiktokPublishMedia.mjs';

export function photoPublishingReady(env=process.env) {
  try {
    if(!env.R2_ACCOUNT_ID||!env.R2_ACCESS_KEY_ID||!env.R2_SECRET_ACCESS_KEY||!(env.R2_BUCKET_NAME||env.R2_BUCKET))return false;
    verifiedPhotoUrl(`${String(env.R2_PUBLIC_URL||'').replace(/\/+$/,'')}/social/check.jpg`,env);
    return true;
  }catch{return false;}
}
export async function createPhotoPublishJob(pool,input,env=process.env) {
  const schedule=validateSocialSchedule(input.scheduledAt,input.timeZone);
  const {workspaceId,userId,accountId,assetIds,mode,caption='',photoTitle='',photoCoverIndex=0,autoAddMusic=false,isAigc=true,privacyLevel,disableComment=true,brandContentToggle=false,brandOrganicToggle=false,confirm,idempotencyKey}=input;
  if(confirm!==true||!['upload','direct'].includes(mode))throw Object.assign(new Error('Choose a publishing mode and confirm your post'),{status:400});
  if(!Array.isArray(assetIds)||assetIds.length<1||assetIds.length>35||new Set(assetIds).size!==assetIds.length||[accountId,...assetIds].some(id=>! /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(String(id))))throw Object.assign(new Error('Select 1–35 distinct workspace photos'),{status:400});
  if(typeof caption!=='string'||caption.length>4000||typeof photoTitle!=='string'||photoTitle.length>90||!Number.isInteger(photoCoverIndex)||photoCoverIndex<0||photoCoverIndex>=assetIds.length||[autoAddMusic,isAigc,disableComment,brandContentToggle,brandOrganicToggle].some(v=>typeof v!=='boolean'))throw Object.assign(new Error('Invalid photo publishing options'),{status:400});
  if(typeof idempotencyKey!=='string'||!idempotencyKey||idempotencyKey.length>128)throw Object.assign(new Error('A valid idempotency key is required'),{status:400});
  if(mode==='direct'&&(env.TIKTOK_ENV!=='production'||env.TIKTOK_APP_AUDITED!=='true')&&privacyLevel!=='SELF_ONLY')throw Object.assign(new Error('Sandbox and unaudited apps can only publish privately'),{status:400});
  if(mode==='direct'&&brandContentToggle&&privacyLevel==='SELF_ONLY')throw Object.assign(new Error('Branded content cannot use private visibility'),{status:400});
  if(!photoPublishingReady(env))throw Object.assign(new Error('Photo publishing requires a verified media domain. Video file upload remains available.'),{status:409});
  const account=await pool.query(`SELECT granted_scopes FROM social_accounts WHERE id=$1 AND workspace_id=$2 AND user_id=$3 AND provider='tiktok' AND status='connected'`,[accountId,workspaceId,userId]);
  const scope=mode==='direct'?'video.publish':'video.upload';
  if(!account.rowCount)throw Object.assign(new Error('TikTok account not found'),{status:404});
  if(!account.rows[0].granted_scopes.includes(scope))throw Object.assign(new Error(`Reconnect TikTok and grant ${scope}`),{status:403});
  if(mode==='direct'){
    const info=await creatorInfo(pool,accountId,env);
    if(!info.privacy_level_options?.includes(privacyLevel))throw Object.assign(new Error('TikTok does not allow this visibility'),{status:400});
  }
  const hash=hashTikTokValue(JSON.stringify({accountId,assetIds,mode,caption,photoTitle,photoCoverIndex,autoAddMusic,isAigc,privacyLevel:privacyLevel||null,disableComment,brandContentToggle,brandOrganicToggle,scheduledAt:schedule.scheduledAt,timeZone:schedule.timeZone}));
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const assets=await client.query('SELECT id,content_type,size_bytes,EXISTS(SELECT 1 FROM generation_outputs o WHERE o.workspace_id=assets.workspace_id AND o.asset_id=assets.id) AS generated FROM assets WHERE workspace_id=$1 AND id=ANY($2::uuid[]) FOR SHARE',[workspaceId,assetIds]);
    if(assets.rowCount!==assetIds.length||assets.rows.some(a=>!['image/png','image/jpeg','image/webp'].includes(a.content_type)||Number(a.size_bytes)>20*1024*1024))throw Object.assign(new Error('Photos must be workspace PNG, JPEG, or WebP images under 20 MB'),{status:400});
    if(!isAigc&&assets.rows.some(a=>a.generated))throw Object.assign(new Error('Generated photos must keep AI-generated disclosure enabled'),{status:400});
    const result=await client.query(`INSERT INTO social_publish_jobs(workspace_id,user_id,social_account_id,asset_id,provider,media_type,mode,idempotency_key,request_hash,caption,privacy_level,disable_comment,brand_content_toggle,brand_organic_toggle,photo_title,photo_cover_index,auto_add_music,is_aigc,status,scheduled_at,schedule_timezone)
      VALUES($1,$2,$3,$4,'tiktok','photo',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      ON CONFLICT(workspace_id,user_id,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key RETURNING id,status,request_hash`,[workspaceId,userId,accountId,assetIds[0],mode,idempotencyKey,hash,caption,privacyLevel||null,disableComment,brandContentToggle,brandOrganicToggle,photoTitle,photoCoverIndex,autoAddMusic,isAigc,schedule.scheduledAt?'scheduled':'queued',schedule.scheduledAt,schedule.timeZone]);
    const job=result.rows[0];
    if(job.request_hash!==hash)throw Object.assign(new Error('Idempotency key was already used for different content'),{status:409});
    for(const [position,assetId] of assetIds.entries())await client.query(`INSERT INTO social_publish_media(workspace_id,social_publish_job_id,asset_id,position) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[workspaceId,job.id,assetId,position]);
    await client.query('COMMIT');return {id:job.id,status:job.status};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

async function photoJpeg(body) {
  const {default:sharp}=await import('sharp');
  const image=sharp(body,{limitInputPixels:16_777_216});
  const metadata=await image.metadata();
  if(!['png','jpeg','webp'].includes(metadata.format))throw new Error('Unsupported photo format');
  return image.rotate().flatten({background:'#fff'}).resize(1080,1080,{fit:'inside',withoutEnlargement:true}).jpeg({quality:90}).toBuffer();
}
export async function executePhotoPublishJob(pool,storage,job,token,env=process.env,fetcher=fetch,{photoStorage,convert=photoJpeg}={}) {
  if(job.provider_publish_id){
    const result=await tikTokJson('/post/publish/status/fetch/',token,{publish_id:job.provider_publish_id},fetcher);
    const status=publishState(result,job.mode);
    await pool.query(`UPDATE social_publish_jobs SET status=$2,provider_status=$3,provider_error=$4,public_post_ids=$5,next_poll_at=now()+interval '30 seconds',updated_at=now() WHERE id=$1`,[job.id,status,result.status,result.fail_reason||null,publicPostIds(result)]);
    return;
  }
  const targetStorage=photoStorage||createReferenceStorage(env,storage);
  if(!targetStorage.publicUrl)throw Object.assign(new Error('Verified public photo storage is unavailable'),{status:409});
  verifiedPhotoUrl(`${targetStorage.publicUrl.replace(/\/+$/,'')}/social/check.jpg`,env);
  const assets=await pool.query(`SELECT a.storage_key,a.content_type,a.size_bytes,m.position FROM social_publish_media m JOIN assets a ON a.id=m.asset_id AND a.workspace_id=m.workspace_id WHERE m.workspace_id=$1 AND m.social_publish_job_id=$2 ORDER BY m.position`,[job.workspace_id,job.id]);
  if(!assets.rows.length||assets.rows.length>35)throw new Error('Photo assets unavailable');
  const urls=[];
  for(const asset of assets.rows){
    const original=await readTikTokAsset(storage,asset.storage_key);
    const bytes=Buffer.isBuffer(original.body)?original.body:Buffer.from(original.body);
    if(bytes.length!==Number(asset.size_bytes)||bytes.length>20*1024*1024)throw new Error('Photo size validation failed');
    const jpeg=await convert(bytes);
    // shortcut: keep publication derivatives; add retention cleanup before large-scale photo publishing.
    const url=verifiedPhotoUrl(await targetStorage.put(`${job.workspace_id}/social/${job.id}/${asset.position}.jpg`,jpeg,'image/jpeg'),env);
    const check=await fetcher(url,{method:'HEAD',redirect:'error',signal:AbortSignal.timeout(15_000)});
    if(!check.ok)throw Object.assign(new Error('Published photo URL is not publicly accessible'),{status:409});
    urls.push(url);
    await pool.query('UPDATE social_publish_jobs SET updated_at=now() WHERE id=$1',[job.id]);
  }
  const post_info={title:job.photo_title,description:job.caption};
  if(job.mode==='direct'){
    const info=await tikTokJson('/post/publish/creator_info/query/',token,{},fetcher);
    if(!info.privacy_level_options?.includes(job.privacy_level)||(env.TIKTOK_ENV!=='production'||env.TIKTOK_APP_AUDITED!=='true')&&job.privacy_level!=='SELF_ONLY')throw new Error('Selected visibility is unavailable');
    Object.assign(post_info,{privacy_level:job.privacy_level,disable_comment:job.disable_comment||info.comment_disabled,auto_add_music:job.auto_add_music,brand_content_toggle:job.brand_content_toggle,brand_organic_toggle:job.brand_organic_toggle});
  }
  const data=await tikTokJson('/post/publish/content/init/',token,{media_type:'PHOTO',post_mode:job.mode==='direct'?'DIRECT_POST':'MEDIA_UPLOAD',post_info,source_info:{source:'PULL_FROM_URL',photo_cover_index:job.photo_cover_index,photo_images:urls},is_aigc:job.is_aigc!==false},fetcher);
  if(!data.publish_id)throw new Error('TikTok did not return a publish ID');
  await pool.query(`UPDATE social_publish_jobs SET provider_publish_id=$2,status='processing',provider_status='PROCESSING_DOWNLOAD',provider_error=NULL,next_poll_at=now()+interval '15 seconds',updated_at=now() WHERE id=$1`,[job.id,data.publish_id]);
}
