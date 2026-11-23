import { randomUUID } from 'node:crypto';
import { encryptTikTokSecret, decryptTikTokSecret, hashTikTokValue } from './tiktokCrypto.mjs';
import { exchangeTikTokCode, refreshTikTokToken, revokeTikTokToken, tikTokJson, tikTokUserInfo } from './tiktokApi.mjs';
import { MAX_TIKTOK_VIDEO_BYTES,videoUploadPlan,uploadChunkEnd,readTikTokAsset,publishState,publicPostIds,publishingError } from './tiktokPublishMedia.mjs';
import { validateSocialSchedule } from '../lib/socialSchedule.mjs';
import { executePhotoPublishJob } from './tiktokPhotoPublishing.mjs';

export const TIKTOK_SCOPE = 'user.info.basic,user.info.profile,user.info.stats,video.upload,video.publish,video.list';
const expiry = (seconds) => new Date(Date.now() + Number(seconds) * 1000);

export function getMp4DurationSeconds(bytes) {
  const read=(start,end,inMovie=false)=>{
    for(let offset=start;offset<end;){
      if(offset+8>end)throw new Error('Video duration metadata is invalid');
      let size=bytes.readUInt32BE(offset),header=8;
      if(size===1){if(offset+16>end)throw new Error('Video duration metadata is invalid');size=Number(bytes.readBigUInt64BE(offset+8));header=16;}
      if(size===0)size=end-offset;
      if(!Number.isSafeInteger(size)||size<header||offset+size>end)throw new Error('Video duration metadata is invalid');
      const type=bytes.toString('ascii',offset+4,offset+8),payload=offset+header;
      if(type==='moov'&&!inMovie){const value=read(payload,offset+size,true);if(value!==null)return value;}
      if(inMovie&&type==='mvhd'){
        const version=bytes[payload],needed=version===1?32:20;
        if(![0,1].includes(version)||payload+needed>offset+size)throw new Error('Video duration metadata is invalid');
        const timescale=bytes.readUInt32BE(payload+(version===1?20:12));
        const duration=version===1?Number(bytes.readBigUInt64BE(payload+24)):bytes.readUInt32BE(payload+16);
        const seconds=duration/timescale;
        if(!timescale||!Number.isFinite(seconds)||seconds<=0)throw new Error('Video duration metadata is invalid');
        return seconds;
      }
      offset+=size;
    }
    return null;
  };
  const duration=read(0,bytes.length);
  if(duration===null)throw new Error('Video duration metadata is missing');
  return duration;
}

export function validateTikTokVideo(bytes,contentType,maxDuration) {
  if(!Buffer.isBuffer(bytes)||bytes.length<16||bytes.length>MAX_TIKTOK_VIDEO_BYTES) throw new Error('TikTok video must be between 16 bytes and 250 MB');
  if(!['video/mp4','video/quicktime'].includes(contentType)||bytes.toString('ascii',4,8)!=='ftyp') throw new Error('TikTok video must be a valid MP4 or MOV file');
  const duration=getMp4DurationSeconds(bytes);
  if(duration>maxDuration) throw new Error(`Video is longer than the TikTok limit of ${maxDuration} seconds`);
  return duration;
}

