import { getPool } from '../db/pool.js';
import * as repository from '../repositories/usageRepository.js';

const MAX_PAGE_SIZE = 100;
const SCOPES = new Set(['me', 'workspace']);
const ADMIN_ROLES = new Set(['owner', 'admin']);

function inputError(message) {
  return Object.assign(new Error(message), { status: 400, code: 'INVALID_USAGE_QUERY' });
}

function pageValue(value, name, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (!/^\d+$/.test(String(value)) || Number(value) < 1) throw inputError(`${name} must be a positive integer`);
  return Number(value);
}

function monthStart(now) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function daysAgoUtc(now, days) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)));
}

function buildDailySeries(now, days, rawRows) {
  const map = new Map();
  for (const row of rawRows || []) {
    map.set(row.day, { credits: Number(row.credits || 0), count: Number(row.count || 0) });
  }
  const series = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset));
    const key = dt.toISOString().slice(0, 10);
    const hit = map.get(key);
    series.push({
      date: key,
      credits: hit ? Number(hit.credits.toFixed(4)) : 0,
      count: hit ? hit.count : 0,
    });
  }
  return series;
}

function mapItem(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    kind: row.kind,
    prompt: row.prompt,
    model: row.model,
    status: row.status,
    provider: row.provider || null,
    credits: String(row.credits ?? '0'),
    estimated: Boolean(row.estimated),
    units: row.units || {},
    source: row.source || 'studio',
  };
}

export function createUsageService({ repository: repo, now = () => new Date() }) {
  return {
    async getUsage({ workspaceId, userId, role, scope = 'me', page, pageSize }) {
      if (!workspaceId || !userId) throw inputError('workspace and user are required');
      if (!SCOPES.has(scope)) throw inputError('scope is invalid');
      if (scope === 'workspace' && !ADMIN_ROLES.has(role)) {
        throw Object.assign(new Error('Workspace usage requires administrator access'), { status: 403, code: 'WORKSPACE_USAGE_FORBIDDEN' });
      }
      const safePage = pageValue(page, 'page', 1);
      const safePageSize = Math.min(MAX_PAGE_SIZE, pageValue(pageSize, 'pageSize', 25));
      const nowDate = now();
      const periodStart = monthStart(nowDate);
      const trendStart = daysAgoUtc(nowDate, 30);
      const args = { workspaceId, userId, scope };
      const [balance, summary, history, analyticsRaw] = await Promise.all([
        repo.getUsageBalance(workspaceId),
        repo.getUsageSummary({ ...args, periodStart }),
        repo.listUsageHistory({ ...args, page: safePage, pageSize: safePageSize }),
        typeof repo.getUsageAnalytics === 'function'
          ? repo.getUsageAnalytics({ ...args, periodStart, trendStart })
          : Promise.resolve(null),
      ]);
      const total = Number(history.total || 0);
      const daily30 = analyticsRaw ? buildDailySeries(nowDate, 30, analyticsRaw.daily) : [];
      const last7Credits = daily30.slice(-7).reduce((sum, d) => sum + d.credits, 0);
      const prev7Credits = daily30.slice(-14, -7).reduce((sum, d) => sum + d.credits, 0);
      return {
        balance: String(balance.balance ?? '0'),
        summary: {
          creditsUsed: String(summary.credits_used ?? '0'),
          generationCount: Number(summary.generation_count || 0),
          breakdown: (summary.breakdown || []).map((row) => ({ kind: row.kind, source: row.source, count: Number(row.count || 0), credits: String(row.credits ?? '0') })),
          periodStart: periodStart.toISOString(),
        },
        analytics: analyticsRaw ? {
          daily30,
          last7Credits: Number(last7Credits.toFixed(4)),
          prev7Credits: Number(prev7Credits.toFixed(4)),
          byKindStatus: (analyticsRaw.byKindStatus || []).map((row) => ({
            kind: row.kind,
            source: row.source,
            total: Number(row.total || 0),
            succeeded: Number(row.succeeded || 0),
            failed: Number(row.failed || 0),
            running: Number(row.running || 0),
            credits: Number(row.credits || 0),
          })),
        } : null,
        permissions: { canViewWorkspace: ADMIN_ROLES.has(role) },
        items: (history.rows || []).map(mapItem),
        pagination: { page: safePage, pageSize: safePageSize, total, totalPages: total ? Math.ceil(total / safePageSize) : 0 },
      };
    },
  };
}

export const usageService = createUsageService({
  repository: {
    getUsageBalance: (workspaceId) => repository.getUsageBalance(getPool(), workspaceId),
    getUsageSummary: (args) => repository.getUsageSummary(getPool(), args),
    listUsageHistory: (args) => repository.listUsageHistory(getPool(), args),
    getUsageAnalytics: (args) => repository.getUsageAnalytics(getPool(), args),
  },
});
