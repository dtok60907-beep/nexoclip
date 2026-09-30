import test from 'node:test';
import assert from 'node:assert/strict';
import { isRetryableProviderError } from '../../src/providers/providerRegistry.js';
import { createProviderRouter } from '../../src/providers/providerRouter.js';
import { createBytePlusImageAdapter } from '../../src/providers/direct/imageAdapters.js';

test('OpenRouter 400 "no route for model" is retryable, generic 400 is not', () => {
  assert.equal(isRetryableProviderError({ status: 400, code: 'OPENROUTER_MODEL_UNAVAILABLE' }), true);
  assert.equal(isRetryableProviderError({ status: 400, code: 'OPENROUTER_REQUEST_FAILED' }), false);
  assert.equal(isRetryableProviderError({ status: 400 }), false);
});

test('sends Seedream straight to BytePlus even when OpenRouter would answer 400', async () => {
  const calls = [];
  const router = createProviderRouter({
    env: { OPENROUTER_API_KEY: 'or-key', BYTEPLUS_API_KEY: 'bp-key', BYTEPLUS_BASE_URL: 'https://ark.example/api/v3' },
    fetch: async (url) => {
      calls.push(url);
      if (url.includes('openrouter.ai')) {
        return { ok: false, status: 400, json: async () => ({ error: { message: 'bytedance-seed/seedream-5-0-pro is not a valid model ID' } }) };
      }
      return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: 'abc', mime_type: 'image/png' }] }) };
    },
  });

  const result = await router.generateImage({ model: 'bytedance-seed/seedream-5-0-pro', prompt: 'a cat' });

  assert.equal(result.provider, 'byteplus');
  assert.equal(calls.length, 1);
  // BytePlus models are routed straight to BytePlus, never via OpenRouter.
  assert.ok(!calls.some((url) => String(url).includes('openrouter.ai')));
  assert.match(calls[0], /ark\.example\/api\/v3\/images\/generations/);
});

test('sends BytePlus image models straight to BytePlus with the direct model id', async () => {
  const calls = [];
  let bytePlusBody;
  const router = createProviderRouter({
    env: { OPENROUTER_API_KEY: 'or-key', BYTEPLUS_API_KEY: 'bp-key', BYTEPLUS_BASE_URL: 'https://ark.example/api/v3' },
    fetch: async (url, options) => {
      calls.push(url);
      if (url.includes('openrouter.ai')) return { ok: false, status: 400, json: async () => ({ error: { message: 'Bad Request' } }) };
      bytePlusBody = JSON.parse(options.body);
      return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: 'abc', mime_type: 'image/png' }] }) };
    },
  });

  const result = await router.generateImage({ model: 'bytedance-seed/seedream-4.5', prompt: 'a cat' });
  assert.equal(result.provider, 'byteplus');
  assert.equal(bytePlusBody.model, 'seedream-4-5-251128');
  assert.equal(calls.length, 1);
  // BytePlus models are routed straight to BytePlus, never via OpenRouter.
  assert.ok(!calls.some((url) => String(url).includes('openrouter.ai')));
});

test('does not depend on OpenRouter credits for BytePlus image models', async () => {
  const calls = [];
  const router = createProviderRouter({
    env: { OPENROUTER_API_KEY: 'or-key', BYTEPLUS_API_KEY: 'bp-key', BYTEPLUS_BASE_URL: 'https://ark.example/api/v3' },
    fetch: async (url) => {
      calls.push(url);
      if (url.includes('openrouter.ai')) return { ok: false, status: 402, json: async () => ({ error: { message: 'Insufficient credits. Add more using https://openrouter.ai/settings/credits', code: 402 } }) };
      return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: 'abc', mime_type: 'image/png' }] }) };
    },
  });

  const result = await router.generateImage({ model: 'bytedance-seed/seedream-5-0-pro', prompt: 'a cat' });
  assert.equal(result.provider, 'byteplus');
  assert.equal(calls.length, 1);
  // BytePlus models are routed straight to BytePlus, never via OpenRouter.
  assert.ok(!calls.some((url) => String(url).includes('openrouter.ai')));
});

test('does not fall back on a 402 for a model with no direct-provider mapping', async () => {
  const calls = [];
  const router = createProviderRouter({
    env: { OPENROUTER_API_KEY: 'or-key', BYTEPLUS_API_KEY: 'bp-key', BYTEPLUS_BASE_URL: 'https://ark.example/api/v3' },
    fetch: async (url) => {
      calls.push(url);
      return { ok: false, status: 402, json: async () => ({ error: { message: 'Insufficient credits' } }) };
    },
  });

  await assert.rejects(router.generateImage({ model: 'anthropic/claude-3-7-sonnet', prompt: 'a cat' }));
  assert.equal(calls.length, 1);
});