export async function saveTikTokAccount(pool, { userId, workspaceId, tokenData, userInfo, env = process.env }) {
  if (!tokenData.open_id || !tokenData.access_token || !tokenData.refresh_token) throw new Error('TikTok token response is incomplete');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const scopes = String(tokenData.scope || '').split(/[\s,]+/).map((scope) => scope.trim()).filter(Boolean);
    const result = await client.query(
      `INSERT INTO social_accounts (workspace_id,user_id,provider,provider_account_id,display_name,avatar_url,granted_scopes,status,profile_data,profile_synced_at)
       VALUES ($1,$2,'tiktok',$3,$4,$5,$6,'connected',$7::jsonb,now())
       ON CONFLICT (workspace_id,user_id,provider,provider_account_id) DO UPDATE SET display_name=EXCLUDED.display_name, avatar_url=EXCLUDED.avatar_url, granted_scopes=EXCLUDED.granted_scopes,status='connected',updated_at=now(),
         posts_sync_cursor=NULL,posts_sync_run_id=NULL,posts_sync_lease_id=NULL,posts_sync_lease_until=NULL,posts_next_sync_at=now(),posts_sync_error=NULL,
         profile_data=EXCLUDED.profile_data,profile_synced_at=now(),profile_next_sync_at=now()+interval '30 minutes',profile_sync_error=NULL,profile_sync_lease_id=NULL,profile_sync_lease_until=NULL
       RETURNING id`, [workspaceId,userId,tokenData.open_id,userInfo.display_name || null,userInfo.avatar_url || null,scopes,JSON.stringify(userInfo)]);
    const accountId = result.rows[0].id;
    await client.query(
      `INSERT INTO social_account_credentials (social_account_id,access_token_encrypted,refresh_token_encrypted,access_expires_at,refresh_expires_at)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (social_account_id) DO UPDATE SET access_token_encrypted=EXCLUDED.access_token_encrypted,refresh_token_encrypted=EXCLUDED.refresh_token_encrypted,access_expires_at=EXCLUDED.access_expires_at,refresh_expires_at=EXCLUDED.refresh_expires_at,updated_at=now()`,
      [accountId,encryptTikTokSecret(tokenData.access_token,env),encryptTikTokSecret(tokenData.refresh_token,env),expiry(tokenData.expires_in),expiry(tokenData.refresh_expires_in)]);
    await client.query('COMMIT');
    return accountId;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function getTikTokAccessToken(pool, accountId, env = process.env, fetcher = fetch) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`SELECT c.*,a.status FROM social_account_credentials c JOIN social_accounts a ON a.id=c.social_account_id WHERE c.social_account_id=$1 FOR UPDATE OF c`, [accountId]);
    const row = result.rows[0];
    if (!row || row.status !== 'connected') throw new Error('TikTok account needs reconnection');
    if (new Date(row.access_expires_at).getTime() > Date.now() + 60_000) {
      await client.query('COMMIT');
      return decryptTikTokSecret(row.access_token_encrypted,env);
    }
    if (new Date(row.refresh_expires_at).getTime() <= Date.now()) throw new Error('TikTok account needs reconnection');
    const token = await refreshTikTokToken(decryptTikTokSecret(row.refresh_token_encrypted,env),env,fetcher);
    await client.query(`UPDATE social_account_credentials SET access_token_encrypted=$2,refresh_token_encrypted=$3,access_expires_at=$4,refresh_expires_at=$5,updated_at=now() WHERE social_account_id=$1`,
      [accountId,encryptTikTokSecret(token.access_token,env),encryptTikTokSecret(token.refresh_token,env),expiry(token.expires_in),expiry(token.refresh_expires_in)]);
    await client.query('COMMIT');
    return token.access_token;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (/invalid_grant|invalid_token|reconnect/i.test(`${error.code} ${error.message}`)) {
      await pool.query("UPDATE social_accounts SET status='reconnect_required',updated_at=now() WHERE id=$1",[accountId]).catch(() => {});
    }
    throw error;
  } finally { client.release(); }
}

export async function creatorInfo(pool, accountId, env = process.env, fetcher = fetch) {
  const token = await getTikTokAccessToken(pool,accountId,env,fetcher);
  return tikTokJson('/post/publish/creator_info/query/',token,{},fetcher);
}

