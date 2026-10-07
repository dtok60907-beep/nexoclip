import test from 'node:test';
import assert from 'node:assert/strict';
import { recordGenerationOutput, recordProviderUsage } from '../../src/repositories/generationOutputRepository.js';

function clientFor(rows = []) {
  const calls = [];
  return { calls, async query(text, values) { calls.push({ text, values }); return { rows }; } };
}

test('records an output asset idempotently within its tenant and provider request', async () => {
  const client = clientFor([{ id: 'o1', workspace_id: 'w1', asset_id: 'a1' }]);
  const output = await recordGenerationOutput(client, {
    workspaceId: 'w1', generationId: 'g1', providerRequestId: 'req1', outputIndex: 0, assetId: 'a1',
  });
  assert.equal(output.id, 'o1');
  assert.match(client.calls[0].text, /ON CONFLICT \(workspace_id, generation_job_id, provider_request_id, output_index\)/);
  assert.deepEqual(client.calls[0].values, ['w1', 'g1', 'req1', 0, 'a1']);
});

test('records estimated and actual provider usage without credentials', async () => {
  const client = clientFor([{ id: 'u1', actual_cost: '0.12' }]);
  await recordProviderUsage(client, {
    workspaceId: 'w1', generationId: 'g1', provider: 'muapi', providerRequestId: 'req1',
    estimatedCost: 0.1, actualCost: 0.12, units: { seconds: 4 }, rawUsage: { total_cost: 0.12 },
  });
  assert.match(client.calls[0].text, /ON CONFLICT \(workspace_id, generation_job_id, provider_request_id\)/);
  assert.deepEqual(client.calls[0].values, ['w1', 'g1', 'muapi', 'req1', 0.1, 0.12, '{"seconds":4}', '{"total_cost":0.12}', 'USD', 'reported']);
});
