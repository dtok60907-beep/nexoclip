import type { getDb } from './db'

let projectsOriginReady = false
export async function ensureProjectsOrigin(sql: ReturnType<typeof getDb>) {
  if (projectsOriginReady) return
  await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'canvas', ADD COLUMN IF NOT EXISTS library_workspace_id uuid`
  projectsOriginReady = true
}

