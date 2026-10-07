import test from 'node:test';
import assert from 'node:assert/strict';
import { createEconomicsService, economicsFilters, isPlatformOperator, mapEconomicsTotals } from '../../src/services/economicsService.js';

const env = { NEXOCLIP_OPERATOR_USER_IDS: ' operator-a, operator-b, ' };
const now = new Date('2026-10-07T15:22:33Z');

test('operator authorization fails closed and workspace ownership cannot grant access', async () => {
  assert.equal(isPlatformOperator('operator-a', env), true);
  assert.equal(isPlatformOperator('operator', env), false);
  assert.equal(isPlatformOperator('operator-a', {}), false);
  let queried = false;
  const service = createEconomicsService({ env, repository: async () => { queried = true; } });
  for (const role of ['owner', 'admin', 'member']) {
    await assert.rejects(service.getReport({ workspaceId: 'w1', userId: 'ordinary-user', role }), (error) => error.status === 403 && error.code === 'PLATFORM_OPERATOR_REQUIRED');
  }
  assert.equal(queried, false);
});

test('date filters use inclusive UTC days, exact ISO boundaries and bounded pages', () => {
  assert.deepEqual(economicsFilters({}, now), { since: '2026-09-08T00:00:00.000Z', until: '2026-10-08T00:00:00.000Z', groupBy: 'model', page: 1, pageSize: 25 });
  const filters = economicsFilters({ from: '2026-10-01', to: '2026-10-07', groupBy: 'provider', pageSize: '1000', page: '2' }, now);
  assert.equal(filters.since, '2026-10-01T00:00:00.000Z');
  assert.equal(filters.until, '2026-10-08T00:00:00.000Z');
  assert.equal(filters.pageSize, 100);
  assert.equal(filters.page, 2);
  assert.equal(economicsFilters({ since: '2026-10-01T12:30:00Z', until: '2026-10-01T13:30:00.5Z' }, now).until, '2026-10-01T13:30:00.500Z');
});

test('invalid periods, calendar dates and filters are rejected', () => {
  for (const filters of [
    { from: '2026-02-30' }, { from: '2026-10-08', to: '2026-10-07' },
    { from: '2024-01-01', to: '2026-10-07' }, { from: '2026-10-01', until: '2026-10-07T00:00:00Z' },
    { since: '2026-10-01T00:00:00+07:00' }, { since: '2026-02-30T00:00:00Z' },
    { groupBy: 'workspace' }, { page: '-1' }, { page: '1.2' }, { model: 'x'.repeat(161) },
  ]) assert.throws(() => economicsFilters(filters, now), (error) => error.status === 400 && error.code === 'INVALID_ECONOMICS_QUERY');
});

test('known components remain visible while unknown fees suppress final contribution', () => {
  const totals = mapEconomicsTotals({ recognized_revenue_idr: '1000', provider_cost_idr: '400', payment_fee_idr: '20', unknown_fee_credits: '10', reported_request_count: '2' });
  assert.equal(totals.recognizedRevenueIdr, 1000);
  assert.equal(totals.providerCostIdr, 400);
  assert.equal(totals.providerGrossContributionIdr, 600);
  assert.equal(totals.knownPaymentFeeIdr, 20);
  assert.equal(totals.paymentFeeIdr, null);
  assert.equal(totals.contributionIdr, null);
  assert.equal(totals.marginPercent, null);
  assert.equal(totals.coverage.complete, false);
});

test('missing costs, FX, revenue, attempts or settlement suppress profitability', () => {
  for (const problem of ['unknown_provider_requests', 'unknown_fx_requests', 'unknown_revenue_credits', 'missing_attempt_count', 'pending_settlement_jobs', 'allocation_mismatch_jobs', 'unobserved_cost_jobs', 'provisional_provider_requests']) {
    const totals = mapEconomicsTotals({ recognized_revenue_idr: 1000, provider_cost_idr: 100, [problem]: 1 });
    assert.equal(totals.providerGrossContributionIdr, null, problem);
    assert.equal(totals.contributionIdr, null, problem);
    assert.equal(totals.marginPercent, null, problem);
  }
});

test('complete coverage produces contribution and zero-revenue promo expenses remain a loss', () => {
  const totals = mapEconomicsTotals({ recognized_revenue_idr: 1000, provider_cost_idr: 400, payment_fee_idr: 100 });
  assert.equal(totals.contributionIdr, 500);
  assert.equal(totals.marginPercent, 50);
  assert.equal(totals.coverage.complete, true);
  const promo = mapEconomicsTotals({ provider_cost_idr: 400 });
  assert.equal(promo.contributionIdr, -400);
  assert.equal(promo.marginPercent, null);
});

test('authorized reports preserve pagination, per-job coverage and sandbox exclusions', async () => {
  let query;
  const service = createEconomicsService({ env, now: () => now, repository: async (input) => {
    query = input;
    return { total: 2, excludedSandboxJobs: 1, totals: { job_count: 2, failed_job_count: 1, unknown_provider_requests: 1 }, breakdown: [{ group_key: 'model-a', job_count: 2 }], items: [{ id: 'job-a', model: 'model-a', provider: 'provider-a', job_count: 1, missing_attempt_count: 1 }] };
  } });
  const result = await service.getReport({ workspaceId: 'verified-workspace', userId: 'operator-a', filters: { pageSize: '1' } });
  assert.equal(query.workspaceId, 'verified-workspace');
  assert.equal(result.totals.excludedSandboxJobs, 1);
  assert.equal(result.totals.contributionIdr, null);
  assert.equal(result.items[0].coverage.costComplete, false);
  assert.equal(result.pagination.totalPages, 2);
  assert.equal(result.breakdown[0].key, 'model-a');
});

test('trial revenue simulation stays separate from actual revenue and does not hide unknown provider costs',()=>{
 const totals=mapEconomicsTotals({recognized_revenue_idr:0,simulated_credits:7.2,simulated_revenue_addition_idr:1430.4,provider_cost_idr:805.59,unknown_provider_requests:1});
 assert.equal(totals.recognizedRevenueIdr,0);assert.equal(totals.simulation.revenueIdr,1430.4);
 assert.ok(Math.abs(totals.simulation.knownContributionIdr-624.81)<0.000001);
 assert.equal(totals.contributionIdr,null);assert.equal(totals.simulation.contributionIdr,null);assert.equal(totals.coverage.costComplete,false);
});
