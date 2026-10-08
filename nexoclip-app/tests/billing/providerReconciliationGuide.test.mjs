import test from 'node:test';
import assert from 'node:assert/strict';
import {requestReconciliationGuide as guide} from '../../src/lib/providerReconciliationGuide.js';
import {requestReconciliationReadiness as readiness} from '../../src/lib/providerReconciliationReadiness.js';

function fixture(){return {
 bill:{provider_account_id:'123',environment:'development',period_start:'2026-10-01T00:00:00Z',period_end:'2026-11-01T00:00:00Z'},
 request:{provider_account_id:'123',provider_request_id:'req-1',model:'model',environment:'development',request_time:'2026-10-03T00:00:00Z',time_is_fallback:false,matching_jobs:1,reconciliation_status:'unreconciled'},
 groups:[{groupKey:'sku',mapping:{model:'model'},package_usage:0,savings_plan_gross_usd:0}],
 payments:[{id:'payment',kind:'invoice_payment'}],allocations:[],
};}
function assess(f){return guide({...f.request,readiness:readiness(f),packageReadiness:readiness({...f,mode:'package'})});}
test('direct route requests per-request proof and does not require unrelated package evidence',()=>{
 const f=fixture(),before=JSON.stringify(f),result=assess(f);
 assert.equal(result.status,'ready');assert.deepEqual(result.paths.map(path=>path.mode),['direct']);
 assert.match(result.paths[0].evidence,/CSV agregat saja belum cukup/);
 assert.equal(JSON.stringify(f),before);
});
test('package-ready requests use package evidence rather than showing a contradictory direct blocker',()=>{
 const f=fixture();f.groups[0].package_usage=1;
 f.payments=[{id:'purchase',kind:'package_purchase'}];
 f.allocations=[{group_key:'sku',remainingQuota:'1',payment_evidence_id:'purchase'}];
 const result=assess(f);
 assert.equal(result.status,'ready');assert.deepEqual(result.paths.map(path=>path.mode),['package']);
 assert.match(result.paths[0].evidence,/kuota yang digunakan/);
 assert.equal(result.paths[0].href,'#provider-package-request');
 f.allocations[0].remainingQuota='0';
 const exhausted=assess(f);assert.equal(exhausted.status,'blocked');
 assert.ok(exhausted.paths.find(path=>path.mode==='package').blockers.some(reason=>reason.href==='#provider-package-allocation'));
});
test('identity blockers cannot become ready through payments and expose no fabricated edit action',()=>{
 const f=fixture();f.request.time_is_fallback=true;f.request.matching_jobs=2;
 const result=assess(f);assert.equal(result.status,'blocked');
 for(const path of result.paths){assert.equal(path.ready,false);for(const code of ['missing_dispatch','ambiguous_request']){const reason=path.blockers.find(item=>item.code===code);assert.ok(reason);assert.equal(reason.href,undefined);}}
});
test('missing prerequisite actions route to existing evidence forms and corrected requests route to corrections',()=>{
 const f=fixture();f.groups=[];f.payments=[];
 const result=assess(f);assert.equal(result.status,'blocked');
 assert.ok(result.paths[0].blockers.some(reason=>reason.href==='#provider-sku-mapping'));
 assert.ok(result.paths[0].blockers.some(reason=>reason.href==='#provider-payment-evidence'));
 for(const reconciliation_status of ['reconciled','corrected']){const result=guide({...f.request,reconciliation_status});assert.equal(result.status,'recorded');assert.equal(result.paths.length,0);assert.equal(result.corrections.length,2);}
 assert.equal(guide({}).status,'unavailable');
});
