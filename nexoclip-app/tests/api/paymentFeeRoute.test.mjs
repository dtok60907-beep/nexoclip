import test from 'node:test';
import assert from 'node:assert/strict';
import { createPaymentFeeGetHandler, createPaymentFeeHandler } from '../../app/api/admin/economics/payment-fees/route.js';

function request(body) {
  const request = new Request('http://app/api/admin/economics/payment-fees', { method: 'POST', headers: { 'content-type': 'application/json', 'x-workspace-id': 'w1' }, body: JSON.stringify(body) });
  request.cookies = { get: () => ({ value: 'session' }) };
  return request;
}
const tenant = { user: { id: 'operator-1' }, workspace: { id: 'w1', role: 'owner' } };
test('workspace owners cannot mutate fee data without operator authorization', async () => {
  let writes = 0;
  const handler = createPaymentFeeHandler({ resolveContext: async () => tenant, env: {}, reconcile: async () => { writes++; } });
  assert.equal((await handler(request({}))).status, 403);
  assert.equal(writes, 0);
});
test('fee endpoint binds workspace and operator to authenticated context', async () => {
  let recorded;
  const handler = createPaymentFeeHandler({ resolveContext: async () => tenant, env: { NEXOCLIP_OPERATOR_USER_IDS: 'operator-1' }, poolFactory: () => ({}), reconcile: async (_pool, args) => { recorded = args; return { observationId: '1' }; } });
  const response = await handler(request({ workspaceId: 'attacker', userId: 'attacker', topupId: 'topup-1', feeIdr: 0 }));
  assert.equal(response.status, 200);
  assert.equal(recorded.workspaceId, 'w1');
  assert.equal(recorded.userId, 'operator-1');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('payment fee candidates require operator access and use authenticated workspace with pagination', async () => {
  const req = new Request('http://app/api/admin/economics/payment-fees?page=2&pageSize=20&workspaceId=attacker', { headers: { 'x-workspace-id': 'w1' } });
  req.cookies = { get: () => ({ value: 'session' }) };
  let received;
  const list = async (_pool, args) => { received = args; return { items: [], pagination: { page: 2 } }; };
  const denied = createPaymentFeeGetHandler({ resolveContext: async () => tenant, env: {}, list });
  assert.equal((await denied(req)).status, 403);
  assert.equal(received, undefined);
  const allowed = createPaymentFeeGetHandler({ resolveContext: async () => tenant, env: { NEXOCLIP_OPERATOR_USER_IDS: 'operator-1' }, poolFactory: () => ({}), list });
  const response = await allowed(req);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(received, { workspaceId: 'w1', page: '2', pageSize: '20' });
});
