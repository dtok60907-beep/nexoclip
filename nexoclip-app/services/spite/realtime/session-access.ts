import type { Queryable } from './db'

export type SessionIdentity = { userId: string; sessionId: string }
export type SessionAccessCheck = (identity: SessionIdentity) => Promise<boolean>

// This query belongs to the SaaS auth database, which may differ from Canvas DB.
export function createSessionAccessCheck(database: Queryable): SessionAccessCheck {
  return async ({ userId, sessionId }) => {
    const result = await database.query(
      `SELECT s.id FROM sessions s JOIN users u ON u.id=s.user_id
       WHERE s.id=$1::uuid AND s.user_id=$2::uuid AND u.suspended_at IS NULL
         AND s.revoked_at IS NULL AND s.expires_at>now()`,
      [sessionId, userId],
    )
    return result.rows.length === 1
  }
}
