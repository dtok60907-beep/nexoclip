// How generator nodes poll a durable job. Polling every 2s made each open tab
// hit /api/generate/status ~180 times for one 6-minute video; the server
// already reconciles the finished result into the shared canvas, so a slower
// cadence (and no polling from hidden tabs) loses nothing.
export const FIRST_POLL_DELAY_MS = 4_000
export const EARLY_POLL_INTERVAL_MS = 5_000
export const LATE_POLL_INTERVAL_MS = 10_000
const EARLY_PHASE_MS = 2 * 60 * 1000

// The worker keeps a job alive for up to three 10-minute attempts; the node
// only gives up well after that. Before, it declared "failed" at 10 minutes
// while the server was still working, inviting a paid re-generate.
export const GIVE_UP_AFTER_MS = 45 * 60 * 1000

export function nextPollDelay(elapsedMs: number): number {
  return elapsedMs < EARLY_PHASE_MS ? EARLY_POLL_INTERVAL_MS : LATE_POLL_INTERVAL_MS
}

export function isHiddenDocument(doc: { visibilityState?: string } | undefined = globalThis.document): boolean {
  return doc?.visibilityState === 'hidden'
}
