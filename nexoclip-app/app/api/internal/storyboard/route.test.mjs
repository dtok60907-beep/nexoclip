import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createInternalStoryboardHandler, STORYBOARD_MODELS } from './route.js';
import { signCanvasAuthorization } from '../../../../src/lib/realtime/internalAuth.js';

const userId = '11111111-1111-4111-8111-111111111111';

function signedRequest(payload, { secret = 'bridge-secret', timestamp = Math.floor(Date.now() / 1000) } = {}) {
  const requestJson = JSON.stringify(payload);
  const authorization = {
    userId, projectId: 'storyboard', timestamp, nonce: 'nonce-1',
    actionDigest: createHash('sha256').update(requestJson).digest('hex'),
  };
  return new Request('http://app/api/internal/storyboard', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId, timestamp, nonce: 'nonce-1', signature: signCanvasAuthorization(authorization, secret), request: requestJson }),
  });
}

function handler(overrides = {}) {
  const previous = process.env.CANVAS_AUTH_SECRET;
  process.env.CANVAS_AUTH_SECRET = 'bridge-secret';
  const created = createInternalStoryboardHandler({
    getDefaultWorkspace: async () => ({ id: 'workspace-1' }),
    getPool: () => ({}),
    publish: async () => {},
    logError: () => {},
    ...overrides,
  });
  return async (request) => {
    try { return await created(request); } finally { process.env.CANVAS_AUTH_SECRET = previous; }
  };
}

test('submits a signed storyboard video job through the credit reservation', async () => {
  let reserved;
  const post = handler({
    reserve: async (_pool, workspaceId, input, actor) => {
      reserved = { workspaceId, input, actor };
      return { id: 'generation-1', kind: 'video', status: 'queued', outputs: [], estimated_provider_cost_usd: 1 };
    },
  });
  const response = await post(signedRequest({
    action: 'submit',
    input: { kind: 'video', model: STORYBOARD_MODELS.video, prompt: 'a chase', parameters: { duration: 8 }, idempotencyKey: 'task-1' },
  }));
  assert.equal(response.status, 201);
  assert.deepEqual((await response.json()).generation, { id: 'generation-1', kind: 'video', status: 'queued', error: null, outputs: [] });
  assert.equal(reserved.workspaceId, 'workspace-1');
  assert.equal(reserved.input.idempotencyKey, 'storyboard:task-1');
  assert.deepEqual(reserved.actor, { userId });
});

test('tags a submission with the caller-provided source (e.g. a different internal tool), defaulting to storyboard', async () => {
  // Three sequential signed requests in one test — unlike `handler()`, this must not
  // mutate the shared process.env.CANVAS_AUTH_SECRET, which other tests in this file
  // toggle concurrently (node --test runs top-level tests in a file concurrently).
  let reserved;
  const post = createInternalStoryboardHandler({
    verify: (payload, signature) => signature === signCanvasAuthorization(payload, 'bridge-secret-local'),
    getDefaultWorkspace: async () => ({ id: 'workspace-1' }),
    getPool: () => ({}),
    publish: async () => {},
    logError: () => {},
    reserve: async (_pool, workspaceId, input, actor) => {
      reserved = { workspaceId, input, actor };
      return { id: 'generation-1', kind: 'image', status: 'queued', outputs: [] };
    },
  });
  const sign = (payload) => signedRequest(payload, { secret: 'bridge-secret-local' });

  await post(sign({
    action: 'submit',
    source: 'director',
    input: { kind: 'image', model: STORYBOARD_MODELS.image, prompt: 'a cat', idempotencyKey: 'task-1' },
  }));
  assert.equal(reserved.input.parameters.source, 'director');
  assert.equal(reserved.input.idempotencyKey, 'director:task-1');

  await post(sign({
    action: 'submit',
    input: { kind: 'image', model: STORYBOARD_MODELS.image, prompt: 'a cat', idempotencyKey: 'task-2' },
  }));
  assert.equal(reserved.input.parameters.source, 'storyboard');
  assert.equal(reserved.input.idempotencyKey, 'storyboard:task-2');

  await post(sign({
    action: 'submit',
    source: 'not-a-real-tool',
    input: { kind: 'image', model: STORYBOARD_MODELS.image, prompt: 'a cat', idempotencyKey: 'task-3' },
  }));
  assert.equal(reserved.input.parameters.source, 'storyboard');
});

test('rejects models other than the configured OpenAI models', async () => {
  const post = handler({ reserve: async () => assert.fail('must not reserve') });
  const response = await post(signedRequest({
    action: 'submit',
    input: { kind: 'image', model: 'bytedance/seedream', prompt: 'x', idempotencyKey: 'k' },
  }));
  assert.equal(response.status, 400);
});

test('rejects a request whose signed JSON was altered', async () => {
  const post = handler({ readBalance: async () => assert.fail('must not read') });
  const original = signedRequest({ action: 'balance' });
  const body = await original.json();
  body.request = JSON.stringify({ action: 'charge-text' });
  const response = await post(new Request('http://app/api/internal/storyboard', { method: 'POST', body: JSON.stringify(body) }));
  assert.equal(response.status, 404);
});

