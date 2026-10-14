import { LEDGER_USAGE_WHERE, jobSourceSql, ledgerKindSql, ledgerModelSql, ledgerSourceSql, ledgerUnitsSql } from './usageRowsSql.js';

// $1 workspace, $2 / $3 the user (as uuid for jobs, as text for ledger metadata), then the period start.
function filters({ workspaceId, userId, scope, periodStart = null }) {
  const values = [workspaceId];
  const jobs = ['gj.workspace_id = $1'];
  const ledger = ['c.workspace_id = $1', LEDGER_USAGE_WHERE('c')];
  if (scope === 'me') {
    values.push(userId, String(userId));
    jobs.push('gj.created_by_user_id = $2');
    // Director charges name their user; older ones without it belong to the workspace owner (whose workspace the
    // Director bills).
    ledger.push(`(c.metadata->>'userId' = $3 OR (c.metadata->>'userId' IS NULL AND EXISTS (
      SELECT 1 FROM workspace_memberships m WHERE m.workspace_id = $1 AND m.user_id = $2 AND m.role = 'owner')))`);
  }
  if (periodStart) {
    values.push(periodStart);
    jobs.push(`gj.created_at >= $${values.length}`);
    ledger.push(`c.created_at >= $${values.length}`);
  }
  return { values, where: jobs.join(' AND '), ledgerWhere: ledger.join(' AND ') };
}

export const CREDIT_CHARGE_SQL = `CASE
  WHEN gj.settlement_status IN ('released', 'refunded') THEN 0::numeric
  WHEN gj.settlement_status = 'captured' THEN GREATEST(
    0::numeric,
    -COALESCE(reservation.amount, -gj.estimated_cost, 0::numeric)
      - COALESCE(adjustments.amount, 0::numeric)
  )
  ELSE COALESCE(gj.estimated_cost, 0::numeric)
END`;

const usageJoin = `
  LEFT JOIN credit_ledger reservation ON reservation.workspace_id = gj.workspace_id
    AND reservation.id = gj.reservation_ledger_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(entry.amount), 0::numeric) AS amount
    FROM credit_ledger entry
    WHERE entry.workspace_id = gj.workspace_id
      AND entry.reason = 'generation_capture'
      AND entry.metadata->>'generationId' = gj.id::text
  ) adjustments ON true
  LEFT JOIN LATERAL (
    SELECT provider, units
    FROM provider_usage
    WHERE workspace_id = gj.workspace_id AND generation_job_id = gj.id
    ORDER BY updated_at DESC, id DESC
    LIMIT 1
  ) pu ON true`;

export async function getUsageBalance(pool, workspaceId) {
  const result = await pool.query(
    `SELECT balance FROM credit_accounts WHERE workspace_id = $1 LIMIT 1`,
    [workspaceId],
  );
  return result.rows[0] || { balance: '0' };
}

// Everything the user paid credits for: generation jobs and the LLM, audio and video-analysis calls billed to the
// ledger without a job (see usageRowsSql.js).
function usageRows({ where, ledgerWhere }) {
  return `SELECT gj.id, gj.created_at, gj.kind, gj.prompt, gj.model, gj.status, pu.provider,
            ${CREDIT_CHARGE_SQL} AS credits,
            (gj.settlement_status = 'pending') AS estimated,
            COALESCE(pu.units, '{}'::jsonb) AS units,
            ${jobSourceSql('gj')} AS source
     FROM generation_jobs gj
     ${usageJoin}
     WHERE ${where}
     UNION ALL
     SELECT c.id, c.created_at, ${ledgerKindSql('c')} AS kind, NULL AS prompt, ${ledgerModelSql('c')} AS model,
            'succeeded' AS status, NULL AS provider, -c.amount AS credits, false AS estimated,
            ${ledgerUnitsSql('c')} AS units, ${ledgerSourceSql('c')} AS source
     FROM credit_ledger c
     WHERE ${ledgerWhere}`;
}

export async function getUsageSummary(pool, input) {
  const filter = filters(input);
  const [total, breakdown] = await Promise.all([
    pool.query(`SELECT COALESCE(SUM(u.credits), 0::numeric) AS credits_used,
              COUNT(*) FILTER (WHERE u.kind IN ('image', 'video'))::text AS generation_count
       FROM (${usageRows(filter)}) u`, filter.values),
    pool.query(`SELECT u.kind, u.source, COUNT(*)::int AS count, COALESCE(SUM(u.credits), 0::numeric)::text AS credits
       FROM (${usageRows(filter)}) u GROUP BY 1, 2 ORDER BY SUM(u.credits) DESC`, filter.values),
  ]);
  return { ...(total.rows[0] || { credits_used: '0', generation_count: '0' }), breakdown: breakdown.rows };
}

export async function listUsageHistory(pool, { workspaceId, userId, scope, page, pageSize }) {
  const filter = filters({ workspaceId, userId, scope });
  const { values } = filter;
  const offset = (page - 1) * pageSize;
  const data = await pool.query(
    `SELECT * FROM (${usageRows(filter)}) u
     ORDER BY u.created_at DESC, u.id DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, pageSize, offset],
  );
  const count = await pool.query(`SELECT COUNT(*)::text AS count FROM (${usageRows(filter)}) u`, values);
  return { rows: data.rows, total: Number(count.rows[0]?.count || 0) };
}
