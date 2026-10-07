import { requirePlatformOperator } from '../lib/auth/platformOperator.js';
import { getPool } from '../db/pool.js';
import { listGenerationJobs, listProviderUsage, getCreditAudit } from '../repositories/adminAuditRepository.js';

const MAX_PAGE_SIZE = 100;
const allowedStatuses = new Set(['queued', 'running', 'succeeded', 'failed', 'canceled']);
function adminError() { return Object.assign(new Error('Administrator access required'), { code: 'ADMIN_REQUIRED', status: 403 }); }
function authorize(role) { if (role !== 'owner' && role !== 'admin') throw adminError(); }
function filters(input = {}) {
  const result = { page: Math.max(1, Number.parseInt(input.page, 10) || 1), pageSize: Math.min(MAX_PAGE_SIZE, Number.parseInt(input.pageSize, 10) || 25) };
  if (input.status && allowedStatuses.has(input.status)) result.status = input.status;
  if (input.model) result.model = String(input.model).slice(0, 120);
  if (input.provider) result.provider = String(input.provider).slice(0, 120);
  if (input.reason) result.reason = String(input.reason).slice(0, 120);
  return result;
}
function result(data, page, pageSize) { const total = Number(data.total || 0); return { items: data.rows, pagination: { page, pageSize, total, totalPages: total ? Math.ceil(total / pageSize) : 0 } }; }
export function createAdminAuditService({ repositories, env = process.env }) {
  async function list(kind, { workspaceId, userId, role, filters: input }) { requirePlatformOperator(userId, env); if (!workspaceId) throw Object.assign(new Error('workspace_id is required'), { status: 400 }); authorize(role); const query = filters(input); const data = await repositories[kind](workspaceId, query); return result(data, Math.max(1, Number.parseInt(query.page, 10) || 1), query.pageSize); }
  return {
    listJobs: (args) => list('listGenerationJobs', args), listUsage: (args) => list('listProviderUsage', args),
    async listCredits({ workspaceId, userId, role, filters: input }) { requirePlatformOperator(userId, env); if (!workspaceId) throw Object.assign(new Error('workspace_id is required'), { status: 400 }); authorize(role); const query = filters(input); const data = await repositories.getCreditAudit(workspaceId, query); return { balance: data.balance, ...result(data, Math.max(1, Number.parseInt(query.page, 10) || 1), query.pageSize) }; },
  };
}
export const adminAuditService = createAdminAuditService({ repositories: { listGenerationJobs, listProviderUsage, getCreditAudit } });
export { adminError };
