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
      CREATE TABLE generation_jobs(id UUID PRIMARY KEY,workspace_id UUID NOT NULL REFERENCES workspaces(id),model TEXT NOT NULL,UNIQUE(workspace_id,id));`);
    for(const name of ['031_generation_cost_events.sql','037_provider_billing_imports.sql','038_provider_billing_sku_mappings.sql','039_generation_provider_account.sql','040_provider_billing_environments.sql'])await pool.query(await readFile(new URL(`../../src/db/migrations/${name}`,import.meta.url),'utf8'));
    const operator=randomUUID(),workspace=randomUUID(),job=randomUUID(),dispatch=randomUUID();
    await pool.query('INSERT INTO users VALUES($1)',[operator]);await pool.query('INSERT INTO workspaces VALUES($1)',[workspace]);
    await pool.query('INSERT INTO generation_jobs VALUES($1,$2,$3)',[job,workspace,'synthetic-model']);
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
    for(const table of ['provider_billing_imports','provider_billing_lines','provider_billing_reviews','provider_billing_sku_mappings','provider_billing_environments'])await assert.rejects(pool.query(`DELETE FROM ${table}`),/append-only/);
    assert.equal((await pool.query('SELECT count(*)::integer AS n FROM generation_cost_events')).rows[0].n,4);
  }finally{await pool.end();await root.query(`DROP SCHEMA ${schema} CASCADE`);await root.end();}
});
