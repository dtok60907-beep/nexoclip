process.env.DATABASE_URL ||= 'postgres://test:test@localhost/test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { createGenerationsPostHandler } from '../../app/api/generations/route.js';

function request(body = {}) {
  const req = new Request('http://app/api/generations', { method: 'POST', headers: { 'content-type': 'application/json', 'x-workspace-id': 'w1', 'idempotency-key': 'request-1' }, body: JSON.stringify(body) });
  req.cookies = { get: () => ({ value: 'token' }) };
  return req;
}

test('creates an attributed generation then publishes after reservation', async () => {
  const calls = [];
  const handler = createGenerationsPostHandler({
    resolveContext: async () => ({ user: { id: 'u1' }, workspace: { id: 'w1', role: 'member' } }),
    reserve: async (...args) => { calls.push(['reserve', args]); return { id: 'g1', status: 'queued' }; },
    publish: async () => calls.push(['publish']), pool: {},
  });
  const response = await handler(request({ prompt: 'fox', model: 'model-1', createdByUserId: 'attacker' }));
  assert.equal(response.status, 201);
  assert.equal(calls[0][0], 'reserve');
  assert.equal(calls[0][1][3].userId, 'u1');
  assert.equal(calls[1][0], 'publish');
});

test('returns durable queued job when publication is deferred', async () => {
  const handler = createGenerationsPostHandler({
    resolveContext: async () => ({ user: { id: 'u1' }, workspace: { id: 'w1', role: 'member' } }),
    reserve: async () => ({ id: 'g1', status: 'queued' }), publish: async () => { throw new Error('redis down'); }, pool: {}, logError: () => {},
  });
  const response = await handler(request({ prompt: 'fox', model: 'model-1' }));
  assert.equal(response.status, 201);
  assert.equal((await response.json()).generation.id, 'g1');
});

test('insufficient credits is rejected with a readable message and never publishes to the queue', async () => {
  let published = 0;
  const handler = createGenerationsPostHandler({
    resolveContext: async () => ({ user: { id: 'u1' }, workspace: { id: 'w1', role: 'member' } }),
    reserve: async () => { throw new Error('Insufficient credits'); },
    publish: async () => { published += 1; }, pool: {},
  });
  const response = await handler(request({ kind: 'image', prompt: 'fox', model: 'google/gemini-3-pro-image' }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'Insufficient credits');
  assert.equal(published, 0);
});
