import test from 'node:test';
import assert from 'node:assert/strict';
import { getEconomicsReport } from '../../src/repositories/economicsRepository.js';

test('economics SQL binds tenant/time/filter values and separates observed costs from quotes', async () => {
  let received;
  const pool = { query: async (sql, values) => { received = { sql, values }; return { rows: [{ totals: { job_count: 1 }, items: [], breakdown: [], total: '1', excluded_sandbox_jobs: '2' }] }; } };
  const result = await getEconomicsReport(pool, { workspaceId: 'tenant-a', since: '2026-10-01T00:00:00Z', until: '2026-10-08T00:00:00Z', model: "model' OR true", provider: 'provider-a', groupBy: 'provider', page: 2, pageSize: 10 });
  assert.deepEqual(received.values, ['tenant-a', '2026-10-01T00:00:00Z', '2026-10-08T00:00:00Z', "model' OR true", 'provider-a', 10, 10]);
  assert.doesNotMatch(received.sql, /model' OR true/);
  assert.match(received.sql, /gj\.workspace_id = \$1/);
  assert.match(received.sql, /e\.workspace_id = \$1/);
  assert.match(received.sql, /a\.workspace_id = \$1/);
  assert.match(received.sql, /latest_generation_cost_observations/);
  assert.match(received.sql, /COUNT\(DISTINCT e\.worker_attempt\)/);
  assert.match(received.sql, /a\.finalized_at IS NOT NULL/);
  assert.match(received.sql, /WHERE sandbox_funded = false/);
  assert.doesNotMatch(received.sql, /estimated_provider_cost_usd/);
  assert.equal(result.excludedSandboxJobs, '2');
});
