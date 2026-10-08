import { getPool } from '../db/pool.js';

const definitions = {
  customers: { table: 'workspace_memberships m JOIN users u ON u.id = m.user_id', scope: 'm.workspace_id', id: 'u.id', date: 'm.created_at', search: "u.email || ' ' || COALESCE(u.display_name, '')", fields: 'u.id, u.email, u.display_name, m.role, m.created_at AS joined_at, u.created_at AS registered_at' },
  transactions: { table: 'credit_topups t', scope: 't.workspace_id', id: 't.id', date: 't.created_at', search: "t.order_id || ' ' || t.package_code", status: 't.status', fields: 't.id, t.order_id, t.package_code, t.amount_idr, t.credits, t.status, t.is_sandbox, t.provider_key, t.created_at, t.completed_at, t.credit_ledger_id' },
  credits: { table: 'credit_ledger l', scope: 'l.workspace_id', id: 'l.id', date: 'l.created_at', search: 'l.reason', fields: 'l.id, l.amount, l.balance_after, l.reason, l.created_at' },
  jobs: { table: 'generation_jobs j', scope: 'j.workspace_id', id: 'j.id', date: 'j.created_at', search: "COALESCE(j.model, '') || ' ' || j.id::text", status: 'j.status', fields: 'j.id, j.kind, j.model, j.status, j.estimated_cost, j.settlement_status, j.attempt_count, j.max_attempts, j.created_at, j.started_at, j.finished_at' },
};

export function createAdminConsoleRepository(pool) {
  return {
    async workspace(workspaceId) {
      const result = await pool.query(`SELECT w.id, w.name, w.slug, w.created_at,
        COALESCE(a.balance, 0)::text AS balance, l.rate_limit, l.rate_window_seconds, l.max_concurrent, l.budget_credits
        FROM workspaces w LEFT JOIN credit_accounts a ON a.workspace_id = w.id
        LEFT JOIN workspace_generation_limits l ON l.workspace_id = w.id WHERE w.id = $1`, [workspaceId]);
      return result.rows[0] || null;
    },
    async overview(workspaceId, filters) {
      const values = [workspaceId, filters.from, filters.to];
      const [members, jobs, payments, balance] = await Promise.all([
        pool.query('SELECT count(*)::int AS members FROM workspace_memberships WHERE workspace_id = $1', [workspaceId]),
        pool.query(`SELECT count(*)::int AS jobs, count(*) FILTER (WHERE status = 'failed')::int AS failed,
          count(*) FILTER (WHERE status IN ('queued','running','processing'))::int AS active,
          count(*) FILTER (WHERE status IN ('running','processing') AND started_at < now() - interval '30 minutes')::int AS long_running
          FROM generation_jobs WHERE workspace_id = $1 AND created_at >= ($2::date::timestamp AT TIME ZONE 'UTC') AND created_at < (($3::date + 1)::timestamp AT TIME ZONE 'UTC')`, values),
        pool.query(`SELECT count(*) FILTER (WHERE status = 'completed' AND NOT is_sandbox)::int AS paid_topups,
          COALESCE(sum(amount_idr) FILTER (WHERE status = 'completed' AND NOT is_sandbox), 0)::text AS sales_idr,
          count(*) FILTER (WHERE status = 'pending')::int AS pending_topups
          FROM credit_topups WHERE workspace_id = $1 AND created_at >= ($2::date::timestamp AT TIME ZONE 'UTC') AND created_at < (($3::date + 1)::timestamp AT TIME ZONE 'UTC')`, values),
        pool.query('SELECT balance::text FROM credit_accounts WHERE workspace_id = $1', [workspaceId]),
      ]);
      return { ...members.rows[0], ...jobs.rows[0], ...payments.rows[0], balance: balance.rows[0]?.balance ?? '0' };
    },
    async list(workspaceId, kind, filters) {
      const def = definitions[kind];
      if (!def) throw new Error('Invalid console section');
      const values = [workspaceId, filters.from, filters.to];
      const conditions = [`${def.scope} = $1`, `${def.date} >= ($2::date::timestamp AT TIME ZONE 'UTC')`, `${def.date} < (($3::date + 1)::timestamp AT TIME ZONE 'UTC')`];
      if (filters.q) { values.push(`%${filters.q.replace(/[\\%_]/g, '\\$&')}%`); conditions.push(`(${def.search}) ILIKE $${values.length}`); }
      if (filters.status && def.status) { values.push(filters.status); conditions.push(`${def.status} = $${values.length}`); }
      if (filters.id) { values.push(filters.id); conditions.push(`${def.id} = $${values.length}::uuid`); }
      const where = conditions.join(' AND ');
      const [rows, count] = await Promise.all([
        pool.query(`SELECT ${def.fields} FROM ${def.table} WHERE ${where} ORDER BY ${def.date} DESC, ${def.id} DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, filters.pageSize, (filters.page - 1) * filters.pageSize]),
        pool.query(`SELECT count(*)::int AS total FROM ${def.table} WHERE ${where}`, values),
      ]);
      const total = count.rows[0].total;
      return { items: rows.rows, pagination: { page: filters.page, pageSize: filters.pageSize, total, totalPages: Math.ceil(total / filters.pageSize) } };
    },
  };
}
export const adminConsoleRepository = {
  workspace: (...args) => createAdminConsoleRepository(getPool()).workspace(...args),
  overview: (...args) => createAdminConsoleRepository(getPool()).overview(...args),
  list: (...args) => createAdminConsoleRepository(getPool()).list(...args),
};
