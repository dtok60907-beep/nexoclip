import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getAuthenticatedUser } from '@/lib/main-session'
import { createNexoClipGenerationClient } from '@/lib/nexoclip-generation-client'
import { projectNotFoundResponse, unauthorizedResponse, userOwnsProject } from '@/lib/project-ownership'
import { createInternalRealtimeClient } from '@/lib/realtime/internal-client'

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) return unauthorizedResponse()
    const body = await request.json() as { projectId?: unknown; nodeId?: unknown; generationId?: unknown }
    const projectId = typeof body.projectId === 'string' ? body.projectId : ''
    const nodeId = typeof body.nodeId === 'string' ? body.nodeId : ''
    const generationId = typeof body.generationId === 'string' ? body.generationId : ''
    if (!projectId || !nodeId || !generationId) return NextResponse.json({ error: 'projectId, nodeId, and generationId are required' }, { status: 400 })
    if (!(await userOwnsProject(getDb(), user.id, projectId))) return projectNotFoundResponse()
    const document = await createInternalRealtimeClient().exportDocument({ userId: user.id, projectId })
    const node = document.projection.nodes.find((candidate) => candidate.id === nodeId)
    if (!node || node.data.lastGenerationId !== generationId || node.data.draftMode !== true) return projectNotFoundResponse()
    const client = createNexoClipGenerationClient()
    if (!client.finalizeDraft) return NextResponse.json({ error: 'Draft finalization is unavailable' }, { status: 503 })
    const generation = await client.finalizeDraft({ userId: user.id, projectId, nodeId, generationId })
    return NextResponse.json({ generation }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Draft finalization failed' }, { status: Number(error?.status) || 500 })
  }
}
