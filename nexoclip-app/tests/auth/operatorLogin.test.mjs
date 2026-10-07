import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoginPostHandler } from '../../app/api/auth/login/route.js';
import { createSessionGetHandler } from '../../app/api/auth/session/route.js';
import { createGoogleCallbackHandler } from '../../app/api/auth/google/callback/route.js';
import { postLoginDestination, safeAuthReturnTo } from '../../src/lib/saas/authDestination.js';

const env = { NEXOCLIP_OPERATOR_USER_IDS: 'operator-a' };
function loginRequest(body = {}) {
  return new Request('https://app.example/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'test@example.com', password: 'valid-password', ...body }), headers: { 'content-type': 'application/json' } });
}

test('session capabilities derive from the authenticated user ID and fail closed', async () => {
  for (const [userId, configuration, expected] of [['operator-a', env, true], ['normal-user', env, false], ['operator-a', {}, false]]) {
    const handler = createSessionGetHandler({ env: configuration, sessionLookup: async () => ({ user_id: userId, email: 'test@example.com', display_name: 'Test', isPlatformOperator: true, role: 'owner' }) });
    const request = { cookies: { get: () => ({ value: 'opaque-session' }) } };
    const response = await handler(request);
    const body = await response.json();
    assert.equal(body.user.isPlatformOperator, expected);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
  const anonymous = createSessionGetHandler({ env, sessionLookup: async () => null });
  assert.deepEqual(await (await anonymous({ cookies: { get: () => undefined } })).json(), { authenticated: false });
});

test('password login returns a trusted operator destination and preserves the HttpOnly session', async () => {
  for (const [userId, expectedPath] of [['operator-a', '/admin/economics'], ['normal-user', '/studio']]) {
    const handler = createLoginPostHandler({ env, authenticate: async () => ({ user: { id: userId, email: 'test@example.com', isPlatformOperator: true }, token: 'opaque-session', expiresAt: new Date(Date.now() + 600000) }) });
    const response = await handler(loginRequest({ isPlatformOperator: true, redirectTo: 'https://other.example' }));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.redirectTo, expectedPath);
    assert.equal(body.user.isPlatformOperator, userId === 'operator-a');
    assert.match(response.headers.get('set-cookie'), /HttpOnly/i);
    assert.match(response.headers.get('set-cookie'), /Secure/i);
    assert.equal(body.token, undefined);
    assert.equal(body.password, undefined);
  }
});

test('failed password login exposes neither operator capability nor session cookie', async () => {
  const handler = createLoginPostHandler({ env, authenticate: async () => { throw new Error('provider credential detail'); } });
  const response = await handler(loginRequest());
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.deepEqual(await response.json(), { error: 'Invalid email or password' });
});

test('login navigation routes operators to economics while preserving normal internal destinations', () => {
  assert.equal(postLoginDestination({ user: { isPlatformOperator: true } }, '/studio'), '/admin/economics');
  assert.equal(postLoginDestination({ user: { isPlatformOperator: false } }, '/studio/billing?topup=1'), '/studio/billing?topup=1');
  assert.equal(postLoginDestination({ user: { isPlatformOperator: 'true' }, redirectTo: 'https://other.example' }), '/studio');
  for (const path of ['https://other.example', '//other.example', '/\\other.example', '/\nother.example', null]) {
    assert.equal(safeAuthReturnTo(path), '/studio');
  }
});

function googleRequest(state = 'trusted-state') {
  const url = new URL(`https://app.example/api/auth/google/callback?code=code&state=${state}`);
  return { nextUrl: url, url: url.href, headers: new Headers(), cookies: { get: () => ({ value: 'trusted-state' }) } };
}

test('Google sign-in uses the same operator destination and preserves ordinary onboarding', async () => {
  const profile = Buffer.from(JSON.stringify({ email: 'test@example.com', email_verified: true, name: 'Test' })).toString('base64url');
  for (const [userId, isNew, expected] of [['operator-a', false, '/admin/economics'], ['normal-user', false, '/studio'], ['normal-user', true, '/onboarding']]) {
    const handler = createGoogleCallbackHandler({ env, fetchImpl: async () => Response.json({ id_token: `header.${profile}.signature` }), authenticate: async () => ({ user: { id: userId }, isNew, token: 'opaque-session', expiresAt: new Date(Date.now() + 600000) }) });
    const response = await handler(googleRequest());
    assert.equal(response.headers.get('location'), `https://app.example${expected}`);
    assert.match(response.headers.get('set-cookie'), /HttpOnly/i);
  }
});

test('Google state rejection happens before profile authentication or operator routing', async () => {
  let called = false;
  const handler = createGoogleCallbackHandler({ env, fetchImpl: async () => { called = true; }, authenticate: async () => { called = true; } });
  const response = await handler(googleRequest('forged-state'));
  assert.equal(response.headers.get('location'), 'https://app.example/login?error=google_state');
  assert.equal(called, false);
});
