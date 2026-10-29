import test from 'node:test';
import assert from 'node:assert/strict';
import { createMotionPlanHandler } from './route.js';

const PROJECT = '33333333-3333-4333-8333-333333333333';
const post = (body) => new Request('http://app/api/motion/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

function handler(overrides = {}) {
  const queued = [];
  const POST = createMotionPlanHandler({
    tenant: async () => ({ workspace: { id: 'ws-1' }, user: { id: 'user-1' } }),
    loadPool: () => ({}),
    loadQueue: () => ({}),
    enqueue: async (args) => { queued.push(args); return { id: 'job-1', status: 'queued' }; },
    logError: () => {},
    ...overrides,
  });
  return { POST, queued };
}

test('a message is queued as a job for the project and answered right away', async () => {
  const { POST, queued } = handler();
  const response = await POST(post({ projectId: PROJECT, brief: 'promo kopi', format: '9:16' }));
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { job: { id: 'job-1', status: 'queued' } });
  assert.equal(queued[0].projectId, PROJECT);
  assert.equal(queued[0].workspaceId, 'ws-1');
  assert.equal(queued[0].userId, 'user-1');
  assert.equal(queued[0].input.brief, 'promo kopi');
});

test('no project, no session and refusals from the queue come back as errors', async () => {
  assert.equal((await handler().POST(post({ brief: 'x' }))).status, 400);
  const guest = handler({ tenant: async () => { throw new Error('Authentication required'); } });
  assert.equal((await guest.POST(post({ projectId: PROJECT, brief: 'x' }))).status, 401);
  const broke = handler({ enqueue: async () => { throw Object.assign(new Error('Kredit kamu habis.'), { status: 402 }); } });
  const response = await broke.POST(post({ projectId: PROJECT, brief: 'x' }));
  assert.equal(response.status, 402);
  assert.equal((await response.json()).error, 'Kredit kamu habis.');
});
