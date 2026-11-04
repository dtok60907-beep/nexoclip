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
