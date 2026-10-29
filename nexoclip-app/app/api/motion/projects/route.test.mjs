import test from 'node:test';
import assert from 'node:assert/strict';
import { createMotionProjectsHandlers } from './route.js';
import { createMotionProjectHandlers } from './[projectId]/route.js';

const WS = '11111111-1111-4111-8111-111111111111';
const PID = '22222222-2222-4222-8222-222222222222';
const doc = { styleId: 'auto', format: '9:16', scenes: [{ title: 'Halo', seconds: 4 }] };
const row = { id: PID, name: 'Promo', doc, created_at: 'c', updated_at: 'u' };

function req(method, body) {
  return new Request('http://app/api/motion/projects', { method, headers: { 'x-workspace-id': WS, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
}
const tenant = async () => ({ workspace: { id: WS }, user: { id: 'u1' } });
const pool = (rows, rowCount = rows.length) => () => ({ query: async () => ({ rows, rowCount }) });
const ctx = (projectId = PID) => ({ params: Promise.resolve({ projectId }) });

test('list and create', async () => {
  const list = createMotionProjectsHandlers({ tenant, loadPool: pool([row]) });
  assert.equal((await (await list.GET(req('GET'))).json()).projects[0].firstTitle, 'Halo');
  const created = await list.POST(req('POST', { name: 'Promo', doc }));
  assert.equal(created.status, 201);
  assert.equal((await list.POST(req('POST', { name: 'Promo', doc: { scenes: [] } }))).status, 400);
});

test('open, save, delete; unknown and foreign projects are 404; no session is 401', async () => {
  const found = createMotionProjectHandlers({ tenant, loadPool: pool([row]) });
  assert.equal((await found.GET(req('GET'), ctx())).status, 200);
  assert.equal((await found.PATCH(req('PATCH', { name: 'Baru' }), ctx())).status, 200);
  assert.equal((await found.GET(req('GET'), ctx('not-a-uuid'))).status, 404);
  const missing = createMotionProjectHandlers({ tenant, loadPool: pool([], 0) });
  assert.equal((await missing.GET(req('GET'), ctx())).status, 404);
  assert.equal((await missing.DELETE(req('DELETE'), ctx())).status, 404);
  assert.equal((await createMotionProjectHandlers({ tenant, loadPool: pool([], 1) }).DELETE(req('DELETE'), ctx())).status, 204);
  const anonymous = createMotionProjectsHandlers({ tenant: async () => { throw new Error('Authentication required'); }, loadPool: pool([]) });
  assert.equal((await anonymous.GET(req('GET'))).status, 401);
});
