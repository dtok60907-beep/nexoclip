export async function storeMetaOAuthState(pool,input) {
  await pool.query('DELETE FROM meta_oauth_states WHERE expires_at<now()');
  await pool.query(`INSERT INTO meta_oauth_states(state_hash,user_id,workspace_id,session_token_hash,redirect_uri,app_id,config_id)
    VALUES($1,$2,$3,$4,$5,$6,$7)`,[input.stateHash,input.userId,input.workspaceId,input.sessionHash,input.config.redirectUri,input.config.appId,input.config.configId]);
}
export async function consumeMetaOAuthState(pool,{stateHash,sessionHash}) {
  return (await pool.query(`DELETE FROM meta_oauth_states s USING sessions se
    WHERE s.state_hash=$1 AND s.session_token_hash=$2 AND s.expires_at>now()
      AND se.token_hash=$2 AND se.user_id=s.user_id AND se.revoked_at IS NULL AND se.expires_at>now()
    RETURNING s.user_id,s.workspace_id,s.redirect_uri,s.app_id,s.config_id`,[stateHash,sessionHash])).rows[0]||null;
}
export async function persistMetaConnection(pool,{workspaceId,userId,snapshot,encryptedToken}) {
  const c=await pool.connect();
  try {
    await c.query('BEGIN');
    const integration=(await c.query(`INSERT INTO meta_integrations(workspace_id,user_id,app_id,config_id,client_business_id,system_user_id,
      access_token_encrypted,access_expires_at,data_access_expires_at,granted_scopes)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT(workspace_id,user_id,app_id,client_business_id) DO UPDATE SET config_id=EXCLUDED.config_id,system_user_id=EXCLUDED.system_user_id,
      access_token_encrypted=EXCLUDED.access_token_encrypted,access_expires_at=EXCLUDED.access_expires_at,data_access_expires_at=EXCLUDED.data_access_expires_at,
      granted_scopes=EXCLUDED.granted_scopes,status='connected',updated_at=now() RETURNING id`,
    [workspaceId,userId,snapshot.config.appId,snapshot.config.configId,snapshot.clientBusinessId,snapshot.systemUserId,encryptedToken,snapshot.accessExpiresAt,snapshot.dataAccessExpiresAt,snapshot.scopes])).rows[0];
    await c.query("UPDATE social_accounts SET status='disconnected',posts_sync_lease_id=NULL,posts_sync_lease_until=NULL,posts_sync_run_id=NULL,instagram_sync_cursor=NULL,updated_at=now() WHERE workspace_id=$1 AND user_id=$2 AND meta_integration_id=$3",[workspaceId,userId,integration.id]);
    for(const account of snapshot.instagram)await c.query(`INSERT INTO social_accounts(workspace_id,user_id,provider,provider_account_id,display_name,granted_scopes,meta_integration_id)
      VALUES($1,$2,'instagram',$3,$4,$5,$6) ON CONFLICT(workspace_id,user_id,provider,provider_account_id) DO UPDATE
      SET display_name=EXCLUDED.display_name,granted_scopes=EXCLUDED.granted_scopes,meta_integration_id=EXCLUDED.meta_integration_id,status='connected',posts_sync_lease_id=NULL,posts_sync_lease_until=NULL,posts_sync_run_id=NULL,instagram_sync_cursor=NULL,posts_sync_error=NULL,posts_next_sync_at=now(),updated_at=now()`,
    [workspaceId,userId,account.id,account.username,snapshot.scopes,integration.id]);
    await c.query('UPDATE meta_ad_accounts SET is_available=false,updated_at=now() WHERE workspace_id=$1 AND user_id=$2 AND meta_integration_id=$3',[workspaceId,userId,integration.id]);
    for(const account of snapshot.adAccounts)await c.query(`INSERT INTO meta_ad_accounts(workspace_id,user_id,meta_integration_id,provider_account_id,name,currency,timezone_name,account_status)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(meta_integration_id,provider_account_id) DO UPDATE SET name=EXCLUDED.name,currency=EXCLUDED.currency,
      timezone_name=EXCLUDED.timezone_name,account_status=EXCLUDED.account_status,is_available=true,updated_at=now()`,
    [workspaceId,userId,integration.id,account.id,account.name||null,account.currency||null,account.timezone_name||null,Number.isInteger(account.account_status)?account.account_status:null]);
    await c.query('COMMIT');return integration.id;
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
export async function listMetaConnections(pool,{workspaceId,userId}) {
  const integrations=(await pool.query(`SELECT id,app_id,config_id,client_business_id,granted_scopes,status,access_expires_at,data_access_expires_at,updated_at
    FROM meta_integrations WHERE workspace_id=$1 AND user_id=$2 AND status<>'disconnected' ORDER BY updated_at DESC`,[workspaceId,userId])).rows;
  const accounts=(await pool.query(`SELECT a.id,a.provider_account_id,a.display_name,a.granted_scopes,a.meta_integration_id,a.posts_synced_at,a.posts_sync_run_id,a.posts_sync_error,
    CASE WHEN m.status<>'connected' OR m.access_expires_at<=now() OR m.data_access_expires_at<=now() THEN 'reconnect_required' ELSE a.status END AS status
    FROM social_accounts a JOIN meta_integrations m ON m.id=a.meta_integration_id AND m.workspace_id=a.workspace_id AND m.user_id=a.user_id
    WHERE a.workspace_id=$1 AND a.user_id=$2 AND a.provider='instagram' AND a.status<>'disconnected' AND m.status<>'disconnected' ORDER BY a.display_name`,[workspaceId,userId])).rows;
  return {integrations,accounts};
}
export async function listMetaAdAccounts(pool,{workspaceId,userId}) {
  return (await pool.query(`SELECT a.id,a.provider_account_id,a.name,a.currency,a.timezone_name,a.account_status,a.meta_integration_id,
    m.status,m.granted_scopes,m.access_expires_at,m.data_access_expires_at
    FROM meta_ad_accounts a JOIN meta_integrations m ON m.id=a.meta_integration_id AND m.workspace_id=a.workspace_id AND m.user_id=a.user_id
    WHERE a.workspace_id=$1 AND a.user_id=$2 AND a.is_available=true AND m.status<>'disconnected' ORDER BY a.name,a.id`,[workspaceId,userId])).rows;
}
export async function findMetaAdCredentials(pool,{workspaceId,userId,accountId}) {
  return (await pool.query(`SELECT a.provider_account_id,a.currency,a.timezone_name,m.id AS integration_id,m.app_id,m.granted_scopes,
    m.access_token_encrypted,m.access_expires_at,m.data_access_expires_at,m.status
    FROM meta_ad_accounts a JOIN meta_integrations m ON m.id=a.meta_integration_id AND m.workspace_id=a.workspace_id AND m.user_id=a.user_id
    WHERE a.id=$1 AND a.workspace_id=$2 AND a.user_id=$3 AND a.is_available=true`,[accountId,workspaceId,userId])).rows[0]||null;
}
export async function markMetaReconnect(pool,id) {
  await pool.query("UPDATE meta_integrations SET status='reconnect_required',updated_at=now() WHERE id=$1 AND status='connected'",[id]);
}
export async function disconnectMetaConnection(pool,{workspaceId,userId,integrationId}) {
  const c=await pool.connect();
  try {
    await c.query('BEGIN');
    const result=await c.query(`UPDATE meta_integrations SET status='disconnected',access_token_encrypted='',updated_at=now()
      WHERE id=$1 AND workspace_id=$2 AND user_id=$3 RETURNING id`,[integrationId,workspaceId,userId]);
    if(result.rowCount)await c.query("UPDATE social_accounts SET status='disconnected',posts_sync_lease_id=NULL,posts_sync_lease_until=NULL,posts_sync_run_id=NULL,instagram_sync_cursor=NULL,updated_at=now() WHERE meta_integration_id=$1 AND workspace_id=$2 AND user_id=$3",[integrationId,workspaceId,userId]);
    await c.query('COMMIT');return result.rowCount>0;
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
export async function findMetaCampaignCredentials(pool,{workspaceId,userId,accountId}) {
  return (await pool.query(`SELECT a.provider_account_id,a.currency,a.timezone_name,m.id AS integration_id,m.app_id,m.granted_scopes,
    m.access_token_encrypted,m.access_expires_at,m.data_access_expires_at,m.status
    FROM meta_ad_accounts a JOIN meta_integrations m ON m.id=a.meta_integration_id AND m.workspace_id=a.workspace_id AND m.user_id=a.user_id
    WHERE a.id=$1 AND a.workspace_id=$2 AND a.user_id=$3 AND a.is_available=true`,[accountId,workspaceId,userId])).rows[0]||null;
}
