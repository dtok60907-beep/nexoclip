import { withBasePath } from '@/lib/base-path'

// Canvas crashes happen in the user's browser, so they never reach the server
// logs on their own. Beacon a compact copy to the server so a crash the user
// only describes as "the page couldn't load" can be traced from the logs.
const recentlyReported = new Map<string, number>()
const DEDUPE_MS = 30_000

export function reportClientError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return
  const err = error instanceof Error ? error : new Error(String(error))
  // A node that keeps crashing re-throws on every canvas update; report once.
  const key = `${context.scope ?? ''}|${context.nodeId ?? ''}|${err.message}`
  const now = Date.now()
  if (now - (recentlyReported.get(key) ?? 0) < DEDUPE_MS) return
  recentlyReported.set(key, now)
  const payload = JSON.stringify({
    message: err.message.slice(0, 2000),
    name: err.name,
    stack: err.stack?.slice(0, 8000),
    digest: (err as Error & { digest?: string }).digest,
    url: window.location.href,
    buildStamp: process.env.NEXT_PUBLIC_BUILD_STAMP,
    ...context,
  })
  try {
    const url = withBasePath('/api/client-error')
    if (!navigator.sendBeacon?.(url, new Blob([payload], { type: 'application/json' }))) {
      void fetch(url, { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' }, keepalive: true })
    }
  } catch {
    // Reporting must never throw from inside an error handler.
  }
}
