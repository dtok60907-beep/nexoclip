export async function claimTikTokProfileSync(pool) {
  const result=await pool.query(`WITH due AS (
    SELECT id FROM social_accounts WHERE provider='tiktok' AND status='connected' AND profile_next_sync_at<=now()
      AND (profile_sync_lease_until IS NULL OR profile_sync_lease_until<now())
    ORDER BY profile_next_sync_at LIMIT 1 FOR UPDATE SKIP LOCKED
  ) UPDATE social_accounts a SET profile_sync_lease_id=gen_random_uuid(),profile_sync_lease_until=now()+interval '2 minutes'
    FROM due WHERE a.id=due.id RETURNING a.id,a.provider_account_id,a.granted_scopes,a.profile_sync_lease_id`);
  return result.rows[0];
}

export async function saveTikTokProfile(pool, account, profile) {
  await pool.query(`UPDATE social_accounts SET profile_data=$3::jsonb,display_name=COALESCE($4,display_name),avatar_url=COALESCE($5,avatar_url),
    profile_synced_at=now(),profile_next_sync_at=now()+interval '30 minutes',profile_sync_error=NULL,
    profile_sync_lease_id=NULL,profile_sync_lease_until=NULL WHERE id=$1 AND profile_sync_lease_id=$2 AND status='connected'`,
  [account.id,account.profile_sync_lease_id,JSON.stringify(profile),profile.display_name??null,profile.avatar_url??null]);
}

export async function failTikTokProfileSync(pool, account, error) {
  const code=String(error.code||'PROFILE_SYNC_FAILED').replace(/[^a-zA-Z0-9_.-]/g,'').slice(0,80)||'PROFILE_SYNC_FAILED';
  const delay=Math.min(3600,Math.max(60,Number(error.retryAfter)||300));
  await pool.query(`UPDATE social_accounts SET profile_sync_error=$3,profile_next_sync_at=now()+($4*interval '1 second'),
    profile_sync_lease_id=NULL,profile_sync_lease_until=NULL WHERE id=$1 AND profile_sync_lease_id=$2`,[account.id,account.profile_sync_lease_id,code,delay]);
}

export async function queueTikTokProfileSync(pool,{accountId,workspaceId,userId}) {
  const result=await pool.query(`UPDATE social_accounts SET profile_next_sync_at=LEAST(profile_next_sync_at,
    GREATEST(now(),COALESCE(profile_synced_at,now()-interval '1 minute')+interval '1 minute'))
    WHERE id=$1 AND workspace_id=$2 AND user_id=$3 AND provider='tiktok' AND status='connected' RETURNING id`,[accountId,workspaceId,userId]);
  if(!result.rowCount)throw Object.assign(new Error('TikTok account not found'),{status:404});
}
