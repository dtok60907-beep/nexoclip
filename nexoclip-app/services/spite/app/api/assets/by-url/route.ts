import { NextRequest, NextResponse } from 'next/server'

import { getDb } from '@/lib/db'
import { getAuthenticatedUser } from '@/lib/main-session'
import {
  projectNotFoundResponse,
  unauthorizedResponse,
  userOwnsProject,
} from '@/lib/project-ownership'
import { assetExpiresAt as resolveAssetExpiresAt } from '@/lib/retention'

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => '\\' + c)
}

function extractAssetKey(url: string): string | null {
  if (url.includes('/api/r2-image/')) {
    return url.split('/api/r2-image/')[1] ?? null
  }
  if (url.includes('.r2.dev/')) {
    return url.split('.r2.dev/')[1] ?? null
  }
  return null
}

interface AssetByUrlRouteDeps {
  getDb?: typeof getDb
  getAuthenticatedUser?: typeof getAuthenticatedUser
  assetExpiresAt?: typeof resolveAssetExpiresAt
}

export function createAssetByUrlRouteHandlers(deps: AssetByUrlRouteDeps = {}) {
  const db = deps.getDb ?? getDb
  const resolveUser = deps.getAuthenticatedUser ?? getAuthenticatedUser
  const assetExpiresAt = deps.assetExpiresAt ?? resolveAssetExpiresAt

  return {
    async GET(request: Request) {
      try {
        const user = await resolveUser(request)
        if (!user) return unauthorizedResponse()

        const sql = db()
        const url = new URL(request.url).searchParams.get('url')
        const projectId = new URL(request.url).searchParams.get('projectId')
        if (!url) {
          return NextResponse.json({ error: 'url is required' }, { status: 400 })
        }
        if (!projectId) {
          return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
        }
        if (!(await userOwnsProject(sql, user.id, projectId))) {
          return projectNotFoundResponse()
        }

        const key = extractAssetKey(url)
        const rows = key
          ? await sql`
              SELECT id
              FROM generation_history
              WHERE project_id = ${projectId}
                AND r2_url LIKE ${'%' + escapeLike(key)}
              ORDER BY created_at DESC
              LIMIT 1
            `
          : await sql`
              SELECT id
              FROM generation_history
              WHERE project_id = ${projectId}
                AND r2_url = ${url}
              ORDER BY created_at DESC
              LIMIT 1
            `

        if (rows.length === 0) {
          return NextResponse.json({ id: null })
        }
        return NextResponse.json({ id: rows[0].id })
      } catch (error) {
        console.error('[assets/by-url] GET error:', error)
        return NextResponse.json({ error: 'lookup failed' }, { status: 500 })
      }
    },

    async POST(request: Request) {
      try {
        const user = await resolveUser(request)
        if (!user) return unauthorizedResponse()

        const sql = db()
        const { url, used_in_canvas, projectId } = await request.json()
        if (!url) {
          return NextResponse.json({ error: 'URL is required' }, { status: 400 })
        }
        if (!projectId) {
          return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
        }
        if (!(await userOwnsProject(sql, user.id, String(projectId)))) {
          return projectNotFoundResponse()
        }

        const key = extractAssetKey(String(url))
        const expiresAt = used_in_canvas ? null : ((await assetExpiresAt())?.toISOString() ?? null)
        const result = key
          ? await sql`
              UPDATE generation_history
              SET used_in_canvas = ${used_in_canvas ?? false},
                  expires_at = ${expiresAt}
              WHERE project_id = ${String(projectId)}
                AND r2_url LIKE ${'%' + escapeLike(key)}
                AND (${Boolean(used_in_canvas)} OR NOT EXISTS (SELECT 1 FROM asset_folder_items WHERE asset_folder_items.asset_id = generation_history.id))
              RETURNING id
            `
          : await sql`
              UPDATE generation_history
              SET used_in_canvas = ${used_in_canvas ?? false},
                  expires_at = ${expiresAt}
              WHERE project_id = ${String(projectId)}
                AND r2_url = ${String(url)}
                AND (${Boolean(used_in_canvas)} OR NOT EXISTS (SELECT 1 FROM asset_folder_items WHERE asset_folder_items.asset_id = generation_history.id))
              RETURNING id
            `

        return NextResponse.json({ success: true, updated: result.length })
      } catch (error) {
        console.error('[assets/by-url] Error:', error)
        return NextResponse.json({ error: 'Failed to update asset' }, { status: 500 })
      }
    },
  }
}

const handlers = createAssetByUrlRouteHandlers()

export async function GET(request: NextRequest) {
  return handlers.GET(request)
}

export async function POST(request: NextRequest) {
  return handlers.POST(request)
}
