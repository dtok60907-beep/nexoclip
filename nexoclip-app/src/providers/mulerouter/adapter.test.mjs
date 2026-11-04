import test from 'node:test';
import assert from 'node:assert/strict';
import { createMuleRouterAdapter } from './adapter.js';

const response = (body, status = 200, headers = {}) => ({
  ok: status >= 200 && status < 300, status,
  headers: { get: (name) => headers[name.toLowerCase()] || null },
  json: async () => body,
  arrayBuffer: async () => Buffer.from('video'),
});

test('submits, polls and downloads a MuleRouter task using the documented vendor route', async () => {
  const calls = [];
  const adapter = createMuleRouterAdapter({ apiKey: 'test-key', pollIntervalMs: 0, fetch: async (url, options = {}) => {
    calls.push({ url, options });
    if (options.method === 'POST') return response({ task_id: 'task-1', status: 'queued' });
    if (url.endsWith('/generation/task-1')) return response({ status: 'succeeded', output: { url: 'https://cdn.example/video.mp4' } });
    return response({}, 200, { 'content-type': 'video/mp4' });
  } });
  const submitted = await adapter.submit({ model: 'w3.0-video', prompt: 'a product film', duration: 10, generateAudio: true });
  assert.equal(submitted.providerRequestId, 'mulerouter:alibaba:w3.0-video:task-1');
  const status = await adapter.poll(submitted.providerRequestId);
  assert.equal(status.status, 'completed');
  const downloaded = await adapter.downloadContent(submitted.providerRequestId, 0, status.output);
  assert.equal(downloaded.contentType, 'video/mp4');
  assert.match(calls[0].url, /\/vendors\/alibaba\/v1\/w3\.0-video\/generation$/);
  assert.equal(JSON.parse(calls[0].options.body).audio, true);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-key');
});

test('accepts a future MuleRouter model through an explicit vendor/model id', async () => {
  let url;
  const adapter = createMuleRouterAdapter({ apiKey: 'test-key', fetch: async (requestUrl, options = {}) => {
    url = requestUrl;
    return response(options.method === 'POST' ? { id: 'future-1' } : { status: 'succeeded', output: 'https://cdn.example/out.mp4' });
  } });
  const result = await adapter.submit({ model: 'mulerouter/alibaba/future-video', prompt: 'test' });
  assert.equal(result.providerRequestId, 'mulerouter:alibaba:future-video:future-1');
  assert.match(url, /\/vendors\/alibaba\/v1\/future-video\/generation$/);
});

test('accepts MuleRouter documented task_info response envelopes for images', async () => {
  const adapter = createMuleRouterAdapter({ apiKey: 'test-key', pollIntervalMs: 0, fetch: async (url, options = {}) => {
    if (options.method === 'POST') return response({ task_info: { id: 'image-task-1', status: 'queued' } }, 202);
    return response({ task_info: { id: 'image-task-1', status: 'succeeded' }, images: ['https://cdn.example/image.png'] });
  } });
  const result = await adapter.generate({ model: 'z-image-spicy-pro', prompt: 'test image' });
  assert.equal(result.providerRequestId, 'mulerouter:carrothub:z-image-spicy-pro:image-task-1');
  assert.deepEqual(result.outputs, ['https://cdn.example/image.png']);
});

test('submits Qwen Image Edit Spicy with its required primary image field', async () => {
  let request;
  const adapter = createMuleRouterAdapter({ apiKey: 'test-key', fetch: async (url, options = {}) => {
    request = { url, body: JSON.parse(options.body) };
    return response({ task_info: { id: 'qwen-task-1', status: 'queued' } }, 202);
  } });
  await adapter.submit({
    model: 'qwen-image-edit-spicy',
    prompt: 'edit the image',
    aspectRatio: '9:16',
    seed: 7,
    referenceImages: ['https://cdn.example/source.png', 'https://cdn.example/style.png'],
  });
  assert.match(request.url, /\/vendors\/carrothub\/v1\/qwen-image-edit-spicy\/generation$/);
  assert.equal(request.body.image, 'https://cdn.example/source.png');
  assert.deepEqual(request.body.reference_images, ['https://cdn.example/style.png']);
  assert.equal(request.body.ratio, undefined);
});
