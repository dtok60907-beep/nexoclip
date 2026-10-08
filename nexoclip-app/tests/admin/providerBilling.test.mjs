import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderBillingService, billingSkuKey } from '../../src/services/providerBillingService.js';
import { createProviderBillingHandlers } from '../../app/api/admin/provider-billing/route.js';
const operator='11111111-1111-1111-1111-111111111111',customer='22222222-2222-2222-2222-222222222222',id='33333333-3333-3333-3333-333333333333';
const env={NEXOCLIP_OPERATOR_USER_IDS:operator};
test('production billing requires matching server account; development classification cannot be overwritten',async()=>{
  let saved;
  const repository={transaction:async fn=>fn({}),lockImport:async()=>{},detail:async()=>({bill:{provider_account_id:'123',environment:'unclassified'}}),classifyEnvironment:async(db,value)=>{saved=value;},list:async(page,size,environment)=>({total:0,imports:[],selected:environment})};
  const service=createProviderBillingService({repository,env});
  const input={action:'classify-environment',id,environment:'production',note:'Verified billing environment'};
  await assert.rejects(service.mutate({userId:operator,input}),{status:409});
  await assert.rejects(service.mutate({userId:customer,input:{...input,environment:'development'}}),{status:403});
  await service.mutate({userId:operator,input:{...input,environment:'development'}});
  assert.equal(saved.environment,'development');assert.equal(saved.userId,operator);
  const production=createProviderBillingService({repository,env:{...env,BYTEPLUS_PRODUCTION_BILLING_ACCOUNT_ID:'123'}});
  await production.mutate({userId:operator,input});assert.equal(saved.environment,'production');
  await assert.rejects(production.mutate({userId:operator,input:{...input,environment:'development'}}),{status:409});
  repository.detail=async()=>({bill:{provider_account_id:'123',environment:'development'}});
  await assert.rejects(production.mutate({userId:operator,input}),{status:409});
  assert.equal((await service.read({userId:operator,environment:'production'})).selected,'production');
  await assert.rejects(service.read({userId:operator,environment:'bad'}),{status:400});
});
test('SKU mapping validates evidence and catalog, rejects stale edits, and records session actor',async()=>{
  const group={configuration:'Seedream',billing_unit:'Piece',usage_unit:'Piece'};
  let saved;let mappings=[];
  const repository={transaction:async fn=>fn({}),lockImport:async()=>{},detail:async()=>({groups:[group]}),mappings:async()=>mappings,mapSku:async(db,value)=>{saved=value;}};
  const service=createProviderBillingService({repository,env,catalog:()=>['test-byteplus']});
  const input={action:'map-sku',id,groupKey:billingSkuKey(group),model:'test-byteplus',note:'Checked provider SKU',expectedMappingId:''};
  await assert.rejects(service.mutate({userId:customer,input}),{status:403});
  await assert.rejects(service.mutate({userId:operator,input:{...input,model:'google'}}),{status:400});
  await assert.rejects(service.mutate({userId:operator,input:{...input,groupKey:'wrong'}}),{status:400});
  await service.mutate({userId:operator,input:{...input,userId:customer}});
  assert.equal(saved.userId,operator);assert.equal(saved.group.configuration,'Seedream');
  mappings=[{id:'123',group_key:input.groupKey,model:'test-byteplus'}];
  await assert.rejects(service.mutate({userId:operator,input}),{status:409});
  assert.equal((await service.mutate({userId:operator,input:{...input,expectedMappingId:'123'}})).replayed,true);
  await service.mutate({userId:operator,input:{...input,expectedMappingId:'123',model:null}});
  assert.equal(saved.model,null);
});
const parsed={providerAccountId:'synthetic-account',billingCycle:'2026-01',currency:'USD',fileHash:'a'.repeat(64),periodStart:'2026-01-01T00:00:00.000Z',periodEnd:'2026-01-02T00:00:00.000Z',warnings:[],
  totals:{savingsPlanGrossUsd:'0.00000000',grossUsd:'1.10000000',discountUsd:'0.00000000',couponUsd:'0.00000000',truncatedUsd:'0.00000000',preTaxUsd:'1.00000000',taxUsd:'0.10000000',totalUsd:'1.10000000',packageUsageRowCount:1},
  rows:[{configuration:'Seedream test',billingUnit:'Piece',usageUnit:'Piece',usage:'1.000000000000',packageUsage:'0.000000000001',totalUsd:'1.10000000'}]};
