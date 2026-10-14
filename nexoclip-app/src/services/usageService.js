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
      const periodStart = monthStart(now());
      const args = { workspaceId, userId, scope };
      const [balance, summary, history] = await Promise.all([
        repo.getUsageBalance(workspaceId),
        repo.getUsageSummary({ ...args, periodStart }),
        repo.listUsageHistory({ ...args, page: safePage, pageSize: safePageSize }),
      ]);
      const total = Number(history.total || 0);
      return {
        balance: String(balance.balance ?? '0'),
        summary: {
          creditsUsed: String(summary.credits_used ?? '0'),
          generationCount: Number(summary.generation_count || 0),
          breakdown: (summary.breakdown || []).map((row) => ({ kind: row.kind, source: row.source, count: Number(row.count || 0), credits: String(row.credits ?? '0') })),
          periodStart: periodStart.toISOString(),
        },
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
  },
});
