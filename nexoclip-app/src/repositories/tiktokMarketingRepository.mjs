export async function storeTikTokMarketingState(pool,input){
  await pool.query('DELETE FROM tiktok_marketing_oauth_states WHERE expires_at<now()');
  await pool.query('INSERT INTO tiktok_marketing_oauth_states(state_hash,workspace_id,user_id,session_token_hash) VALUES($1,$2,$3,$4)',[input.stateHash,input.workspaceId,input.userId,input.sessionHash]);
}
export async function consumeTikTokMarketingState(pool,{stateHash,sessionHash}){
  return (await pool.query(`DELETE FROM tiktok_marketing_oauth_states s USING sessions se
    WHERE s.state_hash=$1 AND s.session_token_hash=$2 AND s.expires_at>now() AND se.token_hash=$2
      AND se.user_id=s.user_id AND se.revoked_at IS NULL AND se.expires_at>now()
    RETURNING s.workspace_id,s.user_id`,[stateHash,sessionHash])).rows[0]||null;
}
export async function saveTikTokMarketingAccounts(pool,{workspaceId,userId,appId,advertiserIds,encryptedToken}){
  for(const advertiserId of advertiserIds)await pool.query(`INSERT INTO tiktok_marketing_accounts(workspace_id,user_id,app_id,advertiser_id,access_token_encrypted)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT(workspace_id,user_id,app_id,advertiser_id) DO UPDATE
    SET access_token_encrypted=EXCLUDED.access_token_encrypted,status='connected',updated_at=now()`,[workspaceId,userId,appId,advertiserId,encryptedToken]);
}
export async function listTikTokMarketingAccounts(pool,{workspaceId,userId}){
  return (await pool.query(`SELECT id,advertiser_id,status,created_at,updated_at FROM tiktok_marketing_accounts
    WHERE workspace_id=$1 AND user_id=$2 AND status<>'disconnected' ORDER BY updated_at DESC`,[workspaceId,userId])).rows;
}
export async function findTikTokMarketingCredentials(pool,{workspaceId,userId,advertiserId}){
  return (await pool.query(`SELECT id,app_id,advertiser_id,access_token_encrypted,status FROM tiktok_marketing_accounts
    WHERE workspace_id=$1 AND user_id=$2 AND advertiser_id=$3 AND status='connected'`,[workspaceId,userId,advertiserId])).rows[0]||null;
}