test('sends a BytePlus deployment endpoint directly with reference images', async () => {
  const calls = [];
  let body;
  const router = createProviderRouter({
    env: { OPENROUTER_API_KEY: 'or-key', BYTEPLUS_API_KEY: 'bp-key', BYTEPLUS_BASE_URL: 'https://ark.example/api/v3' },
    fetch: async (url, options) => {
      calls.push(url);
      body = JSON.parse(options.body);
      return { ok: true, status: 200, json: async () => ({ data: [{ url: 'https://cdn.example/out.jpg' }] }) };
    },
  });

  const result = await router.generateImage({
    model: 'ep-20260907150433-zg8fr',
    prompt: 'a girl and a cow plushie',
    resolution: '2K',
    referenceImages: ['https://cdn.example/one.png', 'https://cdn.example/two.png'],
  });

  assert.equal(result.provider, 'byteplus');
  assert.equal(calls.length, 1);
  assert.match(calls[0], /ark\.example\/api\/v3\/images\/generations/);
  assert.equal(body.model, 'ep-20260907150433-zg8fr');
  assert.deepEqual(body.image, ['https://cdn.example/one.png', 'https://cdn.example/two.png']);
  assert.equal(body.size, '2K');
});

test('BytePlus image adapter never sends an aspect ratio as `size` (BytePlus rejects it with InvalidParameter)', async () => {
  let request;
  const adapter = createBytePlusImageAdapter({
    apiKey: 'bp-key', baseUrl: 'https://ark.example/api/v3',
    fetch: async (url, options) => { request = { url, options }; return { ok: true, status: 200, json: async () => ({ data: [{ url: 'https://cdn.example/out.jpg' }] }) }; },
  });

  await adapter.generate({ model: 'dola-seedream-5-0-pro-260628', prompt: 'a cat', aspectRatio: '1:1' });

  const body = JSON.parse(request.options.body);
  assert.equal(body.size, undefined);
  assert.equal(body.response_format, 'url');
});

test('BytePlus image adapter maps resolution presets to `size`', async () => {
  let request;
  const adapter = createBytePlusImageAdapter({
    apiKey: 'bp-key', baseUrl: 'https://ark.example/api/v3',
    fetch: async (url, options) => { request = { url, options }; return { ok: true, status: 200, json: async () => ({ data: [{ url: 'https://cdn.example/out.jpg' }] }) }; },
  });

  await adapter.generate({ model: 'dola-seedream-5-0-pro-260628', prompt: 'a cat', resolution: '2K' });

  assert.equal(JSON.parse(request.options.body).size, '2K');
});

test('BytePlus Seedream 4.5 deployment upgrades unsupported 1K requests to 2K', async () => {
  let request;
  const adapter = createBytePlusImageAdapter({
    apiKey: 'bp-key', baseUrl: 'https://ark.example/api/v3',
    fetch: async (url, options) => { request = { url, options }; return { ok: true, status: 200, json: async () => ({ data: [{ url: 'https://cdn.example/out.jpg' }] }) }; },
  });

  await adapter.generate({ model: 'ep-20260907150312-xx7gf', prompt: 'a cat', resolution: '1K' });

  assert.equal(JSON.parse(request.options.body).size, '2K');
});

test('BytePlus image adapter surfaces provider error detail without leaking the API key', async () => {
  const adapter = createBytePlusImageAdapter({
    apiKey: 'super-secret',
    baseUrl: 'https://ark.example/api/v3',
    fetch: async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'The parameter `size` specified in the request are not valid', code: 'InvalidParameter' } }) }),
  });

  await assert.rejects(adapter.generate({ model: 'dola-seedream-5-0-pro-260628', prompt: 'a cat' }), (error) => {
    assert.match(error.message, /size.*not valid/);
    assert.equal(error.message.includes('super-secret'), false);
    return true;
  });
});

test('does not fall back on a 400 for a model with no direct-provider mapping', async () => {
  const calls = [];
  const router = createProviderRouter({
    env: { OPENROUTER_API_KEY: 'or-key', BYTEPLUS_API_KEY: 'bp-key', BYTEPLUS_BASE_URL: 'https://ark.example/api/v3' },
    fetch: async (url) => {
      calls.push(url);
      return { ok: false, status: 400, json: async () => ({ error: { message: 'prompt is required' } }) };
    },
  });

  await assert.rejects(router.generateImage({ model: 'anthropic/claude-3-7-sonnet', prompt: 'a cat' }));
  assert.equal(calls.length, 1);
});
