import test from 'node:test';
import assert from 'node:assert/strict';

import { createRealtimeTokenHandler } from '../../app/api/auth/realtime-token/route.js';

const SESSION_USER_ID = '550e8400-e29b-41d4-a716-446655440001';
const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000';

function postRequest(body) {
  const request = new Request('http://app/api/auth/realtime-token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  request.cookies = { get: (name) => name === 'nexoclip_session' ? { value: 'session-token' } : undefined };
  return request;
}

test('returns 401 when the session is missing or invalid', async () => {
  const handler = createRealtimeTokenHandler({
    getSession: async () => null,
    fetchFn: async () => { throw new Error('should not be called'); },
    issueToken: async () => { throw new Error('should not be called'); },
  });

  const response = await handler(postRequest({ projectId: PROJECT_ID }));

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Not authenticated' });
});

test('returns 400 when projectId is not a UUID', async () => {
  const handler = createRealtimeTokenHandler({
    getSession: async () => ({ id: '550e8400-e29b-41d4-a716-446655440010', user_id: SESSION_USER_ID }),
    fetchFn: async () => { throw new Error('should not be called'); },
    issueToken: async () => { throw new Error('should not be called'); },
    env: {
      CANVAS_AUTH_URL: 'http://canvas-auth.internal/authorize',
      CANVAS_AUTH_SECRET: 'canvas-secret',
      REALTIME_TOKEN_SECRET: 'jwt-secret',
    },
  });

  const response = await handler(postRequest({ projectId: 'not-a-uuid', userId: 'attacker-user-id' }));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'projectId must be a valid UUID' });
});

test('returns 503 when realtime auth configuration is unavailable', async () => {
  const handler = createRealtimeTokenHandler({
    getSession: async () => ({ id: '550e8400-e29b-41d4-a716-446655440010', user_id: SESSION_USER_ID }),
    fetchFn: async () => { throw new Error('should not be called'); },
    issueToken: async () => { throw new Error('should not be called'); },
    env: {},
  });

  const response = await handler(postRequest({ projectId: PROJECT_ID }));

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'Realtime authorization is unavailable' });
});

test('returns 403 when Canvas Auth denies authorization', async () => {
  const handler = createRealtimeTokenHandler({
    getSession: async () => ({ id: '550e8400-e29b-41d4-a716-446655440010', user_id: SESSION_USER_ID }),
    fetchFn: async () => Response.json({ error: 'forbidden: internal reason' }, { status: 403 }),
    issueToken: async () => { throw new Error('should not be called'); },
    env: {
      CANVAS_AUTH_URL: 'http://canvas-auth.internal/authorize',
      CANVAS_AUTH_SECRET: 'canvas-secret',
      REALTIME_TOKEN_SECRET: 'jwt-secret',
    },
    createNonce: () => 'nonce-123',
    now: () => 1700000000,
    signAuthorization: () => 'signed-value',
  });

  const response = await handler(postRequest({ projectId: PROJECT_ID }));

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'Realtime authorization denied' });
});

test('returns 502 without leaking internal details when Canvas Auth fails upstream', async () => {
  const handler = createRealtimeTokenHandler({
    getSession: async () => ({ id: '550e8400-e29b-41d4-a716-446655440010', user_id: SESSION_USER_ID }),
    fetchFn: async () => Response.json({ error: 'upstream exploded at http://canvas-auth.internal/authorize' }, { status: 500 }),
    issueToken: async () => { throw new Error('should not be called'); },
    env: {
      CANVAS_AUTH_URL: 'http://canvas-auth.internal/authorize',
      CANVAS_AUTH_SECRET: 'canvas-secret',
      REALTIME_TOKEN_SECRET: 'jwt-secret',
    },
    createNonce: () => 'nonce-123',
    now: () => 1700000000,
    signAuthorization: () => 'signed-value',
  });

  const response = await handler(postRequest({ projectId: PROJECT_ID }));
  const body = await response.text();

  assert.equal(response.status, 502);
  assert.equal(body.includes('http://canvas-auth.internal/authorize'), false);
  assert.equal(body.includes('canvas-secret'), false);
  assert.equal(body.includes('upstream exploded'), false);
});

test('returns 502 safe JSON when session lookup rejects', async () => {
  const handler = createRealtimeTokenHandler({
    getSession: async () => {
      throw new Error('session backend broke for token=session-token');
    },
    fetchFn: async () => { throw new Error('should not be called'); },
    issueToken: async () => { throw new Error('should not be called'); },
  });

  const response = await handler(postRequest({ projectId: PROJECT_ID }));
  const body = await response.text();

  assert.equal(response.status, 502);
  assert.equal(response.headers.get('content-type')?.includes('application/json'), true);
  assert.equal(body.includes('session backend broke'), false);
  assert.equal(body.includes('session-token'), false);
});

