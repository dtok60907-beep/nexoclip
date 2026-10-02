import type { DurableGeneration } from './nexoclip-generation-client'

const ACTIVE = new Set(['queued', 'running', 'processing'])
const TERMINAL = new Set(['succeeded', 'failed'])

export function createQueuedGenerationPatch(
  generation: DurableGeneration,
  submittedAt = Date.now(),
): Record<string, unknown> {
  const generationStatus = generation.status === 'queued' ? 'queued' : 'processing'
  return {
    generationId: generation.id,
    generationStatus,
    generationError: null,
    status: generationStatus === 'queued' ? 'in_queue' : 'in_progress',
    error: null,
    submittedAt,
  }
}

export function createTerminalGenerationPatch(generation: DurableGeneration): Record<string, unknown> | null {
  if (!TERMINAL.has(generation.status)) return null

  if (generation.status === 'succeeded') {
    const outputUrl = generation.outputs?.find((output) => output.download?.url)?.download?.url
    // A video job asked for return_last_frame also stores its last frame as
    // an image output; null clears a previous run's frame.
    const lastFrameUrl = generation.kind === 'video'
      ? generation.outputs?.find((output) => output.contentType?.startsWith('image/') && output.download?.url)?.download?.url ?? null
      : undefined
    if (outputUrl) {
      return {
        lastGenerationId: generation.id,
        generationStatus: 'completed',
        generationError: null,
        outputUrl,
        ...(lastFrameUrl !== undefined ? { lastFrameUrl } : {}),
        status: 'completed',
        error: null,
      }
    }

    return failedPatch(generation.id, 'Generation completed without media output.')
  }

  return failedPatch(generation.id, generation.error?.message || 'Generation failed. Please retry.')
}

export function needsDurableGenerationRecovery(data: Record<string, unknown>): boolean {
  return typeof data.generationId === 'string'
    && typeof data.generationStatus === 'string'
    && ACTIVE.has(data.generationStatus)
}

function failedPatch(generationId: string, message: string): Record<string, unknown> {
  return {
    lastGenerationId: generationId,
    generationStatus: 'failed',
    generationError: message,
    status: 'failed',
    error: message,
  }
}
