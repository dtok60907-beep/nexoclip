import { NextResponse } from 'next/server'

import { getDb } from '@/lib/db'
import { getAuthenticatedUser } from '@/lib/main-session'
import { projectNotFoundResponse, unauthorizedResponse, userOwnsProject } from '@/lib/project-ownership'
import { issueRealtimeToken } from '@/realtime/auth'

interface RealtimeTokenHandlerDeps {
  getDb?: typeof getDb
  getAuthenticatedUser?: typeof getAuthenticatedUser
  userOwnsProject?: typeof userOwnsProject
  issueRealtimeToken?: typeof issueRealtimeToken
  env?: Partial<Pick<NodeJS.ProcessEnv, 'REALTIME_TOKEN_SECRET'>>
}

export function createRealtimeTokenHandler(deps: RealtimeTokenHandlerDeps = {}) {
  const db = deps.getDb ?? getDb
  const resolveUser = deps.getAuthenticatedUser ?? getAuthenticatedUser
  const ownsProject = deps.userOwnsProject ?? userOwnsProject
  const issueToken = deps.issueRealtimeToken ?? issueRealtimeToken
  const env = deps.env ?? process.env

  return async function POST(request: Request) {
    let projectId: unknown
    try {
      ({ projectId } = await request.json())
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    if (typeof projectId !== 'string' || projectId.length === 0) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const user = await resolveUser(request)
    if (!user || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.sessionId ?? '')) return unauthorizedResponse()

    const secret = env.REALTIME_TOKEN_SECRET?.trim()
    if (!secret) {
      return NextResponse.json({ error: 'Realtime service is unavailable' }, { status: 500 })
    }

    if (!(await ownsProject(db(), user.id, projectId))) {
      return projectNotFoundResponse()
    }

    const token = await issueToken({ userId: user.id, projectId, sessionId: user.sessionId! }, secret)
    return NextResponse.json(token)
  }
}

const POST_HANDLER = createRealtimeTokenHandler()

export async function POST(request: Request) {
  return POST_HANDLER(request)
}
