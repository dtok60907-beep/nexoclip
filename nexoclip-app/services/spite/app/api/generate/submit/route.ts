import { NextRequest, NextResponse } from 'next/server'

import { getDb } from '@/lib/db'
import {
  createNexoClipGenerationClient,
  type NexoClipGenerationClient,
} from '@/lib/nexoclip-generation-client'
import { createQueuedGenerationPatch } from '@/lib/durable-generation'
import { queuedHistoryPatch } from '@/lib/generation-history'
import { getModelById } from '@/lib/fal-models'
import { getAuthenticatedUser } from '@/lib/main-session'
import { mentionStateKey, type PersistedMention } from '@/lib/mention-state'
import type { CanvasProjection } from '@/lib/realtime/document'
import {
  assetNotFoundResponse,
  projectNotFoundResponse,
  unauthorizedResponse,
  userOwnsProject,
} from '@/lib/project-ownership'
import {
  createInternalRealtimeClient,
  type InternalRealtimeClient,
} from '@/lib/realtime/internal-client'

interface GenerateSubmitDeps {
  getDb?: typeof getDb
  getAuthenticatedUser?: typeof getAuthenticatedUser
  createNexoClipGenerationClient?: () => NexoClipGenerationClient
  createInternalRealtimeClient?: () => InternalRealtimeClient
}

export function createGenerateSubmitHandler(deps: GenerateSubmitDeps = {}) {
  const db = deps.getDb ?? getDb
  const resolveUser = deps.getAuthenticatedUser ?? getAuthenticatedUser
  const createGenerationClient = deps.createNexoClipGenerationClient ?? createNexoClipGenerationClient
  const createRealtimeClient = deps.createInternalRealtimeClient ?? createInternalRealtimeClient

  return async function POST(request: Request) {
    if (process.env.GENERATION_DISABLED === '1') {
      return NextResponse.json({ error: 'Generation is currently disabled by admin.' }, { status: 503 })
    }

    try {
      const body = await request.json()
      const projectId = typeof body.projectId === 'string' ? body.projectId : undefined
      const user = await resolveUser(request)
      if (!user) return unauthorizedResponse()
      const sql = db()
      if (!projectId || !(await userOwnsProject(sql, user.id, projectId))) return projectNotFoundResponse()

      const nodeId = typeof body.nodeId === 'string' ? body.nodeId : undefined
      const mobile = body.mobile === true
      // Jobs 2..4 of one batch: allowed while the node tracks job 1, and they
      // must not replace the node's tracked generation (the client puts each
      // extra job on its own duplicate node).
      const batchIndex = Number(body.batchIndex)
      const batchExtra = body.batchExtra === true && Number.isInteger(batchIndex) && batchIndex >= 1 && batchIndex <= 11
      const kind = body.kind === 'image' || body.kind === 'video' ? body.kind : undefined
      const prompt = typeof body.prompt === 'string' ? body.prompt : undefined
      const modelId = typeof body.model === 'string' ? body.model : typeof body.modelId === 'string' ? body.modelId : undefined
      if (!nodeId || !kind || !prompt || !modelId) {
        return NextResponse.json({ error: 'projectId, nodeId, kind, prompt, and model are required' }, { status: 400 })
      }
      const configuredModel = getModelById(modelId)
      const model = configuredModel && configuredModel.category === kind
        ? `${configuredModel.provider}/${configuredModel.providerModel}`
        : modelId

      const realtime = createRealtimeClient()
      let durablePromptState: DurablePromptState | null = null
      let nodeData: Record<string, unknown> | undefined
      if (!mobile) {
        const document = await realtime.exportDocument({ userId: user.id, projectId })
        const node = document.projection.nodes.find((candidate) => candidate.id === nodeId)
        nodeData = node?.data as Record<string, unknown> | undefined
        if (!node || node.type !== (kind === 'image' ? 'imageGen' : 'videoGen')) return projectNotFoundResponse()
        if (!batchExtra && typeof node.data.generationId === 'string' && ['queued', 'processing', 'running'].includes(String(node.data.generationStatus))) {
          return NextResponse.json({ error: 'This node already has an active generation' }, { status: 409 })
        }

        durablePromptState = resolveDurablePromptState(document.projection, nodeId)
        if (!durablePromptState || body.promptStateKey !== durablePromptState.stateKey) {
          return NextResponse.json({
            error: 'Prompt changed locally but is not persisted yet. Please wait for it to finish saving and try again.',
            code: 'PROMPT_STATE_NOT_PERSISTED',
          }, { status: 409 })
        }
      }

      // Omni source videos and audio clips arrive as @mention folder URLs too,
      // so they go through the same ownership check as images.
      const references = [...collectReferences(body), ...collectMediaReferences(body)]
      const legacyReferences = references.filter(isLegacyCanvasReference)
      if (legacyReferences.length && !(await projectOwnsLegacyReferences(sql, projectId, legacyReferences))) {
        return assetNotFoundResponse()
      }

      const parameters = mapLegacyParameters(body, kind)
      const supportedRatios = configuredModel?.aspectRatios ?? ['1:1', '16:9', '9:16', '4:3', '3:4']
      if (parameters.aspectRatio === 'auto') delete parameters.aspectRatio
      else if (parameters.aspectRatio !== undefined && !supportedRatios.includes(String(parameters.aspectRatio))) {
        return NextResponse.json({ error: `Aspect ratio is not supported by ${configuredModel?.name ?? 'this model'}` }, { status: 400 })
      }
      const generation = await createGenerationClient().submit({
        userId: user.id,
        projectId,
        nodeId,
        input: { kind, prompt, model, parameters, idempotencyKey: `spite:${projectId}:${nodeId}:${crypto.randomUUID()}` },
      })
      if (!mobile && !batchExtra) {
        // Record the run in the node's gallery (and drop its oldest runs).
        const history = queuedHistoryPatch(generation, nodeData)
        await realtime.patchNodeData({
          userId: user.id,
          projectId,
          nodeId,
          set: { ...createQueuedGenerationPatch(generation), ...history.set },
          ...(history.unset.length ? { unset: history.unset } : {}),
        })
      }

      return NextResponse.json({ generationId: generation.id, generationStatus: 'queued' }, { status: 202 })
    } catch (error: any) {
      return NextResponse.json({ error: error?.message || 'Generation failed' }, { status: Number(error?.status) || 500 })
    }
  }
}

