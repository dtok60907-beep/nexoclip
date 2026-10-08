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

test('records separate unknown primary and known fallback requests before output handling', async () => {
  const observations = [];
  const router = createProviderRouter({
    env: { OPENROUTER_API_KEY: 'router-key', OPENAI_API_KEY: 'direct-key' },
    fetch: async (url) => url.startsWith('https://openrouter.ai')
      ? new Response('', { status: 503 })
      : new Response(JSON.stringify({ data: [{ b64_json: 'cG5n' }], usage: { input_tokens: 2, output_tokens: 3 } }), {
        headers: { 'x-request-id': 'direct-request-1' },
      }),
  });
  await router.generateImage({ model: 'openai/gpt-5-image', prompt: 'fox' }, { onProviderUsage: async (event) => observations.push(event) });
  assert.deepEqual(observations.map((event) => [event.provider, event.eventType]), [
    ['openrouter', 'dispatch'], ['openrouter', 'failed'], ['openai', 'dispatch'], ['openai', 'succeeded'],
  ]);
  assert.notEqual(observations[0].dispatchId, observations[2].dispatchId);
  assert.equal(observations[0].dispatchId, observations[1].dispatchId);
  assert.equal(observations[2].dispatchId, observations[3].dispatchId);
  assert.equal(observations[1].providerRequestId, null);
  assert.equal(observations[3].providerRequestId, 'direct-request-1');
  assert.deepEqual(observations[3].usage, { inputTokens: 2, imageOutputTokens: 3 });
});

test('does not submit or fall back when the pre-dispatch cost marker cannot be saved', async () => {
  let requests = 0;
  const router = createProviderRouter({
    env: { OPENROUTER_API_KEY: 'router-key', OPENAI_API_KEY: 'direct-key' },
    fetch: async () => { requests += 1; return new Response('', { status: 503 }); },
  });
  await assert.rejects(router.generateImage({ model: 'openai/gpt-5-image', prompt: 'fox' }, {
    onProviderUsage: async () => { throw new Error('Ledger unavailable'); },
  }), { code: 'COST_RECORDING_FAILED' });
  assert.equal(requests, 0);
});
