import { NextResponse } from 'next/server'

// Sink for browser-side crashes (see lib/client-error-report.ts). It only
// writes to the server log — nothing is stored.
export async function POST(request: Request) {
  const text = await request.text().catch(() => '')
  let body: unknown = text.slice(0, 12000)
  try {
    body = JSON.parse(text)
  } catch {
    // Keep the raw (truncated) text.
  }
  console.error('[client-error]', JSON.stringify(body))
  return new NextResponse(null, { status: 204 })
}
