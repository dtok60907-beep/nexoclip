import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUsageReport, createUsageAnalyticsService, lowestIdrPerCredit } from '../../src/services/usageAnalyticsService.js';
import { USAGE_ROWS_SQL } from '../../src/repositories/usageRowsSql.js';

test('the worst-case revenue uses the package with the lowest price per credit', () => {
  assert.equal(lowestIdrPerCredit([{ priceIdr: 149_000, credits: 750 }, { priceIdr: 899_000, credits: 5_400 }]), 899_000 / 5_400);
});

test('each kind and source is priced at the worst case and a losing row is flagged', () => {
  const report = buildUsageReport({
    rows: [
      { kind: 'video', source: 'director', count: 2, failed: 1, credits: '100', cost_usd: '0.5', unknown_cost: 0 },
      { kind: 'voiceover', source: 'director', count: 4, failed: 0, credits: '1', cost_usd: '0.02', unknown_cost: 0 },
      { kind: 'image', source: 'canvas', count: 3, failed: 0, credits: '6', cost_usd: '0', unknown_cost: 3 },
    ],
    sold: { amount_idr: '200000', credits: '1000' }, freeCredits: '50', usdIdr: 17_000, lowest: 150,
  });
  const [video, voice, image] = report.items;
  assert.deepEqual([video.costIdr, video.revenueIdrWorst, video.marginIdrWorst, video.losing], [8_500, 15_000, 6_500, false]);
  assert.equal(video.revenueIdrAverage, 20_000); // 100 credits at the Rp200 a credit really sold for
  assert.deepEqual([voice.costIdr, voice.revenueIdrWorst, voice.losing], [340, 150, true]);
  assert.equal(image.marginRatioWorst, null); // no known cost: never shown as free money
  assert.equal(report.totals.unknownCost, 3);
  assert.equal(report.freeCredits, 50);
  assert.equal(report.idrPerCredit.average, 200);
});

test('only platform operators can read the report', async () => {
  const service = createUsageAnalyticsService({ env: { NEXOCLIP_OPERATOR_USER_IDS: 'op-1' }, repository: {}, loadRate: async () => 17_000 });
  await assert.rejects(service.report({ userId: 'someone', input: {} }), (error) => error.status === 403 || /operator|akses|access/i.test(error.message));
});

test('the usage rows cover ledger-billed LLM, audio and video analysis next to generation jobs', () => {
  assert.match(USAGE_ROWS_SQL, /FROM generation_jobs j/);
  assert.match(USAGE_ROWS_SQL, /_\(text\|audio\|video_analysis\)\$/);
  assert.match(USAGE_ROWS_SQL, /'spite:%' THEN 'canvas'/);
});