function fixture(overrides={}){
  const repository={duplicate:async()=>null,transaction:async fn=>fn({}),lockAccount:async()=>{},overlapping:async()=>null,insert:async()=>({id}),classifyEnvironment:async()=>{},
    detail:async()=>({bill:{id,file_hash:parsed.fileHash,period_start:parsed.periodStart,period_end:parsed.periodEnd,pre_tax_usd:'1.00000000',package_row_count:1},groups:[],reviews:[]}),
    comparison:async()=>[{model:'example',requests:2,known_cost_usd:'0.60000000',unknown_requests:1,missing_dispatch_requests:0,observation_version:'version1'}],
    review:async()=>{},...overrides};
  return createProviderBillingService({repository,env,parse:()=>parsed});
}
test('customer including a workspace owner is denied before parsing or persistence',async()=>{
  const service=createProviderBillingService({env,parse:()=>{throw Error('must not parse');}});
  await assert.rejects(service.read({userId:customer}),{status:403});
  await assert.rejects(service.mutate({userId:customer,input:{action:'preview',role:'owner',userId:operator}}),{status:403});
});
test('preview preserves package precision and import requires exact preview hash',async()=>{
  const service=fixture();
  const result=await service.mutate({userId:operator,input:{action:'preview',csv:'fixture'}});
  assert.equal(result.preview.groups[0].package_usage,'0.000000000001');
  assert.equal(result.preview.totals.totalUsd,'1.10000000');
  await assert.rejects(service.mutate({userId:operator,input:{action:'import',csv:'fixture',expectedHash:'b'.repeat(64),reference:'TEST'}}),{status:409});
});
test('replay returns existing import and overlap cannot silently duplicate expenses',async()=>{
  const input={action:'import',csv:'fixture',expectedHash:parsed.fileHash,reference:'TEST'};
  assert.deepEqual(await fixture({duplicate:async()=>({id}),insert:()=>{throw Error('no insert');}}).mutate({userId:operator,input}),{id,replayed:true});
  await assert.rejects(fixture({overlapping:async()=>({id})}).mutate({userId:operator,input}),{status:409});
});
test('comparison uses pre-tax billed cost, preserves unknown requests, and never claims job allocation',async()=>{
  const report=await fixture().read({userId:operator,id});
  assert.equal(report.comparison.differenceUsd,'0.40000000');
  assert.equal(report.comparison.unknownRequests,1);
  assert.equal(report.comparison.allocationStatus,'unallocated');
  assert.match(report.warnings.join(' '),/paket/);
});
test('stale usage review is rejected, actor and reviewed evidence come from server',async()=>{
  let recorded;
  const service=fixture({review:async(db,v)=>{recorded=v;}});
  await assert.rejects(service.mutate({userId:operator,input:{action:'review',id,note:'Investigated billing',expectedComparisonHash:'b'.repeat(64)}}),{status:409});
  assert.equal(recorded,undefined);
  const {comparison}=await service.read({userId:operator,id});
  await service.mutate({userId:operator,input:{action:'review',id,note:'Investigated billing',expectedComparisonHash:comparison.hash,userId:customer}});
  assert.equal(recorded.userId,operator);assert.equal(recorded.comparison.allocationStatus,'unallocated');
});
const request=(method='GET',body,origin='http://localhost')=>{
  const r=new Request('http://localhost/api/admin/provider-billing',{method,headers:{origin,'content-type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})});
  r.cookies={get:()=>({value:'session'})};return r;
};
test('API denies unsigned/customer/spoofed owner access before read or body parse',async()=>{
  let called=0;
  for(const session of [null,{user_id:customer,role:'owner',isPlatformOperator:true}]){
    const api=createProviderBillingHandlers({env,sessionLookup:async()=>session,service:{read:()=>called++,mutate:()=>called++}});
    for(const method of ['GET','POST'])assert.equal((await api[method](request(method,{userId:operator}))).status,session?403:401);
  }
  assert.equal(called,0);
});
test('API checks CSRF/body size, masks server errors and authenticates actors',async()=>{
  let called=0;
  const api=createProviderBillingHandlers({env,sessionLookup:async()=>({user_id:operator}),service:{mutate:async v=>{called++;assert.equal(v.userId,operator);throw Error('private SQL');}}});
  assert.equal((await api.POST(request('POST',{},'https://other.test'))).status,403);
  assert.equal((await api.POST(request('POST',{csv:'a'.repeat(3*1024*1024)}))).status,413);
  assert.equal(called,0);
  const result=await api.POST(request('POST',{userId:customer}));
  assert.equal(result.status,500);assert.doesNotMatch(await result.text(),/private SQL/);
  assert.match(result.headers.get('cache-control'),/no-store/);
});


test('customers cannot reconcile request costs even when spoofing operator identity',async()=>{
 const service=createProviderBillingService({env,repository:{transaction:()=>{throw Error('must not persist');}}});
 await assert.rejects(service.mutate({userId:customer,input:{action:'reconcile-request',userId:operator,role:'admin',id,observationId:'1',paymentId:'1'}}),{status:403});
});


test('customer cost corrections are denied before transaction or parsing amounts',async()=>{
 const service=createProviderBillingService({env,repository:{transaction:()=>{throw Error('must not persist');}}});
 await assert.rejects(service.mutate({userId:customer,input:{action:'correct-request-cost',userId:operator,role:'owner',id}}),{status:403});
});


test('request search and pagination validate bounds and remain independent of billing summaries',async()=>{
 let selected;
 const service=fixture({requestInventory:async(bill,db,options)=>{selected=options;return {rows:[],pagination:{page:options.page,total:0,totalPages:1},search:options.search};}});
 const result=await service.read({userId:operator,id,requestPage:'2',requestSearch:'  Request-001  '});
 assert.deepEqual(selected,{page:2,search:'Request-001',status:'all'});assert.equal(result.comparison.requests,2);
 for(const requestPage of ['0','-1','1.5','100001','bad','']) await assert.rejects(service.read({userId:operator,id,requestPage}),{status:400});
 for(const requestSearch of ['x'.repeat(129),'line\nfeed',null]) await assert.rejects(service.read({userId:operator,id,requestSearch}),{status:400});
 await assert.rejects(service.read({userId:customer,id,requestPage:2,requestSearch:'any'}),{status:403});
});

test('API forwards request search parameters with authenticated operator identity',async()=>{
 let captured;
 const api=createProviderBillingHandlers({env,sessionLookup:async()=>({user_id:operator}),service:{read:async input=>{captured=input;return {ok:true};}}});
 const result=await api.GET({url:`http://localhost/api/admin/provider-billing?id=${id}&requestPage=3&requestSearch=req%25`,cookies:{get:()=>({value:'session'})}});
 assert.equal(result.status,200);assert.equal(captured.userId,operator);assert.equal(captured.requestPage,'3');assert.equal(captured.requestSearch,'req%');
});


test('CSV export is operator-only and validates invoice IDs before reading snapshot',async()=>{
 let calls=0;
 const service=createProviderBillingService({env,repository:{reconciliationExportSnapshot:async invoice=>{calls++;return {bill:{id:invoice,reference:'Invoice',period_start:'2026-01-01',period_end:'2026-01-02'},groups:[],mappings:[],payments:[],reconciliations:[],corrections:[]};}}});
 await assert.rejects(service.exportReconciliation({userId:customer,id}),{status:403});
 await assert.rejects(service.exportReconciliation({userId:operator,id:'header\r\ninjection'}),{status:400});assert.equal(calls,0);
 const result=await service.exportReconciliation({userId:operator,id});assert.equal(calls,1);assert.equal(result.filename,`byteplus-reconciliation-${id}.csv`);assert.match(result.csv,/billing_summary/);
});

test('CSV response sets download/no-store headers and rejects customer or unsupported formats',async()=>{
 let calls=0;
 const service={exportReconciliation:async input=>{calls++;assert.equal(input.userId,operator);assert.equal(input.id,id);return {filename:'audit.csv',csv:'"kind"\r\n"billing_summary"\r\n'};}};
 const get={url:`http://localhost/api/admin/provider-billing?id=${id}&export=reconciliation-csv&requestPage=3&requestSearch=ignored`,cookies:{get:()=>({value:'session'})}};
 const api=createProviderBillingHandlers({env,service,sessionLookup:async()=>({user_id:operator})});
 const result=await api.GET(get);assert.equal(result.status,200);assert.match(result.headers.get('content-type'),/text\/csv/);assert.match(result.headers.get('content-disposition'),/attachment; filename="audit.csv"/);assert.match(result.headers.get('cache-control'),/no-store/);assert.match(await result.text(),/billing_summary/);
 for(const user of [customer,null]) {
  const denied=createProviderBillingHandlers({env,service,sessionLookup:async()=>user ? {user_id:user} : null});
  assert.equal((await denied.GET(get)).status,user ? 403 : 401);
 }
 assert.equal((await api.GET({...get,url:get.url.replace('reconciliation-csv','unsupported')})).status,400);assert.equal(calls,1);
});


test('status filter is validated and passed with search without changing summary scope',async()=>{
 let selected;
 const service=fixture({requestInventory:async(bill,db,options)=>{selected=options;return {rows:[],status:options.status,statusCounts:{unreconciled:0,reconciled:0,corrected:1},pagination:{page:options.page,total:1,totalPages:1}};}});
 const all=await service.read({userId:operator,id});
 const filtered=await service.read({userId:operator,id,requestStatus:'corrected',requestSearch:'request',requestPage:2});
 assert.deepEqual(selected,{page:2,search:'request',status:'corrected'});assert.equal(filtered.comparison.hash,all.comparison.hash);
 for(const requestStatus of ['',null,'unknown',"all' OR 1=1 --",['all']])await assert.rejects(service.read({userId:operator,id,requestStatus}),{status:400});
 await assert.rejects(service.read({userId:customer,id,requestStatus:'unreconciled'}),{status:403});
});

test('API forwards reconciliation status to an operator and keeps CSV export independent of it',async()=>{
 let captured;
 const api=createProviderBillingHandlers({env,sessionLookup:async()=>({user_id:operator}),service:{read:async input=>{captured=input;return {ok:true};},exportReconciliation:async input=>{assert.deepEqual(input,{userId:operator,id});return {filename:'audit.csv',csv:'all-audit'};}}});
 const get={url:`http://localhost/api/admin/provider-billing?id=${id}&requestStatus=unreconciled`,cookies:{get:()=>({value:'session'})}};
 assert.equal((await api.GET(get)).status,200);assert.equal(captured.requestStatus,'unreconciled');
 assert.equal(await (await api.GET({...get,url:get.url+'&export=reconciliation-csv'})).text(),'all-audit');
});


test('inventory prerequisite assessment detects payment blockers without rewriting costs or summaries',async()=>{
 const group={configuration:'Test model',billing_unit:'Piece',usage_unit:'Piece',usage:'1.000000000000',package_usage:'0.000000000000',pre_tax_usd:'1.00000000',total_usd:'1.10000000',savings_plan_gross_usd:'0.00000000'};
 let payments=[];
 const service=fixture({detail:async()=>({bill:{id,provider_account_id:'123',environment:'development',period_start:parsed.periodStart,period_end:parsed.periodEnd,pre_tax_usd:'1.00000000',package_row_count:0},groups:[group],reviews:[]}),mappings:async()=>[{id:'1',group_key:billingSkuKey(group),model:'test-model'}],paymentEvidence:async()=>payments,
 requestInventory:async()=>({rows:[{observation_id:'1',provider_account_id:'123',provider_request_id:'req',model:'test-model',environment:'development',request_time:'2026-01-01T01:00:00Z',time_is_fallback:false,matching_jobs:'1',reconciliation_status:'unreconciled',cost_usd:null,cost_source:'unknown'}]})});
 const blocked=await service.read({userId:operator,id});
 assert.equal(blocked.requestInventory.rows[0].readiness.canReconcile,false);
 assert.ok(blocked.requestInventory.rows[0].readiness.reasons.some(reason=>reason.code==='missing_payment'));
 payments=[{id:'1',kind:'invoice_payment',amount_usd:'1.00000000',amount_idr:'17000.00'}];
 const ready=await service.read({userId:operator,id});assert.equal(ready.requestInventory.rows[0].readiness.canReconcile,true);
 assert.deepEqual(ready.requestInventory.rows[0].readiness.eligibleGroupKeys,[billingSkuKey(group)]);
 assert.equal(ready.requestInventory.rows[0].cost_usd,null);assert.equal(ready.comparison.hash,blocked.comparison.hash);
});

test('identical reconciliation retries remain idempotent after corrections free invoice capacity',async()=>{
  const group={configuration:'Seedream',billing_unit:'Piece',usage_unit:'Piece',package_usage:'0.000000000000',pre_tax_usd:'1.00000000'};
  const groupKey=billingSkuKey(group);
  const input={action:'reconcile-request',id,observationId:'1',paymentId:'1',groupKey,costUsd:'0.4',evidenceReference:'ORIGINAL-CHARGE',note:'Original verified charge before correction'};
  const repository={transaction:async fn=>fn({}),lockAccount:async()=>{},lockImport:async()=>{},
    detail:async()=>({bill:{provider_account_id:'123',environment:'development',period_start:'2026-01-01',period_end:'2026-02-01'},groups:[group]}),
    requestObservation:async()=>({provider_account_id:'123',provider_request_id:'request-1',matching_jobs:1,environment:'development',request_time:'2026-01-02',time_is_fallback:false,model:'test-model'}),
    mappings:async()=>[{group_key:groupKey,model:'test-model'}],
    paymentEvidence:async()=>[{id:'1',kind:'invoice_payment',amount_usd:'1.00000000',amount_idr:'17000.00'}],
    reconciliationForRequest:async()=>({import_id:id,group_key:groupKey,payment_evidence_id:'1',cost_usd:'0.40000000',evidence_reference:input.evidenceReference,note:input.note}),
    requestReconciliations:async()=>[{group_key:groupKey,provider_request_id:'request-1',cost_usd:'0.00000000'},{group_key:groupKey,provider_request_id:'request-2',cost_usd:'1.00000000'}],
    reconcileRequest:async()=>{throw Error('retry must not append another expense');}};
  const service=createProviderBillingService({repository,env});
  assert.deepEqual(await service.mutate({userId:operator,input}),{reconciled:true,replayed:true});
  await assert.rejects(service.mutate({userId:operator,input:{...input,costUsd:'0.5'}}),{status:409});
  repository.reconciliationForRequest=async()=>null;
  await assert.rejects(service.mutate({userId:operator,input}),/melebihi/);
});

test('job navigation requires an operator and validates both exact identities before querying',async()=>{
  let calls=0;
  const repository={jobBillingContext:async(workspaceId,jobId)=>{calls++;return {job:{workspace_id:workspaceId,id:jobId},invoices:[]};}};
  const service=createProviderBillingService({repository,env});
  await assert.rejects(service.read({userId:customer,workspaceId:customer,jobId:id}),{status:403});
  for(const scope of [{jobId:id},{workspaceId:customer},{workspaceId:customer,jobId:'invalid'},{workspaceId:[customer],jobId:id}])await assert.rejects(service.read({userId:operator,...scope}),{status:400});
  assert.equal(calls,0);
  const result=await service.read({userId:operator,workspaceId:customer,jobId:id});
  assert.equal(result.job.id,id);assert.equal(result.job.workspace_id,customer);assert.deepEqual(result.invoices,[]);
  repository.jobBillingContext=async()=>null;
  await assert.rejects(service.read({userId:operator,workspaceId:customer,jobId:id}),{status:404});
});

test('API forwards the exact workspace/job scope without treating it as a substring search',async()=>{
  let captured;
  const handlers=createProviderBillingHandlers({env,sessionLookup:async()=>({user_id:operator}),service:{read:async input=>{captured=input;return {};}}});
  const response=await handlers.GET({url:`http://localhost/api/admin/provider-billing?workspaceId=${customer}&jobId=${id}`,cookies:{get:()=>({value:'session'})}});
  assert.equal(response.status,200);assert.equal(captured.workspaceId,customer);assert.equal(captured.jobId,id);assert.equal(captured.requestSearch,'');
});
