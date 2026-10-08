import test from 'node:test';
import assert from 'node:assert/strict';
import {allocatePackageRequest as allocate,packageRequestBalance} from '../../src/lib/providerPackageRequestAllocation.js';
const fixture=()=>({bill:{provider_account_id:'123',environment:'development',period_start:'2026-01-01',period_end:'2026-02-01'},request:{provider_account_id:'123',provider_request_id:'req',model:'test',environment:'development',matching_jobs:1,time_is_fallback:false,request_time:'2026-01-02'},mapping:{model:'test'},group:{usage_unit:'Piece',savings_plan_gross_usd:'0'},payment:{id:'1',kind:'package_purchase',amount_usd:'10',amount_idr:'170000'},allocation:{id:'2',payment_evidence_id:'1',group_key:'sku',usage_unit:'Piece',consumed_quota:'3',allocated_usd:'1.00000000',allocated_idr:'17000.000000'},rows:[],input:{groupKey:'sku',consumedQuota:'1',evidenceReference:'PROOF-1',note:'Verified package usage per request'}});
test('exact cumulative rounding distributes SKU cost once with no unassigned residual on full usage',()=>{
 const f=fixture();let usd=0n,idr=0n;
 for(let i=0;i<3;i++){const value=allocate(f);usd+=BigInt(value.costUsd.replace('.',''));idr+=BigInt(value.costIdr.replace('.',''));f.rows.push({consumed_quota:value.consumedQuota,cost_usd:value.costUsd,cost_idr:value.costIdr});assert.equal(value.costSource,'calculated');assert.equal(value.packageAllocationId,'2');}
 assert.equal(usd,100000000n);assert.equal(idr,17000000000n);
 assert.throws(()=>allocate(f),/sisa/);
});
test('rejects account, environment, dispatch, model, purchase, unit, plan and ambiguous identity mismatches',()=>{
 for(const [key,patch] of [['request',{provider_account_id:'456'}],['request',{environment:'production'}],['request',{request_time:'invalid'}],['request',{time_is_fallback:true}],['request',{matching_jobs:2}],['mapping',{model:'wrong'}],['payment',{kind:'invoice_payment'}],['allocation',{payment_evidence_id:'99'}],['allocation',{usage_unit:'Token'}],['group',{savings_plan_gross_usd:'1'}]]){const f=fixture();Object.assign(f[key],patch);assert.throws(()=>allocate(f),{status:400});}
});
test('rejects malformed quota, missing evidence and monetary overflow',()=>{
 for(const consumedQuota of ['0','4','-1','NaN','1e3','0.0000000000001',1]){const f=fixture();f.input.consumedQuota=consumedQuota;assert.throws(()=>allocate(f));}
 const f=fixture();f.input.note='';assert.throws(()=>allocate(f),/bukti/);
 const huge=fixture();huge.allocation.allocated_usd='10000000000000';assert.throws(()=>allocate(huge),/presisi/);
});

test('remaining capacity counts only requests assigned to the selected purchase allocation',()=>{
 const f=fixture();const rows=[{package_allocation_id:'2',package_consumed_quota:'0.1'},{package_allocation_id:'9',package_consumed_quota:'3'}];
 assert.deepEqual(packageRequestBalance(f.allocation,rows),{remainingQuota:'2.900000000000',assignedRequests:1});
});

test('correction uses actual remaining money after other requests rounding and zero cancels all cost',()=>{
 const f=fixture();f.allowZero=true;f.rows=[{consumed_quota:'1',cost_usd:'0.33333333',cost_idr:'5666.666667'},{consumed_quota:'1',cost_usd:'0.33333333',cost_idr:'5666.666667'}];
 const corrected=allocate(f);assert.equal(corrected.costUsd,'0.33333334');assert.equal(corrected.costIdr,'5666.666666');
 f.input.consumedQuota='0';assert.equal(allocate(f).costUsd,'0.00000000');assert.equal(allocate(f).costIdr,'0.000000');
 f.input.consumedQuota='2';assert.throws(()=>allocate(f),/sisa/);
});