export async function createPublishJob(pool, { workspaceId,userId,accountId,generationId,mode,caption='',privacyLevel,disableComment=true,disableDuet=true,disableStitch=true,brandContentToggle=false,brandOrganicToggle=false,confirm=false,idempotencyKey,scheduledAt=null,timeZone=null,env=process.env }) {
  const schedule=validateSocialSchedule(scheduledAt,timeZone);
  if (confirm!==true) throw Object.assign(new Error('Explicit publish confirmation is required'),{status:400});
  if (!['upload','direct'].includes(mode)) throw Object.assign(new Error('Unsupported TikTok publishing mode'),{status:400});
  if (typeof caption !== 'string' || [disableComment,disableDuet,disableStitch,brandContentToggle,brandOrganicToggle].some(value=>typeof value!=='boolean')) throw Object.assign(new Error('TikTok publishing options are invalid'),{status:400});
  if (String(caption).length > 2200) throw Object.assign(new Error('Caption exceeds TikTok’s 2,200 character limit'),{status:400});
  if (mode === 'direct' && (env.TIKTOK_ENV !== 'production' || env.TIKTOK_APP_AUDITED !== 'true') && privacyLevel !== 'SELF_ONLY') throw Object.assign(new Error('Sandbox and unaudited apps can only publish privately'),{status:400});
  if(mode==='direct'&&brandContentToggle&&privacyLevel==='SELF_ONLY')throw Object.assign(new Error('Branded content cannot use private visibility'),{status:400});
  if (!idempotencyKey || String(idempotencyKey).length > 128) throw Object.assign(new Error('A valid idempotency key is required'),{status:400});
  if (![accountId,generationId].every(value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value||'')))) throw Object.assign(new Error('A valid TikTok account and generated video are required'),{status:400});
  const video = await pool.query(
    `SELECT g.id,g.parameters,a.id AS asset_id,a.storage_key,a.content_type,a.size_bytes,a.filename
       FROM generation_jobs g JOIN generation_outputs o ON o.workspace_id=g.workspace_id AND o.generation_job_id=g.id
       JOIN assets a ON a.workspace_id=o.workspace_id AND a.id=o.asset_id
      WHERE g.workspace_id=$1 AND g.created_by_user_id=$2 AND g.id=$3 AND g.kind='video' AND g.status='succeeded'
      ORDER BY o.output_index LIMIT 1`,[workspaceId,userId,generationId]);
  const asset = video.rows[0];
  if (!asset) throw Object.assign(new Error('Select a completed video owned by your account'),{status:404});
  if (!['video/mp4','video/quicktime'].includes(asset.content_type) || Number(asset.size_bytes)>MAX_TIKTOK_VIDEO_BYTES) throw Object.assign(new Error('Video must be MP4 or MOV and under 250 MB'),{status:400});
  const account = await pool.query("SELECT id,granted_scopes FROM social_accounts WHERE id=$1 AND workspace_id=$2 AND user_id=$3 AND provider='tiktok' AND status='connected'",[accountId,workspaceId,userId]);
  if (!account.rowCount) throw Object.assign(new Error('TikTok account is unavailable'),{status:404});
  const requiredScope=mode==='direct'?'video.publish':'video.upload';
  if(!account.rows[0].granted_scopes.includes(requiredScope)) throw Object.assign(new Error(`Reconnect TikTok and grant ${requiredScope} to use this publishing mode`),{status:403});
  if (mode === 'direct') {
    const info = await creatorInfo(pool,accountId,env);
    if (!info.privacy_level_options?.includes(privacyLevel)) throw Object.assign(new Error('TikTok does not allow this privacy setting'),{status:400});
    const duration = Number(asset.parameters?.duration);
    if (Number.isFinite(duration) && duration > Number(info.max_video_post_duration_sec || 0)) throw Object.assign(new Error('Video exceeds this TikTok account’s duration limit'),{status:400});
  }
  const request = {accountId,generationId,mode,caption,privacyLevel,disableComment,disableDuet,disableStitch,brandContentToggle,brandOrganicToggle,scheduledAt:schedule.scheduledAt,timeZone:schedule.timeZone};
  const hash = hashTikTokValue(JSON.stringify(request));
  const inserted = await pool.query(
    `INSERT INTO social_publish_jobs (workspace_id,user_id,social_account_id,generation_job_id,asset_id,provider,mode,idempotency_key,request_hash,caption,privacy_level,disable_comment,disable_duet,disable_stitch,brand_content_toggle,brand_organic_toggle,status,scheduled_at,schedule_timezone)
     VALUES ($1,$2,$3,$4,$5,'tiktok',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     ON CONFLICT (workspace_id,user_id,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
     RETURNING id,status,provider_publish_id,request_hash`,[workspaceId,userId,accountId,generationId,asset.asset_id,mode,idempotencyKey,hash,caption,privacyLevel || null,disableComment,disableDuet,disableStitch,brandContentToggle,brandOrganicToggle,schedule.scheduledAt?'scheduled':'queued',schedule.scheduledAt,schedule.timeZone]);
  if (inserted.rows[0].request_hash !== hash) throw Object.assign(new Error('Idempotency key was used for a different request'),{status:409});
  return inserted.rows[0];
}

