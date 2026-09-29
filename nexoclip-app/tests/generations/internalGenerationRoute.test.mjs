import test from 'node:test';
import assert from 'node:assert/strict';
import { createInternalGenerationHandler } from '../../app/api/internal/generations/route.js';

const userId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';

test('returns Canvas outputs as authenticated main-app asset URLs', async () => {
  const handler = createInternalGenerationHandler({
    verify: () => true,
    getDefaultWorkspace: async () => ({ id: 'workspace-1' }),
    getGeneration: async () => ({ id: 'generation-1', status: 'succeeded', outputs: [{ assetId: 'asset-1', download: { url: 'private/key.png' } }] }),
  });
  const response = await handler(new Request('http://app/api/internal/generations', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'status', userId, projectId, nodeId: 'node-1', generationId: 'generation-1', timestamp: 1, nonce: 'nonce', signature: 'signature' }),
  }));

  assert.equal(response.status, 200);
  assert.equal((await response.json()).generation.outputs[0].download.url, '/api/assets/asset-1/download?workspace_id=workspace-1');
});

test('publishes a successfully reserved internal image generation', async () => {
  const published = [];
  const reservations = [];
  const handler = createInternalGenerationHandler({
    verify: () => true,
    getDefaultWorkspace: async () => ({ id: 'workspace-1' }),
    getPool: () => ({ id: 'pool' }),
    reserve: async (...args) => { reservations.push(args); return { id: 'generation-1', kind: 'image' }; },
    publish: async (input) => published.push(input),
  });
  const response = await handler(new Request('http://app/api/internal/generations', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'submit', userId, projectId, nodeId: 'node-1', timestamp: 1, nonce: 'nonce', signature: 'signature',
      input: { kind: 'image', prompt: 'fox', model: 'model-1', idempotencyKey: 'key-1' },
    }),
  }));

  assert.equal(response.status, 201);
  assert.equal(reservations[0][2].parameters.canvasProjectId, projectId);
  assert.deepEqual(reservations[0][3], { userId, allowLegacyCanvasReferences: true });
  assert.deepEqual(published, [{ pool: { id: 'pool' }, kind: 'image' }]);
});
