import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkRequiredEnv } from '@/lib/env-check'
import { withBasePath } from '@/lib/base-path'
import { isRequestAuthenticated } from '@/lib/main-session'

// Paths that do not require a main-app session.
// - /setup: shown when required generation environment variables are missing
// - /api/assets/cleanup: scheduled cleanup job, auth via CRON_SECRET
// - /api/r2-image: media proxy, does its own signed-token check
const PUBLIC_PATHS = [
  '/healthz',
  '/setup',
  '/api/assets/cleanup',
  '/api/r2-image',
]

function sanitizedHeaders(headers: Headers) {
  const nextHeaders = new Headers(headers)
  nextHeaders.delete('x-nexoclip-user-id')
  nextHeaders.delete('x-nexoclip-user-verified')
  return nextHeaders
}

export async function middleware(request: NextRequest) {
  const forwardedHeaders = sanitizedHeaders(request.headers)
  const { pathname } = request.nextUrl
  const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '')
  const appPath = basePath && (pathname === basePath || pathname.startsWith(`${basePath}/`))
    ? pathname.slice(basePath.length) || '/'
    : pathname

  if (appPath.startsWith('/api/internal/')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // An operator impersonating a customer in read-only mode (the main app sets this
  // cookie) may open the canvas but not change it through the API.
  if (request.cookies.get('nexoclip_impersonation')?.value === 'read-only'
    && appPath.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    return NextResponse.json({ error: 'Mode lihat saja: saat impersonate, canvas ini tidak bisa diubah.' }, { status: 403 })
  }

  // Kubernetes health checks must not depend on runtime provider configuration
  // or a user session.
  if (appPath === '/healthz' || pathname.endsWith('/healthz')) {
    return NextResponse.next({ request: { headers: forwardedHeaders } })
  }

  // First gate: refuse to boot if required env vars are missing. Sends
  // every request to /setup until the install is configured, so a
  // self-hoster sees clear instructions instead of a broken-looking
  // login screen. The /setup page itself, and Next.js static asset
  // requests, are allowed through so the page can render.
  const envCheck = checkRequiredEnv()
  if (!envCheck.ok) {
    if (appPath === '/setup' || appPath.startsWith('/_next/')) {
      return NextResponse.next({ request: { headers: forwardedHeaders } })
    }
    if (appPath.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Setup required', missing: envCheck.missing },
        { status: 503 },
      )
    }
    return NextResponse.redirect(new URL(withBasePath('/setup', basePath), request.url))
  }

  // Spite is an authenticated NexoClip surface. Only the main-app session
  // is accepted; it is validated server-to-server by the main app.
  const isAuthenticated = await isRequestAuthenticated(request)

  const isPublic = appPath === '/healthz' || pathname.endsWith('/healthz') || PUBLIC_PATHS.some(
    (p) => appPath === p || appPath.startsWith(p + '/'),
  )

  if (isAuthenticated) {
    if (appPath === '/setup') {
      return NextResponse.redirect(new URL(withBasePath('/', basePath), request.url))
    }
    return NextResponse.next({ request: { headers: forwardedHeaders } })
  }

  // Not logged in:
  if (isPublic) {
    return NextResponse.next({ request: { headers: forwardedHeaders } })
  }

  // Block API routes with a clear 401 (no HTML redirect for data calls).
  if (appPath.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Send unauthenticated users to the main app login, then return them to
  // this exact Spite path after login succeeds.
  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set('next', `${basePath}${appPath}`)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: [
    '/',
    // Run on everything except Next.js internals and static asset files.
    // The image-extension exemption is anchored to `$` — paths like
    // `/api/r2-image/foo.png/extra` still go through middleware because
    // they don't END in an image extension. Without the anchor, any
    // route containing `.png` (or .svg, .jpg, etc.) anywhere in its
    // path would silently skip authz.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
