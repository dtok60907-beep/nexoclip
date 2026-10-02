// POST /api/openrouter/videos is retired (410 ENDPOINT_RETIRED). It submitted paid
// video jobs to the provider WITHOUT reserving credits. Video generation now goes
// through the credited POST /api/generations. The GET poll route
// (videos/[id]/route.js) is intentionally untouched so already-submitted legacy jobs
// can still be reattached; polling adds no provider spend.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVideoSubmitHandler, POST } from '../../app/api/openrouter/videos/route.js';

function postReq(body) {
  const r = new Request('http://app/api/openrouter/videos', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-workspace-id': 'ws-1' },
    body: JSON.stringify(body),
  });
  r.cookies = { get: (n) => (n === 'nexoclip_session' ? { value: 'tok' } : undefined) };
  return r;
}

test('video POST is retired: 410 ENDPOINT_RETIRED and no submit/createJob/tenant call', async () => {
  const calls = [];
  const spy = (name) => async () => { calls.push(name); return { id: 'x' }; };
  const handler = createVideoSubmitHandler({
    resolveTenant: spy('resolveTenant'), env: { OPENROUTER_API_KEY: 'k' },
    submitVideo: spy('submitVideo'), createJob: spy('createJob'), updateJobStatus: spy('updateJobStatus'),
  });
  const res = await handler(postReq({ model: 'google/veo-3.1', prompt: 'a cat' }));
  assert.equal(res.status, 410);
  assert.deepEqual(await res.json(), { error: 'This endpoint has been retired. Use /api/generations.', code: 'ENDPOINT_RETIRED' });
  assert.deepEqual(calls, []);
});

test('video POST is retired for video-to-video and asset-reference bodies too', async () => {
  const handler = createVideoSubmitHandler();
  for (const body of [
    { model: 'runway/aleph-2', prompt: 'x', input_references: [{ type: 'video_url', video_url: { url: 'https://cdn.example/in.mp4' } }] },
    { model: 'bytedance/seedance-2.5', prompt: 'x', input_references: [{ image_url: { url: 'asset://a' } }] },
    {},
  ]) {
    const res = await handler(postReq(body));
    assert.equal(res.status, 410);
    assert.equal((await res.json()).code, 'ENDPOINT_RETIRED');
  }
  assert.equal((await POST(postReq({}))).status, 410);
});
