import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderRouter } from '../../src/providers/providerRouter.js';

test('falls back to Gemini when OpenRouter has no route for a mapped image model', async () => {
  const calls = [];
  const router = createProviderRouter({
    env: { OPENROUTER_API_KEY: 'router-key', GEMINI_API_KEY: 'gemini-key' },
    fetch: async (url) => {
      calls.push(url);
      if (url.startsWith('https://openrouter.ai')) return new Response('', { status: 404 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'cG5n' } }] } }] }), { status: 200 });
    },
  });
  const result = await router.generateImage({ model: 'google/gemini-2.5-flash-image', prompt: 'fox' });
  assert.equal(result.provider, 'google');
  assert.equal(calls.length, 2);
});

test('routes BytePlus image models directly without calling OpenRouter', async () => {
  const calls = [];
  const router = createProviderRouter({
    env: {
      OPENROUTER_API_KEY: 'invalid-router-key',
      BYTEPLUS_API_KEY: 'byteplus-key',
      BYTEPLUS_BASE_URL: 'https://ark.example/api/v3',
    },
    fetch: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ data: [{ url: 'https://cdn.example/image.png' }] }), { status: 200 });
    },
  });

  const result = await router.generateImage({
    model: 'byteplus/seedream-4-5-251128',
    prompt: 'fox',
    aspectRatio: '1:1',
    resolution: '2K',
  });

  assert.equal(result.provider, 'byteplus');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://ark.example/api/v3/images/generations');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer byteplus-key');
  assert.equal(JSON.parse(calls[0].init.body).model, 'seedream-4-5-251128');
});
