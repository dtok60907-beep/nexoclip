import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadFile, generateSaasImage } from '../../packages/studio/src/generationClient.js';

function mockWindow(t, value) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value, configurable: true });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'window', previous); else delete globalThis.window; });
}

test('guest reference files stay local without making an upload request', async t => {
  t.mock.method(globalThis.URL, 'createObjectURL', () => 'blob:guest-reference');
  mockWindow(t, { sessionStorage: { getItem: () => null } });
  const progress = [];
  assert.equal(await uploadFile(null, new Blob(['image'], { type: 'image/png' }), value => progress.push(value)), 'blob:guest-reference');
  assert.deepEqual(progress, [100]);
});

test('generation without a workspace asks for authentication before a network request', async t => {
  const events = [];
  mockWindow(t, { sessionStorage: { getItem: () => null }, dispatchEvent: event => events.push(event.type) });
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected request'); });
  await assert.rejects(generateSaasImage({ model: 'test-image', prompt: 'A cup' }), /Sign in to generate/);
  assert.equal(fetch.mock.callCount(), 0);
  assert.deepEqual(events, ['muapi:auth-required']);
});

test('expired authentication opens sign in instead of silently failing generation', async t => {
  const events = [];
  mockWindow(t, { sessionStorage: { getItem: () => 'workspace' }, dispatchEvent: event => events.push(event.type) });
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 401, json: async () => ({ error: 'Session expired' }) }));
  await assert.rejects(generateSaasImage({ model: 'test-image', prompt: 'A cup' }), /Session expired/);
  assert.deepEqual(events, ['muapi:auth-required']);
});

test('guest references are uploaded after login and resolved before generation submission', async t => {
  mockWindow(t, { sessionStorage: { getItem: () => 'workspace' } });
  const previous = globalThis.XMLHttpRequest;
  let uploads = 0;
  globalThis.XMLHttpRequest = class {
    open(method, path) { assert.equal(path, '/api/uploads'); }
    setRequestHeader() {}
    send() {
      uploads++;
      this.status = 200;
      this.responseText = JSON.stringify({ url: 'https://assets.example/reference.png' });
      this.onload();
    }
  };
  t.after(() => { if (previous) globalThis.XMLHttpRequest = previous; else delete globalThis.XMLHttpRequest; });
  let submitted;
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    if (path === 'blob:guest-reference') return { blob: async () => new Blob(['image'], { type: 'image/png' }) };
    assert.equal(path, '/api/generations');
    submitted = JSON.parse(options.body);
    return { ok: false, status: 400, json: async () => ({ error: 'Stop before paid generation' }) };
  });
  await assert.rejects(generateSaasImage({ model: 'test-image', parameters: { referenceImages: ['blob:guest-reference', 'blob:guest-reference'] } }), /Stop before paid generation/);
  assert.equal(uploads, 1);
  assert.deepEqual(submitted.parameters.referenceImages, ['https://assets.example/reference.png', 'https://assets.example/reference.png']);
});