test('returns 502 safe JSON when Canvas Auth signing throws', async () => {
  const handler = createRealtimeTokenHandler({
    getSession: async () => ({ id: '550e8400-e29b-41d4-a716-446655440010', user_id: SESSION_USER_ID }),
    fetchFn: async () => { throw new Error('should not be called'); },
    issueToken: async () => { throw new Error('should not be called'); },
    env: {
      CANVAS_AUTH_URL: 'http://canvas-auth.internal/authorize',
      CANVAS_AUTH_SECRET: 'canvas-secret',
      REALTIME_TOKEN_SECRET: 'jwt-secret',
    },
    createNonce: () => 'nonce-123',
    now: () => 1700000000,
    signAuthorization: () => {
      throw new Error('cannot sign with canvas-secret');
    },
  });

  const response = await handler(postRequest({ projectId: PROJECT_ID }));
  const body = await response.text();

  assert.equal(response.status, 502);
  assert.equal(response.headers.get('content-type')?.includes('application/json'), true);
  assert.equal(body.includes('cannot sign'), false);
  assert.equal(body.includes('canvas-secret'), false);
});

test('returns 500 safe JSON when JWT issuance throws', async () => {
  const handler = createRealtimeTokenHandler({
    getSession: async () => ({ id: '550e8400-e29b-41d4-a716-446655440010', user_id: SESSION_USER_ID }),
    fetchFn: async () => Response.json({ authorized: true }, { status: 200 }),
    issueToken: async () => {
      throw new Error('jwt signing failed with REALTIME_TOKEN_SECRET=jwt-secret');
    },
    env: {
      CANVAS_AUTH_URL: 'http://canvas-auth.internal/authorize',
      CANVAS_AUTH_SECRET: 'canvas-secret',
      REALTIME_TOKEN_SECRET: 'jwt-secret',
    },
    createNonce: () => 'nonce-123',
    now: () => 1700000000,
    signAuthorization: () => 'signed-value',
  });

  const response = await handler(postRequest({ projectId: PROJECT_ID }));
  const body = await response.text();

  assert.equal(response.status, 500);
  assert.equal(response.headers.get('content-type')?.includes('application/json'), true);
  assert.equal(body.includes('jwt signing failed'), false);
  assert.equal(body.includes('REALTIME_TOKEN_SECRET'), false);
  assert.equal(body.includes('jwt-secret'), false);
});

test('ignores browser userId, signs the trusted auth payload, and issues a JWT only after explicit authorization', async () => {
  const signedPayloads = [];
  let sawAuthorization = false;
  const handler = createRealtimeTokenHandler({
    getSession: async () => ({ id: '550e8400-e29b-41d4-a716-446655440010', user_id: SESSION_USER_ID }),
    fetchFn: async (url, init) => {
      sawAuthorization = true;
      assert.equal(url, 'http://canvas-auth.internal/authorize');
      assert.equal(init.method, 'POST');
      assert.equal(init.headers['Content-Type'], 'application/json');
      assert.deepEqual(JSON.parse(init.body), {
        userId: SESSION_USER_ID,
        projectId: PROJECT_ID,
        timestamp: 1700000000,
        nonce: 'nonce-123',
        signature: 'signed-value',
      });
      return Response.json({ authorized: true }, { status: 200 });
    },
    issueToken: async ({ userId, projectId, sessionId }, secret) => {
      assert.equal(sawAuthorization, true);
      assert.equal(sessionId, '550e8400-e29b-41d4-a716-446655440010');
      assert.equal(secret, 'jwt-secret');
      assert.deepEqual({ userId, projectId }, { userId: SESSION_USER_ID, projectId: PROJECT_ID });
      return { token: 'jwt-token', expiresAt: 1700000060 };
    },
    env: {
      CANVAS_AUTH_URL: 'http://canvas-auth.internal/authorize',
      CANVAS_AUTH_SECRET: 'canvas-secret',
      REALTIME_TOKEN_SECRET: 'jwt-secret',
    },
    createNonce: () => 'nonce-123',
    now: () => 1700000000,
    signAuthorization: (payload, secret) => {
      signedPayloads.push({ payload, secret });
      return 'signed-value';
    },
  });

  const response = await handler(postRequest({ projectId: PROJECT_ID, userId: 'browser-user-id' }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { token: 'jwt-token', expiresAt: 1700000060 });
  assert.deepEqual(signedPayloads, [{
    payload: {
      userId: SESSION_USER_ID,
      projectId: PROJECT_ID,
      timestamp: 1700000000,
      nonce: 'nonce-123',
    },
    secret: 'canvas-secret',
  }]);
});
