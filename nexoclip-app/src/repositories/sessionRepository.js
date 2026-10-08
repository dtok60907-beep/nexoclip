export async function createSessionRecord(client, { userId, tokenHash, expiresAt }) {
  const result = await client.query(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, expires_at, created_at`,
    [userId, tokenHash, expiresAt],
  );

  return result.rows[0];
}

export async function findActiveSession(client, tokenHash) {
  const result = await client.query(
    `SELECT s.id, s.user_id, s.expires_at, s.created_at,
            u.email, u.display_name
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND u.suspended_at IS NULL
       AND s.revoked_at IS NULL
       AND s.expires_at > now()
     LIMIT 1`,
    [tokenHash],
  );

  return result.rows[0] || null;
}

export async function revokeSession(client, tokenHash) {
  const result = await client.query(
    `UPDATE sessions
     SET revoked_at = now(), updated_at = now()
     WHERE token_hash = $1
       AND revoked_at IS NULL
     RETURNING id`,
    [tokenHash],
  );

  return result.rowCount > 0;
}
