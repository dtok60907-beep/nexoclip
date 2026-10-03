import type { DurableGeneration } from './nexoclip-generation-client'

// Every generation a node ran, kept in the node's own data so it syncs live
// and survives reloads: one `gen:<generationId>` key per run, so runs that
// finish at the same time never overwrite each other. The server writes it
// on submit (queued) and when the run finishes (succeeded / failed).

export type GenerationHistoryEntry = {
  id: string
  kind: 'image' | 'video'
  status: 'queued' | 'succeeded' | 'failed'
  outputUrl?: string
  error?: string
  startedAt?: number
  finishedAt?: number
}

export const HISTORY_PREFIX = 'gen:'
export const MAX_HISTORY_ENTRIES = 30
const historyKey = (generationId: string) => `${HISTORY_PREFIX}${generationId}`

function readEntry(value: unknown): GenerationHistoryEntry | null {
  if (!value || typeof value !== 'object') return null
  const entry = value as Partial<GenerationHistoryEntry>
  if (typeof entry.id !== 'string' || !['queued', 'succeeded', 'failed'].includes(String(entry.status))) return null
  return {
    id: entry.id,
    kind: entry.kind === 'video' ? 'video' : 'image',
    status: entry.status as GenerationHistoryEntry['status'],
    ...(typeof entry.outputUrl === 'string' && entry.outputUrl ? { outputUrl: entry.outputUrl } : {}),
    ...(typeof entry.error === 'string' && entry.error ? { error: entry.error } : {}),
    ...(typeof entry.startedAt === 'number' ? { startedAt: entry.startedAt } : {}),
    ...(typeof entry.finishedAt === 'number' ? { finishedAt: entry.finishedAt } : {}),
  }
}

const entryTime = (entry: GenerationHistoryEntry) => entry.startedAt ?? entry.finishedAt ?? 0

// Newest first.
export function readGenerationHistory(data: Record<string, unknown> | undefined | null): GenerationHistoryEntry[] {
  return Object.entries(data ?? {})
    .filter(([key]) => key.startsWith(HISTORY_PREFIX))
    .map(([, value]) => readEntry(value))
    .filter((entry): entry is GenerationHistoryEntry => entry !== null)
    .sort((a, b) => entryTime(b) - entryTime(a) || b.id.localeCompare(a.id))
}

// On submit: a queued entry, plus removal of the oldest entries beyond the cap.
export function queuedHistoryPatch(
  generation: Pick<DurableGeneration, 'id' | 'kind'>,
  data: Record<string, unknown> | undefined,
  now = Date.now(),
): { set: Record<string, unknown>; unset: string[] } {
  const existing = readGenerationHistory(data).filter((entry) => entry.id !== generation.id)
  const unset = existing.slice(MAX_HISTORY_ENTRIES - 1).map((entry) => historyKey(entry.id))
  return {
    set: { [historyKey(generation.id)]: { id: generation.id, kind: generation.kind, status: 'queued', startedAt: now } },
    unset,
  }
}

// When a run finishes: its final status and output or error, keeping the
// start time recorded on submit.
export function terminalHistoryPatch(
  generation: DurableGeneration,
  outputUrl: string | undefined,
  data: Record<string, unknown> | undefined,
  now = Date.now(),
): Record<string, unknown> | null {
  if (generation.status !== 'succeeded' && generation.status !== 'failed') return null
  const previous = readEntry(data?.[historyKey(generation.id)])
  const succeeded = generation.status === 'succeeded' && Boolean(outputUrl)
  const entry: GenerationHistoryEntry = {
    id: generation.id,
    kind: generation.kind,
    status: succeeded ? 'succeeded' : 'failed',
    ...(succeeded ? { outputUrl } : { error: generation.error?.message || (generation.status === 'succeeded' ? 'Generation completed without media output.' : 'Generation failed.') }),
    ...(previous?.startedAt !== undefined ? { startedAt: previous.startedAt } : {}),
    finishedAt: previous?.finishedAt ?? now,
  }
  return { [historyKey(generation.id)]: entry }
}
