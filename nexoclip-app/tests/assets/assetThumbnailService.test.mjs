import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureAssetThumbnail, thumbnailKeyFor } from '../../src/services/assetThumbnailService.js';

function memoryStorage(initial = {}) {
  const objects = new Map(Object.entries(initial));
  const calls = { get: 0, put: [] };
  return {
    calls,
    async exists(key) { return objects.has(key); },
    async get(key) { calls.get += 1; return { body: objects.get(key), contentType: 'image/png' }; },
    async put(key, body, contentType) { calls.put.push({ key, contentType }); objects.set(key, body); },
  };
}

const asset = { id: 'a1', storage_key: 'w1/a1', content_type: 'image/png' };

test('renders a 512px WebP once and reuses it afterwards', async () => {
  const storage = memoryStorage({ 'w1/a1': Buffer.from('original') });
  let resized = 0;
  const resize = async () => { resized += 1; return Buffer.from('thumb'); };
  assert.equal(await ensureAssetThumbnail(storage, asset, { resize }), thumbnailKeyFor('w1/a1'));
  assert.equal(await ensureAssetThumbnail(storage, asset, { resize }), 'w1/a1.thumb-512.webp');
  assert.equal(resized, 1);
  assert.deepEqual(storage.calls.put, [{ key: 'w1/a1.thumb-512.webp', contentType: 'image/webp' }]);
});

test('concurrent requests for the same image render it only once', async () => {
  const storage = memoryStorage({ 'w1/a1': Buffer.from('original') });
  let resized = 0;
  const resize = async () => { resized += 1; await new Promise((r) => setTimeout(r, 10)); return Buffer.from('thumb'); };
  await Promise.all([1, 2, 3].map(() => ensureAssetThumbnail(storage, asset, { resize })));
  assert.equal(resized, 1);
});

test('videos, GIFs and storage without exists() keep the original', async () => {
  const storage = memoryStorage();
  assert.equal(await ensureAssetThumbnail(storage, { ...asset, content_type: 'video/mp4' }), null);
  assert.equal(await ensureAssetThumbnail(storage, { ...asset, content_type: 'image/gif' }), null);
  assert.equal(await ensureAssetThumbnail({ get() {}, put() {} }, asset), null);
});
