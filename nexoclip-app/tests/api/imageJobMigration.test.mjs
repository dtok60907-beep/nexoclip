// POST /api/openrouter/images is retired (410 ENDPOINT_RETIRED). It authenticated the
// caller and then called a paid image provider WITHOUT reserving credits, so any
// workspace member could generate for free. Image generation now goes through the
// credited POST /api/generations (reservation -> settlement/refund). These tests
// prove the old route can no longer reach a provider, a tenant lookup or a job row.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createImageHandler, POST } from '../../app/api/openrouter/images/route.js';

function postReq(body) {
  const r = new Request('http://app/api/openrouter/images', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-workspace-id': 'ws-1' },
    body: JSON.stringify(body),
  });
  r.cookies = { get: (n) => (n === 'nexoclip_session' ? { value: 'tok' } : undefined) };
  return r;
}

test('image POST is retired: 410 ENDPOINT_RETIRED and no generate/persist/createJob/tenant call', async () => {
  const calls = [];
  const spy = (name) => async () => { calls.push(name); return { outputs: [], id: 'x' }; };
  const handler = createImageHandler({
    resolveTenant: spy('resolveTenant'), env: { OPENROUTER_API_KEY: 'k' },
    generate: spy('generate'), persist: spy('persist'),
    createJob: spy('createJob'), updateJobStatus: spy('updateJobStatus'),
  });
  const res = await handler(postReq({ model: 'nano-banana', prompt: 'a cat' }));
  assert.equal(res.status, 410);
  assert.deepEqual(await res.json(), { error: 'This endpoint has been retired. Use /api/generations.', code: 'ENDPOINT_RETIRED' });
  assert.deepEqual(calls, []);
});

test('image POST is retired even for malformed or empty requests', async () => {
  const handler = createImageHandler();
  const bad = new Request('http://app/api/openrouter/images', { method: 'POST', body: 'not json' });
  assert.equal((await handler(bad)).status, 410);
  assert.equal((await POST(postReq({}))).status, 410);
});
