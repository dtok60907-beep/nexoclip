import { NextRequest, NextResponse } from 'next/server'

import { getDb } from '@/lib/db'
import { assetExpiresAt } from '@/lib/retention'
import { createTerminalGenerationPatch } from '@/lib/durable-generation'
import { terminalHistoryPatch } from '@/lib/generation-history'
import {
  createNexoClipGenerationClient,
  type NexoClipGenerationClient,
} from '@/lib/nexoclip-generation-client'
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

interface GenerateStatusDeps {
  getDb?: typeof getDb
  getAuthenticatedUser?: typeof getAuthenticatedUser
  createNexoClipGenerationClient?: () => NexoClipGenerationClient
  createInternalRealtimeClient?: () => InternalRealtimeClient
  recordMobileResult?: typeof recordMobileResult
}

// Flow (/m) lists its thread from generation_history, but durable generations
// were never written there, so every result vanished on reload. Record each
// finished mobile result once, keyed by the generation id so repeated polls
// (or two tabs) cannot duplicate it.
async function recordMobileResult(
  sql: ReturnType<typeof getDb>,
  input: { generationId: string; projectId: string; kind: string; url: string; prompt: string; model: string },
): Promise<void> {
  const expiresAt = (await assetExpiresAt())?.toISOString() ?? null
  await sql`
    INSERT INTO generation_history (id, type, model, prompt, r2_url, used_in_canvas, created_at, expires_at, project_id)
    VALUES (${`gen-${input.generationId}`}, ${input.kind === 'video' ? 'video' : 'image'}, ${input.model}, ${input.prompt},
            ${input.url}, false, CURRENT_TIMESTAMP, ${expiresAt}, ${input.projectId})
    ON CONFLICT (id) DO NOTHING
  `
}

export function createGenerateStatusHandler(deps: GenerateStatusDeps = {}) {
  const db = deps.getDb ?? getDb
  const resolveUser = deps.getAuthenticatedUser ?? getAuthenticatedUser
  const createGenerationClient = deps.createNexoClipGenerationClient ?? createNexoClipGenerationClient
  const createRealtimeClient = deps.createInternalRealtimeClient ?? createInternalRealtimeClient
  const recordResult = deps.recordMobileResult ?? recordMobileResult

  return async function GET(request: Request) {
    try {
      const { searchParams } = new URL(request.url)
      const projectId = searchParams.get('projectId') || undefined
      const user = await resolveUser(request)
      if (!user) return unauthorizedResponse()
      if (!projectId || !(await userOwnsProject(db(), user.id, projectId))) return projectNotFoundResponse()

      const nodeId = searchParams.get('nodeId') || undefined
      const mobile = searchParams.get('mobile') === '1'
      const generationId = searchParams.get('generationId') || undefined
      if (!nodeId || !generationId || !/^[a-zA-Z0-9_-]{1,200}$/.test(generationId)) {
        return NextResponse.json({ error: 'nodeId and a valid generationId are required' }, { status: 400 })
      }

      // The generation lookup is already scoped to the caller's workspace.
      // Exporting the whole canvas on every poll (every 2s per open tab) was
      // the most expensive part of this route, so the document is only read
      // once the job is terminal and its result has to be written to the node.
      const generation = await createGenerationClient().status({ userId: user.id, projectId, nodeId, generationId })
      const terminalPatch = createTerminalGenerationPatch(generation)
      const realtime = createRealtimeClient()
      const document = mobile || !terminalPatch ? undefined : await realtime.exportDocument({ userId: user.id, projectId })
      const node = document?.projection.nodes.find((candidate) => candidate.id === nodeId)
      // The finished run also lands in the node's gallery.
      const historyPatch = terminalPatch && node
        ? terminalHistoryPatch(generation, terminalPatch.outputUrl as string | undefined, node.data as Record<string, unknown>)
        : null
      const patch = terminalPatch ? { ...terminalPatch, ...historyPatch } : null
      const matchesNode = node && (
        node.data.generationId === generationId
        || node.data.lastGenerationId === generationId
      )
      if (!mobile && patch && !matchesNode) return projectNotFoundResponse()
      if (patch && node && (
        Object.entries(patch).some(([key, value]) => JSON.stringify(node.data[key]) !== JSON.stringify(value))
        || (['succeeded', 'failed'].includes(generation.status) && typeof node.data.generationId === 'string')
      )) {
        try {
          const set = { ...patch }
          const unset = ['succeeded', 'failed'].includes(generation.status) ? ['generationId'] : []
          await realtime.patchNodeData({ userId: user.id, projectId, nodeId, set, unset })
        } catch (error) {
          console.error('[generation-status] terminal reconciliation deferred', error)
        }
      }

      const outputUrl = patch?.outputUrl as string | undefined
      const error = patch?.generationError as string | null | undefined
      if (mobile && outputUrl && generation.status === 'succeeded') {
        try {
          await recordResult(db(), {
            generationId: generation.id,
            projectId,
            kind: generation.kind,
            url: outputUrl,
            prompt: (searchParams.get('prompt') || '').slice(0, 4000),
            model: (searchParams.get('model') || '').slice(0, 200),
          })
        } catch (recordError) {
          console.error('[generation-status] mobile result not recorded', recordError)
        }
      }
      return NextResponse.json({
        generationId: generation.id,
        generationStatus: patch?.generationStatus ?? (generation.status === 'queued' ? 'queued' : 'processing'),
        ...(outputUrl ? { outputUrl } : {}),
        ...(typeof patch?.lastFrameUrl === 'string' ? { lastFrameUrl: patch.lastFrameUrl } : {}),
        ...((generation.providerRequestId || (generation as unknown as { provider_request_id?: string }).provider_request_id) ? { providerRequestId: generation.providerRequestId || (generation as unknown as { provider_request_id?: string }).provider_request_id } : {}),
        ...(error ? { error } : {}),
      })
    } catch (error: any) {
      return NextResponse.json({ error: error?.message || 'Status check failed' }, { status: Number(error?.status) || 500 })
    }
  }
}

const GET_HANDLER = createGenerateStatusHandler()

export async function GET(request: NextRequest) {
  return GET_HANDLER(request)
}
