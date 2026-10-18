import { getPool } from '../db/pool.js';
import { createSessionToken, hashSessionToken } from '../lib/auth/session.js';
import { isPlatformOperator } from '../lib/auth/platformOperator.js';

// An operator signs in as a customer for support, quality checks and security. The
// operator's own session is kept aside (a separate cookie) and restored on exit.
export const IMPERSONATION_TTL_SECONDS = 60 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

export function createImpersonationService({ pool = null, env = process.env, now = () => new Date() } = {}) {
  const db = () => pool || getPool();

  async function start({ operatorSession, targetUserId, reason, readOnly = true }) {
    if (!operatorSession || !isPlatformOperator(operatorSession.user_id, env)) throw fail('Hanya operator platform yang boleh impersonate', 403);
    // An impersonation session cannot start another one.
    if (operatorSession.impersonator_user_id) throw fail('Keluar dari impersonate dulu', 409);
    if (!UUID.test(targetUserId || '')) throw fail('ID akun tidak valid');
    if (targetUserId === operatorSession.user_id) throw fail('Tidak bisa impersonate akun sendiri');
    const why = typeof reason === 'string' ? reason.trim() : '';
    if (why.length < 3 || why.length > 500) throw fail('Alasan wajib diisi (3–500 karakter)');
    const client = await db().connect();
    try {
      await client.query('BEGIN');
      const target = (await client.query('SELECT id, email, suspended_at FROM users WHERE id = $1', [targetUserId])).rows[0];
      if (!target) throw fail('Akun tidak ditemukan', 404);
      if (target.suspended_at) throw fail('Akun ini sedang ditangguhkan', 409);
      const token = createSessionToken();
      const expiresAt = new Date(now().getTime() + IMPERSONATION_TTL_SECONDS * 1000);
      const session = (await client.query(
        'INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING id',
        [target.id, hashSessionToken(token), expiresAt],
      )).rows[0];
      await client.query(
        `INSERT INTO impersonation_sessions (session_id, operator_user_id, target_user_id, reason, read_only)
         VALUES ($1, $2, $3, $4, $5)`,
        [session.id, operatorSession.user_id, target.id, why, readOnly !== false],
      );
      await client.query('COMMIT');
      return { token, expiresAt, target: { id: target.id, email: target.email }, readOnly: readOnly !== false };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Ends the impersonation held by this session token (a no-op if it already expired).
  async function stop(token) {
    if (!token) return false;
    const result = await db().query(
      `WITH ended AS (
         UPDATE sessions s SET revoked_at = COALESCE(s.revoked_at, now()), updated_at = now()
         FROM impersonation_sessions i
         WHERE s.token_hash = $1 AND i.session_id = s.id
         RETURNING s.id
       )
       UPDATE impersonation_sessions SET ended_at = COALESCE(ended_at, now())
       WHERE session_id IN (SELECT id FROM ended) RETURNING session_id`,
      [hashSessionToken(token)],
    );
    return result.rowCount > 0;
  }

  async function history(targetUserId) {
    if (!UUID.test(targetUserId || '')) throw fail('ID akun tidak valid');
    return (await db().query(
      `SELECT i.started_at, i.ended_at, i.reason, i.read_only, u.email AS operator_email
       FROM impersonation_sessions i JOIN users u ON u.id = i.operator_user_id
       WHERE i.target_user_id = $1 ORDER BY i.started_at DESC LIMIT 50`,
      [targetUserId],
    )).rows;
  }

  return { start, stop, history };
}

export const impersonationService = createImpersonationService();
