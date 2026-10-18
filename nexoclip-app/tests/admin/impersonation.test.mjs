import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server.js';

const { createImpersonationHandlers } = await import('../../app/api/admin/impersonate/route.js');
const { allowedWhileReadOnly } = await import('../../src/lib/auth/impersonation.js');

const operator = '11111111-1111-4111-8111-111111111111';
const customer = '22222222-2222-4222-8222-222222222222';
const env = { NEXOCLIP_OPERATOR_USER_IDS: operator };
const sessions = {
  'op-token': { user_id: operator, expires_at: new Date(Date.now() + 86400000).toISOString() },
  'imp-token': { user_id: customer, email: 'c@example.com', impersonator_user_id: operator, impersonation_read_only: true, expires_at: new Date(Date.now() + 3600000).toISOString() },
  'cust-token': { user_id: customer },
};
const request = (method, cookies, body, url = 'http://localhost/api/admin/impersonate') => new NextRequest(url, {
  method, headers: { origin: 'http://localhost', cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; '), ...(body ? { 'content-type': 'application/json' } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
function handlers() {
  const calls = [];
  const service = {
    async start(input) { calls.push(['start', input]); return { token: 'imp-token', target: { id: customer, email: 'c@example.com' }, readOnly: input.readOnly }; },
    async stop(token) { calls.push(['stop', token]); return true; },
    async history(id) { calls.push(['history', id]); return [{ reason: 'cek' }]; },
  };
  return { calls, ...createImpersonationHandlers({ sessionLookup: async (t) => sessions[t] || null, service, env }) };
}

test('starting keeps the operator session aside and signs in as the customer, read-only by default', async () => {
  const h = handlers();
  const response = await h.POST(request('POST', { nexoclip_session: 'op-token' }, { targetUserId: customer, reason: 'cek video' }));
  assert.equal(response.status, 200);
  assert.equal(response.cookies.get('nexoclip_operator_session').value, 'op-token');
  assert.equal(response.cookies.get('nexoclip_session').value, 'imp-token');
  assert.equal(response.cookies.get('nexoclip_impersonation').value, 'read-only');
  assert.equal(h.calls[0][1].readOnly, true);
});

test('leaving ends the impersonation and restores the operator session', async () => {
  const h = handlers();
  const response = await h.DELETE(request('DELETE', { nexoclip_session: 'imp-token', nexoclip_operator_session: 'op-token' }));
  assert.equal(response.status, 200);
  assert.deepEqual(h.calls, [['stop', 'imp-token']]);
  assert.equal(response.cookies.get('nexoclip_session').value, 'op-token');
  assert.equal(response.cookies.get('nexoclip_operator_session').value, '');
  assert.equal(response.cookies.get('nexoclip_impersonation').value, '');
});

test('the banner state names the customer; history is for operators only', async () => {
  const h = handlers();
  const state = await (await h.GET(request('GET', { nexoclip_session: 'imp-token', nexoclip_operator_session: 'op-token' }))).json();
  assert.deepEqual({ ...state, expiresAt: undefined }, { impersonating: true, active: true, email: 'c@example.com', readOnly: true, expiresAt: undefined });
  assert.equal((await h.GET(request('GET', { nexoclip_session: 'cust-token' }, null, `http://localhost/api/admin/impersonate?history=${customer}`))).status, 403);
  assert.equal((await h.GET(request('GET', { nexoclip_session: 'imp-token' }, null, `http://localhost/api/admin/impersonate?history=${customer}`))).status, 403);
  assert.equal((await h.GET(request('GET', { nexoclip_session: 'op-token' }, null, `http://localhost/api/admin/impersonate?history=${customer}`))).status, 200);
});

test('read-only impersonation may read, leave and sign out, nothing else', () => {
  assert.equal(allowedWhileReadOnly('GET', '/api/generations'), true);
  assert.equal(allowedWhileReadOnly('POST', '/api/generations'), false);
  assert.equal(allowedWhileReadOnly('DELETE', '/api/admin/impersonate'), true);
  assert.equal(allowedWhileReadOnly('POST', '/api/auth/logout'), true);
});
