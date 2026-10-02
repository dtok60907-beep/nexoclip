// Image/video helpers in generationClient.js used to POST to the now-retired
// uncredited /api/openrouter/{images,videos}. They must only use the credited
// /api/generations endpoint.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateI2I, generateImage } from '../../packages/studio/src/generationClient.js';

function stubFetch() {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (init.method === 'POST') return Response.json({ generation: { id: 'g1' } }, { status: 201 });
    return Response.json({ generation: { id: 'g1', status: 'succeeded', provider: 'openrouter', outputs: [{ url: 'https://cdn/out.png' }] } });
  };
  return calls;
}

test('generateI2I (DrawModal path) posts to /api/generations, never /api/openrouter/*', async () => {
  const realFetch = globalThis.fetch;
  const calls = stubFetch();
  const realTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn) => realTimeout(fn, 0);
  try {
    const res = await generateI2I('', {
      model: 'nano-banana-pro-edit', prompt: 'edit', images_list: ['https://cdn/in.png'],
      aspect_ratio: '1:1', workspace_id: 'ws-1',
    });
    assert.equal(res.outputs[0].url, 'https://cdn/out.png');
    const post = calls.find((c) => c.init.method === 'POST');
    assert.equal(post.url, '/api/generations');
    assert.equal(post.init.headers['x-workspace-id'], 'ws-1');
    assert.ok(post.init.headers['Idempotency-Key']);
    const body = JSON.parse(post.init.body);
    assert.equal(body.kind, 'image');
    assert.equal(body.model, 'google/gemini-3-pro-image');
    assert.deepEqual(body.parameters, { aspectRatio: '1:1', referenceImages: ['https://cdn/in.png'] });
    assert.ok(calls.every((c) => !c.url.includes('/api/openrouter/')));
  } finally {
    globalThis.fetch = realFetch;
    globalThis.setTimeout = realTimeout;
  }
});

test('generateImage rejects unmapped models without any network call', async () => {
  const realFetch = globalThis.fetch;
  const calls = stubFetch();
  try {
    await assert.rejects(generateImage('', { model: 'no-such-model', prompt: 'x', workspace_id: 'ws-1' }), /not available/);
    assert.equal(calls.length, 0);
  } finally { globalThis.fetch = realFetch; }
});

test('no client source posts to the retired /api/openrouter/images or /videos submit routes', () => {
  for (const rel of ['../../packages/studio/src/generationClient.js', '../../packages/studio/src/components/DrawModal.jsx']) {
    const src = fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /\/api\/openrouter\/images/);
    assert.doesNotMatch(src, /fetch\(\s*['"`]\/api\/openrouter\/videos['"`]/);
  }
  const draw = fs.readFileSync(new URL('../../packages/studio/src/components/DrawModal.jsx', import.meta.url), 'utf8');
  assert.match(draw, /generateSaasImage/);
  assert.doesNotMatch(draw, /generateI2I/);
});
