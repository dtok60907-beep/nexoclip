import test from 'node:test';
import assert from 'node:assert/strict';
import {calculatePackageAllocation as calculate} from '../../src/lib/providerPackageAllocation.js';
const payment={id:'1',kind:'package_purchase',amount_usd:'1',amount_idr:'1'};
const group={usage_unit:'Piece',package_usage:'10'};
const input={groupKey:'a',totalQuota:'3',consumedQuota:'1',note:'Confirmed quota evidence'};
test('cumulative rounding allocates exactly the purchase cost',()=>{
 const allocations=[];let usd=0n,idr=0n;
 for(const key of ['a','b','c']) {
  const result=calculate({payment,group,allocations,input:{...input,groupKey:key}});
  usd+=BigInt(result.allocatedUsd.replace('.',''));idr+=BigInt(result.allocatedIdr.replace('.',''));
  allocations.push({payment_evidence_id:'1',group_key:key,total_quota:result.totalQuota,consumed_quota:result.consumedQuota,usage_unit:'Piece'});
 }
 assert.equal(usd,100000000n);assert.equal(idr,1000000n);
 assert.throws(()=>calculate({payment,group,allocations,input}),/melebihi kuota/);
});
test('enforces SKU usage cap, stable quota and matching units',()=>{
 assert.throws(()=>calculate({payment,group:{...group,package_usage:'0.5'},allocations:[],input}),/usage paket/);
 const row={payment_evidence_id:'1',group_key:'b',total_quota:'3',consumed_quota:'1',usage_unit:'Piece'};
 assert.throws(()=>calculate({payment,group,allocations:[row],input:{...input,totalQuota:'4'}}),/harus sama/);
 assert.throws(()=>calculate({payment,group:{...group,usage_unit:'Token'},allocations:[row],input}),/harus sama/);
});
test('rejects non-package evidence, imprecise or invalid quantities',()=>{
 assert.throws(()=>calculate({payment:{...payment,kind:'invoice_payment'},group,allocations:[],input}),/pembelian paket/);
 for(const consumedQuota of ['0','-1','1e3','0.0000000000001',1]) assert.throws(()=>calculate({payment,group,allocations:[],input:{...input,consumedQuota}}));
});
