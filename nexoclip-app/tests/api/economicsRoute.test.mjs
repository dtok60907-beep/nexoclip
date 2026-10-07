import test from 'node:test';
import assert from 'node:assert/strict';
import { createEconomicsGetHandler } from '../../app/api/admin/economics/route.js';

const env = { NEXOCLIP_OPERATOR_USER_IDS: 'operator-a' };
function request(query = '', workspaceId = 'client-workspace') {
  const input = new Request(`http://app/api/admin/economics${query}`, { headers: { 'x-workspace-id': workspaceId } });
  input.cookies = { get: () => ({ value: 'authenticated-session' }) };
  return input;
}

test('economics route derives operator ID and workspace from authenticated membership', async () => {
  let received;
  const handler = createEconomicsGetHandler({ env, resolveContext: async () => ({ user: { id: 'operator-a' }, workspace: { id: 'verified-workspace', role: 'member' } }), service: { getReport: async (args) => { received = args; return { totals: {} }; } } });
  const response = await handler(request('?userId=forged&from=2026-10-01&to=2026-10-07'));
  assert.equal(response.status, 200);
  assert.equal(received.userId, 'operator-a');
  assert.equal(received.workspaceId, 'verified-workspace');
  assert.equal(received.filters.from, '2026-10-01');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('workspace admins, forged operator IDs and missing allowlists cannot read COGS', async () => {
  for (const [userId, configuration] of [['ordinary-admin', env], ['operator-a', {}]]) {
    let called = false;
    const handler = createEconomicsGetHandler({ env: configuration, resolveContext: async () => ({ user: { id: userId }, workspace: { id: 'w1', role: 'owner' } }), service: { getReport: async () => { called = true; } } });
    const response = await handler(request('?userId=operator-a'));
    assert.equal(response.status, 403);
    assert.equal(called, false);
  }
});

test('route handles missing workspace, tenant denials and unexpected errors without exposing internals', async () => {
  const missing = createEconomicsGetHandler({ env });
  assert.equal((await missing(request('', ''))).status, 400);
  for (const [error, expected] of [[new Error('Authentication required'), 401], [new Error('Workspace access denied'), 403], [new Error('postgres://secret-password@host'), 500]]) {
    const handler = createEconomicsGetHandler({ env, resolveContext: async () => { throw error; } });
    const response = await handler(request());
    assert.equal(response.status, expected);
    if (expected === 500) assert.equal((await response.json()).error, 'Economics report unavailable');
  }
});
