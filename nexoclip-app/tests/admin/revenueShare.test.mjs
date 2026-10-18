import test from 'node:test';
import assert from 'node:assert/strict';

const { shareSummary } = await import('../../src/services/revenueShareService.js');

test('the AI cost and other costs are paid back before the profit is shared', () => {
  assert.deepEqual(shareSummary({ project_value_idr: 100_000_000, other_costs_idr: 5_000_000, partner_share_percent: '40' }, 15_000_000.4), {
    value: 100_000_000, aiCost: 15_000_000, otherCosts: 5_000_000, profit: 80_000_000, partnerShare: 32_000_000, ourShare: 48_000_000,
  });
});

test('a project that loses money gives the partner nothing', () => {
  const summary = shareSummary({ project_value_idr: 10_000_000, other_costs_idr: 0, partner_share_percent: '50' }, 12_000_000);
  assert.equal(summary.profit, -2_000_000);
  assert.equal(summary.partnerShare, 0);
  assert.equal(summary.ourShare, -2_000_000);
});
