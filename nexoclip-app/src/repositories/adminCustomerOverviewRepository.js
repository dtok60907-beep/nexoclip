import { getPool } from '../db/pool.js';
import { USAGE_ROWS_SQL } from './usageRowsSql.js';

export function createAdminCustomerOverviewRepository(pool) {
  return {
    async list({ from, query = '' }) {
      const values = [from, query ? `%${query.replace(/[\\%_]/g, '\\$&')}%` : null];
      const result = await pool.query(`
        WITH usage AS (
          SELECT workspace_id, count(*)::int AS usage_count,
            count(*) FILTER (WHERE status = 'succeeded')::int AS successful_usage,
            COALESCE(sum(credits_charged), 0)::text AS credits_used,
            COALESCE(sum(provider_cost_usd), 0)::text AS provider_cost_usd,
            max(created_at) AS last_usage_at
          FROM (${USAGE_ROWS_SQL}) usage_rows
          WHERE created_at >= $1::timestamptz
          GROUP BY workspace_id
        ), payments AS (
          SELECT workspace_id,
            COALESCE(sum(amount_idr) FILTER (WHERE status = 'completed' AND NOT is_sandbox), 0)::text AS topup_revenue_idr,
            count(*) FILTER (WHERE status = 'completed' AND NOT is_sandbox)::int AS paid_topups
          FROM credit_topups
          WHERE created_at >= $1::timestamptz
          GROUP BY workspace_id
        ), members AS (
          SELECT workspace_id, count(*)::int AS member_count, max(created_at) AS last_member_at
          FROM workspace_memberships GROUP BY workspace_id
        )
        SELECT w.id, w.name, w.slug, w.created_at,
          COALESCE(m.member_count, 0)::int AS member_count,
          COALESCE(a.balance, 0)::text AS balance,
          s.plan_code, s.monthly_credits, s.status AS subscription_status, s.current_period_end,
          CASE WHEN s.status = 'active' AND s.current_period_end > now() THEN 'active'
               WHEN s.plan_code IS NULL THEN 'none' ELSE 'expired' END AS plan_state,
          COALESCE(u.usage_count, 0)::int AS usage_count,
          COALESCE(u.successful_usage, 0)::int AS successful_usage,
          COALESCE(u.credits_used, '0') AS credits_used,
          COALESCE(u.provider_cost_usd, '0') AS provider_cost_usd,
          u.last_usage_at,
          COALESCE(p.topup_revenue_idr, '0') AS topup_revenue_idr,
          COALESCE(p.paid_topups, 0)::int AS paid_topups,
          GREATEST(w.created_at, COALESCE(u.last_usage_at, w.created_at), COALESCE(m.last_member_at, w.created_at)) AS last_activity_at
        FROM workspaces w
        LEFT JOIN credit_accounts a ON a.workspace_id = w.id
        LEFT JOIN workspace_subscriptions s ON s.workspace_id = w.id
        LEFT JOIN usage u ON u.workspace_id = w.id
        LEFT JOIN payments p ON p.workspace_id = w.id
        LEFT JOIN members m ON m.workspace_id = w.id
        WHERE ($2::text IS NULL OR (w.name || ' ' || w.slug) ILIKE $2)
        ORDER BY last_activity_at DESC, w.created_at DESC`, values);
      return result.rows;
    },
  };
}

export const adminCustomerOverviewRepository = {
  list: (...args) => createAdminCustomerOverviewRepository(getPool()).list(...args),
};
