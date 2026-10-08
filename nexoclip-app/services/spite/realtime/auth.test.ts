import assert from 'node:assert/strict'
import test from 'node:test'
import { SignJWT, UnsecuredJWT } from 'jose'

import {
  constantTimeEqual,
  signCanvasAuthorization,
  verifyCanvasAuthorization,
} from './internal-auth'
import { issueRealtimeToken, verifyRealtimeToken } from './auth'

const INTERNAL_SECRET = 'internal-secret'
const JWT_SECRET = 'jwt-secret'
const USER_ID = '550e8400-e29b-41d4-a716-446655440001'
const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000'
const nowSeconds = () => Math.floor(Date.now() / 1000)

function authPayload(overrides: Partial<{
  userId: string
  projectId: string
  timestamp: number
  nonce: string
  actionDigest: string
}> = {}) {
  return {
    userId: USER_ID,
    projectId: PROJECT_ID,
    timestamp: nowSeconds(),
    nonce: 'nonce-123',
    ...overrides,
  }
}

async function signManualRealtimeToken({
  secret = JWT_SECRET,
  projectId = PROJECT_ID,
  userId = USER_ID,
  issuer = 'nexoclip',
  audience = 'nexoclip-realtime',
  iat = nowSeconds(),
  exp = iat + 60,
}: {
  secret?: string
  projectId?: string
  userId?: string
  issuer?: string
  audience?: string
  iat?: number
  exp?: number
} = {}) {
  return new SignJWT({ projectId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(secret))
}

test('signCanvasAuthorization uses canonical field order', () => {
  const ordered = authPayload()
  const reordered = {
    nonce: ordered.nonce,
    timestamp: ordered.timestamp,
    projectId: ordered.projectId,
    userId: ordered.userId,
  }

  assert.equal(signCanvasAuthorization(ordered, INTERNAL_SECRET), signCanvasAuthorization(reordered, INTERNAL_SECRET))
})

test('verifyCanvasAuthorization rejects altered payloads and malformed signatures', () => {
  const payload = authPayload()
  const signature = signCanvasAuthorization(payload, INTERNAL_SECRET)

  assert.equal(verifyCanvasAuthorization(payload, signature, INTERNAL_SECRET), true)
  assert.equal(
    verifyCanvasAuthorization({ ...payload, projectId: '550e8400-e29b-41d4-a716-446655440099' }, signature, INTERNAL_SECRET),
    false,
  )
  assert.equal(verifyCanvasAuthorization(payload, `${signature.slice(0, -1)}0`, INTERNAL_SECRET), false)
  assert.equal(verifyCanvasAuthorization(payload, `${signature}extra`, INTERNAL_SECRET), false)
})

test('verifyCanvasAuthorization binds optional action digests into the signature', () => {
  const payload = authPayload({ actionDigest: 'digest-a' })
  const signature = signCanvasAuthorization(payload, INTERNAL_SECRET)

  assert.equal(verifyCanvasAuthorization(payload, signature, INTERNAL_SECRET), true)
  assert.equal(
    verifyCanvasAuthorization({ ...payload, actionDigest: 'digest-b' }, signature, INTERNAL_SECRET),
    false,
  )
})

test('verifyCanvasAuthorization rejects stale and future timestamps', () => {
  const stalePayload = authPayload({ timestamp: nowSeconds() - 61 })
  const futurePayload = authPayload({ timestamp: nowSeconds() + 61 })

  assert.equal(
    verifyCanvasAuthorization(stalePayload, signCanvasAuthorization(stalePayload, INTERNAL_SECRET), INTERNAL_SECRET),
    false,
  )
  assert.equal(
    verifyCanvasAuthorization(futurePayload, signCanvasAuthorization(futurePayload, INTERNAL_SECRET), INTERNAL_SECRET),
    false,
  )
})

test('constantTimeEqual handles equal, different length, and first/last byte mismatches', () => {
  assert.equal(constantTimeEqual('abcdef', 'abcdef'), true)
  assert.equal(constantTimeEqual('abcdef', 'abcde'), false)
  assert.equal(constantTimeEqual('abcdef', 'xbcdef'), false)
  assert.equal(constantTimeEqual('abcdef', 'abcdeX'), false)
})

test('issueRealtimeToken issues a valid 60-second room-bound JWT', async () => {
  const issued = await issueRealtimeToken({ sessionId: '550e8400-e29b-41d4-a716-446655440010', userId: USER_ID, projectId: PROJECT_ID }, JWT_SECRET)
  const verified = await verifyRealtimeToken(issued.token, PROJECT_ID, JWT_SECRET)

  assert.ok(verified)
  assert.deepEqual(verified, {
    userId: USER_ID,
    projectId: PROJECT_ID,
    sessionId: '550e8400-e29b-41d4-a716-446655440010',
    issuedAt: verified.issuedAt,
    expiresAt: verified.expiresAt,
  })
  assert.equal(issued.expiresAt - verified.issuedAt, 60)
  assert.equal(verified.expiresAt, issued.expiresAt)
})

test('verifyRealtimeToken rejects wrong algorithm, signature, issuer, audience, expiry, and project', async () => {
  const now = nowSeconds()
  const wrongSignature = await issueRealtimeToken({ sessionId: '550e8400-e29b-41d4-a716-446655440010', userId: USER_ID, projectId: PROJECT_ID }, 'other-secret')
  const wrongIssuer = await signManualRealtimeToken({ issuer: 'other-issuer' })
  const wrongAudience = await signManualRealtimeToken({ audience: 'other-audience' })
  const expired = await signManualRealtimeToken({ iat: now - 120, exp: now - 60 })
  const wrongProject = await issueRealtimeToken({ sessionId: '550e8400-e29b-41d4-a716-446655440010', userId: USER_ID, projectId: '550e8400-e29b-41d4-a716-446655440099' }, JWT_SECRET)
  const wrongAlgorithm = new UnsecuredJWT({ projectId: PROJECT_ID })
    .setSubject(USER_ID)
    .setIssuer('nexoclip')
    .setAudience('nexoclip-realtime')
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .encode()

  assert.equal(await verifyRealtimeToken(wrongSignature.token, PROJECT_ID, JWT_SECRET), null)
  assert.equal(await verifyRealtimeToken(wrongIssuer, PROJECT_ID, JWT_SECRET), null)
  assert.equal(await verifyRealtimeToken(wrongAudience, PROJECT_ID, JWT_SECRET), null)
  assert.equal(await verifyRealtimeToken(expired, PROJECT_ID, JWT_SECRET), null)
  assert.equal(await verifyRealtimeToken(wrongProject.token, PROJECT_ID, JWT_SECRET), null)
  assert.equal(await verifyRealtimeToken(wrongAlgorithm, PROJECT_ID, JWT_SECRET), null)
})
