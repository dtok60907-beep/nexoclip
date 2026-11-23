import { ensureProjectsOrigin } from '@/lib/projects-origin'
import { getDb } from '@/lib/db'
import { getAuthenticatedUser } from '@/lib/main-session'
import {
  projectNotFoundResponse,
  unauthorizedResponse,
  userOwnsProject,
} from '@/lib/project-ownership'
import {
  createInternalRealtimeClient,
  type InternalRealtimeClient,
} from '@/lib/realtime/internal-client'
import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'

// Duplicate a project by creating a new project row, exporting the source
// project's authoritative realtime document, and replacing the new project's
// document through the trusted realtime API. Asset/generation history is not
// cloned — the copy references the same stored assets as the original.
interface DuplicateProjectDeps {
  getDb?: typeof getDb
  getAuthenticatedUser?: typeof getAuthenticatedUser
  createProjectId?: () => string
  createInternalRealtimeClient?: () => InternalRealtimeClient
}

export function createDuplicateProjectHandler(deps: DuplicateProjectDeps = {}) {
  const db = deps.getDb ?? getDb
  const resolveUser = deps.getAuthenticatedUser ?? getAuthenticatedUser
  const createProjectId = deps.createProjectId ?? uuidv4
  const internalRealtime = deps.createInternalRealtimeClient ?? createInternalRealtimeClient

  return async function POST(
    request: Request,
    { params }: { params: Promise<{ projectId: string }> },
  ) {
    try {
      const user = await resolveUser(request)
      if (!user) return unauthorizedResponse()

      const sql = db()
      const { projectId } = await params
      if (!(await userOwnsProject(sql, user.id, projectId))) {
        return projectNotFoundResponse()
      }

      await ensureProjectsOrigin(sql)
      const original = await sql`
        SELECT library_workspace_id, name, description, thumbnail, COALESCE(origin, 'canvas') AS origin
        FROM projects
        WHERE id = ${projectId}
      `
      if (original.length === 0) {
        return projectNotFoundResponse()
      }

      const newId = createProjectId()
      const newName = `${original[0].name} (Copy)`
      const realtime = internalRealtime()
      const projection = await realtime.exportDocument({
        userId: user.id,
        projectId,
      })

      const inserted = await sql`
        INSERT INTO projects (id, userid, name, description, thumbnail, origin, library_workspace_id, createdat, updatedat)
        VALUES (
          ${newId},
          ${user.id},
          ${newName},
          ${original[0].description || ''},
          ${original[0].thumbnail || null},
          ${original[0].origin},
          ${user.workspaceId ?? original[0].library_workspace_id ?? null},
          NOW(),
          NOW()
        )
        RETURNING id, name, description, thumbnail, origin, createdat, updatedat
      `

      try {
        await realtime.replaceDocument({
          userId: user.id,
          projectId: newId,
          projection: projection.projection,
        })
      } catch (error) {
        await sql`
          DELETE FROM projects
          WHERE id = ${newId} AND userid = ${user.id}
        `
        throw error
      }

      return NextResponse.json(inserted[0])
    } catch (error) {
      console.error('[projects] Duplicate failed:', error)
      return NextResponse.json({ error: 'Failed to duplicate project' }, { status: 500 })
    }
  }
}

const POST_HANDLER = createDuplicateProjectHandler()

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  return POST_HANDLER(request, context)
}
