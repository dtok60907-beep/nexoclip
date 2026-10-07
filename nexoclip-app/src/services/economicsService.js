import { getPool } from '../db/pool.js';
import { getEconomicsReport } from '../repositories/economicsRepository.js';
import { isPlatformOperator, operatorError } from '../lib/auth/platformOperator.js';
export { isPlatformOperator, operatorError } from '../lib/auth/platformOperator.js';

const DAY_MS = 86_400_000;
const MAX_PERIOD_DAYS = 366;

function inputError(message) {
  return Object.assign(new Error(message), { status: 400, code: 'INVALID_ECONOMICS_QUERY' });
}

function dateDay(value, name) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw inputError(`${name} must be YYYY-MM-DD`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw inputError(`${name} is invalid`);
  return date.getTime();
}

function instant(value, name) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) throw inputError(`${name} must be an ISO timestamp in UTC`);
  const date = new Date(value);
  const expected = value.replace(/(?:\.(\d{1,3}))?Z$/, (_, fraction = '') => `.${fraction.padEnd(3, '0')}Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== expected) throw inputError(`${name} is invalid`);
  return date.getTime();
}

function positiveInteger(value, name, fallback, maximum) {
  if (value === undefined || value === null || value === '') return fallback;
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) throw inputError(`${name} must be a positive integer`);
  return Math.min(Number(value), maximum);
}

export function economicsFilters(input = {}, now = new Date()) {
  if ((input.from || input.to) && (input.since || input.until)) throw inputError('Use from/to or since/until');
  const defaultUntil = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const until = input.to ? dateDay(input.to, 'to') + DAY_MS : input.until ? instant(input.until, 'until') : defaultUntil;
  const since = input.from ? dateDay(input.from, 'from') : input.since ? instant(input.since, 'since') : until - 30 * DAY_MS;
  if (since >= until || until - since > MAX_PERIOD_DAYS * DAY_MS) throw inputError('Date window must be positive and at most 366 days');
  const groupBy = input.groupBy || 'model';
  if (!['model', 'provider'].includes(groupBy)) throw inputError('groupBy must be model or provider');
  const filters = {
    since: new Date(since).toISOString(), until: new Date(until).toISOString(), groupBy,
    page: positiveInteger(input.page, 'page', 1, 100000),
    pageSize: positiveInteger(input.pageSize, 'pageSize', 25, 100),
  };
  if (input.environment) {
    if (!['all','development','production','unclassified'].includes(input.environment)) throw inputError('Lingkungan tidak valid');
    filters.environment=input.environment;
  }
  for (const key of ['model', 'provider']) {
    if (input[key] !== undefined && input[key] !== '') {
      if (typeof input[key] !== 'string' || input[key].length > 160) throw inputError(`${key} is invalid`);
      filters[key] = input[key];
    }
  }
  return filters;
}

function number(value) { return Number(value || 0); }

export function mapEconomicsTotals(row = {}) {
  const coverage = {
    unknownRevenueCredits: number(row.unknown_revenue_credits),
    unknownPaymentFeeCredits: number(row.unknown_fee_credits),
    unknownProviderRequests: number(row.unknown_provider_requests),
    unknownFxRequests: number(row.unknown_fx_requests),
    unobservedCostJobs: number(row.unobserved_cost_jobs),
    provisionalProviderRequests: number(row.provisional_provider_requests),
    missingAttemptCount: number(row.missing_attempt_count),
    pendingSettlementJobs: number(row.pending_settlement_jobs),
    allocationMismatchJobs: number(row.allocation_mismatch_jobs),
  };
  coverage.revenueComplete = coverage.unknownRevenueCredits === 0 && coverage.pendingSettlementJobs === 0 && coverage.allocationMismatchJobs === 0;
  coverage.costComplete = coverage.unknownProviderRequests === 0 && coverage.unknownFxRequests === 0
    && coverage.missingAttemptCount === 0 && coverage.unobservedCostJobs === 0 && coverage.provisionalProviderRequests === 0;
  coverage.paymentFeesComplete = coverage.unknownPaymentFeeCredits === 0 && coverage.pendingSettlementJobs === 0 && coverage.allocationMismatchJobs === 0;
  coverage.complete = coverage.revenueComplete && coverage.costComplete && coverage.paymentFeesComplete;
  const recognizedRevenueIdr = number(row.recognized_revenue_idr);
  const providerCostIdr = number(row.provider_cost_idr);
  const knownPaymentFeeIdr = number(row.payment_fee_idr);
  const contributionIdr = coverage.complete ? recognizedRevenueIdr - providerCostIdr - knownPaymentFeeIdr : null;
  return {
    jobCount: number(row.job_count), failedJobCount: number(row.failed_job_count),
    providerRequestCount: number(row.provider_request_count), creditsConsumed: number(row.credits_consumed),
    recognizedRevenueIdr, providerCostUsd: number(row.provider_cost_usd), providerCostIdr,
    knownPaymentFeeIdr, paymentFeeIdr: coverage.paymentFeesComplete ? knownPaymentFeeIdr : null,
    providerGrossContributionIdr: coverage.revenueComplete && coverage.costComplete ? recognizedRevenueIdr - providerCostIdr : null,
    contributionIdr, marginPercent: contributionIdr !== null && recognizedRevenueIdr > 0 ? contributionIdr / recognizedRevenueIdr * 100 : null,
    simulation: number(row.simulated_credits) > 0 ? {
      creditsConsumed: number(row.simulated_credits),
      additionalRevenueIdr: number(row.simulated_revenue_addition_idr),
      revenueIdr: recognizedRevenueIdr + number(row.simulated_revenue_addition_idr),
      knownContributionIdr: recognizedRevenueIdr + number(row.simulated_revenue_addition_idr) - providerCostIdr - knownPaymentFeeIdr,
      contributionIdr: coverage.complete ? recognizedRevenueIdr + number(row.simulated_revenue_addition_idr) - providerCostIdr - knownPaymentFeeIdr : null,
    } : null,
    costSources: { reported: number(row.reported_request_count), calculated: number(row.calculated_request_count), unknown: number(row.unknown_provider_requests) },
    coverage,
  };
}

export function createEconomicsService({ repository, env = process.env, now = () => new Date() }) {
  return {
    async getReport({ workspaceId, userId, filters: input = {} }) {
      if (!isPlatformOperator(userId, env)) throw operatorError();
      if (!workspaceId) throw inputError('workspace_id is required');
      const filters = economicsFilters(input, now());
      const data = await repository({ workspaceId, ...filters });
      const total = number(data.total);
      return {
        period: { since: filters.since, until: filters.until, basis: 'terminal_job' }, groupBy: filters.groupBy,environment:filters.environment || 'all',
        totals: { ...mapEconomicsTotals(data.totals), excludedSandboxJobs: number(data.excludedSandboxJobs) },
        breakdown: (data.breakdown || []).map((row) => ({ key: row.group_key || '(unknown)', ...mapEconomicsTotals(row) })),
        items: (data.items || []).map((row) => ({
          id: row.id, model: row.model, provider: row.provider || null, kind: row.kind, status: row.status,environment:row.environment || 'unclassified',
          settlementStatus: row.settlement_status, cohortAt: row.cohort_at, ...mapEconomicsTotals(row),
        })),
        pagination: { page: filters.page, pageSize: filters.pageSize, total, totalPages: total ? Math.ceil(total / filters.pageSize) : 0 },
      };
    },
  };
}

export const economicsService = createEconomicsService({ repository: (input) => getEconomicsReport(getPool(), input) });
