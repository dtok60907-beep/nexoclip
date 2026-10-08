import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRequestReconciliation as validate} from '../../src/lib/providerRequestReconciliation.js';
const fixture=()=>({bill:{provider_account_id:'123',environment:'development',period_start:'2026-01-01T00:00:00Z',period_end:'2026-01-02T00:00:00Z'},request:{provider_request_id:'req',provider_account_id:'123',environment:'development',request_time:'2026-01-01T02:00:00Z',time_is_fallback:false,model:'test'},group:{package_usage:'0.000000000000',pre_tax_usd:'1.00000000'},mapping:{model:'test'},payment:{kind:'invoice_payment',amount_usd:'1',amount_idr:'17000'},allocatedUsd:'0.1',input:{costUsd:'0.4',evidenceReference:'BILL-REQ-1',note:'Verified BytePlus request charge'}});
test('reconciles exact USD and paid FX without floating point',()=>{
 const value=validate(fixture());assert.equal(value.costUsd,'0.40000000');assert.equal(value.costIdr,'6800.000000');assert.equal(value.usdIdrRate,'17000.000000');
 const f=fixture();f.input.costUsd='0';assert.equal(validate(f).costIdr,'0.000000');
});
test('rejects wrong account, environment, time, model and package SKU',()=>{
 const patches=[['request',{provider_account_id:'456'}],['request',{environment:'production'}],['request',{time_is_fallback:true}],['request',{request_time:'2026-01-02T00:00:00Z'}],['request',{provider_request_id:null}],['mapping',{model:'other'}],['group',{package_usage:'0.000000000001'}],['group',{savings_plan_gross_usd:'0.01'}],['payment',{kind:'package_purchase'}]];
 for(const [key,patch] of patches) {const f=fixture();f[key]={...f[key],...patch};assert.throws(()=>validate(f),{status:400});}
});
test('caps aggregate charge and rejects malformed or missing evidence',()=>{
 const f=fixture();f.input.costUsd='0.90000001';assert.throws(()=>validate(f),/melebihi/);
 for(const value of ['-1','1e2','NaN','0.000000001',0.4]){const f=fixture();f.input.costUsd=value;assert.throws(()=>validate(f));}
 const missing=fixture();missing.input.note='';assert.throws(()=>validate(missing),/Referensi/);
});
