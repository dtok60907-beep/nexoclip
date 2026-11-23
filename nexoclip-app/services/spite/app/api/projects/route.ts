import { ensureProjectsOrigin } from '@/lib/projects-origin'
import { getDb } from '@/lib/db'
import { getAuthenticatedUser } from '@/lib/main-session'
import { unauthorizedResponse } from '@/lib/project-ownership'
import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'

// `origin` distinguishes how a project is meant to be worked in: 'canvas' (the
// node graph, the default) vs 'flow' (the simple, linear prompt→result
// generation thread — the Flow mode, usable on phone and desktop). The
// dashboard groups them separately and opens Flow projects in the thread UI
// instead of the canvas. Anything that isn't 'canvas' is treated as Flow, so
// legacy 'mobile' rows keep working. Cached so the idempotent ALTER runs once
// per serverless instance, not per request.
interface ProjectsRouteDeps {
  getDb?: typeof getDb
  getAuthenticatedUser?: typeof getAuthenticatedUser
  createProjectId?: () => string
}

export function createProjectsRouteHandlers(deps: ProjectsRouteDeps = {}) {
  const db = deps.getDb ?? getDb
  const resolveUser = deps.getAuthenticatedUser ?? getAuthenticatedUser
  const createProjectId = deps.createProjectId ?? uuidv4

  return {
    async POST(request: Request) {
      try {
        const user = await resolveUser(request)
        if (!user) return unauthorizedResponse()

        const sql = db()
        await ensureProjectsOrigin(sql)
        const { name, description, origin } = await request.json()
        const projectId = createProjectId()
        const safeOrigin = origin === 'flow' || origin === 'mobile' ? 'flow' : 'canvas'

        const result = await sql`
          INSERT INTO projects (id, userid, name, description, origin, library_workspace_id, createdat, updatedat)
          VALUES (${projectId}, ${user.id}, ${name || 'Untitled Project'}, ${description || ''}, ${safeOrigin}, ${user.workspaceId ?? null}, NOW(), NOW())
          RETURNING id, name, description, thumbnail, origin, createdat, updatedat
        `

        return NextResponse.json(result[0])
      } catch (error) {
        console.error('[projects] Error creating project:', error)
        return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
      }
    },

    async GET(request: Request) {
      try {
        const user = await resolveUser(request)
        if (!user) return unauthorizedResponse()

        const sql = db()
        await ensureProjectsOrigin(sql)
        // Pull each project plus the URL of its "shot 1" node, if any. The
        // LATERAL join finds the first canvas_node whose data.shotId is
        // 'shot-1' for that project and returns whichever URL field it has
        // (image outputUrl, video poster, or raw thumbnail). Falling back to
        // the project's own thumbnail column lets explicit overrides work
        // too. Sorted by updatedat DESC so the most recently edited project
        // surfaces at the top.
        const projects = await sql`
          SELECT
            p.id,
            p.library_workspace_id,
            p.name,
            p.description,
            COALESCE(shot1.thumb, p.thumbnail) AS thumbnail,
            COALESCE(p.origin, 'canvas') AS origin,
            p.createdat,
            p.updatedat
          FROM projects p
          LEFT JOIN LATERAL (
            -- COALESCE order matters here. videoThumbnail is the poster
            -- frame the video node captures from the first frame of the
            -- generated clip; outputUrl is the .mp4 itself. The dashboard
            -- renders the result inside an <img> tag — if we hand it the
            -- .mp4 first, it shows a broken image. Always prefer the
            -- poster, fall through to outputUrl only when no poster
            -- exists (e.g. image-gen shots that don't have one).
            --
            -- Also accept selectedShotId as a legacy alias for shotId.
            -- Older reference-node code wrote to selectedShotId and never
            -- showed up here; new code writes shotId.
            SELECT COALESCE(
              data->>'videoThumbnail',
              data->>'outputUrl',
              data->>'thumbnail',
              data->>'assetUrl'
            ) AS thumb
            FROM canvas_nodes
            WHERE projectId = p.id::text
              AND (data->>'shotId' = 'shot-1' OR data->>'selectedShotId' = 'shot-1')
              AND COALESCE(
                data->>'videoThumbnail',
                data->>'outputUrl',
                data->>'thumbnail',
                data->>'assetUrl'
              ) IS NOT NULL
            LIMIT 1
          ) shot1 ON true
          WHERE p.userid = ${user.id}
          ORDER BY p.updatedat DESC
        `

        return NextResponse.json(projects)
      } catch (error) {
        console.error('[projects] Error fetching projects:', error)
        return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
      }
    },
  }
}

const handlers = createProjectsRouteHandlers()

export async function POST(request: NextRequest) {
  return handlers.POST(request)
}

export async function GET(request: NextRequest) {
  return handlers.GET(request)
}