export async function executePublishJob(pool, storage, jobId, env = process.env, fetcher = fetch, getToken = getTikTokAccessToken) {
  const claimed = await pool.query(`UPDATE social_publish_jobs SET status='uploading',attempts=attempts+1,updated_at=now() WHERE id=$1 AND provider='tiktok' AND status IN ('queued','scheduled') AND (next_poll_at IS NULL OR next_poll_at<=now()) AND (scheduled_at IS NULL OR scheduled_at<=now()) RETURNING *`,[jobId]);
  const job = claimed.rows[0];
  if (!job) return;
  try {
    if(!job.provider_publish_id){
      const authorization=await pool.query(`SELECT a.granted_scopes FROM social_accounts a
        JOIN workspace_memberships m ON m.workspace_id=a.workspace_id AND m.user_id=a.user_id
        JOIN users u ON u.id=a.user_id AND u.suspended_at IS NULL
        WHERE a.id=$1 AND a.workspace_id=$2 AND a.user_id=$3 AND a.status='connected'`,[job.social_account_id,job.workspace_id,job.user_id]);
      if(!authorization.rows[0]?.granted_scopes.includes(job.mode==='direct'?'video.publish':'video.upload'))throw Object.assign(new Error('Reconnect TikTok and review this post before publishing'),{status:403});
    }
    const token = await getToken(pool,job.social_account_id,env,fetcher);
    if(job.media_type==='photo')return await executePhotoPublishJob(pool,storage,job,token,env,fetcher);
    if(job.provider_publish_id&&!job.upload_url_encrypted){
      const result=await tikTokJson('/post/publish/status/fetch/',token,{publish_id:job.provider_publish_id},fetcher);
      const status=publishState(result,job.mode);
      await pool.query(`UPDATE social_publish_jobs SET status=$2,provider_status=$3,provider_error=$4,public_post_ids=$5,next_poll_at=now()+interval '30 seconds',updated_at=now() WHERE id=$1`,[job.id,status,result.status,result.fail_reason||null,publicPostIds(result)]);
      return;
    }
    const video = await pool.query(`SELECT a.storage_key,a.content_type,a.size_bytes FROM assets a JOIN generation_outputs o ON o.workspace_id=a.workspace_id AND o.asset_id=a.id WHERE a.workspace_id=$1 AND a.id=$2 AND o.generation_job_id=$3 AND EXISTS (SELECT 1 FROM generation_jobs g WHERE g.id=o.generation_job_id AND g.workspace_id=a.workspace_id AND g.created_by_user_id=$4 AND g.status='succeeded')`,[job.workspace_id,job.asset_id,job.generation_job_id,job.user_id]);
    const asset = video.rows[0];
    if (!asset) throw new Error('TikTok video asset is no longer available');
    if(Number(asset.size_bytes)>MAX_TIKTOK_VIDEO_BYTES)throw Object.assign(new Error('Video exceeds the 250 MB publishing limit'),{status:400});
    const object = await readTikTokAsset(storage,asset.storage_key);
    const bytes = Buffer.isBuffer(object.body)?object.body:Buffer.from(object.body);
    if (bytes.length !== Number(asset.size_bytes)) throw new Error('TikTok video size validation failed');
    const tokenInfo=job.mode==='direct'?await tikTokJson('/post/publish/creator_info/query/',token,{},fetcher):null;
    const maxDuration=job.mode==='direct'?Number(tokenInfo.max_video_post_duration_sec||0):600;
    validateTikTokVideo(bytes,asset.content_type,maxDuration);
    if(tokenInfo&&!tokenInfo.privacy_level_options?.includes(job.privacy_level)) throw new Error('Selected TikTok privacy setting is no longer available');
    if(job.mode==='direct'&&(env.TIKTOK_ENV!=='production'||env.TIKTOK_APP_AUDITED!=='true')&&job.privacy_level!=='SELF_ONLY') throw new Error('Unaudited TikTok publishing is restricted to private posts');
    const contentType = asset.content_type;
    const resuming=Boolean(job.provider_publish_id&&job.upload_url_encrypted);
    let publishId=job.provider_publish_id,uploadUrl=job.upload_url_encrypted?decryptTikTokSecret(job.upload_url_encrypted,env):null;
    if (!publishId || !uploadUrl) {
      if(publishId)throw Object.assign(new Error('A publish request already exists; check its status before sending again'),{code:'EXISTING_PUBLISH_REQUEST'});
      const source_info=videoUploadPlan(bytes.length);
      const data=job.mode==='upload'
        ? await tikTokJson('/post/publish/inbox/video/init/',token,{source_info},fetcher)
        : await tikTokJson('/post/publish/video/init/',token,{post_info:{title:job.caption,privacy_level:job.privacy_level,disable_comment:job.disable_comment||tokenInfo.comment_disabled,disable_duet:job.disable_duet||tokenInfo.duet_disabled,disable_stitch:job.disable_stitch||tokenInfo.stitch_disabled,brand_content_toggle:job.brand_content_toggle,brand_organic_toggle:job.brand_organic_toggle,is_aigc:job.is_aigc},source_info},fetcher);
      publishId=data.publish_id; uploadUrl=data.upload_url;
      if (!uploadUrl || !publishId) throw new Error('TikTok did not return an upload URL');
      await pool.query(`UPDATE social_publish_jobs SET provider_publish_id=$2,upload_url_encrypted=$3,updated_at=now() WHERE id=$1`,[job.id,publishId,encryptTikTokSecret(uploadUrl,env)]);
    }
    const target = new URL(uploadUrl);
    if (target.protocol !== 'https:' || !target.hostname.endsWith('.tiktokapis.com')) throw new Error('TikTok returned an invalid upload URL');
    let uploadedBytes=0;
    if(resuming) {
      const state=await tikTokJson('/post/publish/status/fetch/',token,{publish_id:publishId},fetcher);
      if(state.status==='FAILED'||state.status==='PUBLISH_COMPLETE'||state.status==='SEND_TO_USER_INBOX'&&job.mode==='upload') {
        const status=state.status==='FAILED'?'failed':state.status==='PUBLISH_COMPLETE'?'published':'awaiting_creator';
        await pool.query(`UPDATE social_publish_jobs SET status=$2,provider_status=$3,provider_error=$4,upload_url_encrypted=NULL,public_post_ids=$5,next_poll_at=CASE WHEN $2='awaiting_creator' THEN now()+interval '60 seconds' ELSE NULL END,updated_at=now() WHERE id=$1`,[job.id,status,state.status,state.fail_reason||null,publicPostIds(state)]);
        return;
      }
      uploadedBytes=Number(state.uploaded_bytes||0);
      if(!Number.isInteger(uploadedBytes)||uploadedBytes<0||uploadedBytes>bytes.length) throw new Error('TikTok upload progress is invalid');
    }
    const chunkSize = videoUploadPlan(bytes.length).chunk_size;
    if(uploadedBytes!==bytes.length&&uploadedBytes%chunkSize!==0)throw new Error('TikTok upload progress is not on a safe chunk boundary');
    for (let start=uploadedBytes; start<bytes.length;) {
      const end=uploadChunkEnd(start,bytes.length,chunkSize);
      const chunk = bytes.subarray(start,end);
      const upload = await fetcher(uploadUrl,{method:'PUT',redirect:'error',signal:AbortSignal.timeout(120_000),headers:{'content-type':contentType,'content-length':String(chunk.length),'content-range':`bytes ${start}-${start+chunk.length-1}/${bytes.length}`},body:chunk});
      const final = start+chunk.length === bytes.length;
      if (!(final ? [200,201] : [206]).includes(upload.status)) throw Object.assign(new Error(`TikTok upload failed (${upload.status})`),{status:upload.status,retryAfter:upload.headers.get('retry-after')});
      await pool.query('UPDATE social_publish_jobs SET updated_at=now() WHERE id=$1',[job.id]);
      start=end;
    }
    await pool.query(`UPDATE social_publish_jobs SET status='processing',provider_status='PROCESSING_UPLOAD',provider_error=NULL,upload_url_encrypted=NULL,next_poll_at=now()+interval '15 seconds',updated_at=now() WHERE id=$1`,[job.id]);
  } catch (error) {
    const persisted=await pool.query('SELECT provider_publish_id FROM social_publish_jobs WHERE id=$1',[job.id]).catch(()=>({rows:[]}));
    const hasProviderId=Boolean(persisted.rows[0]?.provider_publish_id||job.provider_publish_id);
    const retry=(error.status===429||hasProviderId&&error.status>=500)&&job.attempts<3;
    const status=retry?'queued':hasProviderId||error.status>=500||!error.status?'needs_review':'failed';
    const retrySeconds=Math.max(1,Math.min(3600,Number(error.retryAfter)||30));
    await pool.query(`UPDATE social_publish_jobs SET status=$2,provider_error=$3,next_poll_at=CASE WHEN $2='queued' THEN now()+($4::int*interval '1 second') ELSE NULL END,updated_at=now() WHERE id=$1`,[job.id,status,publishingError(error),retrySeconds]);
  }
}

