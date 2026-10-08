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

test('cost evidence selection is parameterized before totals, breakdown and pagination',async()=>{
 let received;const pool={query:async(sql,values)=>{received={sql,values};return {rows:[]};}};
 await getEconomicsReport(pool,{workspaceId:'w',since:'2026-10-01',until:'2026-10-08',environment:'production',costStatus:'needs_reconciliation',page:2,pageSize:1});
 assert.deepEqual(received.values,['w','2026-10-01','2026-10-08','production','needs_reconciliation',1,1]);
 assert.match(received.sql,/CASE \$5::text/);assert.match(received.sql,/SELECT \* FROM classified WHERE sandbox_funded = false AND/);
 await assert.rejects(getEconomicsReport(pool,{costStatus:"estimated' OR true"}),{status:400});
});

test('issue selection is bound alongside cost status before summaries and pagination',async()=>{
 let selected;const pool={query:async(sql,values)=>{selected={sql,values};return {rows:[]};}};
 await getEconomicsReport(pool,{workspaceId:'w',since:'2026-10-01',until:'2026-10-08',environment:'production',costStatus:'reconciled',issue:'unknown_fee',page:2,pageSize:1});
 assert.deepEqual(selected.values,['w','2026-10-01','2026-10-08','production','reconciled','unknown_fee',1,1]);
 assert.match(selected.sql,/CASE \$6::text/);
 await assert.rejects(getEconomicsReport(pool,{issue:"unknown_fee' OR true"}),{status:400});
});
