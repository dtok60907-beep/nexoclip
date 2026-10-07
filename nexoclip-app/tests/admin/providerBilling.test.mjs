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
