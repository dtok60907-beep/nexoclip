export async function findSocialWorkspace(db, workspaceId) {
  return (await db.query('SELECT * FROM social_workspaces WHERE workspace_id = $1', [workspaceId])).rows[0] || null;
}

export async function claimSocialWorkspace(db, workspaceId) {
  return (await db.query(`INSERT INTO social_workspaces (workspace_id) VALUES ($1)
    ON CONFLICT DO NOTHING RETURNING workspace_id`, [workspaceId])).rowCount === 1;
}

export async function completeSocialWorkspace(db, workspaceId, organizationId, encryptedKey) {
  await db.query(`UPDATE social_workspaces SET status = 'ready', organization_id = $2,
    encrypted_api_key = $3, updated_at = now() WHERE workspace_id = $1 AND status = 'provisioning'`,
  [workspaceId, organizationId, encryptedKey]);
}

export async function flagSocialWorkspace(db, workspaceId) {
  await db.query(`UPDATE social_workspaces SET status = 'needs_review', updated_at = now()
    WHERE workspace_id = $1 AND status = 'provisioning'`, [workspaceId]);
}

export async function claimSubmission(db, workspaceId, key, hash) {
  const inserted = await db.query(`INSERT INTO social_submissions (workspace_id, idempotency_key, request_hash)
    VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING *`, [workspaceId, key, hash]);
  if (inserted.rowCount) return { claimed: true, row: inserted.rows[0] };
  return { claimed: false, row: (await db.query(`SELECT * FROM social_submissions
    WHERE workspace_id = $1 AND idempotency_key = $2`, [workspaceId, key])).rows[0] };
}

export async function finishSubmission(db, workspaceId, key, result) {
  await db.query(`UPDATE social_submissions SET status = $3, result = $4, updated_at = now()
    WHERE workspace_id = $1 AND idempotency_key = $2`,
  [workspaceId, key, result ? 'accepted' : 'needs_review', result ? JSON.stringify(result) : null]);
}