type DurablePromptState = {
  stateKey: string
}

function resolveDurablePromptState(
  projection: CanvasProjection,
  generationNodeId: string,
): DurablePromptState | null {
  const promptEdge = projection.edges
    .filter((edge) => edge.target === generationNodeId && edge.targetHandle === 'prompt-in')
    .sort((left, right) => left.id.localeCompare(right.id))[0]
  const promptNode = promptEdge
    ? projection.nodes.find((node) => node.id === promptEdge.source && node.type === 'prompt')
    : undefined
  if (!promptNode) return null

  const mentions = normalizePersistedMentions(promptNode.data.mentions)
  return {
    stateKey: mentionStateKey(String(promptNode.data.text ?? '').trim(), mentions),
  }
}

function normalizePersistedMentions(value: unknown): PersistedMention[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const mention = entry as Record<string, unknown>
    if (typeof mention.folderId !== 'string' || typeof mention.name !== 'string') return []
    const selectedAssetIds = Array.isArray(mention.selectedAssetIds)
      ? mention.selectedAssetIds.filter((id): id is string => typeof id === 'string')
      : []
    const selectedWorkspaceAssetIds = Array.isArray(mention.selectedWorkspaceAssetIds)
      ? mention.selectedWorkspaceAssetIds.filter((id): id is string => typeof id === 'string')
      : []
    return [{
      folderId: mention.folderId,
      name: mention.name,
      selectedAssetIds,
      ...(selectedWorkspaceAssetIds.length > 0 ? { selectedWorkspaceAssetIds } : {}),
    }]
  })
}

