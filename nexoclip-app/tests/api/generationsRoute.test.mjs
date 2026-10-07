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

test('customer response includes reserved credits without exposing internal COGS', async () => {
  const handler = createGenerationsPostHandler({
    resolveContext: async () => ({ user: { id: 'u1' }, workspace: { id: 'w1' } }),
    reserve: async () => ({ id: 'g1', estimated_cost: '6.4', estimated_provider_cost_usd: '0.04', pricing_snapshot: { markupMultiplier: 1.6 } }),
    publish: async () => {}, pool: {},
  });
  const response = await handler(request({ prompt: 'fox', model: 'model-1' }));
  assert.deepEqual((await response.json()).generation, { id: 'g1', estimated_cost: '6.4' });
});
