import assert from 'node:assert/strict'
import test from 'node:test'

import { createAuthenticatedUserResolver, createRequestAuthenticationChecker } from './main-session'

function makeRequest({
  headers = {},
  cookie = 'nexoclip_session=session-token; spite_session=spite-token; theme=dark',
}: {
  headers?: Record<string, string>
  cookie?: string
} = {}) {
  return new Request('http://spite.local/api/projects', {
    headers: {
      cookie,
      ...headers,
    },
  })
}

test('forwards only nexoclip_session and ignores client-supplied identity headers', async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = []
  const getAuthenticatedUser = createAuthenticatedUserResolver({
    env: { NEXOCLIP_INTERNAL_URL: 'http://nexoclip.internal' },
    fetchFn: async (url, init) => {
      calls.push({ url: String(url), init })
      return Response.json({
        authenticated: true,
        user: { id: '550e8400-e29b-41d4-a716-446655440001' },
      })
    },
  })

  const user = await getAuthenticatedUser(makeRequest({
    headers: {
      'x-nexoclip-user-id': 'browser-spoofed-user',
      'x-nexoclip-user-verified': '1',
      authorization: 'Bearer should-not-forward',
    },
  }))

  assert.deepEqual(user, { id: '550e8400-e29b-41d4-a716-446655440001' })
  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.url, 'http://nexoclip.internal/api/auth/session')
  assert.deepEqual(calls[0]?.init, {
    cache: 'no-store',
    headers: {
      cookie: 'nexoclip_session=session-token',
    },
  })
})

test('fails closed when introspection is unavailable or invalid', async () => {
  const cases = [
    createAuthenticatedUserResolver({ env: {}, fetchFn: async () => Response.json({ authenticated: true, user: { id: 'ignored' } }) }),
    createAuthenticatedUserResolver({ env: { NEXOCLIP_INTERNAL_URL: 'http://nexoclip.internal' }, fetchFn: async () => Response.json({ authenticated: false }) }),
    createAuthenticatedUserResolver({ env: { NEXOCLIP_INTERNAL_URL: 'http://nexoclip.internal' }, fetchFn: async () => new Response('bad gateway', { status: 502 }) }),
    createAuthenticatedUserResolver({ env: { NEXOCLIP_INTERNAL_URL: 'http://nexoclip.internal' }, fetchFn: async () => Response.json({ authenticated: true, user: { id: 123 } }) }),
    createAuthenticatedUserResolver({ env: { NEXOCLIP_INTERNAL_URL: 'http://nexoclip.internal' }, fetchFn: async () => { throw new Error('boom') } }),
  ]

  for (const resolveUser of cases) {
    assert.equal(await resolveUser(makeRequest()), null)
  }
})

test('does not authenticate a legacy Spite session without a main-app user', async () => {
  const isRequestAuthenticated = createRequestAuthenticationChecker({
    getAuthenticatedUser: async () => null,
  })

  assert.equal(await isRequestAuthenticated(makeRequest({ cookie: 'spite_session=legacy-session' })), false)
})

test('returns null when nexoclip_session is absent and returns the trusted user when present', async () => {
  let fetchCalls = 0
  const getAuthenticatedUser = createAuthenticatedUserResolver({
    env: { NEXOCLIP_INTERNAL_URL: 'http://nexoclip.internal' },
    fetchFn: async () => {
      fetchCalls += 1
      return Response.json({
        authenticated: true,
        user: { id: '550e8400-e29b-41d4-a716-446655440002' },
      })
    },
  })

  assert.equal(await getAuthenticatedUser(makeRequest({ cookie: 'spite_session=spite-only' })), null)
  assert.deepEqual(await getAuthenticatedUser(makeRequest()), { id: '550e8400-e29b-41d4-a716-446655440002' })
  assert.equal(fetchCalls, 1)
})

test('returns the trusted session binding and never reads it from browser identity headers', async () => {
  const sessionId = '550e8400-e29b-41d4-a716-446655440010'
  const resolve = createAuthenticatedUserResolver({
    env: { NEXOCLIP_INTERNAL_URL: 'http://nexoclip.internal' },
    fetchFn: async () => Response.json({ authenticated: true, user: { id: 'trusted-user' }, sessionId }),
  })
  assert.deepEqual(await resolve(makeRequest({ headers: { 'x-session-id': 'forged' } })), { id: 'trusted-user', sessionId })
})
