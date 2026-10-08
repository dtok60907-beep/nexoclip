import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { createProviderBillingRepository } from '../../src/repositories/providerBillingRepository.js';
import { createProviderBillingService, billingSkuKey } from '../../src/services/providerBillingService.js';

test('supplier evidence: migrations, concurrent import, overlap denial, exact money, append-only reviews and no credit mutation',
  {skip:!process.env.PROVIDER_BILLING_TEST_DATABASE_URL},async()=>{
  const connectionString=process.env.PROVIDER_BILLING_TEST_DATABASE_URL;
  const root=new pg.Pool({connectionString});const schema=`provider_bill_${randomUUID().replaceAll('-','')}`;
  await root.query(`CREATE SCHEMA ${schema}`);
  const pool=new pg.Pool({connectionString,options:`-c search_path=${schema},public`});
  try{
    await pool.query(`CREATE TABLE users(id UUID PRIMARY KEY);CREATE TABLE workspaces(id UUID PRIMARY KEY);
      CREATE TABLE generation_jobs(id UUID PRIMARY KEY,workspace_id UUID NOT NULL REFERENCES workspaces(id),model TEXT NOT NULL,environment TEXT NOT NULL DEFAULT 'development',UNIQUE(workspace_id,id));`);
    for(const name of ['031_generation_cost_events.sql','037_provider_billing_imports.sql','038_provider_billing_sku_mappings.sql','039_generation_provider_account.sql','040_provider_billing_environments.sql','042_provider_payment_evidence.sql','043_provider_package_allocations.sql','044_provider_request_reconciliations.sql','045_provider_request_cost_corrections.sql','046_provider_package_request_allocations.sql','047_provider_package_request_corrections.sql'])await pool.query(await readFile(new URL(`../../src/db/migrations/${name}`,import.meta.url),'utf8'));
    const operator=randomUUID(),workspace=randomUUID(),job=randomUUID(),dispatch=randomUUID();
    await pool.query('INSERT INTO users VALUES($1)',[operator]);await pool.query('INSERT INTO workspaces VALUES($1)',[workspace]);
    await pool.query('INSERT INTO generation_jobs(id,workspace_id,model) VALUES($1,$2,$3)',[job,workspace,'synthetic-model']);
    await pool.query(`INSERT INTO generation_cost_events(workspace_id,generation_job_id,provider,dispatch_id,worker_attempt,event_type,observation_fingerprint,cost_source,created_at)
      VALUES($1,$2,'byteplus',$3,1,'dispatch',$4,'unknown','2026-01-01T02:00:00Z')`,[workspace,job,dispatch,'1'.repeat(64)]);
    const parsed={providerAccountId:'123',billingCycle:'2026-01',currency:'USD',fileHash:'a'.repeat(64),periodStart:'2026-01-01T00:00:00Z',periodEnd:'2026-01-02T00:00:00Z',warnings:[],
      totals:{savingsPlanGrossUsd:'0.00000000',grossUsd:'1.10000001',discountUsd:'0.00000000',couponUsd:'0.00000000',truncatedUsd:'0.00000000',preTaxUsd:'1.00000001',taxUsd:'0.10000000',totalUsd:'1.10000001',packageUsageRowCount:1},
      rows:[{lineNumber:2,identityHash:'c'.repeat(64),configuration:'Test model',billingUnit:'Piece',usageUnit:'Piece',usage:'1.000000000000',packageUsage:'0.000000000001',preTaxUsd:'1.00000001',savingsPlanGrossUsd:'0.00000000',totalUsd:'1.10000001'}]};
    const repository=createProviderBillingRepository(pool);
    const service=createProviderBillingService({repository,env:{NEXOCLIP_OPERATOR_USER_IDS:operator},parse:()=>parsed,catalog:()=>['synthetic-model']});
    const input={action:'import',csv:'fixture',expectedHash:parsed.fileHash,reference:'TEST-INVOICE'};
    const outcomes=await Promise.all(Array.from({length:4},()=>service.mutate({userId:operator,input})));
    const id=outcomes[0].id;assert.ok(outcomes.every(r=>r.id===id));assert.equal(outcomes.filter(r=>!r.replayed).length,1);
    let report=await service.read({userId:operator,id});
    assert.equal(report.bill.total_usd,'1.10000001');assert.equal(report.groups[0].package_usage,'0.000000000001');
    assert.equal(report.bill.environment,'development');
    const payment={action:'payment-evidence',id,kind:'invoice_payment',amountUsd:'0.4',amountIdr:'6800',paidAt:'2026-10-08T00:00:00.000Z',reference:'BANK-1',note:'Invoice bank settlement'};
    const paymentResults=await Promise.all([service.mutate({userId:operator,input:payment}),service.mutate({userId:operator,input:payment})]);
    assert.equal(paymentResults.filter(row=>!row.replayed).length,1);
    await assert.rejects(service.mutate({userId:operator,input:{...payment,amountIdr:'7000'}}),{status:409});
    await assert.rejects(service.mutate({userId:operator,input:{...payment,reference:'BANK-2',amountUsd:'1'}}),{status:409});
    await service.mutate({userId:operator,input:{...payment,kind:'package_purchase',reference:'PACKAGE-1',amountUsd:'100',amountIdr:'1700000',note:'Separate prepaid package cost; allocation pending'}});
    const payments=await service.read({userId:operator,id});
    assert.equal(payments.paymentEvidence.length,2);
    const allocation={action:'allocate-package',id,paymentId:payments.paymentEvidence.find(row=>row.kind==='package_purchase').id,groupKey:payments.groups[0].groupKey,totalQuota:'1',consumedQuota:'0.000000000001',note:'Quota supported by synthetic package evidence'};
    await service.mutate({userId:operator,input:allocation});
    assert.equal((await service.read({userId:operator,id})).packageAllocations.length,1);
    await service.mutate({userId:operator,input:allocation});
    await assert.rejects(service.mutate({userId:operator,input:{...allocation,note:'Different allocation evidence'}}),error=>error.status===409);

    assert.equal(payments.paymentEvidence.find(row=>row.kind==='invoice_payment').effectiveFx,'17000.000000');
    assert.equal((await repository.list(1,20,'production')).total,0);
    assert.equal(report.groups[0].effective_rate_usd,'1.000000010000');
    assert.equal(report.groups[0].non_package_usage,'0.999999999999');
    assert.equal(report.groups[0].payg_rate_usd,null);
    assert.equal(report.comparison.unknownRequests,1);assert.equal(report.comparison.allocationStatus,'unallocated');
    const review={action:'review',id,note:'Account allocation still pending',expectedComparisonHash:report.comparison.hash};
    await Promise.all(Array.from({length:3},()=>service.mutate({userId:operator,input:review})));
    assert.equal((await repository.detail(id)).reviews.length,1);
    const mapping={action:'map-sku',id,groupKey:billingSkuKey(report.groups[0]),model:'synthetic-model',note:'Matched synthetic SKU',expectedMappingId:''};
    const edits=await Promise.allSettled([service.mutate({userId:operator,input:mapping}),service.mutate({userId:operator,input:mapping})]);
    assert.equal(edits.filter(v=>v.status==='fulfilled').length,1);
    assert.equal(edits.find(v=>v.status==='rejected').reason.status,409);
    const mapped=await service.read({userId:operator,id});
    assert.equal(mapped.groups[0].mapping.model,'synthetic-model');
    assert.equal(mapped.modelSummary.mappedPreTaxUsd,'1.00000001');
    assert.equal(mapped.modelSummary.unmappedSkuCount,0);
    assert.notEqual(mapped.comparison.hash,report.comparison.hash);
    await assert.rejects(service.mutate({userId:operator,input:review}),{status:409});
    await service.mutate({userId:operator,input:{...mapping,model:null,expectedMappingId:mapped.groups[0].mapping.id}});
    assert.equal((await service.read({userId:operator,id})).groups[0].mapping.model,null);
    assert.equal((await service.read({userId:operator,id})).modelSummary.unmappedPreTaxUsd,'1.00000001');
    await pool.query(`INSERT INTO generation_cost_events(workspace_id,generation_job_id,provider,provider_request_id,dispatch_id,worker_attempt,event_type,observation_fingerprint,cost_source,cost_usd,created_at)
      VALUES($1,$2,'byteplus','test-request',$3,1,'succeeded',$4,'reported',0.60000001,'2026-01-03T02:00:00Z')`,[workspace,job,dispatch,'2'.repeat(64)]);
    // Observation arrives outside billing window; original dispatch still selects it.
    report=await service.read({userId:operator,id});assert.equal(report.comparison.knownCostUsd,'0.60000001');assert.equal(report.comparison.differenceUsd,'0.40000000');
    await assert.rejects(service.mutate({userId:operator,input:review}),{status:409});
    const overlap=createProviderBillingService({repository,env:{NEXOCLIP_OPERATOR_USER_IDS:operator},parse:()=>({...parsed,fileHash:'b'.repeat(64)})});
    await assert.rejects(overlap.mutate({userId:operator,input:{...input,expectedHash:'b'.repeat(64),reference:'OTHER'}}),{status:409});
    // No incomplete batch survives a unique row conflict on another export.
    const repeatedRow=createProviderBillingService({repository,env:{NEXOCLIP_OPERATOR_USER_IDS:operator},parse:()=>({...parsed,fileHash:'d'.repeat(64),periodStart:'2026-01-03T00:00:00Z',periodEnd:'2026-01-04T00:00:00Z'})});
    await assert.rejects(repeatedRow.mutate({userId:operator,input:{...input,expectedHash:'d'.repeat(64),reference:'OTHER'}}),{code:'23505'});
    assert.equal((await repository.list(1,20)).total,1);
    for(const account of ['123','456']) await pool.query(`INSERT INTO generation_cost_events
      (workspace_id,generation_job_id,provider,provider_account_id,provider_request_id,dispatch_id,worker_attempt,event_type,observation_fingerprint,cost_source,cost_usd,created_at)
      VALUES($1,$2,'byteplus',$3,$4,$5,1,'succeeded',$6,'reported',0.1,'2026-01-01T03:00:00Z')`,
      [workspace,job,account,`request-${account}`,randomUUID(),account.padEnd(64,'0')]);
    const accountReport=await service.read({userId:operator,id});
    assert.equal(accountReport.accountCoverage.matching_account_requests,1);
    assert.equal(accountReport.accountCoverage.other_account_requests,1);
    assert.equal(accountReport.accountCoverage.unidentified_account_requests,1);
    assert.equal(accountReport.accountComparison.knownCostUsd,'0.10000000');
    assert.equal(accountReport.accountComparison.requests,1);
    assert.equal(accountReport.requestInventory.rows.length,3);
    assert.equal(accountReport.requestInventory.truncated,false);
    assert.equal(accountReport.requestInventory.rows.find(row=>row.provider_request_id==='request-123').account_match,'matching');
    assert.equal(accountReport.requestInventory.rows.find(row=>row.provider_request_id==='test-request').time_is_fallback,false);
    assert.ok(accountReport.requestInventory.rows.every(row=>row.workspace_id===workspace && row.generation_job_id===job));
    const missingAccount=accountReport.requestInventory.rows.find(row=>!row.provider_account_id);
    assert.equal(missingAccount.readiness.canReconcile,false);
    assert.ok(missingAccount.readiness.reasons.some(reason=>reason.code==='missing_account'));

    for(const table of ['provider_billing_imports','provider_billing_lines','provider_billing_reviews','provider_billing_sku_mappings','provider_billing_environments','provider_payment_evidence','provider_package_allocations'])await assert.rejects(pool.query(`DELETE FROM ${table}`),/append-only/);
    assert.equal((await pool.query('SELECT count(*)::integer AS n FROM generation_cost_events')).rows[0].n,4);
    const later={...parsed,fileHash:'e'.repeat(64),periodStart:'2026-01-03T00:00:00Z',periodEnd:'2026-01-04T00:00:00Z',rows:[{...parsed.rows[0],identityHash:'f'.repeat(64),packageUsage:'0.000000000000'}]};
    const matchingService=createProviderBillingService({repository,env:{NEXOCLIP_OPERATOR_USER_IDS:operator},parse:()=>later,catalog:()=>['synthetic-model']});
    const laterBill=await matchingService.mutate({userId:operator,input:{...input,expectedHash:later.fileHash,reference:'REQUEST-INVOICE'}});
    const laterReport=await matchingService.read({userId:operator,id:laterBill.id});
    const groupKey=laterReport.groups[0].groupKey;
    await matchingService.mutate({userId:operator,input:{action:'map-sku',id:laterBill.id,groupKey,expectedMappingId:'',model:'synthetic-model',note:'Synthetic matching SKU evidence'}});
    await matchingService.mutate({userId:operator,input:{...payment,id:laterBill.id,reference:'REQUEST-PAYMENT'}});
    const laterPayment=(await matchingService.read({userId:operator,id:laterBill.id})).paymentEvidence[0];
    const laterDispatch=randomUUID();
    await pool.query(`INSERT INTO generation_cost_events(workspace_id,generation_job_id,provider,provider_account_id,dispatch_id,worker_attempt,event_type,observation_fingerprint,cost_source,created_at)
      VALUES($1,$2,'byteplus','123',$3,1,'dispatch',$4,'unknown','2026-01-03T02:00:00Z')`,[workspace,job,laterDispatch,'7'.repeat(64)]);
    const observation=(await pool.query(`INSERT INTO generation_cost_events(workspace_id,generation_job_id,provider,provider_account_id,provider_request_id,dispatch_id,worker_attempt,event_type,observation_fingerprint,cost_source,cost_usd,created_at)
      VALUES($1,$2,'byteplus','123','matched-request',$3,1,'succeeded',$4,'calculated',0.5,'2026-01-03T02:01:00Z') RETURNING id::text`,[workspace,job,laterDispatch,'8'.repeat(64)])).rows[0];
    const reconcile={action:'reconcile-request',id:laterBill.id,groupKey,observationId:observation.id,paymentId:laterPayment.id,costUsd:'0.4',evidenceReference:'CHARGE-REQ-1',note:'Verified synthetic request charge evidence'};
    const results=await Promise.all([matchingService.mutate({userId:operator,input:reconcile}),matchingService.mutate({userId:operator,input:reconcile})]);
    assert.equal(results.filter(row=>!row.replayed).length,1);
    await assert.rejects(matchingService.mutate({userId:operator,input:{...reconcile,costUsd:'0.6'}}),{status:409});
    const reconciled=(await matchingService.read({userId:operator,id:laterBill.id})).requestReconciliations;
    assert.equal(reconciled.length,1);assert.equal(reconciled[0].cost_usd,'0.40000000');assert.equal(reconciled[0].cost_idr,'6800.000000');
    const reconciledInventory=await matchingService.read({userId:operator,id:laterBill.id,requestStatus:'reconciled'});
    assert.equal(reconciledInventory.requestInventory.status,'reconciled');
    assert.equal(reconciledInventory.requestInventory.pagination.total,1);
    assert.equal(reconciledInventory.requestInventory.rows[0].provider_request_id,'matched-request');
    assert.equal(reconciledInventory.requestInventory.rows[0].reconciliation_status,'reconciled');
    assert.deepEqual(reconciledInventory.requestInventory.statusCounts,{unreconciled:0,reconciled:1,corrected:0});
    assert.equal((await matchingService.read({userId:operator,id:laterBill.id,requestStatus:'corrected'})).requestInventory.pagination.total,0);
    await pool.query(`INSERT INTO generation_cost_events(workspace_id,generation_job_id,provider,provider_account_id,provider_request_id,dispatch_id,worker_attempt,event_type,observation_fingerprint,cost_source,cost_usd)
      VALUES($1,$2,'byteplus','123','matched-request',$3,1,'poll',$4,'calculated',0.9)`,[workspace,job,laterDispatch,'9'.repeat(64)]);
    const latest=(await pool.query("SELECT cost_usd::text FROM latest_generation_cost_observations WHERE provider_request_id='matched-request'")).rows[0];
    assert.equal(latest.cost_usd,'0.40000000');
    await assert.rejects(pool.query('DELETE FROM provider_request_reconciliations'),/append-only/);
    const correction={action:'correct-request-cost',id:laterBill.id,reconciliationId:reconciled[0].id,previousCostEventId:reconciled[0].current_cost_event_id,groupKey,paymentId:laterPayment.id,costUsd:'0.6',evidenceReference:'CORRECTION-1',note:'Provider confirmed corrected synthetic request cost'};
    const changes=await Promise.all([matchingService.mutate({userId:operator,input:correction}),matchingService.mutate({userId:operator,input:correction})]);
    assert.equal(changes.filter(row=>!row.replayed).length,1);
    await assert.rejects(matchingService.mutate({userId:operator,input:{...correction,costUsd:'0.7'}}),{status:409});
    await assert.rejects(matchingService.mutate({userId:operator,input:{...correction,reconciliationId:'999999'}}),{status:404});
    const corrected=await matchingService.read({userId:operator,id:laterBill.id});
    assert.equal(corrected.requestReconciliations[0].cost_usd,'0.60000000');
    assert.equal(corrected.requestReconciliations[0].cost_idr,'10200.000000');
    assert.equal(corrected.requestReconciliations[0].original_cost_usd,'0.40000000');
    assert.equal(corrected.requestCorrectionHistory[0].previous_cost_usd,'0.40000000');
    assert.equal(corrected.requestCorrectionHistory[0].created_by,operator);
    await assert.rejects(matchingService.mutate({userId:operator,input:{...correction,previousCostEventId:corrected.requestReconciliations[0].current_cost_event_id,costUsd:'1.00000002'}}),/melebihi/);
    const zero={...correction,previousCostEventId:corrected.requestReconciliations[0].current_cost_event_id,costUsd:'0',evidenceReference:'CORRECTION-ZERO',note:'Provider confirms this request incurred no charge'};
    await matchingService.mutate({userId:operator,input:zero});
    const final=await matchingService.read({userId:operator,id:laterBill.id});
    assert.equal(final.requestCorrectionHistory.length,2);
    assert.equal((await matchingService.mutate({userId:operator,input:correction})).replayed,true);
    assert.equal((await matchingService.read({userId:operator,id:laterBill.id})).requestReconciliations[0].cost_usd,'0.00000000');
    assert.equal(final.requestReconciliations[0].cost_usd,'0.00000000');
    assert.equal(final.requestReconciliations[0].cost_idr,'0.000000');
    assert.equal((await pool.query("SELECT cost_usd::text FROM latest_generation_cost_observations WHERE provider_request_id='matched-request'")).rows[0].cost_usd,'0.00000000');
    assert.equal((await pool.query('SELECT cost_usd::text FROM generation_cost_events WHERE id=$1',[reconciled[0].cost_event_id])).rows[0].cost_usd,'0.40000000');
    await assert.rejects(pool.query('DELETE FROM provider_request_cost_corrections'),/append-only/);
    await assert.rejects(matchingService.mutate({userId:randomUUID(),input:zero}),{status:403});
    const pagedRows=Array.from({length:110},(_,index)=>({dispatch:randomUUID(),request:`paged-request-${String(index+1).padStart(3,'0')}`}));
    await pool.query(`INSERT INTO generation_cost_events(workspace_id,generation_job_id,provider,provider_account_id,provider_request_id,dispatch_id,worker_attempt,event_type,observation_fingerprint,cost_source,created_at)
      SELECT $1,$2,'byteplus','123',CASE WHEN event='dispatch' THEN NULL ELSE request END,dispatch::uuid,1,event,CASE WHEN event='dispatch' THEN $4 ELSE $5 END,'unknown','2026-01-03T03:00:00Z'
      FROM jsonb_to_recordset($3::jsonb) AS records(dispatch text,request text) CROSS JOIN unnest(ARRAY['dispatch','submitted']) AS event`,[workspace,job,JSON.stringify(pagedRows),'a'.repeat(64),'b'.repeat(64)]);
    const firstPage=await matchingService.read({userId:operator,id:laterBill.id});
    const secondPage=await matchingService.read({userId:operator,id:laterBill.id,requestPage:2});
    const thirdPage=await matchingService.read({userId:operator,id:laterBill.id,requestPage:3});
    assert.equal(firstPage.requestInventory.pagination.total,111);assert.equal(firstPage.requestInventory.pagination.totalPages,3);
    assert.ok(firstPage.requestInventory.rows.every(row=>row.readiness.canReconcile));
    assert.ok(firstPage.requestInventory.rows.every(row=>row.readiness.eligibleGroupKeys.includes(groupKey)));
    const correctedPrerequisites=thirdPage.requestInventory.rows.find(row=>row.provider_request_id==='matched-request').readiness;
    assert.equal(correctedPrerequisites.canReconcile,false);
    assert.ok(correctedPrerequisites.reasons.some(reason=>reason.code==='use_correction'));

    assert.equal(firstPage.requestInventory.rows.length,50);assert.equal(secondPage.requestInventory.rows.length,50);assert.equal(thirdPage.requestInventory.rows.length,11);
    const allIds=[...firstPage.requestInventory.rows,...secondPage.requestInventory.rows,...thirdPage.requestInventory.rows].map(row=>row.observation_id);
    assert.equal(new Set(allIds).size,111);
    assert.ok(thirdPage.requestInventory.rows.some(row=>row.provider_request_id==='matched-request'));
    assert.equal(firstPage.comparison.hash,thirdPage.comparison.hash);
    assert.equal(firstPage.comparison.requests,thirdPage.comparison.requests);
    assert.equal(firstPage.comparison.knownCostUsd,thirdPage.comparison.knownCostUsd);
    assert.deepEqual(firstPage.comparison.rows,thirdPage.comparison.rows);
    assert.equal(firstPage.requestInventory.status,'all');
    assert.deepEqual(firstPage.requestInventory.statusCounts,{unreconciled:110,reconciled:0,corrected:1});
    // Each read gets a new timestamp; comparison evidence and hashes remain invariant.
    const comparisonFacts=({observedAt,...facts})=>facts;
    for(const [status,total] of [['all',111],['unreconciled',110],['reconciled',0],['corrected',1]]) {
      const filtered=await matchingService.read({userId:operator,id:laterBill.id,requestStatus:status});
      assert.equal(filtered.requestInventory.status,status);
      assert.equal(filtered.requestInventory.pagination.total,total);
      assert.deepEqual(filtered.requestInventory.statusCounts,firstPage.requestInventory.statusCounts);
      if(status!=='all')assert.ok(filtered.requestInventory.rows.every(row=>row.reconciliation_status===status));
      assert.deepEqual(comparisonFacts(filtered.comparison),comparisonFacts(firstPage.comparison));
      assert.deepEqual(comparisonFacts(filtered.accountComparison),comparisonFacts(firstPage.accountComparison));
      assert.deepEqual(filtered.accountCoverage,firstPage.accountCoverage);
      assert.deepEqual(filtered.modelSummary,firstPage.modelSummary);
      if(status==='corrected') {
        assert.equal(filtered.requestInventory.rows.length,1);
        assert.equal(filtered.requestInventory.rows[0].provider_request_id,'matched-request');
        assert.equal(filtered.requestInventory.rows[0].cost_usd,'0.00000000');
      }
    }
    const unreconciledLastPage=await matchingService.read({userId:operator,id:laterBill.id,requestPage:3,requestStatus:'unreconciled'});
    assert.equal(unreconciledLastPage.requestInventory.pagination.total,110);
    assert.equal(unreconciledLastPage.requestInventory.pagination.totalPages,3);
    assert.equal(unreconciledLastPage.requestInventory.rows.length,10);
    assert.ok(unreconciledLastPage.requestInventory.rows.every(row=>row.reconciliation_status==='unreconciled'));
    const search=await matchingService.read({userId:operator,id:laterBill.id,requestSearch:'  PAGED-REQUEST-001  '});
    assert.equal(search.requestInventory.pagination.total,1);assert.equal(search.requestInventory.rows[0].provider_request_id,'paged-request-001');
    const searchedUnreconciled=await matchingService.read({userId:operator,id:laterBill.id,requestSearch:'  PAGED-REQUEST-001  ',requestStatus:'unreconciled'});
    assert.equal(searchedUnreconciled.requestInventory.pagination.total,1);
    assert.equal(searchedUnreconciled.requestInventory.rows[0].reconciliation_status,'unreconciled');
    assert.deepEqual(searchedUnreconciled.requestInventory.statusCounts,{unreconciled:1,reconciled:0,corrected:0});
    const searchedCorrected=await matchingService.read({userId:operator,id:laterBill.id,requestSearch:'  MATCHED-REQUEST  ',requestStatus:'corrected'});
    assert.equal(searchedCorrected.requestInventory.pagination.total,1);
    assert.equal(searchedCorrected.requestInventory.rows[0].reconciliation_status,'corrected');
    assert.deepEqual(searchedCorrected.requestInventory.statusCounts,{unreconciled:0,reconciled:0,corrected:1});
    const searchStatusMismatch=await matchingService.read({userId:operator,id:laterBill.id,requestSearch:'paged-request-001',requestStatus:'corrected'});
    assert.equal(searchStatusMismatch.requestInventory.pagination.total,0);
    assert.equal(searchStatusMismatch.requestInventory.rows.length,0);
    assert.deepEqual(searchStatusMismatch.requestInventory.statusCounts,{unreconciled:1,reconciled:0,corrected:0});
    assert.deepEqual(comparisonFacts(searchStatusMismatch.comparison),comparisonFacts(firstPage.comparison));
    assert.deepEqual(searchStatusMismatch.modelSummary,firstPage.modelSummary);
    for(const value of ['%',"' OR 1=1 --",'no-such-request']) {
      const empty=await matchingService.read({userId:operator,id:laterBill.id,requestSearch:value});
      assert.equal(empty.requestInventory.rows.length,0);assert.equal(empty.requestInventory.pagination.total,0);
    }
    const outside=await matchingService.read({userId:operator,id:laterBill.id,requestPage:4});
    assert.equal(outside.requestInventory.rows.length,0);assert.equal(outside.requestInventory.pagination.total,111);
    const exported=await matchingService.exportReconciliation({userId:operator,id:laterBill.id});
    assert.equal(exported.csv.split('\r\n').length,6);
    assert.match(exported.csv,/matched-request/);assert.match(exported.csv,/0.40000000/);assert.match(exported.csv,/0.60000000/);assert.match(exported.csv,/0.00000000/);
    assert.match(exported.csv,/6800.000000/);assert.match(exported.csv,/10200.000000/);
    assert.doesNotMatch(exported.csv,/paged-request-001/);
    await assert.rejects(matchingService.exportReconciliation({userId:randomUUID(),id:laterBill.id}),{status:403});
    await assert.rejects(matchingService.exportReconciliation({userId:operator,id:randomUUID()}),{status:404});
    // Identical request IDs on other accounts and tenant/job identities remain independent.
    const otherWorkspace=randomUUID(),otherJob=randomUUID(),sameWorkspaceJob=randomUUID();
    await pool.query('INSERT INTO workspaces VALUES($1)',[otherWorkspace]);
    await pool.query('INSERT INTO generation_jobs(id,workspace_id,model) VALUES($1,$2,$3),($4,$5,$3)',[otherJob,otherWorkspace,'synthetic-model',sameWorkspaceJob,workspace]);
    for(const [index,identity] of [[0,{workspace,job,account:'456'}],[1,{workspace,job:sameWorkspaceJob,account:'123'}],[2,{workspace:otherWorkspace,job:otherJob,account:'123'}]]) {
      await pool.query(`INSERT INTO generation_cost_events(workspace_id,generation_job_id,provider,provider_account_id,provider_request_id,dispatch_id,worker_attempt,event_type,observation_fingerprint,cost_source,created_at)
        VALUES($1,$2,'byteplus',$3,'matched-request',$4,1,'submitted',$5,'unknown','2026-01-03T04:00:00Z')`,
        [identity.workspace,identity.job,identity.account,randomUUID(),String(index+1).repeat(64)]);
    }
    const independent=await matchingService.read({userId:operator,id:laterBill.id,requestSearch:'matched-request',requestStatus:'unreconciled'});
    assert.equal(independent.requestInventory.pagination.total,3);
    assert.deepEqual(independent.requestInventory.statusCounts,{unreconciled:3,reconciled:0,corrected:1});
    assert.ok(independent.requestInventory.rows.every(row=>row.reconciliation_status==='unreconciled'));
    assert.ok(independent.requestInventory.rows.every(row=>row.provider_account_id!=='123' || row.workspace_id!==workspace || row.generation_job_id!==job));
    assert.ok(independent.requestInventory.rows.every(row=>!row.readiness.canReconcile));
    assert.ok(independent.requestInventory.rows.filter(row=>row.provider_account_id==='123').every(row=>row.readiness.reasons.some(reason=>reason.code==='ambiguous_request')));
    assert.ok(independent.requestInventory.rows.find(row=>row.provider_account_id==='456').readiness.reasons.some(reason=>reason.code==='account_mismatch'));

    const originalIdentity=await matchingService.read({userId:operator,id:laterBill.id,requestSearch:'matched-request',requestStatus:'corrected'});
    assert.equal(originalIdentity.requestInventory.pagination.total,1);
    assert.equal(originalIdentity.requestInventory.rows[0].workspace_id,workspace);
    assert.equal(originalIdentity.requestInventory.rows[0].generation_job_id,job);
    assert.equal(originalIdentity.requestInventory.rows[0].provider_account_id,'123');
    const otherInvoice={...later,providerAccountId:'456',fileHash:'0'.repeat(64),rows:[{...later.rows[0],identityHash:'6'.repeat(64)}]};
    const otherInvoiceService=createProviderBillingService({repository,env:{NEXOCLIP_OPERATOR_USER_IDS:operator},parse:()=>otherInvoice,catalog:()=>['synthetic-model']});
    const otherBill=await otherInvoiceService.mutate({userId:operator,input:{...input,expectedHash:otherInvoice.fileHash,reference:'OTHER-ACCOUNT-INVOICE'}});
    const otherInvoiceInventory=await otherInvoiceService.read({userId:operator,id:otherBill.id,requestSearch:'matched-request',requestStatus:'unreconciled'});
    assert.equal(otherInvoiceInventory.requestInventory.pagination.total,4);
    assert.deepEqual(otherInvoiceInventory.requestInventory.statusCounts,{unreconciled:4,reconciled:0,corrected:0});
    assert.ok(otherInvoiceInventory.requestInventory.rows.every(row=>row.reconciliation_status==='unreconciled'));
    // Package usage has its own prepaid cost basis, independent of PAYG invoice totals.
    const packageParsed={...parsed,fileHash:'3'.repeat(64),periodStart:'2026-01-05T00:00:00Z',periodEnd:'2026-01-06T00:00:00Z',rows:[{...parsed.rows[0],identityHash:'4'.repeat(64),usage:'3.000000000000',packageUsage:'3.000000000000',totalUsd:'0.00000000',preTaxUsd:'0.00000000'}],totals:{...parsed.totals,preTaxUsd:'0.00000000',totalUsd:'0.00000000'}};
    const packageService=createProviderBillingService({repository,env:{NEXOCLIP_OPERATOR_USER_IDS:operator},parse:()=>packageParsed,catalog:()=>['synthetic-model']});
    const packageBill=await packageService.mutate({userId:operator,input:{...input,expectedHash:packageParsed.fileHash,reference:'PACKAGE-JOBS-INVOICE'}});
    const packageGroup=billingSkuKey(packageParsed.rows.map(row=>({configuration:row.configuration,billing_unit:row.billingUnit,usage_unit:row.usageUnit}))[0]);
    await packageService.mutate({userId:operator,input:{action:'map-sku',id:packageBill.id,groupKey:packageGroup,model:'synthetic-model',note:'Verified package SKU mapping',expectedMappingId:''}});
    await packageService.mutate({userId:operator,input:{...payment,id:packageBill.id,kind:'package_purchase',amountUsd:'10',amountIdr:'170000',reference:'PACKAGE-JOBS-PURCHASE'}});
    const packagePayment=(await packageService.read({userId:operator,id:packageBill.id})).paymentEvidence[0];
    await packageService.mutate({userId:operator,input:{action:'allocate-package',id:packageBill.id,paymentId:packagePayment.id,groupKey:packageGroup,totalQuota:'30',consumedQuota:'3',note:'Three package units used on this SKU'}});
    const source=(await packageService.read({userId:operator,id:packageBill.id})).packageAllocations[0];
    const requestInputs=[];
    for(let index=0;index<4;index++) {
      const requestDispatch=randomUUID();
      await pool.query(`INSERT INTO generation_cost_events(workspace_id,generation_job_id,provider,provider_account_id,dispatch_id,worker_attempt,event_type,observation_fingerprint,cost_source,created_at) VALUES($1,$2,'byteplus','123',$3,1,'dispatch',$4,'unknown','2026-01-05T02:00:00Z')`,[workspace,job,requestDispatch,String(index+5).repeat(64)]);
      const event=(await pool.query(`INSERT INTO generation_cost_events(workspace_id,generation_job_id,provider,provider_account_id,provider_request_id,dispatch_id,worker_attempt,event_type,observation_fingerprint,cost_source,cost_usd,created_at) VALUES($1,$2,'byteplus','123',$3,$4,1,'succeeded',$5,'calculated',1.5,'2026-01-05T02:01:00Z') RETURNING id::text`,[workspace,job,`package-job-${index}`,requestDispatch,String(index+5).repeat(64)])).rows[0];
      requestInputs.push({action:'allocate-package-request',id:packageBill.id,allocationId:source.id,observationId:event.id,consumedQuota:'1',evidenceReference:`PACKAGE-USAGE-${index}`,note:'Verified provider package consumption per request'});
    }
    const ready=await packageService.read({userId:operator,id:packageBill.id});
    assert.ok(ready.requestInventory.rows.every(row=>row.packageReadiness.canReconcile));
    assert.ok(ready.requestInventory.rows.every(row=>!row.readiness.canReconcile));
    const concurrent=await Promise.all([packageService.mutate({userId:operator,input:requestInputs[0]}),packageService.mutate({userId:operator,input:requestInputs[0]})]);
    assert.equal(concurrent.filter(row=>!row.replayed).length,1);
    for(const entry of requestInputs.slice(1,3))await packageService.mutate({userId:operator,input:entry});
    assert.equal((await packageService.mutate({userId:operator,input:requestInputs[0]})).replayed,true);
    assert.equal((await packageService.mutate({userId:operator,input:requestInputs[1]})).replayed,true);
    await assert.rejects(packageService.mutate({userId:operator,input:requestInputs[3]}),/sisa/);
    await assert.rejects(packageService.mutate({userId:operator,input:{...requestInputs[0],consumedQuota:'0.5'}}),{status:409});
    await assert.rejects(packageService.mutate({userId:randomUUID(),input:requestInputs[0]}),{status:403});
    const packageReport=await packageService.read({userId:operator,id:packageBill.id});
    assert.equal(packageReport.requestReconciliations.length,3);
    assert.equal(packageReport.packageAllocations[0].remainingQuota,'0.000000000000');
    assert.ok(packageReport.requestInventory.rows.every(row=>!row.packageReadiness.canReconcile));
    assert.ok(packageReport.requestReconciliations.every(row=>row.package_allocation_id===source.id&&row.package_consumed_quota==='1.000000000000'));
    const packagedCosts=await pool.query("SELECT sum(cost_usd)::text AS usd,sum(cost_idr)::text AS idr FROM latest_generation_cost_observations WHERE provider_request_id IN ('package-job-0','package-job-1','package-job-2')");
    assert.equal(packagedCosts.rows[0].usd,'1.00000000');assert.equal(packagedCosts.rows[0].idr,'17000.000000');
    assert.equal(packageReport.requestReconciliations.find(row=>row.provider_request_id==='package-job-1').cost_usd,'0.33333334');
    const allocatedEvent=(await pool.query('SELECT cost_source,usage FROM generation_cost_events WHERE id=$1',[packageReport.requestReconciliations[0].cost_event_id])).rows[0];
    assert.equal(allocatedEvent.cost_source,'calculated');assert.equal(allocatedEvent.usage.source,'operator_package_usage_evidence');
    const packageCsv=await packageService.exportReconciliation({userId:operator,id:packageBill.id});
    assert.match(packageCsv.csv,/allocated_package_purchase/);assert.match(packageCsv.csv,/package_consumed_quota/);
    const parent=packageReport.requestReconciliations[0];
    await assert.rejects(packageService.mutate({userId:operator,input:{...correction,id:packageBill.id,reconciliationId:parent.id,previousCostEventId:parent.current_cost_event_id}}),/Koreksi alokasi paket/);
    const target=packageReport.requestReconciliations.find(row=>row.provider_request_id==='package-job-1');
    const cancel={action:'correct-package-request',id:packageBill.id,reconciliationId:target.id,previousCostEventId:target.current_cost_event_id,consumedQuota:'0',evidenceReference:'PACKAGE-CANCEL',note:'Provider confirms package quota was misattributed to this request'};
    const cancelled=await Promise.all([packageService.mutate({userId:operator,input:cancel}),packageService.mutate({userId:operator,input:cancel})]);
    assert.equal(cancelled.filter(row=>!row.replayed).length,1);
    await assert.rejects(packageService.mutate({userId:operator,input:{...cancel,consumedQuota:'0.5'}}),{status:409});
    await assert.rejects(packageService.mutate({userId:randomUUID(),input:cancel}),{status:403});
    let updated=await packageService.read({userId:operator,id:packageBill.id});
    const zeroRow=updated.requestReconciliations.find(row=>row.id===target.id);
    assert.equal(zeroRow.cost_usd,'0.00000000');assert.equal(zeroRow.cost_idr,'0.000000');
    assert.equal(zeroRow.package_consumed_quota,'0.000000000000');assert.equal(zeroRow.original_package_consumed_quota,'1.000000000000');
    assert.equal(updated.packageAllocations[0].remainingQuota,'1.000000000000');
    assert.equal(updated.requestCorrectionHistory[0].previous_package_consumed_quota,'1.000000000000');
    assert.equal(updated.requestCorrectionHistory[0].created_by,operator);
    assert.ok(updated.requestReconciliations.filter(row=>row.id!==target.id).every(row=>row.cost_usd===packageReport.requestReconciliations.find(old=>old.id===row.id).cost_usd));
    await packageService.mutate({userId:operator,input:requestInputs[3]});
    updated=await packageService.read({userId:operator,id:packageBill.id});
    assert.equal(updated.packageAllocations[0].remainingQuota,'0.000000000000');
    // Replaying the initial allocation or old correction after capacity is reused adds nothing.
    assert.equal((await packageService.mutate({userId:operator,input:requestInputs[1]})).replayed,true);
    assert.equal((await packageService.mutate({userId:operator,input:cancel})).replayed,true);
    const restore={...cancel,previousCostEventId:zeroRow.current_cost_event_id,consumedQuota:'0.5',evidenceReference:'PACKAGE-RESTORE',note:'Provider verifies revised package usage for original request'};
    await assert.rejects(packageService.mutate({userId:operator,input:restore}),/sisa/);
    await assert.rejects(packageService.mutate({userId:operator,input:{...restore,previousCostEventId:target.current_cost_event_id}}),{status:409});
    const fourth=updated.requestReconciliations.find(row=>row.provider_request_id==='package-job-3');
    await packageService.mutate({userId:operator,input:{...restore,reconciliationId:fourth.id,previousCostEventId:fourth.current_cost_event_id,evidenceReference:'PACKAGE-REDUCE'}});
    await packageService.mutate({userId:operator,input:restore});
    updated=await packageService.read({userId:operator,id:packageBill.id});
    assert.equal(updated.requestCorrectionHistory.length,3);
    assert.equal(updated.packageAllocations[0].remainingQuota,'0.000000000000');
    const totals=(await pool.query("SELECT sum(cost_usd)::text AS usd,sum(cost_idr)::text AS idr FROM latest_generation_cost_observations WHERE provider_request_id LIKE 'package-job-%'")).rows[0];
    assert.equal(totals.usd,'1.00000000');assert.equal(totals.idr,'17000.000000');
    assert.equal((await packageService.mutate({userId:operator,input:cancel})).replayed,true);
    const correctedCsv=await packageService.exportReconciliation({userId:operator,id:packageBill.id});
    assert.match(correctedCsv.csv,/previous_package_consumed_quota/);assert.match(correctedCsv.csv,/PACKAGE-CANCEL/);assert.match(correctedCsv.csv,/PACKAGE-RESTORE/);
    // Navigation uses dispatch/account/environment, never job terminal time or fuzzy IDs.
    const context=await packageService.read({userId:operator,workspaceId:workspace,jobId:job});
    assert.equal(context.job.id,job);
    assert.ok(context.invoices.some(bill=>bill.id===packageBill.id));
    const scoped=await packageService.read({userId:operator,id:packageBill.id,workspaceId:workspace,jobId:job});
    assert.equal(scoped.requestInventory.pagination.total,4);
    assert.ok(scoped.requestInventory.rows.every(row=>row.workspace_id===workspace && row.generation_job_id===job));
    const wrongJob=await packageService.read({userId:operator,id:packageBill.id,workspaceId:workspace,jobId:sameWorkspaceJob});
    assert.equal(wrongJob.requestInventory.pagination.total,0);
    assert.equal(wrongJob.bill.total_usd,scoped.bill.total_usd);
    assert.equal(wrongJob.requestReconciliations.length,scoped.requestReconciliations.length);
    const missingDispatch=await packageService.read({userId:operator,workspaceId:otherWorkspace,jobId:otherJob});
    assert.deepEqual(missingDispatch.invoices,[]);
    await assert.rejects(packageService.read({userId:operator,workspaceId:workspace,jobId:otherJob}),{status:404});
    await assert.rejects(pool.query('DELETE FROM provider_package_request_corrections'),/append-only/);
    await assert.rejects(pool.query('DELETE FROM provider_package_request_allocations'),/append-only/);
  }finally{await pool.end();await root.query(`DROP SCHEMA ${schema} CASCADE`);await root.end();}
});
