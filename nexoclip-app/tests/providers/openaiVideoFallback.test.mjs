import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { getDirectProvider } from '../../src/providers/providerRegistry.js';
import { createOpenAIVideoAdapter } from '../../src/providers/direct/openaiVideoAdapter.js';
import { createProviderRouter } from '../../src/providers/providerRouter.js';

function jsonResponse(body, { status = 200 } = {}) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => body };
}

// A tiny real JPEG — sharp (used by the adapter to cover-crop reference images to Sora's
// required exact size) needs actual decodable image bytes, not an arbitrary string.
async function fixtureImageResponse() {
  const buffer = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 200, g: 50, b: 50 } } }).jpeg().toBuffer();
  return { ok: true, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) };
}

test('maps OpenRouter Sora 2 Pro to the direct OpenAI video model', () => {
  assert.deepEqual(getDirectProvider('openai/sora-2-pro'), { provider: 'openai', model: 'sora-2-pro' });
});

test('OpenAI video adapter cover-crops the reference image to exactly match `size` before sending it', async () => {
  let submitRequest;
  const adapter = createOpenAIVideoAdapter({
    apiKey: 'oa-key',
    fetch: async (url, options) => {
      if (url === 'https://cdn.example.com/ref.jpg') return fixtureImageResponse();
      submitRequest = { url, options };
      return jsonResponse({ id: 'video_1', status: 'queued' });
    },
  });
  const result = await adapter.submit({
    model: 'sora-2-pro', prompt: 'a woman waving', duration: 8, aspectRatio: '9:16',
    referenceImages: ['https://cdn.example.com/ref.jpg'],
  });
  assert.equal(submitRequest.url, 'https://api.openai.com/v1/videos');
  const body = JSON.parse(submitRequest.options.body);
  assert.equal(body.size, '720x1280'); // exact target size Sora requires
  assert.match(body.input_reference.image_url, /^data:image\/jpeg;base64,/);
  const resizedBuffer = Buffer.from(body.input_reference.image_url.split(',')[1], 'base64');
  const metadata = await sharp(resizedBuffer).metadata();
  assert.equal(metadata.width, 720);
  assert.equal(metadata.height, 1280); // cropped to exactly match `size`, not left at its original 400x300
  assert.equal(body.seconds, '8');
  assert.equal(result.provider, 'openai');
});

test('OpenAI video adapter poll/download hit /videos/{id} and /videos/{id}/content', async () => {
  const calls = [];
  const adapter = createOpenAIVideoAdapter({
    apiKey: 'oa-key',
    fetch: async (url) => {
      calls.push(url);
      if (url.endsWith('/content')) return { ok: true, headers: { get: () => 'video/mp4' }, arrayBuffer: async () => new TextEncoder().encode('bytes').buffer };
      return jsonResponse({ id: 'video_1', status: 'completed' });
    },
  });
  const status = await adapter.poll('video_1');
  assert.equal(status.status, 'completed');
  const { buffer, contentType } = await adapter.downloadContent('video_1');
  assert.equal(contentType, 'video/mp4');
  assert.equal(buffer.toString(), 'bytes');
  assert.deepEqual(calls, ['https://api.openai.com/v1/videos/video_1', 'https://api.openai.com/v1/videos/video_1/content']);
});

test('falls back to direct OpenAI when OpenRouter rejects Sora 2 Pro with 403', async () => {
  const calls = [];
  const router = createProviderRouter({
    env: { OPENROUTER_API_KEY: 'or-key', OPENAI_API_KEY: 'oa-key' },
    fetch: async (url) => {
      calls.push(url);
      if (url.includes('openrouter.ai')) return { ok: false, status: 403, json: async () => ({}) };
      if (url === 'https://cdn.example.com/ref.jpg') return fixtureImageResponse();
      return jsonResponse({ id: 'video_1', status: 'queued' });
    },
  });
  const result = await router.submitVideo({ model: 'openai/sora-2-pro', prompt: 'a woman waving', referenceImages: ['https://cdn.example.com/ref.jpg'] });
  assert.equal(result.provider, 'openai');
  assert.equal(calls.length, 3);
  assert.match(calls[2], /api\.openai\.com\/v1\/videos$/);
});

test('falls back to direct OpenAI when the configured OpenRouter key itself is invalid (401)', async () => {
  const calls = [];
  const router = createProviderRouter({
    env: { OPENROUTER_API_KEY: 'or-key-revoked', OPENAI_API_KEY: 'oa-key' },
    fetch: async (url) => {
      calls.push(url);
      if (url.includes('openrouter.ai')) return { ok: false, status: 401, json: async () => ({}) };
      if (url === 'https://cdn.example.com/ref.jpg') return fixtureImageResponse();
      return jsonResponse({ id: 'video_1', status: 'queued' });
    },
  });
  const result = await router.submitVideo({ model: 'openai/sora-2-pro', prompt: 'a woman waving', referenceImages: ['https://cdn.example.com/ref.jpg'] });
  assert.equal(result.provider, 'openai');
  assert.equal(calls.length, 3);
  assert.match(calls[2], /api\.openai\.com\/v1\/videos$/);
});

test('poll and download route to the direct OpenAI adapter once a job is tagged provider: openai', async () => {
  const calls = [];
  const router = createProviderRouter({
    env: { OPENAI_API_KEY: 'oa-key' },
    fetch: async (url) => {
      calls.push(url);
      if (url.endsWith('/content')) return { ok: true, headers: { get: () => 'video/mp4' }, arrayBuffer: async () => new TextEncoder().encode('bytes').buffer };
      return jsonResponse({ id: 'video_1', status: 'completed' });
    },
  });
  const status = await router.pollVideo('openai', 'video_1');
  assert.equal(status.status, 'completed');
  const { contentType } = await router.downloadVideo('openai', 'video_1', 0);
  assert.equal(contentType, 'video/mp4');
});