function mapLegacyParameters(body: Record<string, unknown>, kind: 'image' | 'video'): Record<string, unknown> {
  const settings = body.settings && typeof body.settings === 'object' && !Array.isArray(body.settings)
    ? body.settings as Record<string, unknown>
    : {}
  const allowed = kind === 'image'
    ? new Set(['aspectRatio', 'resolution', 'quality', 'seed', 'name', 'swap_url'])
    : new Set(['aspectRatio', 'duration', 'resolution', 'seed', 'videoUrl', 'videoUrls', 'audioUrls', 'draft', 'outputFormat', 'generateAudio', 'watermark', 'returnLastFrame', 'omniReferenceTaskType', 'draftTaskId'])
  const unsupported = Object.keys(settings).filter((key) => !allowed.has(key))
  if (unsupported.length) {
    throw Object.assign(new Error(`Unsupported durable generation parameters: ${unsupported.join(', ')}`), { status: 400 })
  }

  const referenceImages = collectReferences(body)
  if (kind === 'image') {
    if (body.endImageUrl !== undefined) {
      throw Object.assign(new Error('endImageUrl is only supported for video generations'), { status: 400 })
    }
    const parameters: Record<string, unknown> = {}
    for (const key of allowed) if (settings[key] !== undefined && settings[key] !== '') parameters[key] = settings[key]
    if (referenceImages.length) parameters.referenceImages = referenceImages
    return parameters
  }

  const frameImages = [
    typeof body.referenceImageUrl === 'string' ? { url: body.referenceImageUrl, frameType: 'first_frame' } : undefined,
    typeof body.endImageUrl === 'string' ? { url: body.endImageUrl, frameType: 'last_frame' } : undefined,
  ].filter(Boolean)
  const stringList = (value: unknown) => Array.isArray(value) ? value.filter((url): url is string => typeof url === 'string' && url.length > 0) : []
  // `videoUrl` is the single source video older clients send.
  const videoUrls = [...new Set([...(typeof settings.videoUrl === 'string' ? [settings.videoUrl] : []), ...stringList(settings.videoUrls)])]
  const audioUrls = [...new Set(stringList(settings.audioUrls))]
  const tenantReferences = [...referenceImages, ...frameImages.map((frame) => frame!.url), ...videoUrls, ...audioUrls]
  if (tenantReferences.some((url) => !/^\/api\/assets\/[^/]+\/download(?:\?|$)/.test(url) && !isLegacyCanvasReference(url))) {
    throw Object.assign(new Error('Video references must be tenant assets or owned Canvas references'), { status: 400 })
  }
  const isSeedance25 = typeof body.model === 'string' && body.model.includes('seedance-2.5')
  const isExtend = settings.omniReferenceTaskType === 'extend'
  const isEdit = settings.omniReferenceTaskType === 'edit'
  const requestedRatio = typeof settings.aspectRatio === 'string' ? settings.aspectRatio : ''
  if ((isExtend || isEdit) && videoUrls.length === 0) {
    throw Object.assign(new Error(`Seedance ${isEdit ? 'edit' : 'extend'} requires a source video.`), { status: 400 })
  }
  if (settings.draft === true && (!isSeedance25 || settings.resolution !== '480p')) {
    throw Object.assign(new Error('Draft mode is only supported for Seedance 2.5 at 480p.'), { status: 400 })
  }
  if (settings.draftTaskId && (!isSeedance25 || settings.resolution !== '1080p')) {
    throw Object.assign(new Error('Draft finalization requires Seedance 2.5 at 1080p.'), { status: 400 })
  }
  // Draft, extend, and edit always use adaptive ratio. Normalize stale clients
  // rather than rejecting requests created before the Canvas control was added.
  const parameters: Record<string, unknown> = { aspectRatio: isSeedance25 && (isExtend || isEdit || settings.draft === true) ? 'adaptive' : (requestedRatio || '16:9') }
  for (const key of ['resolution', 'seed', 'draft', 'outputFormat', 'generateAudio', 'watermark', 'returnLastFrame', 'omniReferenceTaskType', 'draftTaskId']) {
    if (settings[key] !== undefined && settings[key] !== '') parameters[key] = settings[key]
  }
  // 'auto' (-1) lets Seedance pick the length; edit always keeps the source length.
  if (isSeedance25 && (isEdit || settings.duration === 'auto')) parameters.duration = -1
  else if (settings.duration !== undefined) parameters.duration = Number.parseInt(String(settings.duration), 10)
  if (referenceImages.length) parameters.referenceImages = referenceImages
  if (videoUrls.length) parameters.referenceVideos = videoUrls
  if (audioUrls.length) parameters.referenceAudios = audioUrls
  if (frameImages.length) parameters.frameImages = frameImages
  return parameters
}

// The app has been served from /spite and, more recently, /canvas
// (NEXT_PUBLIC_BASE_PATH); either prefix may still show up on stored or
// freshly-uploaded r2-image URLs, so both must be recognized here.
function isLegacyCanvasReference(url: string): boolean {
  return /^\/(?:spite\/|canvas\/)?api\/r2-image\/.+/.test(url)
}

async function projectOwnsLegacyReferences(sql: ReturnType<typeof getDb>, projectId: string, references: string[]): Promise<boolean> {
  const normalizedReferences = [...new Set(references.map((url) => url.replace(/^\/(?:spite|canvas)/, '')))]
  const rows = await sql`
    SELECT count(DISTINCT regexp_replace(r2_url, '^/(spite|canvas)', ''))::int AS owned_count
    FROM generation_history
    WHERE project_id = ${projectId}
      AND regexp_replace(r2_url, '^/(spite|canvas)', '') = ANY(${normalizedReferences}::text[])
  ` as Array<{ owned_count: number }>
  return Number(rows[0]?.owned_count ?? 0) === normalizedReferences.length
}

function collectReferences(body: Record<string, unknown>): string[] {
  const references = [
    typeof body.referenceImageUrl === 'string' ? body.referenceImageUrl : undefined,
    ...(Array.isArray(body.referenceImageUrls) ? body.referenceImageUrls : []),
    ...(Array.isArray(body.referenceGroups)
      ? body.referenceGroups.flatMap((group) => group && typeof group === 'object' && Array.isArray((group as { urls?: unknown }).urls)
        ? (group as { urls: unknown[] }).urls
        : [])
      : []),
  ]
  return [...new Set(references.filter((value): value is string => typeof value === 'string' && value.length > 0))]
}

function collectMediaReferences(body: Record<string, unknown>): string[] {
  const settings = body.settings && typeof body.settings === 'object' && !Array.isArray(body.settings)
    ? body.settings as Record<string, unknown>
    : {}
  const values = [
    settings.videoUrl,
    ...(Array.isArray(settings.videoUrls) ? settings.videoUrls : []),
    ...(Array.isArray(settings.audioUrls) ? settings.audioUrls : []),
  ]
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))]
}

const POST_HANDLER = createGenerateSubmitHandler()

export async function POST(request: NextRequest) {
  return POST_HANDLER(request)
}
