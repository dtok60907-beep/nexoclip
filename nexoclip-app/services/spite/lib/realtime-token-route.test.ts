import assert from 'node:assert/strict'
import test from 'node:test'

import { createRealtimeTokenHandler } from '@/app/api/auth/realtime-token/route'

const OWNER_ID = '550e8400-e29b-41d4-a716-446655440001'
const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000'

function request(body: unknown): Request {
  return new Request('http://localhost/api/auth/realtime-token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

test('issues a project-bound token only for the authenticated owner', async () => {
  const POST = createRealtimeTokenHandler({
    getAuthenticatedUser: async () => ({ id: OWNER_ID, sessionId: '550e8400-e29b-41d4-a716-446655440010' }),
    getDb: () => ({}) as any,
    userOwnsProject: async () => true,
    issueRealtimeToken: async ({ userId, projectId, sessionId }) => ({
      token: `${userId}:${projectId}:${sessionId}`,
      expiresAt: 123,
    }),
    env: { REALTIME_TOKEN_SECRET: 'secret' },
  })

  const response = await POST(request({ projectId: PROJECT_ID }))

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    token: `${OWNER_ID}:${PROJECT_ID}:550e8400-e29b-41d4-a716-446655440010`,
    expiresAt: 123,
  })
})

test('rejects an unauthenticated realtime token request', async () => {
  const POST = createRealtimeTokenHandler({
    getAuthenticatedUser: async () => null,
  })

  assert.equal((await POST(request({ projectId: PROJECT_ID }))).status, 401)
})

test('hides a project not owned by the authenticated user', async () => {
  const POST = createRealtimeTokenHandler({
    getAuthenticatedUser: async () => ({ id: OWNER_ID, sessionId: '550e8400-e29b-41d4-a716-446655440010' }),
    getDb: () => ({}) as any,
    userOwnsProject: async () => false,
    env: { REALTIME_TOKEN_SECRET: 'secret' },
  })

  assert.equal((await POST(request({ projectId: PROJECT_ID }))).status, 404)
})

test('rejects a realtime token request without a project id', async () => {
  const POST = createRealtimeTokenHandler({
    getAuthenticatedUser: async () => ({ id: OWNER_ID, sessionId: '550e8400-e29b-41d4-a716-446655440010' }),
  })

  assert.equal((await POST(request({}))).status, 400)
})

test('does not expose a missing realtime secret', async () => {
  const POST = createRealtimeTokenHandler({
    getAuthenticatedUser: async () => ({ id: OWNER_ID, sessionId: '550e8400-e29b-41d4-a716-446655440010' }),
    env: {},
  })

  const response = await POST(request({ projectId: PROJECT_ID }))

  assert.equal(response.status, 500)
  assert.doesNotMatch(await response.text(), /secret/i)
})

test('rejects a user without a verified login session binding', async () => {
  const POST = createRealtimeTokenHandler({ getAuthenticatedUser: async () => ({ id: OWNER_ID }) })
  assert.equal((await POST(request({ projectId: PROJECT_ID }))).status, 401)
})