test('charges text usage to the ledger and takes the remaining balance when short', async () => {
  const entries = [];
  let balance = 1.25;
  const post = handler({
    priceText: async () => ({ usd: 0.02, credits: 3.2 }),
    readBalance: async () => balance,
    appendCredit: async (_pool, entry) => {
      if (-entry.amount > balance) throw new Error('Insufficient credits');
      balance += entry.amount;
      entries.push(entry);
    },
  });
  const response = await post(signedRequest({ action: 'charge-text', model: 'gpt-4.1', inputTokens: 5000, outputTokens: 1000, idempotencyKey: 'llm-1' }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.credits, 1.2);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].reason, 'storyboard_text');
  assert.equal(entries[0].idempotencyKey, 'storyboard-text:llm-1');
  assert.equal(entries[0].metadata.partial, true);
});

test('maps insufficient credits on submit to HTTP 402', async () => {
  const post = handler({ reserve: async () => { throw new Error('Insufficient credits'); } });
  const response = await post(signedRequest({
    action: 'submit',
    input: { kind: 'image', model: STORYBOARD_MODELS.image, prompt: 'x', idempotencyKey: 'k' },
  }));
  assert.equal(response.status, 402);
});


test('the storyboard bridge imports images only (renders use the binary upload)', async () => {
  const post = handler({ importAsset: async () => { throw new Error('must not import'); }, createStorage: () => ({}) });
  const dataBase64 = Buffer.from('mp4-bytes').toString('base64');
  const response = await post(signedRequest({ action: 'import-asset', source: 'director', filename: 'x.mp4', contentType: 'video/mp4', dataBase64 }));
  assert.equal(response.status, 400);
});

test('generates a voiceover, stores it as an asset and charges it once', async () => {
  const charges = [];
  const imports = [];
  let generated = 0;
  let stored = null;
  // Two signed requests: own verifier instead of handler(), which toggles the shared secret.
  const created = createInternalStoryboardHandler({
    verify: (payload, signature) => signature === signCanvasAuthorization(payload, 'audio-secret'),
    getDefaultWorkspace: async () => ({ id: 'workspace-1' }),
    getPool: () => ({}),
    logError: () => {},
    readBalance: async () => 100,
    priceAudio: async () => ({ usd: 0.01, credits: 2 }),
    generateAudio: async (audio) => { generated += 1; assert.equal(audio.voiceId, 'JBFqnCBsd6RMkjVDRZzb'); return { body: Buffer.from('mp3'), contentType: 'audio/mpeg' }; },
    importAsset: async (_ws, input) => { imports.push(input); return { asset: { id: 'audio-asset-1' } }; },
    appendCredit: async (_pool, entry) => { charges.push(entry); stored = entry; },
    findCreditEntry: async (_pool, _ws, key) => (stored && stored.idempotencyKey === key ? { amount: stored.amount, metadata: stored.metadata } : null),
  });
  const post = (request) => created(request);
  const payload = { action: 'generate-audio', source: 'director', idempotencyKey: 'p1:audio:voiceover:1',
    audio: { type: 'voiceover', text: 'Pagi ini lebih semangat.', voiceId: 'JBFqnCBsd6RMkjVDRZzb' } };
  const first = await post(signedRequest(payload, { secret: 'audio-secret' }));
  assert.equal(first.status, 201);
  assert.deepEqual(await first.json(), { assetId: 'audio-asset-1', credits: 2 });
  assert.equal(imports[0].allowAudio, true);
  assert.deepEqual([charges[0].amount, charges[0].reason, charges[0].idempotencyKey], [-2, 'director_audio', 'director-audio:p1:audio:voiceover:1']);
  const again = await post(signedRequest(payload, { secret: 'audio-secret' }));
  assert.deepEqual(await again.json(), { assetId: 'audio-asset-1', credits: 2 });
  assert.equal(generated, 1);
  assert.equal(charges.length, 1);
});

test('refuses audio the balance cannot pay for, before calling the provider', async () => {
  let generated = false;
  const post = handler({
    readBalance: async () => 1,
    priceAudio: async () => ({ usd: 0.3, credits: 48 }),
    generateAudio: async () => { generated = true; },
    findCreditEntry: async () => null,
  });
  const response = await post(signedRequest({ action: 'generate-audio', idempotencyKey: 'k',
    audio: { type: 'music', text: 'warm lo-fi', durationSeconds: 30 } }));
  assert.equal(response.status, 402);
  assert.equal(generated, false);
});

