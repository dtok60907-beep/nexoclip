import type { NextRequest } from 'next/server'


export interface AuthenticatedUser {
  id: string
  sessionId?: string
}

export interface AuthenticatedUserResolverOptions {
  env?: Partial<Pick<NodeJS.ProcessEnv, 'NEXOCLIP_INTERNAL_URL'>>
  fetchFn?: typeof fetch
}

export interface RequestAuthenticationCheckerOptions {
  getAuthenticatedUser?: (request: Request | NextRequest) => Promise<AuthenticatedUser | null>
}

const MAIN_SESSION_COOKIE_NAME = 'nexoclip_session'

function readCookieValue(request: Request | NextRequest, name: string): string | null {
  if ('cookies' in request && request.cookies?.get) {
    return request.cookies.get(name)?.value ?? null
  }

  const cookieHeader = request.headers.get('cookie')
  if (!cookieHeader) return null

  for (const segment of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = segment.trim().split('=')
    if (rawName === name) {
      return rawValue.join('=') || null
    }
  }

  return null
}

export function createAuthenticatedUserResolver(options: AuthenticatedUserResolverOptions = {}) {
  const fetchFn = options.fetchFn ?? fetch
  const env = options.env ?? process.env

  return async function getAuthenticatedUser(request: Request | NextRequest): Promise<AuthenticatedUser | null> {
    const baseUrl = env.NEXOCLIP_INTERNAL_URL?.trim().replace(/\/$/, '')
    if (!baseUrl) return null

    const sessionToken = readCookieValue(request, MAIN_SESSION_COOKIE_NAME)
    if (!sessionToken) return null

    try {
      const response = await fetchFn(`${baseUrl}/api/auth/session`, {
        cache: 'no-store',
        headers: {
          cookie: `${MAIN_SESSION_COOKIE_NAME}=${sessionToken}`,
        },
      })

      if (!response.ok) return null

      const body = await response.json() as {
        sessionId?: unknown
        authenticated?: boolean
        user?: { id?: unknown }
      }

      if (!body?.authenticated || typeof body.user?.id !== 'string' || !body.user.id) {
        return null
      }

      return { id: body.user.id, ...(typeof body.sessionId === 'string' ? { sessionId: body.sessionId } : {}) }
    } catch {
      return null
    }
  }
}

export const getAuthenticatedUser = createAuthenticatedUserResolver()

export function createRequestAuthenticationChecker(options: RequestAuthenticationCheckerOptions = {}) {
  const resolveUser = options.getAuthenticatedUser ?? getAuthenticatedUser

  return async function isRequestAuthenticated(request: Request | NextRequest): Promise<boolean> {
    return Boolean(await resolveUser(request))
  }
}

export const isRequestAuthenticated = createRequestAuthenticationChecker()
