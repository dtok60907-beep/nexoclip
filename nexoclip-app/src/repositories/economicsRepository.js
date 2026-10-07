import { CREDIT_CHARGE_SQL } from './usageRepository.js';

const summedFields = [
  'job_count', 'failed_job_count', 'provider_request_count', 'credits_consumed', 'recognized_revenue_idr',
  'provider_cost_usd', 'provider_cost_idr', 'payment_fee_idr', 'unknown_revenue_credits', 'unknown_fee_credits',
  'unknown_provider_requests', 'unknown_fx_requests', 'missing_attempt_count', 'pending_settlement_jobs',
  'allocation_mismatch_jobs', 'reported_request_count', 'calculated_request_count',
  'unobserved_cost_jobs', 'provisional_provider_requests', 'simulated_revenue_addition_idr', 'simulated_credits',
];

const aggregateSql = summedFields.map((name) => `COALESCE(SUM(${name}), 0) AS ${name}`).join(',\n         ');

// Reporting uses terminal jobs as a stable cohort. Request observations are
// consolidated by the cost-event view, while worker-attempt coverage comes
// from all immutable observations, including attempt-start markers.
export async function getEconomicsReport(pool, { workspaceId, since, until, groupBy = 'model', model, provider, environment='all',page = 1, pageSize = 25 }) {
  const values = [workspaceId, since, until];
  const conditions = ["gj.workspace_id = $1", "gj.status IN ('succeeded', 'failed')", 'COALESCE(gj.finished_at, gj.created_at) >= $2::timestamptz', 'COALESCE(gj.finished_at, gj.created_at) < $3::timestamptz'];
  for (const [name, value] of [['model', model], ['provider', provider]]) {
    if (value) { values.push(value); conditions.push(`gj.${name} = $${values.length}`); }
  }
  if (environment!=='all') {values.push(environment);conditions.push(`gj.environment = $${values.length}`);}
  values.push(pageSize, (page - 1) * pageSize);
  const limit = `$${values.length - 1}`;
  const offset = `$${values.length}`;
  const groupField = groupBy === 'provider' ? 'provider' : 'model';
  const result = await pool.query(
    `WITH cohort AS (
       SELECT gj.id, gj.workspace_id, gj.model, gj.provider, gj.kind, gj.status, gj.settlement_status,gj.environment,
              gj.attempt_count, COALESCE(gj.finished_at, gj.created_at) AS cohort_at,
              CASE WHEN gj.settlement_status = 'pending' THEN 0::numeric ELSE ${CREDIT_CHARGE_SQL} END AS charged_credits
       FROM generation_jobs gj
       LEFT JOIN credit_ledger reservation ON reservation.workspace_id = gj.workspace_id AND reservation.id = gj.reservation_ledger_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(entry.amount), 0::numeric) AS amount
         FROM credit_ledger entry
         WHERE entry.workspace_id = gj.workspace_id AND entry.reason = 'generation_capture'
           AND entry.metadata->>'generationId' = gj.id::text
       ) adjustments ON true
       WHERE ${conditions.join(' AND ')}
     ), allocations AS (
       SELECT a.generation_job_id,
              COALESCE(SUM(a.consumed_credits * simulation.assumed_amount_idr / simulation.reference_credits) FILTER (WHERE a.finalized_at IS NOT NULL AND l.source_type = 'promo'),0) AS simulated_revenue_addition_idr,
              COALESCE(SUM(a.consumed_credits) FILTER (WHERE a.finalized_at IS NOT NULL AND l.source_type = 'promo' AND simulation.lot_id IS NOT NULL),0) AS simulated_credits,
              BOOL_OR(l.source_type = 'sandbox' AND a.reserved_credits > 0) AS sandbox_funded,
              COALESCE(SUM(a.consumed_credits) FILTER (WHERE a.finalized_at IS NOT NULL AND l.source_type <> 'sandbox'), 0) AS consumed_credits,
              COALESCE(SUM(CASE WHEN l.source_type = 'promo' THEN 0 ELSE a.consumed_credits * l.amount_idr / l.granted_credits END)
                FILTER (WHERE a.finalized_at IS NOT NULL AND l.source_type <> 'sandbox' AND (l.amount_idr IS NOT NULL OR l.source_type = 'promo')), 0) AS revenue_idr,
              COALESCE(SUM(a.consumed_credits) FILTER (WHERE a.finalized_at IS NOT NULL AND l.amount_idr IS NULL AND l.source_type NOT IN ('sandbox', 'promo')), 0) AS unknown_revenue_credits,
              COALESCE(SUM(CASE WHEN l.source_type = 'promo' THEN 0 ELSE a.consumed_credits * l.payment_fee_idr / l.granted_credits END)
                FILTER (WHERE a.finalized_at IS NOT NULL AND l.source_type <> 'sandbox' AND (l.payment_fee_idr IS NOT NULL OR l.source_type = 'promo')), 0) AS payment_fee_idr,
              COALESCE(SUM(a.consumed_credits) FILTER (WHERE a.finalized_at IS NOT NULL AND l.payment_fee_idr IS NULL AND l.source_type NOT IN ('sandbox', 'promo')), 0) AS unknown_fee_credits
       FROM generation_credit_allocations a
       JOIN credit_lots l ON l.workspace_id = a.workspace_id AND l.id = a.lot_id
       LEFT JOIN credit_revenue_simulations simulation ON simulation.workspace_id=l.workspace_id AND simulation.lot_id=l.id
       JOIN cohort gj ON gj.workspace_id = a.workspace_id AND gj.id = a.generation_job_id
       WHERE a.workspace_id = $1
       GROUP BY a.generation_job_id
     ), costs AS (
       SELECT e.generation_job_id, COUNT(*) AS request_count,
              COALESCE(SUM(e.cost_usd) FILTER (WHERE e.cost_usd IS NOT NULL AND e.cost_source IN ('reported', 'calculated')), 0) AS cost_usd,
              COALESCE(SUM(CASE WHEN e.cost_usd = 0 THEN 0 ELSE e.cost_idr END) FILTER (WHERE e.cost_usd IS NOT NULL AND e.cost_source IN ('reported', 'calculated')), 0) AS cost_idr,
              COUNT(*) FILTER (WHERE e.cost_usd IS NULL OR e.cost_source = 'unknown') AS unknown_requests,
              COUNT(*) FILTER (WHERE e.cost_usd > 0 AND e.cost_idr IS NULL AND e.cost_source IN ('reported', 'calculated')) AS unknown_fx_requests,
              COUNT(*) FILTER (WHERE e.cost_usd IS NOT NULL AND e.event_type NOT IN ('succeeded', 'failed', 'output_failed', 'reconciled')
                AND NOT EXISTS (
                  SELECT 1 FROM generation_cost_events terminal
                  WHERE terminal.workspace_id = e.workspace_id AND terminal.generation_job_id = e.generation_job_id
                    AND terminal.provider = e.provider AND terminal.cost_usd = e.cost_usd
                    AND terminal.event_type IN ('succeeded', 'failed', 'output_failed', 'reconciled')
                    AND ((e.provider_request_id IS NOT NULL AND terminal.provider_request_id = e.provider_request_id)
                      OR (e.provider_request_id IS NULL AND terminal.provider_request_id IS NULL AND terminal.dispatch_id = e.dispatch_id))
                )) AS provisional_requests,
              COUNT(*) FILTER (WHERE e.cost_usd IS NOT NULL AND e.cost_source = 'reported') AS reported_requests,
              COUNT(*) FILTER (WHERE e.cost_usd IS NOT NULL AND e.cost_source = 'calculated') AS calculated_requests
       FROM latest_generation_cost_observations e
       JOIN cohort gj ON gj.workspace_id = e.workspace_id AND gj.id = e.generation_job_id
       WHERE e.workspace_id = $1
       GROUP BY e.generation_job_id
     ), attempts AS (
       SELECT e.generation_job_id, COUNT(DISTINCT e.worker_attempt) AS observed_attempts
       FROM generation_cost_events e
       JOIN cohort gj ON gj.workspace_id = e.workspace_id AND gj.id = e.generation_job_id
       WHERE e.workspace_id = $1
       GROUP BY e.generation_job_id
     ), job_financials AS (
       SELECT gj.*, 1 AS job_count, CASE WHEN gj.status = 'failed' THEN 1 ELSE 0 END AS failed_job_count,
              COALESCE(costs.request_count, 0) AS provider_request_count,
              gj.charged_credits AS credits_consumed,
              COALESCE(a.revenue_idr, 0) AS recognized_revenue_idr,
              COALESCE(a.simulated_revenue_addition_idr,0) AS simulated_revenue_addition_idr, COALESCE(a.simulated_credits,0) AS simulated_credits,
              COALESCE(costs.cost_usd, 0) AS provider_cost_usd, COALESCE(costs.cost_idr, 0) AS provider_cost_idr,
              COALESCE(a.payment_fee_idr, 0) AS payment_fee_idr,
              GREATEST(gj.charged_credits - COALESCE(a.consumed_credits, 0), 0) + COALESCE(a.unknown_revenue_credits, 0) AS unknown_revenue_credits,
              GREATEST(gj.charged_credits - COALESCE(a.consumed_credits, 0), 0) + COALESCE(a.unknown_fee_credits, 0) AS unknown_fee_credits,
              COALESCE(costs.unknown_requests, 0) AS unknown_provider_requests,
              COALESCE(costs.unknown_fx_requests, 0) AS unknown_fx_requests,
              CASE WHEN COALESCE(costs.request_count, 0) = 0 THEN 1 ELSE 0 END AS unobserved_cost_jobs,
              COALESCE(costs.provisional_requests, 0) AS provisional_provider_requests,
              GREATEST(GREATEST(COALESCE(gj.attempt_count, 0), 1) - COALESCE(attempts.observed_attempts, 0), 0) AS missing_attempt_count,
              CASE WHEN gj.settlement_status = 'pending' THEN 1 ELSE 0 END AS pending_settlement_jobs,
              CASE WHEN ABS(gj.charged_credits - COALESCE(a.consumed_credits, 0)) > 0.000001 THEN 1 ELSE 0 END AS allocation_mismatch_jobs,
              COALESCE(costs.reported_requests, 0) AS reported_request_count,
              COALESCE(costs.calculated_requests, 0) AS calculated_request_count,
              COALESCE(a.sandbox_funded, false) AS sandbox_funded
       FROM cohort gj
       LEFT JOIN allocations a ON a.generation_job_id = gj.id
       LEFT JOIN costs ON costs.generation_job_id = gj.id
       LEFT JOIN attempts ON attempts.generation_job_id = gj.id
     ), financials AS (
       SELECT * FROM job_financials WHERE sandbox_funded = false
     ), totals AS (
       SELECT ${aggregateSql} FROM financials
     ), breakdown AS (
       SELECT COALESCE(${groupField}, '(unknown)') AS group_key, ${aggregateSql}
       FROM financials GROUP BY ${groupField}
     ), history AS (
       SELECT * FROM financials ORDER BY cohort_at DESC, id DESC LIMIT ${limit} OFFSET ${offset}
     )
     SELECT row_to_json(totals) AS totals,
            COALESCE((SELECT json_agg(breakdown ORDER BY group_key) FROM breakdown), '[]'::json) AS breakdown,
            COALESCE((SELECT json_agg(history ORDER BY cohort_at DESC, id DESC) FROM history), '[]'::json) AS items,
            (SELECT COUNT(*) FROM financials) AS total,
            (SELECT COUNT(*) FROM job_financials WHERE sandbox_funded = true) AS excluded_sandbox_jobs
     FROM totals`,
    values,
  );
  const row = result.rows[0] || {};
  return { totals: row.totals || {}, breakdown: row.breakdown || [], items: row.items || [], total: row.total || 0, excludedSandboxJobs: row.excluded_sandbox_jobs || 0 };
}
