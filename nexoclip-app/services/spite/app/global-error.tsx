'use client'

import { useEffect } from 'react'
import { reportClientError } from '@/lib/client-error-report'

// Last-resort boundary for errors in the root layout itself.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[canvas] root crashed', error)
    reportClientError(error, { scope: 'global' })
  }, [error])

  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', background: '#0c0d12', color: '#fff', fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 560, width: '100%' }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Canvas hit an error</h1>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, color: '#fca5a5', background: 'rgba(0,0,0,.4)', padding: 12, borderRadius: 8, maxHeight: 256, overflow: 'auto' }}>
            {`${error.name}: ${error.message}${error.digest ? `\ndigest: ${error.digest}` : ''}\n${error.stack ?? ''}`}
          </pre>
          <button type="button" onClick={reset} style={{ marginRight: 8, padding: '6px 12px', borderRadius: 6 }}>Try again</button>
          <button type="button" onClick={() => window.location.reload()} style={{ padding: '6px 12px', borderRadius: 6 }}>Reload</button>
        </div>
      </body>
    </html>
  )
}
