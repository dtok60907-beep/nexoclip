import type { Sql } from '@/lib/db'

export const NODE_LOCK_LEASE_SECONDS = 15
export const PROMPT_LOCK_LEASE_SECONDS = NODE_LOCK_LEASE_SECONDS

let canvasLockSchemaReady: Promise<void> | null = null

type CanvasNodeLockInput = {
  projectId: string
  nodeId: string
  participantId: string
  userId: string
}

export async function ensureCanvasNodeLocks(sql: Sql): Promise<void> {
  if (canvasLockSchemaReady) return canvasLockSchemaReady
  // Keep the historical physical table during rolling deployment. Old Prompt
  // instances and new generic-node instances therefore share one authority.
  canvasLockSchemaReady = sql`
    CREATE TABLE IF NOT EXISTS canvas_prompt_editor_locks (
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      node_id text NOT NULL,
      participant_id text NOT NULL,
      user_id text NOT NULL,
      expires_at timestamptz NOT NULL,
      PRIMARY KEY (project_id, node_id)
    )
  `.then(() => undefined).catch((error) => {
    canvasLockSchemaReady = null
    throw error
  })
  return canvasLockSchemaReady
}

export async function claimCanvasNodeLock(sql: Sql, input: CanvasNodeLockInput) {
  const rows = await sql`
    INSERT INTO canvas_prompt_editor_locks (project_id, node_id, participant_id, user_id, expires_at)
    VALUES (${input.projectId}, ${input.nodeId}, ${input.participantId}, ${input.userId}, now() + interval '15 seconds')
    ON CONFLICT (project_id, node_id) DO UPDATE
      -- Taking over an expired lock must also take ownership; renewing only
      -- expires_at left the previous holder in place, so the new holder's
      -- first heartbeat failed ("lock ended") and the old tab held it again.
      SET expires_at = now() + interval '15 seconds',
          participant_id = EXCLUDED.participant_id,
          user_id = EXCLUDED.user_id
      WHERE canvas_prompt_editor_locks.expires_at <= now()
        OR (canvas_prompt_editor_locks.participant_id = ${input.participantId}
          AND canvas_prompt_editor_locks.user_id = ${input.userId})
    RETURNING participant_id, expires_at
  `
  return rows[0] ?? null
}

export async function heartbeatCanvasNodeLock(sql: Sql, input: CanvasNodeLockInput) {
  const rows = await sql`
    UPDATE canvas_prompt_editor_locks
    SET expires_at = now() + interval '15 seconds'
    WHERE project_id = ${input.projectId}
      AND node_id = ${input.nodeId}
      AND participant_id = ${input.participantId}
      AND user_id = ${input.userId}
      AND expires_at > now()
    RETURNING participant_id, expires_at
  `
  return rows[0] ?? null
}

export async function releaseCanvasNodeLock(sql: Sql, input: CanvasNodeLockInput): Promise<void> {
  await sql`
    DELETE FROM canvas_prompt_editor_locks
    WHERE project_id = ${input.projectId}
      AND node_id = ${input.nodeId}
      AND participant_id = ${input.participantId}
      AND user_id = ${input.userId}
  `
}

// Who holds a live lock, so a refused claim can say "your other tab" rather
// than "another user" when it is the same person.
export async function readCanvasNodeLockHolder(sql: Sql, input: Pick<CanvasNodeLockInput, 'projectId' | 'nodeId'>): Promise<string | null> {
  const rows = await sql`
    SELECT user_id FROM canvas_prompt_editor_locks
    WHERE project_id = ${input.projectId} AND node_id = ${input.nodeId} AND expires_at > now()
  ` as Array<{ user_id: string }>
  return rows[0]?.user_id ?? null
}

export const ensurePromptEditorLocks = ensureCanvasNodeLocks
export const claimPromptEditorLock = claimCanvasNodeLock
export const heartbeatPromptEditorLock = heartbeatCanvasNodeLock
export const releasePromptEditorLock = releaseCanvasNodeLock
