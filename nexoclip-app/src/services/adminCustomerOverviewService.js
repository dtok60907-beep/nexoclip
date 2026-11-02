import { adminCustomerOverviewRepository } from '../repositories/adminCustomerOverviewRepository.js';
import { isPlatformOperator, operatorError } from './economicsService.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

export function createAdminCustomerOverviewService({ repository = adminCustomerOverviewRepository, env = process.env, now = () => new Date() } = {}) {
  return {
    async list({ userId, days = 30, query = '' }) {
      if (!isPlatformOperator(userId, env)) throw operatorError();
      const period = Number(days);
      if (!Number.isInteger(period) || period < 1 || period > 365) throw fail('Periode harus 1–365 hari');
      const cleanQuery = String(query || '').trim().slice(0, 120);
      const from = new Date(now().getTime() - (period - 1) * 86400000).toISOString();
      const rows = await repository.list({ from, query: cleanQuery });
      const totals = rows.reduce((sum, row) => ({
        workspaces: sum.workspaces + 1,
        members: sum.members + Number(row.member_count),
        activePlans: sum.activePlans + (row.plan_state === 'active' ? 1 : 0),
        usage: sum.usage + Number(row.usage_count),
        creditsUsed: sum.creditsUsed + Number(row.credits_used),
        revenueIdr: sum.revenueIdr + Number(row.topup_revenue_idr),
        providerCostUsd: sum.providerCostUsd + Number(row.provider_cost_usd),
      }), { workspaces: 0, members: 0, activePlans: 0, usage: 0, creditsUsed: 0, revenueIdr: 0, providerCostUsd: 0 });
      return { period: { from, days: period }, totals, rows };
    },
  };
}

export const adminCustomerOverviewService = createAdminCustomerOverviewService();
