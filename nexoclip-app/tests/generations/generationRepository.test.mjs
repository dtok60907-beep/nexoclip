import test from 'node:test';
import { deploymentEnvironment } from '../../src/lib/deploymentEnvironment.js';
import assert from 'node:assert/strict';
import { createImageGeneration, createVimaxGeneration, findGeneration, findGenerationByIdempotencyKey } from '../../src/repositories/generationRepository.js';

function clientFor(rows = []) {
  const calls = [];
  return { calls, async query(text, values) { calls.push({ text, values }); return { rows }; } };
}

test('creates a queued image generation scoped to a workspace', async () => {
  const client = clientFor([{ id: 'g1', workspace_id: 'w1', status: 'queued' }]);
  const generation = await createImageGeneration(client, {
    workspaceId: 'w1', createdByUserId: 'u1', projectId: 'p1', prompt: 'fox', model: 'flux-dev', parameters: { aspectRatio: '1:1' },
  });
  assert.equal(generation.status, 'queued');
  assert.deepEqual(client.calls[0].values, ['w1', 'u1', 'p1', 'image', 'fox', 'flux-dev', '{"aspectRatio":"1:1"}',deploymentEnvironment()]);
  assert.match(client.calls[0].text, /INSERT INTO generation_jobs/);
  assert.match(client.calls[0].text, /created_by_user_id/);
  assert.match(client.calls[0].text, /RETURNING[\s\S]*estimated_provider_cost_usd, pricing_snapshot/);
});

test('stores the USD estimate and accepted pricing snapshot in the reserved job insert', async () => {
  const snapshot = { version: 1, usdToIdrRate: 15500, markupPercent: 60, creditsPerIdr: 0.01 };
  const row = { id: 'g1', estimated_cost: '1.240000', estimated_provider_cost_usd: '0.00500000', pricing_snapshot: snapshot };
  const client = clientFor([row]);
  assert.deepEqual(await createImageGeneration(client, {
    workspaceId: 'w1', createdByUserId: 'u1', projectId: 'p1', prompt: 'fox', model: 'flux-dev', parameters: {},
    idempotencyKey: 'request-1', estimatedCost: 1.24, pricingVersionId: 'pv1', reservationLedgerId: 'ledger-1',
    estimatedProviderCostUsd: 0.005, pricingSnapshot: snapshot,
  }), row);
  assert.equal(client.calls.length, 1, 'quote and reservation fields must be written in one INSERT');
  assert.deepEqual(client.calls[0].values, [
    'w1', 'u1', 'p1', 'image', 'fox', 'flux-dev', '{}', 'request-1', 1.24, 'pv1', 'ledger-1',
    0.005, JSON.stringify(snapshot),deploymentEnvironment(),
  ]);
  assert.match(client.calls[0].text, /reservation_ledger_id, estimated_provider_cost_usd, pricing_snapshot,environment\)/);
  assert.match(client.calls[0].text, /\$11, \$12, \$13::jsonb/);
});

test('keeps optional quote fields unknown for a legacy reserved caller', async () => {
  const client = clientFor([{ id: 'g1' }]);
  await createImageGeneration(client, {
    workspaceId: 'w1', projectId: null, prompt: 'fox', model: 'flux-dev', parameters: {},
    idempotencyKey: 'request-1', estimatedCost: 1, pricingVersionId: 'pv1', reservationLedgerId: 'ledger-1',
  });
  assert.deepEqual(client.calls[0].values.slice(11,13), [null, null], 'SQL NULL must not become a JSON null snapshot');
});

test('preserves a known zero provider estimate', async () => {
  const client = clientFor([{ id: 'g1' }]);
  await createImageGeneration(client, {
    workspaceId: 'w1', projectId: null, prompt: 'fox', model: 'flux-dev', parameters: {},
    idempotencyKey: 'request-1', estimatedCost: 0, pricingVersionId: 'pv1', reservationLedgerId: null,
    estimatedProviderCostUsd: 0, pricingSnapshot: {},
  });
  assert.deepEqual(client.calls[0].values.slice(11,13), [0, '{}']);
});

test('creates a ViMax generation with explicit durable-kind fields', async () => {
  const client = clientFor([{ id: 'g1', workspace_id: 'w1', kind: 'vimax_render_video', status: 'queued' }]);
  const generation = await createVimaxGeneration(client, {
    workspaceId: 'w1', projectId: null, kind: 'vimax_render_video', prompt: 'Render ViMax storyboard video', model: 'vimax',
    parameters: { sessionId: 's1', input: {} }, createdByUserId: 'u1', idempotencyKey: 'request-1', estimatedCost: 0, pricingVersionId: 'pv1',
    reservationLedgerId: 'ledger-1', vimaxSessionId: 's1',
  });
  assert.equal(generation.kind, 'vimax_render_video');
  assert.match(client.calls[0].text, /vimax_session_id/);
  assert.match(client.calls[0].text, /provider/);
  assert.doesNotMatch(client.calls[0].text.split('RETURNING')[0], /estimated_provider_cost_usd|pricing_snapshot/);
  assert.deepEqual(client.calls[0].values, [
    'w1', 'u1', null, 'vimax_render_video', 'Render ViMax storyboard video', 'vimax', '{"sessionId":"s1","input":{}}',
    'request-1', 0, 'pv1', 'ledger-1', 's1', 'vimax',deploymentEnvironment(),
  ]);
});

test('finds a generation only within the requested workspace', async () => {
  const client = clientFor([]);
  assert.equal(await findGeneration(client, 'w2', 'g1'), null);
  assert.deepEqual(client.calls[0].values, ['w2', 'g1']);
  assert.match(client.calls[0].text, /WHERE workspace_id = \$1 AND id = \$2/);
  assert.match(client.calls[0].text, /estimated_provider_cost_usd, pricing_snapshot/);
});

test('returns the original accepted quote on a tenant-scoped idempotency lookup', async () => {
  const row = { id: 'g1', estimated_provider_cost_usd: '0.00500000', pricing_snapshot: { version: 1 } };
  const client = clientFor([row]);
  assert.deepEqual(await findGenerationByIdempotencyKey(client, 'w1', 'request-1'), row);
  assert.deepEqual(client.calls[0].values, ['w1', 'request-1']);
  assert.match(client.calls[0].text, /WHERE workspace_id = \$1 AND idempotency_key = \$2/);
  assert.match(client.calls[0].text, /estimated_provider_cost_usd, pricing_snapshot/);
});
