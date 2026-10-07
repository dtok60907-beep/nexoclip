import test from 'node:test';
import assert from 'node:assert/strict';
import { openAIImageUsage, googleImageUsage, createOpenAIImageAdapter, createBytePlusImageAdapter } from '../../src/providers/direct/imageAdapters.js';

test('direct image usage distinguishes explicit zero from absent or invalid token counts', () => {
  assert.deepEqual(openAIImageUsage({}), {});
  assert.deepEqual(googleImageUsage({}), {});
  assert.deepEqual(openAIImageUsage({ input_tokens: null, output_tokens: '' }), {});
  assert.deepEqual(openAIImageUsage({ input_tokens: 0, output_tokens: '0' }), { inputTokens: 0, imageOutputTokens: 0 });
  assert.deepEqual(googleImageUsage({ promptTokenCount: 0, candidatesTokenCount: 0 }), { inputTokens: 0, imageOutputTokens: 0 });
  assert.deepEqual(googleImageUsage({ promptTokenCount: 2, thoughtsTokenCount: 3, candidatesTokensDetails: [{ modality: 'IMAGE', tokenCount: 4 }] }), {
    inputTokens: 2, imageOutputTokens: 4, textOutputTokens: 3,
  });
});

test('direct image results retain the actual upstream request identity', async () => {
  const adapter = createOpenAIImageAdapter({ apiKey: 'fake-key', fetch: async () => new Response(JSON.stringify({ data: [{ b64_json: 'cG5n' }] }), {
    headers: { 'x-request-id': 'openai-req-1' },
  }) });
  const result = await adapter.generate({ model: 'gpt-image-1', prompt: 'fox' });
  assert.equal(result.providerRequestId, 'openai-req-1');
  assert.deepEqual(result.usage, {});
});

test('BytePlus explicit zero generated images remains a known zero observation', async () => {
  const adapter = createBytePlusImageAdapter({ apiKey: 'fake-key', baseUrl: 'https://byteplus.test', fetch: async () => new Response(JSON.stringify({
    id: 'byteplus-req-1', data: [{ b64_json: 'cG5n' }], usage: { generated_images: 0 },
  })) });
  const result = await adapter.generate({ model: 'seedream-4.5', prompt: 'fox' });
  assert.equal(result.providerRequestId, 'byteplus-req-1');
  assert.deepEqual(result.usage, { generated_images: 0 });
});
