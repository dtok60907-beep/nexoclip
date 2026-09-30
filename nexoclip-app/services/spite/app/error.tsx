'use client'

import { useEffect, useState } from 'react'
import { reportClientError } from '@/lib/client-error-report'

// Replaces Next's generic "This page couldn't load" screen so a crash shows
// what actually broke and can be retried without a full reload.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    console.error('[canvas] page crashed', error)
    reportClientError(error, { scope: 'route' })
  }, [error])

  const details = [error.name + ': ' + error.message, error.digest && `digest: ${error.digest}`, error.stack]
    .filter(Boolean)
    .join('\n')

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0c0d12] p-6 text-white">
      <div className="w-full max-w-xl">
        <h1 className="mb-2 text-xl font-semibold">Canvas hit an error</h1>
        <p className="mb-4 text-sm text-white/60">Try again first — your canvas is saved. If it keeps happening, copy the details and send them over.</p>
        <pre className="mb-4 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[11px] text-red-300">
          {details}
        </pre>
        <div className="flex gap-2">
          <button type="button" onClick={reset} className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-black">
            Try again
          </button>
          <button type="button" onClick={() => window.location.reload()} className="rounded-md border border-white/20 px-3 py-1.5 text-sm">
            Reload
          </button>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(details).then(() => setCopied(true)).catch(() => {})}
            className="rounded-md border border-white/20 px-3 py-1.5 text-sm"
          >
            {copied ? 'Copied' : 'Copy details'}
          </button>
        </div>
      </div>
    </div>
  )
}