export async function pollTikTokPublishJobs(pool, env = process.env, fetcher = fetch, getToken = getTikTokAccessToken) {
  const due = await pool.query(`WITH due AS (SELECT id FROM social_publish_jobs WHERE provider='tiktok' AND status IN ('processing','awaiting_creator') AND provider_publish_id IS NOT NULL AND (next_poll_at IS NULL OR next_poll_at<=now()) ORDER BY next_poll_at NULLS FIRST LIMIT 4 FOR UPDATE SKIP LOCKED) UPDATE social_publish_jobs j SET next_poll_at=now()+interval '30 seconds' FROM due WHERE j.id=due.id RETURNING j.id,j.social_account_id,j.provider_publish_id,j.mode`);
  for (const job of due.rows) {
    try {
      const token = await getToken(pool,job.social_account_id,env,fetcher);
      const result = await tikTokJson('/post/publish/status/fetch/',token,{publish_id:job.provider_publish_id},fetcher);
      const status = result.status;
      const next = publishState(result,job.mode);
      const pollDelay=next==='awaiting_creator'?60:30;
      await pool.query(`UPDATE social_publish_jobs SET status=$2,provider_status=$3,provider_error=$4,public_post_ids=$6,next_poll_at=CASE WHEN $2 IN ('processing','awaiting_creator') THEN now()+($5::int*interval '1 second') ELSE NULL END,updated_at=now() WHERE id=$1 AND status IN ('processing','awaiting_creator')`,[job.id,next,status,result.fail_reason || null,pollDelay,publicPostIds(result)]);
    } catch (error) {
      await pool.query(`UPDATE social_publish_jobs SET provider_error=$2,next_poll_at=now()+interval '60 seconds',updated_at=now() WHERE id=$1 AND status IN ('processing','awaiting_creator')`,[job.id,publishingError(error)]);
    }
  }
}

