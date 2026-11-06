import test from 'node:test';
import assert from 'node:assert/strict';
import { createSocialHandlers } from '../../app/api/social/route.js';

const id = '11111111-1111-4111-8111-111111111111';
function request({ origin = 'https://app.nexoclip.com', body, method = 'POST' } = {}) {
  const req = new Request('https://app.nexoclip.com/api/social', { method,
    headers: { origin, 'x-workspace-id': id }, body: method === 'POST' ? JSON.stringify(body || { action: 'activate' }) : undefined });
  req.cookies = { get: () => ({ value: 'session' }) };
  return req;
}

test('rejects CSRF before tenant or provider calls', async () => {
  const handlers = createSocialHandlers({ resolveTenant: () => assert.fail('must not run'), service: {} });
  assert.equal((await handlers.POST(request({ origin: 'https://evil.test' }))).status, 403);
});

test('denies cross-tenant access before reading channels or mutating Postiz', async () => {
  const handlers = createSocialHandlers({ resolveTenant: async () => { throw new Error('Workspace access denied'); },
    service: { activate: () => assert.fail('must not run'), status: () => assert.fail('must not run') } });
  assert.equal((await handlers.GET(request({ method: 'GET' }))).status, 403);
  assert.equal((await handlers.POST(request())).status, 403);
});

test('session and workspace are resolved at the server boundary; errors stay private', async () => {
  const handlers = createSocialHandlers({ resolveTenant: async args => {
    assert.deepEqual(args, { token: 'session', workspaceId: id }); return { workspace: { id } };
  }, service: { status: async () => { throw new Error('postgres://secret'); } } });
  const result = await handlers.GET(request({ method: 'GET' }));
  assert.equal(result.status, 500);
  assert.ok(!(await result.text()).includes('secret'));
});

test('connection return URL is derived from the app, never a client body field', async () => {
  const handlers = createSocialHandlers({ resolveTenant: async () => ({ workspace: { id } }),
    service: { connect: async (_tenant, origin) => { assert.equal(origin, 'https://app.nexoclip.com'); return { url: 'https://www.linkedin.com/oauth/v2/authorization' }; } } });
  const result = await handlers.POST(request({ body: { action: 'connect', redirectUrl: 'https://evil.test' } }));
  assert.equal(result.status, 200);
});
