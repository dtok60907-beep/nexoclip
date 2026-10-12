import test from 'node:test';
import assert from 'node:assert/strict';
import { getDirectProvider } from '../../src/providers/providerRegistry.js';
import { createProviderRouter } from '../../src/providers/providerRouter.js';
import { createOpenAIImageAdapter } from '../../src/providers/direct/imageAdapters.js';

test('maps OpenRouter GPT image models to direct OpenAI image models', () => {
  assert.deepEqual(getDirectProvider('openai/gpt-5-image'), { provider: 'openai', model: 'gpt-image-1' });
  assert.deepEqual(getDirectProvider('openai/gpt-5-image-mini'), { provider: 'openai', model: 'gpt-image-1-mini' });
  assert.deepEqual(getDirectProvider('openai/gpt-5.4-image-2'), { provider: 'openai', model: 'gpt-image-2' });
  assert.deepEqual(getDirectProvider('gpt-image-1.5'), { provider: 'openai', model: 'gpt-image-1.5' });
  // A namespaced bare gpt-image id (if OpenRouter ever exposes one) also resolves without renaming the model.
  assert.deepEqual(getDirectProvider('openai/gpt-image-1'), { provider: 'openai', model: 'gpt-image-1' });
  // Non-image GPT chat models stay OpenRouter-only.
  assert.equal(getDirectProvider('openai/gpt-5'), null);
});

test('falls back to direct OpenAI when OpenRouter has no route for the GPT image model', async () => {
  const calls = [];
  const router = createProviderRouter({
    env: { OPENROUTER_API_KEY: 'or-key', OPENAI_API_KEY: 'oa-key' },
    fetch: async (url) => {
      calls.push(url);
      if (url.includes('openrouter.ai')) return { ok: false, status: 400, json: async () => ({ error: { message: 'no route for openai/gpt-5-image' } }) };
      return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: 'abc', mime_type: 'image/png' }] }) };
    },
  });

  const result = await router.generateImage({ model: 'openai/gpt-5-image', prompt: 'a cat' });
  assert.equal(result.provider, 'openai');
  assert.equal(calls.length, 2);
  assert.match(calls[1], /api\.openai\.com\/v1\/images\/generations/);
});

test('falls back to direct OpenAI when the configured OpenRouter key itself is invalid (401)', async () => {
  const calls = [];
  const router = createProviderRouter({
    env: { OPENROUTER_API_KEY: 'or-key-revoked', OPENAI_API_KEY: 'oa-key' },
    fetch: async (url) => {
      calls.push(url);
      if (url.includes('openrouter.ai')) {
        return { ok: false, status: 401, json: async () => ({ error: { code: 'OPENROUTER_AUTHENTICATION_FAILED', message: 'OpenRouter authentication failed' } }) };
      }
      return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: 'abc', mime_type: 'image/png' }] }) };
    },
  });

  const result = await router.generateImage({ model: 'openai/gpt-5.4-image-2', prompt: 'a cat' });
  assert.equal(result.provider, 'openai');
  assert.equal(calls.length, 2);
  assert.match(calls[1], /api\.openai\.com\/v1\/images\/generations/);
});

test('OpenAI adapter routes reference images through /images/edits as multipart, not /images/generations', async () => {
  let editsCall;
  const adapter = createOpenAIImageAdapter({
    apiKey: 'oa-key',
    fetch: async (url, options) => {
      if (url === 'https://cdn.example.com/ref.jpg') {
        return { ok: true, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => new TextEncoder().encode('fake-bytes').buffer };
      }
      editsCall = { url, options };
      return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: 'edited', mime_type: 'image/png' }] }) };
    },
  });
  const result = await adapter.generate({ model: 'gpt-image-2', prompt: 'add a red hat', referenceImages: ['https://cdn.example.com/ref.jpg'] });
  assert.match(editsCall.url, /api\.openai\.com\/v1\/images\/edits$/);
  assert.ok(editsCall.options.body instanceof FormData);
  assert.equal(editsCall.options.body.get('prompt'), 'add a red hat');
  assert.ok(editsCall.options.body.get('image[]') instanceof Blob);
  assert.deepEqual(result.outputs, [{ url: 'data:image/png;base64,edited', mimeType: 'image/png' }]);
});

test('reports DIRECT_PROVIDER_UNAVAILABLE when OPENAI_API_KEY is not configured', async () => {
  const router = createProviderRouter({
    env: { OPENROUTER_API_KEY: 'or-key' },
    fetch: async () => ({ ok: false, status: 402, json: async () => ({ error: { message: 'Insufficient credits' } }) }),
  });

  await assert.rejects(router.generateImage({ model: 'openai/gpt-5-image', prompt: 'a cat' }), (error) => {
    assert.equal(error.code, 'DIRECT_PROVIDER_UNAVAILABLE');
    assert.equal(error.provider, 'openai');
    return true;
  });
});
