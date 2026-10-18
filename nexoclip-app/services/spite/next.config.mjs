import { createRequire } from 'node:module'

const pkg = createRequire(import.meta.url)('./package.json')

// A readable, always-increasing build stamp (UTC "MMM D HH:mm"). The commit SHA
// is effectively random to read, so it can't answer "did my refresh pick up the
// new build?" at a glance — a timestamp can. Computed once at build time.
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/$/, '')

const BUILD_STAMP = new Date().toLocaleString('en-GB', {
  timeZone: 'UTC', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
}).replace(',', '')

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  basePath,
  typescript: {
    // Type errors fail the build. The codebase is TS-strict and currently
    // type-clean, so this just stops a future type regression from silently
    // shipping. If a forker's build ever fails here, the error message tells
    // them exactly what to fix — don't flip this back to true to paper over it.
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    // Middleware runs on every API route and Next buffers the request body for it,
    // keeping only the first 10 MB by default: every video over 10 MB failed to
    // upload. Match /api/r2-upload's own 200 MB cap.
    middlewareClientMaxBodySize: '200mb',
  },
  // What build is live, exposed to the client. The version + build stamp are
  // what the UI shows (readable, ordered); the SHA is kept for the tooltip so
  // a build can still be traced back to an exact commit.
  env: {
    NEXT_PUBLIC_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev',
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD_STAMP: BUILD_STAMP,
  },
  // Defence-in-depth response headers. Scoped to HTML/page routes only
  // — API routes (especially /api/r2-image) set their own headers and
  // pile-on globals can break third-party fetchers like fal.ai's image
  // downloader. CSP intentionally not set yet; needs per-route work.
  async headers() {
    return [
      {
        source: '/((?!api/).*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

export default nextConfig