test('a video is watched by the Seed model, charged by its tokens, and answered again from the ledger', async () => {
  const charges = [];
  let stored = null;
  let watched = 0;
  const created = createInternalStoryboardHandler({
    verify: (payload, signature) => signature === signCanvasAuthorization(payload, 'video-secret'),
    getDefaultWorkspace: async () => ({ id: 'workspace-1' }),
    getPool: () => ({}),
    logError: () => {},
    readBalance: async () => 50,
    createStorage: () => ({}),
    getDownload: async () => ({ asset: { content_type: 'video/mp4' }, download: { url: 'https://r2.example/v.mp4?sig=1' } }),
    watchVideo: async ({ url }) => {
      watched += 1;
      if (url.startsWith('https:')) throw Object.assign(new Error('Invalid video_url'), { invalidUrl: true });
      assert.match(url, /^data:video\/mp4;base64,/);
      return { text: '00:00 seorang pria berjalan', usage: { prompt_tokens: 1000, completion_tokens: 100 } };
    },
    fetchBytes: async () => Buffer.from('mp4'),
    priceVideoAnalysis: async () => ({ usd: 0.00045, credits: 0.1 }),
    appendCredit: async (_pool, entry) => { charges.push(entry); stored = entry; },
    findCreditEntry: async (_pool, _ws, key) => (stored && stored.idempotencyKey === key ? { amount: stored.amount, metadata: stored.metadata } : null),
  });
  const payload = { action: 'analyze-video', source: 'director', assetId: 'video-1', idempotencyKey: 'p1:video-1' };
  const first = await created(signedRequest(payload, { secret: 'video-secret' }));
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { text: '00:00 seorang pria berjalan', credits: 0.1 });
  assert.equal(watched, 2); // the URL first, then the file inline
  assert.equal(charges[0].reason, 'director_video_analysis');
  const again = await created(signedRequest(payload, { secret: 'video-secret' }));
  assert.deepEqual(await again.json(), { text: '00:00 seorang pria berjalan', credits: 0.1 });
  assert.equal(watched, 2);
});

test('starts, reads and removes the Seedance trust of a workspace image for the Director', async () => {
  const calls = [];
  const trust = {
    start: async (workspaceId, assetId) => { calls.push(['start', workspaceId, assetId]); return { status: 'processing' }; },
    get: async (workspaceId, assetId) => { calls.push(['get', workspaceId, assetId]); return assetId === 'gone' ? null : { status: 'active' }; },
    delete: async () => { throw Object.assign(new Error('BytePlus Assets API request failed.'), { code: 'BYTEPLUS_ASSETS_REQUEST_FAILED', status: 400 }); },
  };
  // Several signed requests: verify with its own secret instead of toggling the shared env (see above).
  const post = createInternalStoryboardHandler({
    verify: (payload, signature) => signature === signCanvasAuthorization(payload, 'bridge-secret-trust'),
    getDefaultWorkspace: async () => ({ id: 'workspace-1' }), getPool: () => ({}), logError: () => {}, trust,
  });
  const signedRequestFor = (payload) => signedRequest(payload, { secret: 'bridge-secret-trust' });
  assert.deepEqual(await (await post(signedRequestFor({ action: 'trust-asset', assetId: 'asset-1' }))).json(), { status: 'processing', error: null });
  assert.deepEqual(await (await post(signedRequestFor({ action: 'trust-status', assetId: 'asset-1' }))).json(), { status: 'active', error: null });
  assert.equal((await post(signedRequestFor({ action: 'trust-status', assetId: 'gone' }))).status, 404);
  const removed = await post(signedRequestFor({ action: 'untrust-asset', assetId: 'asset-1' }));
  assert.equal(removed.status, 400);
  assert.equal((await removed.json()).code, 'BYTEPLUS_ASSETS_REQUEST_FAILED');
  assert.equal((await post(signedRequestFor({ action: 'trust-asset' }))).status, 400);
  assert.deepEqual(calls[0], ['start', 'workspace-1', 'asset-1']);
});

test('the Director can remove an old final video, and nothing but videos', async () => {
  const removed = [];
  const assets = { 'render-1': 'video/mp4', 'photo-1': 'image/png' };
  const post = createInternalStoryboardHandler({
    verify: (payload, signature) => signature === signCanvasAuthorization(payload, 'bridge-secret-render'),
    getDefaultWorkspace: async () => ({ id: 'workspace-1' }), getPool: () => ({}), logError: () => {},
    createStorage: () => ({}),
    getDownload: async (_workspaceId, assetId) => (assets[assetId] ? { asset: { id: assetId, content_type: assets[assetId] } } : null),
    removeAsset: async (workspaceId, assetId) => { removed.push([workspaceId, assetId]); },
  });
  const sign = (payload) => signedRequest(payload, { secret: 'bridge-secret-render' });
  assert.deepEqual(await (await post(sign({ action: 'delete-render', assetId: 'render-1' }))).json(), { deleted: true });
  assert.equal((await post(sign({ action: 'delete-render', assetId: 'photo-1' }))).status, 400);
  assert.deepEqual(await (await post(sign({ action: 'delete-render', assetId: 'gone' }))).json(), { deleted: false });
  assert.deepEqual(removed, [['workspace-1', 'render-1']]);
});
