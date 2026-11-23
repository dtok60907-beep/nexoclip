export async function queueTikTokPostSync(pool, { accountId, workspaceId, userId }) {
  const result = await pool.query(`UPDATE social_accounts SET
    posts_next_sync_at=LEAST(posts_next_sync_at,GREATEST(now(),COALESCE(posts_synced_at,now()-interval '1 minute')+interval '1 minute'))
    WHERE id=$1 AND workspace_id=$2 AND user_id=$3 AND provider='tiktok' AND status='connected'
      AND 'video.list'=ANY(granted_scopes)
    RETURNING id`, [accountId, workspaceId, userId]);
  if (result.rowCount) return;
  const account = await pool.query(`SELECT granted_scopes FROM social_accounts
    WHERE id=$1 AND workspace_id=$2 AND user_id=$3 AND provider='tiktok' AND status='connected'`, [accountId, workspaceId, userId]);
  if (!account.rowCount) throw Object.assign(new Error('TikTok account not found'), { status:404 });
  throw Object.assign(new Error('Reconnect TikTok and grant video.list to sync public posts'), { status:409 });
}

export async function listTikTokPosts(pool, { workspaceId, userId, offset=0 }) {
  const result = await pool.query(`SELECT p.id,p.social_account_id,p.provider_post_id,p.title,p.caption,p.cover_url,p.share_url,p.duration,p.published_at,p.metrics,
      a.display_name AS account_name FROM social_posts p JOIN social_accounts a ON a.id=p.social_account_id
    WHERE p.workspace_id=$1 AND p.user_id=$2 AND p.provider='tiktok' AND p.is_available AND a.status='connected'
    ORDER BY p.published_at DESC,p.id DESC LIMIT 51 OFFSET $3`, [workspaceId,userId,offset]);
  return { posts:result.rows.slice(0,50), nextOffset:result.rows.length>50?offset+50:null };
}

export async function storeTikTokVideoDetails(pool,{accountId,workspaceId,userId,videos,runId}) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const account=await client.query(`SELECT posts_sync_run_id FROM social_accounts WHERE id=$1 AND workspace_id=$2 AND user_id=$3 AND status='connected' AND 'video.list'=ANY(granted_scopes) FOR UPDATE`,[accountId,workspaceId,userId]);
    if(!account.rowCount)throw Object.assign(new Error('TikTok account unavailable'),{status:404});
    for(const video of videos){
      const metrics=Object.fromEntries(['view_count','like_count','comment_count','share_count'].filter(key=>Number.isSafeInteger(video[key])&&video[key]>=0).map(key=>[key,video[key]]));
      await client.query(`INSERT INTO social_posts(workspace_id,user_id,social_account_id,provider,provider_post_id,title,caption,cover_url,share_url,duration,published_at,seen_sync_id,metrics)
        VALUES($1,$2,$3,'tiktok',$4,$5,$6,$7,$8,$9,to_timestamp($10),$11,$12::jsonb)
        ON CONFLICT(social_account_id,provider_post_id) DO UPDATE SET title=EXCLUDED.title,caption=EXCLUDED.caption,cover_url=EXCLUDED.cover_url,
          share_url=EXCLUDED.share_url,duration=EXCLUDED.duration,published_at=EXCLUDED.published_at,metrics=EXCLUDED.metrics,is_available=true,updated_at=now()`,
      [workspaceId,userId,accountId,video.id,video.title||'',video.video_description||'',video.cover_image_url||null,video.share_url||null,video.duration??null,video.create_time,account.rows[0].posts_sync_run_id||runId,JSON.stringify(metrics)]);
    }
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

export async function claimTikTokPostSync(pool) {
  const result = await pool.query(`WITH due AS (
    SELECT id FROM social_accounts WHERE provider='tiktok' AND status='connected'
      AND 'video.list'=ANY(granted_scopes) AND posts_next_sync_at<=now()
      AND (posts_sync_lease_until IS NULL OR posts_sync_lease_until<now())
    ORDER BY posts_next_sync_at FOR UPDATE SKIP LOCKED LIMIT 1
  ) UPDATE social_accounts a SET posts_sync_lease_id=gen_random_uuid(),
      posts_sync_lease_until=now()+interval '2 minutes',
      posts_sync_run_id=COALESCE(posts_sync_run_id,gen_random_uuid())
    FROM due WHERE a.id=due.id RETURNING a.*`);
  return result.rows[0];
}

export async function storeTikTokPostPage(pool, account, page) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const lease = await client.query(`SELECT id FROM social_accounts WHERE id=$1 AND posts_sync_lease_id=$2
      AND status='connected' FOR UPDATE`, [account.id,account.posts_sync_lease_id]);
    if (!lease.rowCount) { await client.query('ROLLBACK'); return; }
    for (const video of page.videos) {
      await client.query(`INSERT INTO social_posts(workspace_id,user_id,social_account_id,provider,provider_post_id,title,caption,cover_url,share_url,duration,published_at,seen_sync_id)
        VALUES($1,$2,$3,'tiktok',$4,$5,$6,$7,$8,$9,to_timestamp($10),$11)
        ON CONFLICT(social_account_id,provider_post_id) DO UPDATE SET title=EXCLUDED.title,caption=EXCLUDED.caption,
          cover_url=EXCLUDED.cover_url,share_url=EXCLUDED.share_url,duration=EXCLUDED.duration,
          published_at=EXCLUDED.published_at,seen_sync_id=EXCLUDED.seen_sync_id,is_available=true,updated_at=now()`,
      [account.workspace_id,account.user_id,account.id,video.id,video.title||'',video.video_description||'',video.cover_image_url||null,video.share_url||null,video.duration??null,video.create_time,account.posts_sync_run_id]);
    }
    if (!page.has_more) await client.query(`UPDATE social_posts SET is_available=false,cover_url=NULL,updated_at=now()
      WHERE social_account_id=$1 AND seen_sync_id<>$2`, [account.id,account.posts_sync_run_id]);
    await client.query(`UPDATE social_accounts SET posts_sync_cursor=$3,
      posts_sync_run_id=CASE WHEN $4 THEN posts_sync_run_id ELSE NULL END,
      posts_synced_at=CASE WHEN $4 THEN posts_synced_at ELSE now() END,
      posts_next_sync_at=CASE WHEN $4 THEN now() ELSE now()+interval '30 minutes' END,
      posts_sync_lease_id=NULL,posts_sync_lease_until=NULL,posts_sync_error=NULL
      WHERE id=$1 AND posts_sync_lease_id=$2`, [account.id,account.posts_sync_lease_id,page.has_more?page.cursor:null,page.has_more]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function failTikTokPostSync(pool, account, error) {
  // Store codes only: provider messages can include request details.
  const code=String(error.code||'SYNC_FAILED').replace(/[^a-zA-Z0-9_.-]/g,'').slice(0,80)||'SYNC_FAILED';
  const delay=Math.min(3600,Math.max(60,Number(error.retryAfter)||300));
  await pool.query(`UPDATE social_accounts SET posts_sync_error=$3,posts_next_sync_at=now()+($4*interval '1 second'),
    posts_sync_lease_id=NULL,posts_sync_lease_until=NULL WHERE id=$1 AND posts_sync_lease_id=$2`,
  [account.id,account.posts_sync_lease_id,code,delay]);
}