export async function processTikTokWebhook(pool,event,raw) {
  if(typeof event.content==='string')event={...event,content:JSON.parse(event.content)};
  const fingerprint=hashTikTokValue(raw),client=await pool.connect();
  try {
    await client.query('BEGIN');
    const duplicate=await client.query('SELECT id FROM social_publish_events WHERE event_fingerprint=$1',[fingerprint]);
    if(duplicate.rowCount){await client.query('COMMIT');return {duplicate:true};}
    const account=event.user_openid?await client.query("SELECT id FROM social_accounts WHERE provider='tiktok' AND provider_account_id=$1 AND status<>'disconnected' LIMIT 1",[event.user_openid]):{rows:[]};
    const publishId=event.content?.publish_id;
    const job=publishId?await client.query("SELECT id,social_account_id FROM social_publish_jobs WHERE provider='tiktok' AND provider_publish_id=$1 LIMIT 1",[publishId]):{rows:[]};
    await client.query(`INSERT INTO social_publish_events(social_publish_job_id,social_account_id,provider,event_type,event_fingerprint,payload) VALUES($1,$2,'tiktok',$3,$4,$5::jsonb)`,[job.rows[0]?.id||null,account.rows[0]?.id||job.rows[0]?.social_account_id||null,event.event,fingerprint,JSON.stringify(event)]);
    if(event.event==='authorization.removed'&&account.rows[0]){
      await client.query("UPDATE social_accounts SET status='disconnected',updated_at=now() WHERE provider='tiktok' AND provider_account_id=$1",[event.user_openid]);
      await client.query(`DELETE FROM social_account_credentials WHERE social_account_id IN (SELECT id FROM social_accounts WHERE provider='tiktok' AND provider_account_id=$1)`,[event.user_openid]);
    }
    if(job.rows[0]) {
      const status=event.event==='post.publish.failed'?'failed':event.event==='post.publish.complete'||event.event==='post.publish.publicly_available'?'published':event.event==='post.publish.inbox_delivered'?'awaiting_creator':null;
      if(status) await client.query("UPDATE social_publish_jobs SET status=$2,provider_status=$3,provider_error=$4,next_poll_at=CASE WHEN $2='awaiting_creator' THEN now()+interval '60 seconds' ELSE NULL END,updated_at=now() WHERE id=$1 AND (status NOT IN ('published','failed') OR status=$2)",[job.rows[0].id,status,event.event,event.content?.reason||null]);
    }
    await client.query('COMMIT'); return {duplicate:false};
  } catch(error) { await client.query('ROLLBACK'); if(error.code==='23505') return {duplicate:true}; throw error; } finally { client.release(); }
}

export async function disconnectTikTok(pool, accountId, workspaceId, userId, env = process.env) {
  const row = await pool.query(`SELECT c.access_token_encrypted FROM social_accounts a JOIN social_account_credentials c ON c.social_account_id=a.id WHERE a.id=$1 AND a.workspace_id=$2 AND a.user_id=$3`,[accountId,workspaceId,userId]);
  if (!row.rowCount) return false;
  const token = decryptTikTokSecret(row.rows[0].access_token_encrypted,env);
  await revokeTikTokToken(token,env);
  await pool.query("UPDATE social_accounts SET status='disconnected',updated_at=now() WHERE id=$1",[accountId]);
  await pool.query('DELETE FROM social_account_credentials WHERE social_account_id=$1',[accountId]);
  return true;
}
