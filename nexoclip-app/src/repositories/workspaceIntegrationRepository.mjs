export async function createIntegrationState(pool, { stateHash, userId, workspaceId, provider, sessionHash }) {
  await pool.query('DELETE FROM workspace_integration_oauth_states WHERE expires_at<now()');
  await pool.query(`INSERT INTO workspace_integration_oauth_states(state_hash,user_id,workspace_id,provider,session_token_hash)
    VALUES($1,$2,$3,$4,$5)`, [stateHash, userId, workspaceId, provider, sessionHash]);
}

export async function consumeIntegrationState(pool, { stateHash, sessionHash, provider }) {
  return (await pool.query(`DELETE FROM workspace_integration_oauth_states s USING sessions se
    WHERE s.state_hash=$1 AND s.provider=$2 AND s.session_token_hash=$3 AND s.expires_at>now()
      AND se.token_hash=$3 AND se.user_id=s.user_id AND se.revoked_at IS NULL AND se.expires_at>now()
    RETURNING s.user_id,s.workspace_id`, [stateHash, provider, sessionHash])).rows[0] || null;
}

export async function saveWorkspaceIntegration(pool, input) {
  return (await pool.query(`INSERT INTO workspace_integrations(workspace_id,user_id,provider,provider_user_id,display_name,
      access_token_encrypted,refresh_token_encrypted,scopes,expires_at,status)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'connected')
    ON CONFLICT(workspace_id,user_id,provider,provider_user_id) DO UPDATE SET display_name=EXCLUDED.display_name,
      access_token_encrypted=EXCLUDED.access_token_encrypted,
      refresh_token_encrypted=COALESCE(EXCLUDED.refresh_token_encrypted,workspace_integrations.refresh_token_encrypted),
      scopes=EXCLUDED.scopes,expires_at=EXCLUDED.expires_at,status='connected',updated_at=now()
    RETURNING id`, [input.workspaceId, input.userId, input.provider, input.providerUserId, input.displayName,
    input.accessTokenEncrypted, input.refreshTokenEncrypted, input.scopes, input.expiresAt])).rows[0];
}

export async function listWorkspaceIntegrations(pool, { workspaceId, userId }) {
  return (await pool.query(`SELECT id,provider,provider_user_id,display_name,scopes,expires_at,status,created_at,updated_at
    FROM workspace_integrations WHERE workspace_id=$1 AND user_id=$2 AND status<>'disconnected' ORDER BY provider,display_name`,
  [workspaceId, userId])).rows;
}

export async function disconnectWorkspaceIntegration(pool, { workspaceId, userId, provider }) {
  return (await pool.query(`UPDATE workspace_integrations SET status='disconnected',access_token_encrypted='',refresh_token_encrypted=NULL,updated_at=now()
    WHERE workspace_id=$1 AND user_id=$2 AND provider=$3 AND status<>'disconnected' RETURNING id`,
  [workspaceId, userId, provider])).rowCount;
}
