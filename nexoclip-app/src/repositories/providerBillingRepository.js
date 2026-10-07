export function createProviderBillingRepository(pool) {
  return {
    async transaction(fn) {
      const db = await pool.connect();
      try {
        await db.query('BEGIN');
        const result = await fn(db);
        await db.query('COMMIT');
        return result;
      } catch (error) { await db.query('ROLLBACK'); throw error; }
      finally { db.release(); }
    },
    async lockAccount(db, account) {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended('byteplus-billing:' || $1,0))", [account]);
    },
    async duplicate(hash, db = pool) {
      return (await db.query('SELECT id FROM provider_billing_imports WHERE file_hash=$1', [hash])).rows[0] || null;
    },
    async overlapping(db, parsed) {
      return (await db.query(`SELECT id FROM provider_billing_imports WHERE provider_account_id=$1
        AND period_start < $3::timestamptz AND period_end > $2::timestamptz LIMIT 1`,
      [parsed.providerAccountId, parsed.periodStart, parsed.periodEnd])).rows[0] || null;
    },
    async insert(db, { parsed, userId, reference }) {
      const t = parsed.totals;
      const bill = (await db.query(`INSERT INTO provider_billing_imports
        (provider_account_id,billing_cycle,currency,file_hash,reference,period_start,period_end,row_count,package_row_count,
         gross_usd,discount_usd,coupon_usd,truncated_usd,pre_tax_usd,tax_usd,total_usd,created_by,savings_plan_gross_usd)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
      [parsed.providerAccountId, parsed.billingCycle, parsed.currency, parsed.fileHash, reference, parsed.periodStart,
        parsed.periodEnd, parsed.rows.length, t.packageUsageRowCount, t.grossUsd, t.discountUsd, t.couponUsd,
        t.truncatedUsd, t.preTaxUsd, t.taxUsd, t.totalUsd, userId, t.savingsPlanGrossUsd])).rows[0];
      // Whitelisted parser output only: never store the raw CSV or account names.
      await db.query(`INSERT INTO provider_billing_lines
        (import_id,provider_account_id,identity_hash,line_number,configuration,billing_unit,usage_unit,usage,package_usage,total_usd,evidence)
        SELECT $1,$2,x->>'identityHash',(x->>'lineNumber')::integer,x->>'configuration',x->>'billingUnit',x->>'usageUnit',
          (x->>'usage')::numeric,(x->>'packageUsage')::numeric,(x->>'totalUsd')::numeric,x
        FROM jsonb_array_elements($3::jsonb) x`, [bill.id, parsed.providerAccountId, JSON.stringify(parsed.rows)]);
      return bill;
    },
    async list(page, pageSize, environment='all') {
      const [items, count] = await Promise.all([
        pool.query(`SELECT b.id,b.provider_account_id,b.billing_cycle,b.reference,b.row_count,b.total_usd,b.created_at,
          COALESCE(e.environment,'unclassified') AS environment FROM provider_billing_imports b
          LEFT JOIN provider_billing_environments e ON e.import_id=b.id
          WHERE $3='all' OR COALESCE(e.environment,'unclassified')=$3
          ORDER BY b.created_at DESC,b.id DESC LIMIT $1 OFFSET $2`, [pageSize,(page-1)*pageSize,environment]),
        pool.query(`SELECT count(*)::integer AS n FROM provider_billing_imports b
          LEFT JOIN provider_billing_environments e ON e.import_id=b.id
          WHERE $1='all' OR COALESCE(e.environment,'unclassified')=$1`,[environment]),
      ]);
      return { imports: items.rows, total: count.rows[0].n };
    },
    async detail(id, db = pool) {
      const bill = (await db.query(`SELECT b.*,COALESCE(e.environment,'unclassified') AS environment
        FROM provider_billing_imports b LEFT JOIN provider_billing_environments e ON e.import_id=b.id WHERE b.id=$1`, [id])).rows[0];
      if (!bill) return null;
      const groups = (await db.query(`SELECT configuration,billing_unit,usage_unit,count(*)::integer AS rows,
        sum(usage)::text AS usage,sum(package_usage)::text AS package_usage,sum(total_usd)::text AS total_usd,
        sum((evidence->>'preTaxUsd')::numeric)::text AS pre_tax_usd,
        sum((evidence->>'savingsPlanGrossUsd')::numeric)::text AS savings_plan_gross_usd
        FROM provider_billing_lines WHERE import_id=$1 GROUP BY configuration,billing_unit,usage_unit
        ORDER BY configuration,billing_unit,usage_unit`, [id])).rows;
      const reviews = (await db.query(`SELECT note,created_at,comparison_hash,created_by FROM provider_billing_reviews
        WHERE import_id=$1 ORDER BY id DESC LIMIT 50`, [id])).rows;
      return { bill, groups, reviews };
    },
    async comparison(bill, db = pool, accountOnly = false) {
      // Invoice consumption time and dispatch time are different bases. This is
      // an explicit platform comparator, not an account or per-request match.
      return (await db.query(`WITH observations AS (
        SELECT e.id,e.cost_usd,e.cost_source,gj.model,dispatch.dispatched_at
        FROM latest_generation_cost_observations e
        JOIN generation_jobs gj ON gj.workspace_id=e.workspace_id AND gj.id=e.generation_job_id
        LEFT JOIN LATERAL (SELECT min(d.created_at) AS dispatched_at FROM generation_cost_events d
          WHERE d.workspace_id=e.workspace_id AND d.generation_job_id=e.generation_job_id
          AND d.provider=e.provider AND d.dispatch_id=e.dispatch_id AND d.event_type='dispatch') dispatch ON true
        WHERE e.provider='byteplus' AND COALESCE(dispatch.dispatched_at,e.created_at)>=$1::timestamptz
          AND COALESCE(dispatch.dispatched_at,e.created_at)<$2::timestamptz
          AND ($3::text IS NULL OR e.provider_account_id=$3)
      ) SELECT model,count(*)::integer AS requests,COALESCE(sum(cost_usd),0)::text AS known_cost_usd,
        count(*) FILTER (WHERE cost_usd IS NULL)::integer AS unknown_requests,
        count(*) FILTER (WHERE dispatched_at IS NULL)::integer AS missing_dispatch_requests,
        md5(string_agg(id::text,',' ORDER BY id)) AS observation_version
        FROM observations GROUP BY model ORDER BY model`, [bill.period_start,bill.period_end,accountOnly ? bill.provider_account_id : null])).rows;
    },
    async accountCoverage(bill, db = pool) {
      return (await db.query(`WITH requests AS (
        SELECT e.provider_account_id,e.provider_request_id FROM latest_generation_cost_observations e
        LEFT JOIN LATERAL (SELECT min(d.created_at) AS dispatched_at FROM generation_cost_events d
          WHERE d.workspace_id=e.workspace_id AND d.generation_job_id=e.generation_job_id
            AND d.provider=e.provider AND d.dispatch_id=e.dispatch_id AND d.event_type='dispatch') dispatch ON true
        WHERE e.provider='byteplus' AND COALESCE(dispatch.dispatched_at,e.created_at)>=$1::timestamptz
          AND COALESCE(dispatch.dispatched_at,e.created_at)<$2::timestamptz
      ) SELECT count(*) FILTER (WHERE provider_account_id=$3)::integer AS matching_account_requests,
        count(*) FILTER (WHERE provider_account_id IS NULL)::integer AS unidentified_account_requests,
        count(*) FILTER (WHERE provider_account_id IS NOT NULL AND provider_account_id<>$3)::integer AS other_account_requests,
        count(*) FILTER (WHERE provider_account_id=$3 AND provider_request_id IS NULL)::integer AS missing_request_ids
        FROM requests`,[bill.period_start,bill.period_end,bill.provider_account_id])).rows[0];
    },
    async requestInventory(bill,db=pool) {
      const result=await db.query(`SELECT e.id::text AS observation_id,e.workspace_id,e.generation_job_id,
        e.provider_account_id,e.provider_request_id,e.dispatch_id,e.event_type,e.cost_source,
        e.cost_usd::text,gj.model,COALESCE(dispatch.dispatched_at,e.created_at) AS request_time,
        (dispatch.dispatched_at IS NULL) AS time_is_fallback,
        CASE WHEN e.provider_account_id IS NULL THEN 'unknown'
          WHEN e.provider_account_id=$3 THEN 'matching' ELSE 'other' END AS account_match
        FROM latest_generation_cost_observations e
        JOIN generation_jobs gj ON gj.workspace_id=e.workspace_id AND gj.id=e.generation_job_id
        LEFT JOIN LATERAL (SELECT min(d.created_at) AS dispatched_at FROM generation_cost_events d
          WHERE d.workspace_id=e.workspace_id AND d.generation_job_id=e.generation_job_id
            AND d.provider=e.provider AND d.dispatch_id=e.dispatch_id AND d.event_type='dispatch') dispatch ON true
        WHERE e.provider='byteplus' AND COALESCE(dispatch.dispatched_at,e.created_at)>=$1::timestamptz
          AND COALESCE(dispatch.dispatched_at,e.created_at)<$2::timestamptz
        ORDER BY COALESCE(dispatch.dispatched_at,e.created_at) DESC,e.id DESC LIMIT 101`,
        [bill.period_start,bill.period_end,bill.provider_account_id]);
      return {rows:result.rows.slice(0,100),truncated:result.rows.length>100,limit:100};
    },
    async review(db, { id, note, comparison, reviewHash, userId }) {
      await db.query(`INSERT INTO provider_billing_reviews
        (import_id,note,comparison_hash,comparison_snapshot,review_hash,created_by)
        VALUES ($1,$2,$3,$4::jsonb,$5,$6) ON CONFLICT(review_hash) DO NOTHING`,
      [id,note,comparison.hash,JSON.stringify(comparison),reviewHash,userId]);
    },
    async mappings(id, db = pool) {
      return (await db.query(`SELECT id::text,group_key,configuration,billing_unit,usage_unit,model,note,created_by,created_at FROM provider_billing_sku_mappings
        WHERE import_id=$1 ORDER BY id DESC`, [id])).rows;
    },
    async lockImport(db,id) {
      await db.query('SELECT id FROM provider_billing_imports WHERE id=$1 FOR UPDATE',[id]);
    },
    async classifyEnvironment(db,{id,environment,note,userId}) {
      await db.query(`INSERT INTO provider_billing_environments(import_id,environment,note,created_by)
        VALUES($1,$2,$3,$4)`,[id,environment,note,userId]);
    },
    async mapSku(db,{id,groupKey,group,model,note,userId}) {
      await db.query(`INSERT INTO provider_billing_sku_mappings
        (import_id,group_key,configuration,billing_unit,usage_unit,model,note,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[id,groupKey,group.configuration,group.billing_unit,group.usage_unit,model,note,userId]);
    },
  };
}
