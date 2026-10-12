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
