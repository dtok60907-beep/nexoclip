export async function instagramCredentials(pool,{workspaceId,userId,accountId}) {
  return (await pool.query(`SELECT a.*,m.app_id,m.access_token_encrypted,m.access_expires_at,m.data_access_expires_at,m.status AS integration_status
    FROM social_accounts a JOIN meta_integrations m ON m.id=a.meta_integration_id AND m.workspace_id=a.workspace_id AND m.user_id=a.user_id
    JOIN workspace_memberships w ON w.workspace_id=a.workspace_id AND w.user_id=a.user_id JOIN users u ON u.id=a.user_id AND u.suspended_at IS NULL
    WHERE a.id=$1 AND a.workspace_id=$2 AND a.user_id=$3 AND a.provider='instagram'`,[accountId,workspaceId,userId])).rows[0]||null;
}
export async function listInstagramPosts(pool,{workspaceId,userId,offset=0}) {
  if(!Number.isInteger(offset)||offset<0||offset>10000)throw Object.assign(new Error('Invalid page'),{status:400});
  const result=await pool.query(`SELECT p.id,p.social_account_id,p.provider_post_id,p.caption,p.cover_url,p.share_url,p.published_at,p.metrics,p.media_details,a.display_name AS account_name
    FROM social_posts p JOIN social_accounts a ON a.id=p.social_account_id JOIN meta_integrations m ON m.id=a.meta_integration_id
    WHERE p.workspace_id=$1 AND p.user_id=$2 AND p.provider='instagram' AND p.is_available AND a.status='connected' AND m.status='connected'
    ORDER BY p.published_at DESC,p.id DESC LIMIT 25 OFFSET $3`,[workspaceId,userId,offset]);
  return {posts:result.rows.slice(0,24),nextOffset:result.rows.length>24?offset+24:null};
}
export async function queueInstagramSync(pool,{workspaceId,userId,accountId}) {
  const result=await pool.query(`UPDATE social_accounts a SET posts_next_sync_at=LEAST(posts_next_sync_at,GREATEST(now(),COALESCE(posts_synced_at,now()-interval '1 minute')+interval '1 minute'))
    FROM meta_integrations m WHERE a.id=$1 AND a.workspace_id=$2 AND a.user_id=$3 AND a.provider='instagram' AND a.status='connected'
    AND m.id=a.meta_integration_id AND m.status='connected' RETURNING a.id`,[accountId,workspaceId,userId]);
  if(!result.rowCount)throw Object.assign(new Error('Reconnect a Creator or Business Instagram account first'),{status:409});
}
export async function claimInstagramSync(pool) {
  return (await pool.query(`WITH due AS (SELECT a.id FROM social_accounts a JOIN meta_integrations m ON m.id=a.meta_integration_id
    JOIN workspace_memberships w ON w.workspace_id=a.workspace_id AND w.user_id=a.user_id JOIN users u ON u.id=a.user_id AND u.suspended_at IS NULL
    WHERE a.provider='instagram' AND a.status='connected' AND m.status='connected' AND 'instagram_basic'=ANY(a.granted_scopes)
      AND a.posts_next_sync_at<=now() AND (a.posts_sync_lease_until IS NULL OR a.posts_sync_lease_until<now())
    ORDER BY a.posts_next_sync_at FOR UPDATE OF a SKIP LOCKED LIMIT 1)
    UPDATE social_accounts a SET posts_sync_lease_id=gen_random_uuid(),posts_sync_lease_until=now()+interval '2 minutes',posts_sync_run_id=COALESCE(posts_sync_run_id,gen_random_uuid())
    FROM due WHERE a.id=due.id RETURNING a.*`)).rows[0];
}
export async function storeInstagramPage(pool,account,{posts,cursor}) {
  const c=await pool.connect();
  try {
    await c.query('BEGIN');
    const lease=await c.query(`SELECT a.id FROM social_accounts a JOIN meta_integrations m ON m.id=a.meta_integration_id
      WHERE a.id=$1 AND a.posts_sync_lease_id=$2 AND a.status='connected' AND m.status='connected' FOR UPDATE OF a`,[account.id,account.posts_sync_lease_id]);
    if(!lease.rowCount){await c.query('ROLLBACK');return;}
    for(const p of posts)await c.query(`INSERT INTO social_posts(workspace_id,user_id,social_account_id,provider,provider_post_id,caption,cover_url,share_url,published_at,seen_sync_id,metrics,media_details)
      VALUES($1,$2,$3,'instagram',$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb)
      ON CONFLICT(social_account_id,provider_post_id) DO UPDATE SET caption=EXCLUDED.caption,cover_url=EXCLUDED.cover_url,share_url=EXCLUDED.share_url,
        published_at=EXCLUDED.published_at,seen_sync_id=EXCLUDED.seen_sync_id,metrics=EXCLUDED.metrics,media_details=EXCLUDED.media_details,is_available=true,updated_at=now()`,
    [account.workspace_id,account.user_id,account.id,p.id,p.caption,p.coverUrl,p.shareUrl,p.timestamp,account.posts_sync_run_id,JSON.stringify(p.metrics),JSON.stringify(p.details)]);
    // The API exposes at most 10K recent media; only reconcile deletions inside the returned time window.
    if(!cursor)await c.query(`UPDATE social_posts SET is_available=false,cover_url=NULL,updated_at=now() WHERE social_account_id=$1 AND seen_sync_id<>$2
      AND published_at>=COALESCE((SELECT min(published_at) FROM social_posts WHERE social_account_id=$1 AND seen_sync_id=$2),'-infinity'::timestamptz)`,[account.id,account.posts_sync_run_id]);
    await c.query(`UPDATE social_accounts SET instagram_sync_cursor=$3,posts_sync_run_id=CASE WHEN $3::text IS NULL THEN NULL ELSE posts_sync_run_id END,
      posts_synced_at=CASE WHEN $3::text IS NULL THEN now() ELSE posts_synced_at END,posts_next_sync_at=CASE WHEN $3::text IS NULL THEN now()+interval '30 minutes' ELSE now() END,
      posts_sync_lease_id=NULL,posts_sync_lease_until=NULL,posts_sync_error=NULL WHERE id=$1 AND posts_sync_lease_id=$2`,[account.id,account.posts_sync_lease_id,cursor]);
    await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
export async function failInstagramSync(pool,account,code) {
  await pool.query(`UPDATE social_accounts SET posts_sync_error=$3,posts_next_sync_at=now()+interval '5 minutes',posts_sync_lease_id=NULL,posts_sync_lease_until=NULL,
    status=CASE WHEN $3 IN ('META_PROFESSIONAL_REQUIRED','META_RECONNECT_REQUIRED','META_PERMISSION_REQUIRED') THEN 'reconnect_required' ELSE status END
    WHERE id=$1 AND posts_sync_lease_id=$2`,[account.id,account.posts_sync_lease_id,code]);
}
export async function listInstagramJobs(pool,{workspaceId,userId}) {
  return (await pool.query(`SELECT j.id,j.status,j.caption,j.media_type,j.provider_error,j.provider_status,j.public_post_ids,j.created_at,a.display_name AS account_name
    FROM social_publish_jobs j JOIN social_accounts a ON a.id=j.social_account_id WHERE j.workspace_id=$1 AND j.user_id=$2 AND j.provider='instagram' ORDER BY j.created_at DESC LIMIT 30`,[workspaceId,userId])).rows;
}
export async function insertInstagramJob(pool,input,hash) {
  const c=await pool.connect();
  try {
    await c.query('BEGIN');
    const account=await c.query(`SELECT id FROM social_accounts WHERE id=$1 AND workspace_id=$2 AND user_id=$3 AND provider='instagram' AND status='connected' FOR SHARE`,[input.accountId,input.workspaceId,input.userId]);
    if(!account.rowCount)throw Object.assign(new Error('Instagram account unavailable'),{status:409});
    const assets=await c.query(`SELECT id,content_type,size_bytes FROM assets WHERE workspace_id=$1 AND id=ANY($2::uuid[]) FOR SHARE`,[input.workspaceId,input.assetIds]);
    if(assets.rowCount!==input.assetIds.length||assets.rows.some(a=>Number(a.size_bytes)<=0||Number(a.size_bytes)>(input.mediaType==='video'?250*1024*1024:20*1024*1024)||!(input.mediaType==='video'?['video/mp4','video/quicktime']:['image/jpeg','image/png','image/webp']).includes(a.content_type)))throw Object.assign(new Error('Select ready workspace photos or a completed MP4/MOV video'),{status:400});
    if(input.mediaType==='video'){
      const video=await c.query(`SELECT id FROM generation_jobs g WHERE g.workspace_id=$1 AND g.created_by_user_id=$2 AND g.id=$3 AND g.status='succeeded' AND g.kind='video'
        AND EXISTS(SELECT 1 FROM generation_outputs o WHERE o.workspace_id=g.workspace_id AND o.generation_job_id=g.id AND o.asset_id=$4)`,[input.workspaceId,input.userId,input.generationId,input.assetIds[0]]);
      if(!video.rowCount)throw Object.assign(new Error('Select a completed video owned by your account'),{status:404});
    }
    const result=await c.query(`INSERT INTO social_publish_jobs(workspace_id,user_id,social_account_id,asset_id,generation_job_id,provider,mode,media_type,idempotency_key,request_hash,caption)
      VALUES($1,$2,$3,$4,$5,'instagram','direct',$6,$7,$8,$9) ON CONFLICT(workspace_id,user_id,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key RETURNING id,status,request_hash,provider`,
    [input.workspaceId,input.userId,input.accountId,input.assetIds[0],input.generationId||null,input.mediaType,input.idempotencyKey,hash,input.caption]);
    const job=result.rows[0];
    if(job.request_hash!==hash||job.provider!=='instagram')throw Object.assign(new Error('Idempotency key already used for different content'),{status:409});
    for(const [position,id] of input.assetIds.entries())await c.query(`INSERT INTO social_publish_media(workspace_id,social_publish_job_id,asset_id,position) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[input.workspaceId,job.id,id,position]);
    await c.query('COMMIT');return {id:job.id,status:job.status};
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}

export async function claimInstagramJob(pool) {
  return (await pool.query(`WITH due AS (SELECT id FROM social_publish_jobs WHERE provider='instagram' AND status IN ('queued','processing')
    AND (next_poll_at IS NULL OR next_poll_at<=now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
    UPDATE social_publish_jobs j SET status='uploading',attempts=attempts+1,updated_at=now() FROM due WHERE j.id=due.id RETURNING j.*`)).rows[0];
}

export async function saveInstagramJob(pool,jobId,stage,status,error=null,delay=30) {
  return pool.query(`UPDATE social_publish_jobs SET status=$2,provider_state=$3::jsonb,provider_error=$4,
    next_poll_at=now()+($5*interval '1 second'),updated_at=now() WHERE id=$1 AND status='uploading'`,[jobId,status,JSON.stringify(stage),error,delay]);
}

export async function instagramJobAssets(pool,job) {
  return (await pool.query(`SELECT a.storage_key,a.content_type,a.size_bytes FROM social_publish_media sm JOIN assets a ON a.workspace_id=sm.workspace_id AND a.id=sm.asset_id
        WHERE sm.workspace_id=$1 AND sm.social_publish_job_id=$2 ORDER BY sm.position`,[job.workspace_id,job.id])).rows;
}

export async function storeInstagramContainer(pool,jobId,container,stage) {
  return pool.query(`UPDATE social_publish_jobs SET provider_publish_id=$2,provider_state=$3::jsonb,status='processing',next_poll_at=now()+interval '30 seconds',updated_at=now() WHERE id=$1 AND status='uploading'`,[jobId,container,JSON.stringify(stage)]);
}

export async function storeInstagramStatus(pool,jobId,status) {
  return pool.query(`UPDATE social_publish_jobs SET provider_status=$2 WHERE id=$1`,[jobId,typeof status==='string'?status:null]);
}

export async function requestInstagramSync(pool,accountId) {
  return pool.query('UPDATE social_accounts SET posts_next_sync_at=now() WHERE id=$1',[accountId]);
}

export async function storeInstagramPublishIntent(pool,jobId,stage) {
  return pool.query(`UPDATE social_publish_jobs SET provider_state=$2::jsonb,updated_at=now() WHERE id=$1 AND status='uploading'`,[jobId,JSON.stringify(stage)]);
}

export async function storeInstagramPublished(pool,jobId,id) {
  return pool.query(`UPDATE social_publish_jobs SET status='published',public_post_ids=ARRAY[$2::text],provider_status='PUBLISHED',provider_error=NULL,updated_at=now() WHERE id=$1 AND status='uploading'`,[jobId,id]);
}

export async function markInstagramIntegrationReconnect(pool,accountId) {
  return pool.query(`UPDATE meta_integrations m SET status='reconnect_required' FROM social_accounts a WHERE a.id=$1 AND m.id=a.meta_integration_id`,[accountId]);
}
