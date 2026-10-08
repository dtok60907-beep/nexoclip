import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { getEconomicsReport } from '../../src/repositories/economicsRepository.js';
import { mapEconomicsTotals, createEconomicsService } from '../../src/services/economicsService.js';

const databaseUrl = process.env.NEXOCLIP_TEST_DATABASE_URL;
const skip = !databaseUrl && 'NEXOCLIP_TEST_DATABASE_URL is required (dedicated test database)';
const migrations = new URL('../../src/db/migrations/', import.meta.url);

async function fixture(run) {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  const schema = `economics_test_${randomUUID().replaceAll('-', '')}`;
  try {
    await client.query('BEGIN');
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET LOCAL search_path TO ${schema}, public`);
    await client.query(`CREATE TABLE workspaces(id UUID PRIMARY KEY);
      CREATE TABLE users(id UUID PRIMARY KEY);
      CREATE TABLE credit_topups(id UUID PRIMARY KEY, workspace_id UUID NOT NULL REFERENCES workspaces(id));
      CREATE TABLE generation_jobs (
        id UUID PRIMARY KEY, workspace_id UUID NOT NULL REFERENCES workspaces(id),
        model TEXT, provider TEXT, kind TEXT DEFAULT 'image', status TEXT, settlement_status TEXT,
        estimated_cost NUMERIC(20,6), reservation_ledger_id UUID, attempt_count INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT '2026-09-01T00:00:00Z', finished_at TIMESTAMPTZ DEFAULT '2026-10-05T12:00:00Z',
        UNIQUE(workspace_id,id)
      );`);
    for (const name of ['007_credits.sql', '031_generation_cost_events.sql', '032_credit_lots.sql', '033_payment_fee_reconciliation.sql', '036_credit_revenue_simulation.sql','039_generation_provider_account.sql','041_generation_environment.sql','037_provider_billing_imports.sql','038_provider_billing_sku_mappings.sql','040_provider_billing_environments.sql','042_provider_payment_evidence.sql','043_provider_package_allocations.sql','044_provider_request_reconciliations.sql','045_provider_request_cost_corrections.sql','046_provider_package_request_allocations.sql','047_provider_package_request_corrections.sql']) {
      await client.query(await readFile(new URL(name, migrations), 'utf8'));
    }
    const workspaceId = randomUUID();
    await client.query('INSERT INTO workspaces(id) VALUES($1)', [workspaceId]);
    let sequence = 0;
    async function ledger(amount, reason, metadata = {}, workspace = workspaceId) {
      const result = await client.query(`INSERT INTO credit_ledger(workspace_id,amount,balance_after,reason,idempotency_key,metadata)
        VALUES($1,$2,1000,$3,$4,$5::jsonb) RETURNING id`, [workspace, amount, reason, randomUUID(), JSON.stringify(metadata)]);
      return result.rows[0].id;
    }
    async function job({ environment='unclassified',consumed = 5, reserved = 10, model = 'model-a', status = 'succeeded', settlement = 'captured', attempts = 1, workspace = workspaceId, finishedAt = '2026-10-05T12:00:00Z' } = {}) {
      const id = randomUUID();
      const reservation = await ledger(-reserved, 'generation_reservation', {}, workspace);
      await client.query(`INSERT INTO generation_jobs(id,workspace_id,model,provider,status,settlement_status,estimated_cost,reservation_ledger_id,attempt_count,finished_at,environment)
        VALUES($1,$2,$3,'provider-a',$4,$5,$6,$7,$8,$9,$10)`, [id, workspace, model, status, settlement, reserved, reservation, attempts, finishedAt,environment]);
      if (settlement === 'captured' && consumed < reserved) await ledger(reserved - consumed, 'generation_capture', { generationId: id }, workspace);
      return id;
    }
    async function allocation(generationId, { consumed = 5, reserved = 10, source = 'paid', amountIdr = 1000, feeIdr = 100, finalized = true, granted = 10 } = {}) {
      const sourceLedger = ['legacy', 'unknown'].includes(source) ? null : await ledger(granted, source === 'paid' ? 'topup' : 'promo');
      const lot = (await client.query(`INSERT INTO credit_lots(workspace_id,source_ledger_id,source_type,granted_credits,available_credits,amount_idr,payment_fee_idr)
        VALUES($1,$2,$3,$6,0,$4,$5) RETURNING id`, [workspaceId, sourceLedger, source, amountIdr, feeIdr, granted])).rows[0].id;
      await client.query(`INSERT INTO generation_credit_allocations(workspace_id,generation_job_id,lot_id,reserved_credits,consumed_credits,returned_credits,finalized_at)
        VALUES($1,$2,$3,$4,$5,$6,$7)`, [workspaceId, generationId, lot, reserved, finalized ? consumed : 0, finalized ? reserved - consumed : 0, finalized ? new Date('2026-10-05T12:00:00Z') : null]);
      return lot;
    }
    async function event(generationId, { request = randomUUID(), dispatch = randomUUID(), attempt = 1, type = 'succeeded', usd = 0.01, idr = 150, source = 'reported', workspace = workspaceId, account = null, provider = 'provider-a' } = {}) {
      const fingerprint = createHash('sha256').update(String(sequence++)).digest('hex');
      const inserted=await client.query(`INSERT INTO generation_cost_events(workspace_id,generation_job_id,provider,provider_request_id,dispatch_id,worker_attempt,event_type,observation_fingerprint,cost_usd,cost_idr,usd_idr_rate,cost_source,provider_account_id)
        VALUES($1,$2,$13,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id::text`, [workspace, generationId, request, dispatch, attempt, type, fingerprint, usd, idr, idr !== null && usd !== null && usd > 0 ? idr / usd : null, source, account,provider]);
      return inserted.rows[0].id;
    }
    const report = (extra = {}) => getEconomicsReport(client, { workspaceId, since: '2026-10-01T00:00:00Z', until: '2026-10-08T00:00:00Z', ...extra });
    await run({ client, workspaceId, job, allocation, event, report });
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
}

test('economics recognizes finalized sale value and each incurred provider request once', { skip }, async () => {
  await fixture(async ({ job, allocation, event, report }) => {
    const id = await job({ attempts: 3 });
    await allocation(id);
    const failed = randomUUID();
    const success = randomUUID();
    await event(id, { request: failed, attempt: 1, type: 'failed', usd: 0.02, idr: 300 });
    await event(id, { request: success, attempt: 2, usd: 0.03, idr: 450 });
    await event(id, { request: success, attempt: 3, type: 'poll', usd: 0.03, idr: 450 });
    await event(id, { request: success, attempt: 3, type: 'timeout', usd: null, idr: null, source: 'unknown' });
    const result = await report();
    const totals = mapEconomicsTotals(result.totals);
    assert.equal(totals.recognizedRevenueIdr, 500);
    assert.equal(totals.paymentFeeIdr, 50);
    assert.equal(totals.providerRequestCount, 2);
    assert.equal(totals.providerCostIdr, 750);
    assert.equal(totals.providerCostUsd, 0.05);
    assert.equal(totals.contributionIdr, -300);
    assert.equal(totals.coverage.complete, true);
    assert.equal(result.items[0].id, id);
  });
});

test('sandbox-funded failures and other tenants are excluded while paid failures retain expenses', { skip }, async () => {
  await fixture(async ({ client, job, allocation, event, report }) => {
    const sandbox = await job({ consumed: 0, status: 'failed', settlement: 'released' });
    await allocation(sandbox, { consumed: 0, source: 'sandbox', amountIdr: 0, feeIdr: 0 });
    await event(sandbox, { usd: 1, idr: 15000 });
    const failure = await job({ consumed: 0, status: 'failed', settlement: 'released' });
    await allocation(failure, { consumed: 0 });
    await event(failure, { usd: 0.02, idr: 300, type: 'failed' });
    const otherWorkspace = randomUUID();
    await client.query('INSERT INTO workspaces(id) VALUES($1)', [otherWorkspace]);
    const otherJob = await job({ workspace: otherWorkspace });
    await event(otherJob, { workspace: otherWorkspace, usd: 10, idr: 150000 });
    const result = await report();
    const totals = mapEconomicsTotals(result.totals);
    assert.equal(Number(result.excludedSandboxJobs), 1);
    assert.equal(totals.jobCount, 1);
    assert.equal(totals.failedJobCount, 1);
    assert.equal(totals.recognizedRevenueIdr, 0);
    assert.equal(totals.providerCostIdr, 300);
    assert.equal(totals.contributionIdr, -300);
  });
});

test('unknown revenue, fees, FX and attempts never become a fabricated profit', { skip }, async () => {
  await fixture(async ({ job, allocation, event, report }) => {
    const unknownRevenue = await job({ model: 'unknown-revenue', attempts: 2 });
    await allocation(unknownRevenue, { source: 'legacy', amountIdr: null, feeIdr: null });
    await event(unknownRevenue, { usd: 0.01, idr: null });
    const unknownFee = await job({ model: 'unknown-fee' });
    await allocation(unknownFee, { feeIdr: null });
    await event(unknownFee, { request: null, type: 'dispatch', usd: null, idr: null, source: 'unknown' });
    const result = await report();
    const totals = mapEconomicsTotals(result.totals);
    assert.equal(totals.recognizedRevenueIdr, 500);
    assert.equal(totals.providerCostUsd, 0.01);
    assert.equal(totals.coverage.unknownRevenueCredits, 5);
    assert.equal(totals.coverage.unknownPaymentFeeCredits, 10);
    assert.equal(totals.coverage.unknownProviderRequests, 1);
    assert.equal(totals.coverage.unknownFxRequests, 1);
    assert.equal(totals.coverage.missingAttemptCount, 1);
    assert.equal(totals.paymentFeeIdr, null);
    assert.equal(totals.contributionIdr, null);
    assert.equal(totals.marginPercent, null);
  });
});

test('reports use terminal cohort dates and paginate with the same filtered total', { skip }, async () => {
  await fixture(async ({ job, report }) => {
    const inside = await job({ model: 'inside', finishedAt: '2026-10-01T00:00:00Z' });
    await job({ model: 'inside', finishedAt: '2026-10-07T23:59:59Z' });
    await job({ model: 'outside', finishedAt: '2026-10-08T00:00:00Z' });
    const result = await report({ model: 'inside', pageSize: 1, page: 2 });
    assert.equal(Number(result.total), 2);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].id, inside);
    assert.equal(Number(result.totals.job_count), 2);
    assert.equal(result.breakdown.length, 1);
    assert.equal(result.breakdown[0].group_key, 'inside');
    assert.equal(mapEconomicsTotals(result.totals).coverage.unobservedCostJobs, 2);
  });
});

test('partial poll costs remain visibly provisional until a provider terminal observation exists', { skip }, async () => {
  await fixture(async ({ job, allocation, event, report }) => {
    const id = await job();
    await allocation(id);
    const request = randomUUID();
    await event(id, { request, type: 'poll', usd: 0.01, idr: 150 });
    await event(id, { request, type: 'interrupted', usd: 0.01, idr: 150 });
    let totals = mapEconomicsTotals((await report()).totals);
    assert.equal(totals.providerCostIdr, 150);
    assert.equal(totals.coverage.provisionalProviderRequests, 1);
    assert.equal(totals.contributionIdr, null);
    await event(id, { request, type: 'interrupted', usd: 0.01, idr: 150 });
    totals = mapEconomicsTotals((await report()).totals);
    assert.equal(totals.coverage.provisionalProviderRequests, 1);
    assert.equal(totals.contributionIdr, null);
    await event(id, { request, type: 'reconciled', usd: 0.02, idr: 300 });
    totals = mapEconomicsTotals((await report()).totals);
    assert.equal(totals.providerCostIdr, 300);
    assert.equal(totals.coverage.provisionalProviderRequests, 0);
    assert.equal(totals.contributionIdr, 150);
  });
});

test('unfinalized lot reservations cannot recognize a sale and confirmed promo credits have zero revenue', { skip }, async () => {
  await fixture(async ({ job, allocation, event, report }) => {
    const unfinished = await job({ model: 'unfinished' });
    await allocation(unfinished, { finalized: false });
    await event(unfinished);
    const unfinishedTotals = mapEconomicsTotals((await report({ model: 'unfinished' })).totals);
    assert.equal(unfinishedTotals.recognizedRevenueIdr, 0);
    assert.equal(unfinishedTotals.coverage.unknownRevenueCredits, 5);
    assert.equal(unfinishedTotals.coverage.allocationMismatchJobs, 1);
    assert.equal(unfinishedTotals.contributionIdr, null);
    const promo = await job({ model: 'promo' });
    await allocation(promo, { source: 'promo', amountIdr: 0, feeIdr: 0 });
    await event(promo, { usd: 0, idr: 0 });
    const promoTotals = mapEconomicsTotals((await report({ model: 'promo' })).totals);
    assert.equal(promoTotals.recognizedRevenueIdr, 0);
    assert.equal(promoTotals.paymentFeeIdr, 0);
    assert.equal(promoTotals.providerCostIdr, 0);
    assert.equal(promoTotals.coverage.complete, true);
    assert.equal(promoTotals.contributionIdr, 0);
    assert.equal(promoTotals.marginPercent, null);
  });
});

test('specific trial simulation recognizes only consumed credits and preserves real revenue, other promo grants and fee provenance', {skip},async()=>{
 await fixture(async({client,workspaceId,job,allocation,event,report})=>{
  const actor=randomUUID();await client.query('INSERT INTO users(id) VALUES($1)',[actor]);
  const id=await job({model:'trial-simulation',consumed:7.2,reserved:7.2});
  const lot=await allocation(id,{source:'promo',granted:750,consumed:7.2,reserved:7.2,amountIdr:0,feeIdr:0});
  await event(id,{idr:805.58819});
  await client.query('INSERT INTO credit_revenue_simulations(workspace_id,lot_id,assumed_amount_idr,reference_credits,reason,recorded_by_user_id) VALUES($1,$2,149000,750,$3,$4)',[workspaceId,lot,'approved simulation',actor]);
  const unrelated=await job({model:'other-promo',consumed:3,reserved:3});await allocation(unrelated,{source:'promo',consumed:3,reserved:3,amountIdr:0,feeIdr:0});await event(unrelated,{usd:0,idr:0});
  const result=await report(),totals=mapEconomicsTotals(result.totals);
  assert.equal(totals.recognizedRevenueIdr,0);assert.equal(totals.simulation.revenueIdr,1430.4);assert.equal(totals.simulation.creditsConsumed,7.2);
  assert.ok(Math.abs(totals.simulation.contributionIdr-624.81181)<0.000001);
  assert.equal(mapEconomicsTotals((await report({model:'other-promo'})).totals).simulation,null);
  assert.equal((await client.query('SELECT source_type,amount_idr FROM credit_lots WHERE id=$1',[lot])).rows[0].source_type,'promo');
 });
});

 test('Economics isolates production, development and unclassified jobs without rewriting provenance',{skip},async()=>{
  await fixture(async({client,job,allocation,event,report})=>{
    let production;
    for(const environment of ['production','development','unclassified']){
      const id=await job({environment});await allocation(id);await event(id);
      if(environment==='production')production=id;
      assert.equal((await report({environment})).items.length,1);
    }
    for(const environment of ['production','development','unclassified']){
      const result=await report({environment});assert.equal(Number(result.totals.job_count),1);
      assert.equal(Number(result.totals.recognized_revenue_idr),500);
      assert.equal(Number(result.totals.provider_cost_idr),150);
      assert.equal(result.items[0].environment,environment);
    }
    assert.equal(Number((await report({environment:'all'})).totals.job_count),3);
    await client.query('SAVEPOINT environment_edit');
    await assert.rejects(client.query("UPDATE generation_jobs SET environment='development' WHERE id=$1",[production]),/immutable/);
    await client.query('ROLLBACK TO SAVEPOINT environment_edit');
  });
 });

 test('terminal costs from another provider account cannot finalize a provisional request', { skip }, async () => {
  await fixture(async ({ job, allocation, event, report }) => {
    const id = await job();
    await allocation(id);
    const request = randomUUID();
    await event(id, { request, account: '123', type: 'succeeded' });
    await event(id, { request, account: '456', type: 'poll' });
    let totals = mapEconomicsTotals((await report()).totals);
    assert.equal(totals.providerCostIdr, 300);
    assert.equal(totals.coverage.provisionalProviderRequests, 1);
    assert.equal(totals.contributionIdr, null);
    await event(id, { request, account: '456', type: 'succeeded' });
    totals = mapEconomicsTotals((await report()).totals);
    assert.equal(totals.coverage.provisionalProviderRequests, 0);
    assert.equal(totals.contributionIdr, 150);
  });
});

test('evidence categories partition costs and follow corrected package events without claiming invoice finality', { skip },async()=>{
 await fixture(async({client,workspaceId,job,allocation,event,report})=>{
   const id=await job();await allocation(id);
   await event(id,{source:'calculated',usd:0.01,idr:150});
   await event(id,{source:'reported',usd:0.02,idr:300});
   // Metadata/event labels alone cannot claim provider billing evidence.
   await event(id,{type:'reconciled',source:'reported',usd:0.03,idr:450});
   const actor=randomUUID();await client.query('INSERT INTO users VALUES($1)',[actor]);
   const bill=(await client.query(`INSERT INTO provider_billing_imports(provider_account_id,billing_cycle,currency,file_hash,reference,period_start,period_end,row_count,package_row_count,gross_usd,savings_plan_gross_usd,discount_usd,coupon_usd,truncated_usd,pre_tax_usd,tax_usd,total_usd,created_by) VALUES('123','2026-10','USD',$1,'SYNTHETIC-INVOICE','2026-10-01','2026-10-08',1,1,10,0,0,0,0,10,0,10,$2) RETURNING id`,['a'.repeat(64),actor])).rows[0];
   const pay=(await client.query(`INSERT INTO provider_payment_evidence(import_id,kind,amount_usd,amount_idr,paid_at,reference,note,created_by) VALUES($1,'package_purchase',10,150000,'2026-10-08','SYNTHETIC-PAY','Verified synthetic provider payment',$2) RETURNING id::text`,[bill.id,actor])).rows[0];
   const invoicePayment=(await client.query(`INSERT INTO provider_payment_evidence(import_id,kind,amount_usd,amount_idr,paid_at,reference,note,created_by) VALUES($1,'invoice_payment',1,15000,'2026-10-08','SYNTHETIC-INVOICE-PAY','Verified synthetic invoice payment',$2) RETURNING id::text`,[bill.id,actor])).rows[0];
   const sku=(await client.query(`INSERT INTO provider_package_allocations(import_id,payment_evidence_id,group_key,usage_unit,total_quota,consumed_quota,allocated_usd,allocated_idr,note,created_by) VALUES($1,$2,$3,'Piece',250,3,0.12,1800,'Verified synthetic package quota',$4) RETURNING id::text`,[bill.id,pay.id,'b'.repeat(64),actor])).rows[0];
   const matchedRequest=randomUUID(),packagedRequest=randomUUID();
   async function linked(request,costEvent,paymentId=pay.id,usd='0.04') {
     return (await client.query(`INSERT INTO provider_request_reconciliations(import_id,payment_evidence_id,cost_event_id,provider_account_id,provider_request_id,group_key,cost_usd,evidence_reference,note,created_by) VALUES($1,$2,$3,'123',$4,$5,$7,'SYNTHETIC-REQUEST','Verified synthetic request cost',$6) RETURNING id::text`,[bill.id,paymentId,costEvent,request,'b'.repeat(64),actor,usd])).rows[0];
   }
   const matchedEvent=await event(id,{request:matchedRequest,provider:'byteplus',account:'123',type:'reconciled',usd:0.04,idr:600});
   await linked(matchedRequest,matchedEvent,invoicePayment.id);
   const packageEvent=await event(id,{request:packagedRequest,provider:'byteplus',account:'123',type:'reconciled',source:'calculated',usd:0.04,idr:600});
   const parent=await linked(packagedRequest,packageEvent);
   await client.query('INSERT INTO provider_package_request_allocations VALUES($1,$2,1)',[parent.id,sku.id]);
   let data=await report(),totals=mapEconomicsTotals(data.totals);
   assert.equal(totals.costEvidence.status,'mixed');
   assert.deepEqual(totals.costEvidence.estimated,{requests:1,knownCostIdr:150});
   assert.deepEqual(totals.costEvidence.providerReported,{requests:2,knownCostIdr:750});
   assert.deepEqual(totals.costEvidence.matched,{requests:1,knownCostIdr:600});
   assert.deepEqual(totals.costEvidence.packageMatched,{requests:1,knownCostIdr:600});
   assert.equal(totals.providerRequestCount,5);assert.equal(totals.providerCostIdr,2100);
   assert.equal(mapEconomicsTotals(data.breakdown[0]).costEvidence.status,'mixed');
   assert.equal(mapEconomicsTotals(data.items[0]).costEvidence.packageMatched.requests,1);
   const correctedEvent=await event(id,{request:packagedRequest,provider:'byteplus',account:'123',type:'reconciled',source:'calculated',usd:0,idr:0});
   const correction=(await client.query(`INSERT INTO provider_request_cost_corrections(reconciliation_id,previous_cost_event_id,cost_event_id,payment_evidence_id,group_key,cost_usd,evidence_reference,note,created_by) VALUES($1,$2,$3,$4,$5,0,'CANCEL-PACKAGE','Provider corrected package usage to zero',$6) RETURNING id::text`,[parent.id,packageEvent,correctedEvent,pay.id,'b'.repeat(64),actor])).rows[0];
   await client.query('INSERT INTO provider_package_request_corrections VALUES($1,$2,1,0)',[correction.id,sku.id]);
   totals=mapEconomicsTotals((await report()).totals);
   assert.equal(totals.providerCostIdr,1500);assert.equal(totals.providerRequestCount,5);
   assert.deepEqual(totals.costEvidence.packageMatched,{requests:1,knownCostIdr:0});
   assert.equal(totals.costEvidence.estimated.requests+totals.costEvidence.providerReported.requests+totals.costEvidence.matched.requests+totals.costEvidence.packageMatched.requests,5);
   const verifiedJob=await job({model:'verified'});await allocation(verifiedJob);
   const verifiedRequest=randomUUID();
   const verifiedEvent=await event(verifiedJob,{request:verifiedRequest,provider:'byteplus',account:'123',type:'reconciled',usd:0,idr:0});
   await linked(verifiedRequest,verifiedEvent,invoicePayment.id,'0');
   const unknownJob=await job({model:'unknown'});await allocation(unknownJob);
   const fxJob=await job({model:'missing-fx'});await allocation(fxJob);await event(fxJob,{usd:0.01,idr:null});
   const estimateJob=await job({model:'estimate-only'});await allocation(estimateJob);await event(estimateJob,{source:'calculated'});
   const sandboxJob=await job({model:'sandbox'});await allocation(sandboxJob,{source:'sandbox',amountIdr:0,feeIdr:0});await event(sandboxJob);
   const all=await report();assert.equal(Number(all.total),5);
   assert.equal(Number(all.attention.total_jobs),5);assert.equal(Number(all.attention.attention_jobs),4);
   assert.equal(Number(all.attention.provider_evidence),3);assert.equal(Number(all.attention.unknown_fx),1);
   assert.equal(Number(all.attention.unobserved_cost),1);assert.equal(Number(all.attention.missing_attempt),1);
   assert.ok(Object.entries(all.attention).filter(([key])=>!['total_jobs','attention_jobs'].includes(key)).reduce((sum,[,value])=>sum+Number(value),0)>Number(all.attention.attention_jobs));
   const needs=await report({costStatus:'needs_reconciliation'});
   assert.equal(Number(needs.total),4);assert.equal(Number(needs.totals.job_count),4);
   assert.equal(Number(needs.totals.provider_cost_idr),1650);
   assert.deepEqual(new Set(needs.items.map(row=>row.id)),new Set([id,unknownJob,fxJob,estimateJob]));
   assert.ok(needs.breakdown.every(row=>!['verified','sandbox'].includes(row.group_key)));
   const next=await report({costStatus:'needs_reconciliation',page:2,pageSize:1});
   assert.deepEqual(next.attention,needs.attention);
   assert.equal(Number(next.attention.attention_jobs),4);
   assert.equal(Number(next.total),4);assert.equal(next.items.length,1);assert.equal(next.items[0].id,needs.items[1].id);
   assert.equal(Number(next.totals.provider_cost_idr),Number(needs.totals.provider_cost_idr));
   const verified=await report({costStatus:'reconciled'});
   assert.equal(Number(verified.total),1);assert.equal(verified.items[0].id,verifiedJob);
   assert.equal(mapEconomicsTotals(verified.totals).costEvidence.status,'reconciled');
   const incomplete=await report({costStatus:'incomplete'});
   assert.deepEqual(new Set(incomplete.items.map(row=>row.id)),new Set([unknownJob,fxJob]));
   const estimated=await report({costStatus:'estimated'});
   assert.deepEqual(new Set(estimated.items.map(row=>row.id)),new Set([id,estimateJob]));
   assert.equal(Number(estimated.totals.provider_cost_idr),1650);
   const reported=await report({costStatus:'provider_reported'});
   assert.deepEqual(new Set(reported.items.map(row=>row.id)),new Set([id,fxJob]));
   const empty=await report({costStatus:'needs_reconciliation',model:'verified'});
   assert.equal(Number(empty.total),0);assert.equal(Number(empty.totals.job_count),0);assert.equal(empty.breakdown.length,0);
   assert.equal(Number(empty.attention.attention_jobs),0);assert.equal(Number(empty.attention.total_jobs),0);
   // Fully evidenced provider costs can still have independent revenue/fee problems.
   const fxOnly=await report({issue:'unknown_fx',costStatus:'needs_reconciliation',page:2,pageSize:1});
   assert.equal(Number(fxOnly.total),1);assert.equal(Number(fxOnly.attention.total_jobs),1);assert.equal(fxOnly.items.length,0);
   assert.equal(Number(fxOnly.attention.unknown_fx),1);
   const unmatched=await report({issue:'provider_evidence'});
   assert.equal(Number(unmatched.total),3);assert.equal(Number(unmatched.totals.provider_cost_idr),1650);
   assert.equal(Number((await report({issue:'any'})).total),4);
   assert.equal(Number((await report({model:'verified',issue:'any'})).total),0);
   const financeJob=await job({model:'finance-only'});await allocation(financeJob,{source:'legacy',amountIdr:null,feeIdr:null});
   const financeRequest=randomUUID();const financeEvent=await event(financeJob,{request:financeRequest,provider:'byteplus',account:'123',type:'reconciled',usd:0,idr:0});
   await linked(financeRequest,financeEvent,invoicePayment.id,'0');
   const finance=await report({model:'finance-only',costStatus:'reconciled'});
   assert.equal(Number(finance.attention.attention_jobs),1);assert.equal(Number(finance.attention.unknown_revenue),1);assert.equal(Number(finance.attention.unknown_fee),1);assert.equal(Number(finance.attention.provider_evidence),0);
   const feeFilter=await report({issue:'unknown_fee',costStatus:'reconciled'});
   assert.deepEqual(feeFilter.items.map(row=>row.id),[financeJob]);assert.equal(Number(feeFilter.attention.unknown_fee),1);
   assert.equal(Number((await report({issue:'unknown_revenue',costStatus:'reconciled'})).total),1);
   assert.equal(Number((await report({issue:'unobserved_cost'})).total),1);
   assert.equal(Number((await report({issue:'missing_attempt'})).total),1);
   const failed=await job({model:'failed-but-complete',status:'failed',consumed:0});await allocation(failed,{consumed:0,source:'promo',amountIdr:0,feeIdr:0});
   const failedRequest=randomUUID();const failedEvent=await event(failed,{request:failedRequest,provider:'byteplus',account:'123',type:'reconciled',usd:0,idr:0});
   await linked(failedRequest,failedEvent,invoicePayment.id,'0');
   const failedReport=await report({model:'failed-but-complete'});assert.equal(Number(failedReport.totals.failed_job_count),1);assert.equal(Number(failedReport.attention.attention_jobs),0);
   const unknownCostJob=await job({model:'unknown-cost'});await allocation(unknownCostJob);await event(unknownCostJob,{usd:null,idr:null,source:'unknown'});
   assert.deepEqual((await report({issue:'unknown_provider'})).items.map(row=>row.id),[unknownCostJob]);
   const pendingJob=await job({model:'pending',settlement:'pending',consumed:0});await allocation(pendingJob,{finalized:false});await event(pendingJob,{type:'poll'});
   assert.deepEqual((await report({issue:'pending_settlement'})).items.map(row=>row.id),[pendingJob]);
   assert.deepEqual((await report({issue:'provisional_cost'})).items.map(row=>row.id),[pendingJob]);
   const mismatchJob=await job({model:'mismatch'});await allocation(mismatchJob,{consumed:3});await event(mismatchJob);
   assert.deepEqual((await report({issue:'allocation_mismatch'})).items.map(row=>row.id),[mismatchJob]);
   const allIssues=await report({issue:'any',pageSize:1});assert.equal(Number(allIssues.total),8);assert.equal(Number(allIssues.attention.attention_jobs),8);assert.equal(allIssues.items.length,1);
   const otherWorkspace=randomUUID();await client.query('INSERT INTO workspaces VALUES($1)',[otherWorkspace]);await job({workspace:otherWorkspace,model:'foreign-job'});
   const foreign=await report({model:'foreign-job'});assert.equal(Number(foreign.attention.total_jobs),0);
   const exporter=createEconomicsService({env:{NEXOCLIP_OPERATOR_USER_IDS:actor},repository:input=>getEconomicsReport(client,input),now:()=>new Date('2026-10-08T00:00:00Z')});
   const exported=await exporter.exportIssues({workspaceId,userId:actor,filters:{from:'2026-10-01',to:'2026-10-07',issue:'all',page:2,pageSize:1}});
   const rows=exported.csv.split('\r\n').filter(line=>line.startsWith('"job",'));
   assert.equal(rows.length,8);
   for(const jobId of [id,unknownJob,fxJob,estimateJob,financeJob,unknownCostJob,pendingJob,mismatchJob])assert.ok(exported.csv.includes(jobId));
   for(const jobId of [verifiedJob,sandboxJob,failed])assert.ok(!exported.csv.includes(jobId));
   assert.ok(!exported.csv.includes('foreign-job'));
   const feesCsv=await exporter.exportIssues({workspaceId,userId:actor,filters:{from:'2026-10-01',to:'2026-10-07',issue:'unknown_fee',costStatus:'reconciled'}});
   assert.ok(feesCsv.csv.includes(financeJob));assert.ok(!feesCsv.csv.includes(mismatchJob));
   const before=(await client.query('SELECT count(*)::int AS n FROM generation_cost_events')).rows[0].n;
   await exporter.exportIssues({workspaceId,userId:actor,filters:{from:'2026-10-01',to:'2026-10-07',model:'verified'}});
   assert.equal((await client.query('SELECT count(*)::int AS n FROM generation_cost_events')).rows[0].n,before);



 });
});
