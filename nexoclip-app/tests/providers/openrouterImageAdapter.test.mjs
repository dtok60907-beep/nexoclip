import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenRouterImageAdapter } from '../../src/providers/openrouter/imageAdapter.js';

function response(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}

test('submits an image request and normalizes base64 output', async () => {
  const calls = [];
  const adapter = createOpenRouterImageAdapter({
    baseUrl: 'https://openrouter.test/',
    apiKey: 'server-secret',
    fetch: async (...args) => {
      calls.push(args);
      return response({ created: 123, data: [{ b64_json: 'aGVsbG8=', media_type: 'image/png' }], usage: { cost: 0.04 } });
    },
  });

  const result = await adapter.generate({ model: 'google/gemini-2.5-flash-image', prompt: 'a red panda', aspectRatio: '1:1' });

  assert.equal(calls[0][0], 'https://openrouter.test/api/v1/images');
  assert.equal(calls[0][1].headers.Authorization, 'Bearer server-secret');
  assert.deepEqual(JSON.parse(calls[0][1].body), {
    model: 'google/gemini-2.5-flash-image', prompt: 'a red panda', aspect_ratio: '1:1',
  });
  assert.deepEqual(result, {
    provider: 'openrouter', status: 'succeeded', providerRequestId: '123',
    outputs: [{ url: 'data:image/png;base64,aGVsbG8=', mimeType: 'image/png' }],
    usage: { cost: 0.04, costUsd: 0.04 },
  });
});

test('translates reference images to input_references', async () => {
  let body;
  const adapter = createOpenRouterImageAdapter({
    apiKey: 'server-secret',
    fetch: async (_url, options) => { body = JSON.parse(options.body); return response({ data: [{ b64_json: 'x', media_type: 'image/jpeg' }] }); },
  });

  await adapter.generate({ model: 'google/gemini-2.5-flash-image', prompt: 'edit', referenceImages: ['https://example.test/input.jpg'] });

  assert.deepEqual(body.input_references, [{ type: 'image_url', image_url: { url: 'https://example.test/input.jpg' } }]);
});

test('sanitizes provider errors', async () => {
  const adapter = createOpenRouterImageAdapter({
    apiKey: 'server-secret',
    fetch: async () => response({ error: { message: 'server-secret leaked' } }, { status: 401 }),
  });

  await assert.rejects(adapter.generate({ model: 'x', prompt: 'y' }), (error) => {
    assert.deepEqual(error, { code: 'OPENROUTER_AUTHENTICATION_FAILED', status: 401, message: 'OpenRouter authentication failed' });
    assert.equal(JSON.stringify(error).includes('server-secret'), false);
    return true;
  });
});
