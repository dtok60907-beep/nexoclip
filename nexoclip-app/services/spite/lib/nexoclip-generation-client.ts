import {
  createCanvasAuthorizationActionDigest,
  signCanvasAuthorization,
} from '@/realtime/internal-auth'

export type DurableGenerationInput = {
  kind: 'image' | 'video'
  prompt: string
  model: string
  parameters: Record<string, unknown>
  idempotencyKey: string
}

export type DurableGeneration = {
  id: string
  kind: 'image' | 'video'
  status: 'queued' | 'running' | 'processing' | 'succeeded' | 'failed'
  result?: Record<string, unknown> | null
  error?: { message?: string } | null
  outputs?: Array<{ assetId: string; contentType?: string; download?: { url: string }; url?: string }>
  providerRequestId?: string
}

export type NexoClipGenerationClient = {
  submit(input: { userId: string; projectId: string; nodeId: string; input: DurableGenerationInput }): Promise<DurableGeneration>
  status(input: { userId: string; projectId: string; nodeId: string; generationId: string }): Promise<DurableGeneration>
  finalizeDraft?(input: { userId: string; projectId: string; nodeId: string; generationId: string }): Promise<DurableGeneration>
}

export class NexoClipGenerationRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'NexoClipGenerationRequestError'
  }
}

type NexoClipGenerationClientEnv = Partial<Pick<NodeJS.ProcessEnv,
  'NEXOCLIP_INTERNAL_URL'
  | 'CANVAS_AUTH_HMAC_SECRET'>>

type ClientOptions = {
  env?: NexoClipGenerationClientEnv
  now?: () => number
  createNonce?: () => string
  fetchFn?: typeof fetch
}

export function createNexoClipGenerationClient(options: ClientOptions = {}): NexoClipGenerationClient {
  const env = (options.env ?? process.env) as NexoClipGenerationClientEnv
  const now = options.now ?? (() => Math.floor(Date.now() / 1000))
  const createNonce = options.createNonce ?? crypto.randomUUID
  const fetchFn = options.fetchFn ?? fetch
  const request = async (
    action: 'submit' | 'status' | 'finalize-draft',
    input: { userId: string; projectId: string; nodeId: string; input?: DurableGenerationInput; generationId?: string },
  ): Promise<DurableGeneration> => {
    const secret = env.CANVAS_AUTH_HMAC_SECRET
    const baseUrl = env.NEXOCLIP_INTERNAL_URL?.trim().replace(/\/$/, '')
    if (!baseUrl || !secret) throw new Error('NexoClip durable generation service is unavailable')

    const actionBody = action === 'submit'
      ? { action, input: input.input! }
      : { action, generationId: input.generationId! }
    const payload = {
      userId: input.userId,
      projectId: input.projectId,
      nodeId: input.nodeId,
      timestamp: now(),
      nonce: createNonce(),
      actionDigest: createCanvasAuthorizationActionDigest(actionBody),
    }
    const signature = signCanvasAuthorization(payload, secret)
    const response = await fetchFn(`${baseUrl}/api/internal/generations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...payload, signature, ...actionBody }),
    })

    if (!response.ok) throw new NexoClipGenerationRequestError(response.status, await safeErrorMessage(response))
    return (await response.json() as { generation: DurableGeneration }).generation
  }

  return {
    submit: (input) => request('submit', input),
    status: (input) => request('status', input),
    finalizeDraft: (input) => request('finalize-draft', input),
  }
}

async function safeErrorMessage(response: Response): Promise<string> {
  const fallback = `NexoClip durable generation request failed (HTTP ${response.status})`
  try {
    const text = await response.text()
    if (!text) return fallback
    try {
      const body = JSON.parse(text) as { error?: unknown; message?: unknown }
      if (typeof body.error === 'string' && body.error.trim()) return body.error
      if (typeof body.message === 'string' && body.message.trim()) return body.message
    } catch {
      // Proxies and platform errors may return plain text or HTML.
    }
    const plainText = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    return plainText ? `${fallback}: ${plainText.slice(0, 240)}` : fallback
  } catch {
    return fallback
  }
}
