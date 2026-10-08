import assert from 'node:assert/strict'
import test from 'node:test'
import { createSessionAccessCheck } from './session-access'

const identity = { sessionId: '550e8400-e29b-41d4-a716-446655440010', userId: '550e8400-e29b-41d4-a716-446655440001' }
test('session access binds session and owner and propagates database failures', async () => {
  let active = true
  const check = createSessionAccessCheck({ query: async (sql, params) => {
    assert.deepEqual(params, [identity.sessionId, identity.userId])
    assert.match(sql, /u.suspended_at IS NULL/)
    assert.match(sql, /s.revoked_at IS NULL/)
    assert.match(sql, /s.expires_at>now\(\)/)
    return { rows: active ? [{ id: identity.sessionId }] : [] } as any
  } })
  assert.equal(await check(identity), true)
  active = false
  assert.equal(await check(identity), false)
  const failing = createSessionAccessCheck({ query: async () => { throw new Error('database offline') } })
  await assert.rejects(failing(identity), /database offline/)
})
