// nexoclip-app/tests/api/directorProxyRoute.test.mjs
process.env.DATABASE_URL ||= 'postgres://test:test@localhost/test';

import test from 'node:test';
import assert from 'node:assert/strict';

const { createDirectorProxyHandler } = await import('../../app/api/director/[...path]/route.js');

const env = { DIRECTOR_SERVICE_URL: 'http://director:4760/', DIRECTOR_PROXY_SECRET: 's3cret' };
const okSession = async () => ({ user_id: '11111111-2222-3333-4444-555555555555' });

function req(url, { method = 'GET', body, headers = {} } = {}) {
  const request = new Request(url, { method, body, headers });
  request.cookies = { get: (n) => (n === 'nexoclip_session' ? { value: 'tok' } : undefined) };
  return request;
}
const ctx = (path) => ({ params: Promise.resolve({ path }) });

test('forwards with the session user id and proxy secret, ignoring client identity headers', async () => {
  let seen;
  const handler = createDirectorProxyHandler({
    getSession: okSession,
    env,
    fetchFn: async (url, init) => {
      seen = { url, init };
      return new Response('{"approved":"script"}', { status: 200, headers: { 'content-type': 'application/json', 'set-cookie': 'x=1' } });
    },
  });
  const res = await handler(
    req('http://app/api/director/projects/p1/approve?x=1', { method: 'POST', body: '{}', headers: { 'X-Nexoclip-User-Id': 'attacker' } }),
    ctx(['projects', 'p1', 'approve']),
  );
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { approved: 'script' });
  assert.equal(res.headers.get('set-cookie'), null);
  assert.equal(seen.url, 'http://director:4760/api/director/projects/p1/approve?x=1');
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.body, '{}');
  assert.equal(seen.init.headers['X-Nexoclip-User-Id'], '11111111-2222-3333-4444-555555555555');
  assert.equal(seen.init.headers['X-Director-Proxy-Secret'], 's3cret');
});

test('rejects unauthenticated requests without calling the service', async () => {
  let called = false;
  const handler = createDirectorProxyHandler({ getSession: async () => null, env, fetchFn: async () => { called = true; } });
  const res = await handler(req('http://app/api/director/projects'), ctx(['projects']));
  assert.equal(res.status, 401);
  assert.equal(called, false);
});

test('rejects path traversal segments', async () => {
  let called = false;
  const handler = createDirectorProxyHandler({ getSession: okSession, env, fetchFn: async () => { called = true; } });
  const res = await handler(req('http://app/api/director/x'), ctx(['projects', '..', 'media']));
  assert.equal(res.status, 404);
  assert.equal(called, false);
});

test('reports 503 when the service is not configured and 502 when it is down', async () => {
  const unconfigured = createDirectorProxyHandler({ getSession: okSession, env: {} });
  assert.equal((await unconfigured(req('http://app/api/director/projects'), ctx(['projects']))).status, 503);
  const down = createDirectorProxyHandler({ getSession: okSession, env, fetchFn: async () => { throw new Error('ECONNREFUSED'); } });
  assert.equal((await down(req('http://app/api/director/projects'), ctx(['projects']))).status, 502);
});
