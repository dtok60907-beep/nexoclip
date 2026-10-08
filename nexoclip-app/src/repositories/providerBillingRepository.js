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
    async jobBillingContext(workspaceId,jobId) {
      const job=(await pool.query('SELECT id,workspace_id,model,environment FROM generation_jobs WHERE workspace_id=$1 AND id=$2',[workspaceId,jobId])).rows[0];
      if(!job)return null;
      // Only actual dispatch timestamps select invoices; terminal/cohort dates and
      // observation fallback timestamps are not billing evidence.
      const invoices=(await pool.query(`SELECT DISTINCT b.id,b.reference,b.billing_cycle,b.provider_account_id,
        b.period_start,b.period_end,COALESCE(env.environment,'unclassified') AS environment
        FROM latest_generation_cost_observations e
        JOIN LATERAL (SELECT min(d.created_at) AS dispatched_at FROM generation_cost_events d
          WHERE d.workspace_id=e.workspace_id AND d.generation_job_id=e.generation_job_id
            AND d.provider=e.provider AND d.dispatch_id=e.dispatch_id AND d.event_type='dispatch') dispatch ON true
        JOIN provider_billing_imports b ON b.provider_account_id=e.provider_account_id
          AND dispatch.dispatched_at>=b.period_start AND dispatch.dispatched_at<b.period_end
        LEFT JOIN provider_billing_environments env ON env.import_id=b.id
        WHERE e.workspace_id=$1 AND e.generation_job_id=$2 AND e.provider='byteplus'
          AND COALESCE(env.environment,'unclassified')=$3
        ORDER BY b.period_start,b.id`,[workspaceId,jobId,job.environment])).rows;
      return {job,invoices};
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
    async requestInventory(bill,db=pool,{page=1,search='',status='all',jobId=null,workspaceId=null}={}) {
      const limit=50;
      const result=(await db.query(`WITH inventory AS (
        SELECT e.id::text AS observation_id,e.workspace_id,e.generation_job_id,
        e.provider_account_id,e.provider_request_id,e.dispatch_id,e.event_type,e.cost_source,
        e.cost_usd::text,gj.model,gj.environment,COALESCE(dispatch.dispatched_at,e.created_at) AS request_time,
        (dispatch.dispatched_at IS NULL) AS time_is_fallback,
        CASE WHEN e.provider_account_id IS NULL THEN 'unknown'
          WHEN e.provider_account_id=$3 THEN 'matching' ELSE 'other' END AS account_match,
        CASE WHEN reconciled.has_corrections THEN 'corrected' WHEN reconciled.id IS NOT NULL THEN 'reconciled' ELSE 'unreconciled' END AS reconciliation_status,
        elsewhere.import_id AS other_reconciliation_import_id,
        (SELECT count(DISTINCT (other.workspace_id,other.generation_job_id)) FROM generation_cost_events other
          WHERE other.provider=e.provider AND other.provider_account_id=e.provider_account_id
            AND other.provider_request_id=e.provider_request_id) AS matching_jobs
        FROM latest_generation_cost_observations e
        JOIN generation_jobs gj ON gj.workspace_id=e.workspace_id AND gj.id=e.generation_job_id
        LEFT JOIN LATERAL (SELECT min(d.created_at) AS dispatched_at FROM generation_cost_events d
          WHERE d.workspace_id=e.workspace_id AND d.generation_job_id=e.generation_job_id
            AND d.provider=e.provider AND d.dispatch_id=e.dispatch_id AND d.event_type='dispatch') dispatch ON true
        LEFT JOIN LATERAL (SELECT r.id,
          EXISTS(SELECT 1 FROM provider_request_cost_corrections c WHERE c.reconciliation_id=r.id) AS has_corrections
          FROM provider_request_reconciliations r JOIN generation_cost_events original ON original.id=r.cost_event_id
          WHERE r.import_id=$7::uuid AND r.provider_account_id=e.provider_account_id AND r.provider_request_id=e.provider_request_id
            AND original.workspace_id=e.workspace_id AND original.generation_job_id=e.generation_job_id) reconciled ON true
        LEFT JOIN provider_request_reconciliations elsewhere ON elsewhere.provider_account_id=e.provider_account_id
          AND elsewhere.provider_request_id=e.provider_request_id AND elsewhere.import_id<>$7::uuid
        WHERE e.provider='byteplus' AND COALESCE(dispatch.dispatched_at,e.created_at)>=$1::timestamptz
          AND COALESCE(dispatch.dispatched_at,e.created_at)<$2::timestamptz
          AND ($9::uuid IS NULL OR (e.workspace_id=$9::uuid AND e.generation_job_id=$10::uuid))
          AND ($4='' OR strpos(lower(COALESCE(e.provider_request_id,'')),lower($4))>0
            OR strpos(lower(gj.model),lower($4))>0
            OR strpos(e.generation_job_id::text,lower($4))>0
            OR strpos(e.workspace_id::text,lower($4))>0
            OR strpos(COALESCE(e.provider_account_id,''),$4)>0
            OR strpos(e.dispatch_id::text,lower($4))>0)
      ), filtered AS (SELECT * FROM inventory WHERE $8='all' OR reconciliation_status=$8)
        SELECT (SELECT count(*)::integer FROM filtered) AS total,
        (SELECT jsonb_build_object('unreconciled',count(*) FILTER(WHERE reconciliation_status='unreconciled'),
          'reconciled',count(*) FILTER(WHERE reconciliation_status='reconciled'),
          'corrected',count(*) FILTER(WHERE reconciliation_status='corrected')) FROM inventory) AS status_counts,
        COALESCE((SELECT jsonb_agg(to_jsonb(paged) ORDER BY paged.request_time DESC,paged.observation_id::bigint DESC)
          FROM (SELECT * FROM filtered ORDER BY request_time DESC,observation_id::bigint DESC LIMIT $5 OFFSET $6) paged),'[]'::jsonb) AS rows`,
        [bill.period_start,bill.period_end,bill.provider_account_id,search,limit,(page-1)*limit,bill.id,status,workspaceId,jobId])).rows[0];
      return {rows:result.rows,limit,truncated:false,search,status,statusCounts:result.status_counts,pagination:{page,total:result.total,totalPages:Math.max(1,Math.ceil(result.total/limit))}};
    },
    async reconciliationExportSnapshot(id) {
      return this.transaction(async db=>{
        await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
        const detail=await this.detail(id,db);
        if(!detail)throw Object.assign(new Error('Tagihan tidak ditemukan'),{status:404});
        const count=(await db.query(`SELECT
          (SELECT count(*) FROM provider_request_reconciliations WHERE import_id=$1) +
          (SELECT count(*) FROM provider_request_cost_corrections c JOIN provider_request_reconciliations r ON r.id=c.reconciliation_id WHERE r.import_id=$1) AS rows`,[id])).rows[0];
        if(Number(count.rows)>9999)throw Object.assign(new Error('Ekspor audit maksimal 10.000 baris termasuk ringkasan tagihan'),{status:413});
        return {...detail,mappings:await this.mappings(id,db),payments:await this.paymentEvidence(id,db),reconciliations:await this.requestReconciliations(id,db),corrections:await this.requestCorrectionHistory(id,db)};
      });
    },
    async requestReconciliations(id,db=pool) {
      return (await db.query(`SELECT r.id::text,COALESCE(c.payment_evidence_id,r.payment_evidence_id)::text AS payment_evidence_id,
        r.cost_event_id::text,COALESCE(c.cost_event_id,r.cost_event_id)::text AS current_cost_event_id,
        r.provider_account_id,r.provider_request_id,COALESCE(c.group_key,r.group_key) AS group_key,
        COALESCE(c.cost_usd,r.cost_usd)::text AS cost_usd,r.cost_usd::text AS original_cost_usd,initial.cost_idr::text AS original_cost_idr,COALESCE(c.created_by,r.created_by) AS current_created_by,COALESCE(c.created_at,r.created_at) AS current_created_at,r.evidence_reference AS original_evidence_reference,r.note AS original_note,r.created_by AS original_created_by,
        COALESCE(c.evidence_reference,r.evidence_reference) AS evidence_reference,
        COALESCE(c.note,r.note) AS note,r.created_at,e.workspace_id,e.generation_job_id,job.model,
        e.cost_idr::text,e.usd_idr_rate::text,c.id::text AS latest_correction_id,
        pkg.package_allocation_id::text,COALESCE(pc.consumed_quota,pkg.consumed_quota)::text AS package_consumed_quota,
        pkg.consumed_quota::text AS original_package_consumed_quota
        FROM provider_request_reconciliations r
        LEFT JOIN provider_package_request_allocations pkg ON pkg.reconciliation_id=r.id
        LEFT JOIN LATERAL (SELECT * FROM provider_request_cost_corrections revisions
          WHERE revisions.reconciliation_id=r.id ORDER BY revisions.id DESC LIMIT 1) c ON true
        LEFT JOIN provider_package_request_corrections pc ON pc.cost_correction_id=c.id
        JOIN generation_cost_events e ON e.id=COALESCE(c.cost_event_id,r.cost_event_id)
        JOIN generation_cost_events initial ON initial.id=r.cost_event_id
        JOIN generation_jobs job ON job.workspace_id=e.workspace_id AND job.id=e.generation_job_id
        WHERE r.import_id=$1 ORDER BY r.id DESC`,[id])).rows;
    },
    async requestCorrectionHistory(id,db=pool) {
      return (await db.query(`SELECT c.id::text,c.reconciliation_id::text,c.previous_cost_event_id::text,
        c.cost_event_id::text,c.payment_evidence_id::text,c.group_key,c.cost_usd::text,c.evidence_reference,
        c.note,c.created_by,c.created_at,r.provider_request_id,e.cost_idr::text,e.usd_idr_rate::text,
        previous.cost_usd::text AS previous_cost_usd,previous.cost_idr::text AS previous_cost_idr,
        pc.package_allocation_id::text,pc.consumed_quota::text AS package_consumed_quota,pc.previous_consumed_quota::text AS previous_package_consumed_quota
        FROM provider_request_cost_corrections c JOIN provider_request_reconciliations r ON r.id=c.reconciliation_id
        LEFT JOIN provider_package_request_corrections pc ON pc.cost_correction_id=c.id
        JOIN generation_cost_events e ON e.id=c.cost_event_id
        JOIN generation_cost_events previous ON previous.id=c.previous_cost_event_id
        WHERE r.import_id=$1 ORDER BY c.id DESC`,[id])).rows;
    },
    async requestReconciliationById(id,importId,db=pool) {
      return (await db.query('SELECT *,id::text,cost_event_id::text FROM provider_request_reconciliations WHERE id=$1 AND import_id=$2',[id,importId])).rows[0] || null;
    },
    async correctRequestCost(db,{parent,previousCostEventId,paymentId,groupKey,request,evidence,fingerprint,userId}) {
      const event=await this.appendReconciledCost(db,{id:parent.import_id,request,evidence,fingerprint,previousCostEventId});
      const result=await db.query(`INSERT INTO provider_request_cost_corrections
        (reconciliation_id,previous_cost_event_id,cost_event_id,payment_evidence_id,group_key,cost_usd,evidence_reference,note,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id::text`,[parent.id,previousCostEventId,event.id,paymentId,groupKey,evidence.costUsd,evidence.evidenceReference,evidence.note,userId]);
      return result.rows[0];
    },
    async recordPackageRequestCorrection(db,{correctionId,allocationId,previousQuota,consumedQuota}) {
      await db.query(`INSERT INTO provider_package_request_corrections(cost_correction_id,package_allocation_id,previous_consumed_quota,consumed_quota) VALUES($1,$2,$3,$4)`,[correctionId,allocationId,previousQuota,consumedQuota]);
    },
    async reconciliationForRequest(account,request,db=pool) {
      return (await db.query(`SELECT *,cost_usd::text,payment_evidence_id::text FROM provider_request_reconciliations
        WHERE provider_account_id=$1 AND provider_request_id=$2`,[account,request])).rows[0] || null;
    },
    async requestObservation(observationId,db=pool) {
      return (await db.query(`SELECT e.*,gj.model,gj.environment,COALESCE(dispatch.dispatched_at,e.created_at) AS request_time,
        (dispatch.dispatched_at IS NULL) AS time_is_fallback,
        (SELECT count(DISTINCT (other.workspace_id,other.generation_job_id)) FROM generation_cost_events other
          WHERE other.provider=e.provider AND other.provider_account_id=e.provider_account_id
            AND other.provider_request_id=e.provider_request_id) AS matching_jobs
        FROM generation_cost_events e JOIN generation_jobs gj ON gj.workspace_id=e.workspace_id AND gj.id=e.generation_job_id
        LEFT JOIN LATERAL (SELECT min(d.created_at) AS dispatched_at FROM generation_cost_events d
          WHERE d.workspace_id=e.workspace_id AND d.generation_job_id=e.generation_job_id
            AND d.provider=e.provider AND d.dispatch_id=e.dispatch_id AND d.event_type='dispatch') dispatch ON true
        WHERE e.id=$1 AND e.provider='byteplus' AND e.event_type<>'attempt_started'`,[observationId])).rows[0] || null;
    },
    async appendReconciledCost(db,{id,request,evidence,fingerprint,previousCostEventId}) {
      return (await db.query(`INSERT INTO generation_cost_events
        (workspace_id,generation_job_id,provider,provider_account_id,provider_request_id,dispatch_id,worker_attempt,
         event_type,observation_fingerprint,cost_usd,cost_idr,usd_idr_rate,cost_source,usage)
        VALUES($1,$2,'byteplus',$3,$4,$5,$6,'reconciled',$7,$8,$9,$10,$12,$11::jsonb) RETURNING id`,
        [request.workspace_id,request.generation_job_id,request.provider_account_id,request.provider_request_id,
         request.dispatch_id,request.worker_attempt,fingerprint,evidence.costUsd,evidence.costIdr,evidence.usdIdrRate,
         JSON.stringify({billingImportId:id,evidenceReference:evidence.evidenceReference,source:evidence.packageAllocationId?'operator_package_usage_evidence':'operator_request_evidence',...(evidence.packageAllocationId?{packageAllocationId:evidence.packageAllocationId,packageConsumedQuota:evidence.consumedQuota}:{}),...(previousCostEventId ? {previousCostEventId} : {})}),evidence.costSource || 'reported'])).rows[0];
    },
    async reconcileRequest(db,{id,paymentId,groupKey,request,evidence,fingerprint,userId}) {
      const event=await this.appendReconciledCost(db,{id,request,evidence,fingerprint});
      const result=await db.query(`INSERT INTO provider_request_reconciliations
        (import_id,payment_evidence_id,cost_event_id,provider_account_id,provider_request_id,group_key,cost_usd,evidence_reference,note,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id::text`,[id,paymentId,event.id,request.provider_account_id,request.provider_request_id,groupKey,evidence.costUsd,evidence.evidenceReference,evidence.note,userId]);
      return result.rows[0];
    },
    async packageRequestAllocations(id,db=pool) {
      const current=await this.requestReconciliations(id,db);
      return current.filter(row=>row.package_allocation_id).map(row=>({...row,reconciliation_id:row.id,
        consumed_quota:row.package_consumed_quota,initial_consumed_quota:row.original_package_consumed_quota,
        initial_evidence_reference:row.original_evidence_reference,initial_note:row.original_note}));
    },
    async recordPackageRequestAllocation(db,{reconciliationId,allocationId,consumedQuota}) {
      await db.query(`INSERT INTO provider_package_request_allocations(reconciliation_id,package_allocation_id,consumed_quota) VALUES($1,$2,$3)`,[reconciliationId,allocationId,consumedQuota]);
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
    async paymentEvidence(id,db=pool) {
      return (await db.query(`SELECT id::text,kind,amount_usd::text,amount_idr::text,paid_at,reference,note,created_at
        FROM provider_payment_evidence WHERE import_id=$1 ORDER BY id DESC`,[id])).rows;
    },
    async addPaymentEvidence(db,{id,evidence,userId}) {
      await db.query(`INSERT INTO provider_payment_evidence(import_id,kind,amount_usd,amount_idr,paid_at,reference,note,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[id,evidence.kind,evidence.amountUsd,evidence.amountIdr,evidence.paidAt,evidence.reference,evidence.note,userId]);
    },
    async packageAllocations(id,db=pool) {
      return (await db.query(`SELECT id::text,payment_evidence_id::text,group_key,usage_unit,total_quota::text,
        consumed_quota::text,allocated_usd::text,allocated_idr::text,note,created_at
        FROM provider_package_allocations WHERE import_id=$1 ORDER BY id`,[id])).rows;
    },
    async allocatePackage(db,{id,paymentId,groupKey,allocation,userId}) {
      await db.query(`INSERT INTO provider_package_allocations
        (import_id,payment_evidence_id,group_key,usage_unit,total_quota,consumed_quota,allocated_usd,allocated_idr,note,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,paymentId,groupKey,allocation.usageUnit,allocation.totalQuota,allocation.consumedQuota,allocation.allocatedUsd,allocation.allocatedIdr,allocation.note,userId]);
    },
    async mapSku(db,{id,groupKey,group,model,note,userId}) {
      await db.query(`INSERT INTO provider_billing_sku_mappings
        (import_id,group_key,configuration,billing_unit,usage_unit,model,note,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[id,groupKey,group.configuration,group.billing_unit,group.usage_unit,model,note,userId]);
    },
  };
}
