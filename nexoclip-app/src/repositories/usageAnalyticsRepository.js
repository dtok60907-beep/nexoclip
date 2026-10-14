import { getPool } from '../db/pool.js';
import { USAGE_ROWS_SQL } from './usageRowsSql.js';
import { PROVIDER_BILLING_CODE } from '../lib/providerBilling.js';

const PERIOD = `u.created_at >= ($1::date::timestamp AT TIME ZONE 'UTC') AND u.created_at < (($2::date + 1)::timestamp AT TIME ZONE 'UTC')`;

export function createUsageAnalyticsRepository(pool) {
  return {
    // Per kind of work and where it came from, across every workspace.
    async usage({ from, to }) {
      const result = await pool.query(`SELECT u.kind, u.source, count(*)::int AS count,
          count(*) FILTER (WHERE u.status = 'failed')::int AS failed,
          COALESCE(sum(u.credits_charged), 0)::text AS credits,
          COALESCE(sum(u.provider_cost_usd), 0)::text AS cost_usd,
          count(*) FILTER (WHERE u.status = 'succeeded' AND u.provider_cost_usd IS NULL)::int AS unknown_cost
        FROM (${USAGE_ROWS_SQL}) u WHERE ${PERIOD}
        GROUP BY 1, 2 ORDER BY 1, 2`, [from, to]);
      return result.rows;
    },
    // What a credit has actually been sold for (completed, non-sandbox top-ups, all time).
    async soldCredits() {
      const result = await pool.query(`SELECT COALESCE(sum(amount_idr), 0)::text AS amount_idr, COALESCE(sum(credits), 0)::text AS credits
        FROM credit_topups WHERE status = 'completed' AND NOT is_sandbox`);
      return result.rows[0];
    },
    // Jobs a provider refused in the last 24 hours because of our account (unpaid bill, quota): act on these now.
    async providerAlerts() {
      const result = await pool.query(`SELECT provider, count(*)::int AS failed, max(created_at) AS last_at
        FROM generation_jobs WHERE status = 'failed' AND error->>'code' = $1 AND created_at > now() - interval '24 hours'
        GROUP BY provider ORDER BY 2 DESC`, [PROVIDER_BILLING_CODE]);
      return result.rows;
    },
    // Credits handed out for free in the period (sign-up grants): used like paid credits, earn nothing.
    async freeCredits({ from, to }) {
      const result = await pool.query(`SELECT COALESCE(sum(amount), 0)::text AS credits FROM credit_ledger u
        WHERE u.reason = 'onboarding_grant' AND ${PERIOD}`, [from, to]);
      return result.rows[0].credits;
    },
  };
}

export const usageAnalyticsRepository = {
  usage: (...args) => createUsageAnalyticsRepository(getPool()).usage(...args),
  soldCredits: (...args) => createUsageAnalyticsRepository(getPool()).soldCredits(...args),
  freeCredits: (...args) => createUsageAnalyticsRepository(getPool()).freeCredits(...args),
  providerAlerts: (...args) => createUsageAnalyticsRepository(getPool()).providerAlerts(...args),
};
