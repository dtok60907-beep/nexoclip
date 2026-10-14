import { usageAnalyticsRepository } from '../repositories/usageAnalyticsRepository.js';
import { consoleFilters } from './adminConsoleService.js';
import { isPlatformOperator, operatorError } from './economicsService.js';
import { loadUsdIdrRate } from './generationPricing.js';
import { TOPUP_PACKAGES } from './topupPackages.js';

// The worst case for revenue: every credit bought in the package with the lowest price per credit.
export function lowestIdrPerCredit(packages = TOPUP_PACKAGES) {
  return Math.min(...packages.map((pkg) => Number(pkg.priceIdr) / Number(pkg.credits)));
}

const round = (value, digits = 0) => Math.round(value * 10 ** digits) / 10 ** digits;

// Credits used, revenue and provider cost per kind of work and source. Revenue is shown twice: at the average price
// credits were really sold for, and at the cheapest package (the worst case); a row that loses money in the worst
// case is flagged. Payment fees, taxes, hosting and fixed subscriptions (e.g. the ElevenLabs plan) are not in it.
export function buildUsageReport({ rows, sold, freeCredits, usdIdr, lowest }) {
  const soldCredits = Number(sold?.credits) || 0;
  const average = soldCredits > 0 ? Number(sold.amount_idr) / soldCredits : null;
  const items = rows.map((row) => {
    const credits = Number(row.credits) || 0;
    const costIdr = (Number(row.cost_usd) || 0) * usdIdr;
    const worst = credits * lowest;
    return {
      kind: row.kind, source: row.source, count: row.count, failed: row.failed, unknownCost: row.unknown_cost,
      credits: round(credits, 2), costUsd: round(Number(row.cost_usd) || 0, 4), costIdr: round(costIdr),
      revenueIdrWorst: round(worst), revenueIdrAverage: average === null ? null : round(credits * average),
      marginIdrWorst: round(worst - costIdr), marginRatioWorst: costIdr > 0 ? round(worst / costIdr, 2) : null,
      losing: costIdr > 0 && worst < costIdr,
    };
  });
  const sum = (key) => round(items.reduce((total, item) => total + (item[key] || 0), 0), key === 'costUsd' ? 4 : 2);
  const totals = {
    count: sum('count'), credits: sum('credits'), costUsd: sum('costUsd'), costIdr: sum('costIdr'),
    revenueIdrWorst: sum('revenueIdrWorst'), revenueIdrAverage: average === null ? null : sum('revenueIdrAverage'),
    unknownCost: sum('unknownCost'),
  };
  totals.marginIdrWorst = round(totals.revenueIdrWorst - totals.costIdr);
  return {
    items, totals, usdIdr, idrPerCredit: { lowest: round(lowest, 2), average: average === null ? null : round(average, 2) },
    freeCredits: round(Number(freeCredits) || 0, 2),
  };
}

export function createUsageAnalyticsService({ repository = usageAnalyticsRepository, env = process.env, loadRate = loadUsdIdrRate } = {}) {
  return {
    async report({ userId, input }) {
      if (!isPlatformOperator(userId, env)) throw operatorError();
      const filters = consoleFilters(input);
      const [rows, sold, freeCredits, usdIdr] = await Promise.all([
        repository.usage(filters), repository.soldCredits(), repository.freeCredits(filters), loadRate({ env }),
      ]);
      return { filters: { from: filters.from, to: filters.to }, ...buildUsageReport({ rows, sold, freeCredits, usdIdr, lowest: lowestIdrPerCredit() }) };
    },
  };
}

export const usageAnalyticsService = createUsageAnalyticsService();
