import test from 'node:test';
import assert from 'node:assert/strict';
import { providerBillingSummary } from '../../src/lib/providerBillingSummary.js';

test('multiple units classify money per model without summing incompatible usage; unmapped evidence remains separate',()=>{
  const groups=[{pre_tax_usd:'0.10000001',usage_unit:'Image',mapping:{model:'A'}},{pre_tax_usd:'0.20000002',usage_unit:'Token',mapping:{model:'A'}},{pre_tax_usd:'2',mapping:null}];
  const result=providerBillingSummary(groups,[{model:'A',requests:2,known_cost_usd:'0.2',unknown_requests:1}]);
  assert.equal(result.mappedPreTaxUsd,'0.30000003');assert.equal(result.unmappedPreTaxUsd,'2.00000000');
  assert.equal(result.rows[0].differenceUsd,'0.10000003');assert.equal(result.rows[0].status,'unknown_request_costs');
  assert.equal(result.rows[0].skuCount,2);assert.equal(result.allocationStatus,'unallocated');
});
test('missing SKU or request coverage stays unknown and package costs are flagged',()=>{
  const result=providerBillingSummary([{pre_tax_usd:'0',mapping:{model:'A'},rate_status:'package_or_plan'}],[{model:'B',requests:1,known_cost_usd:'0.3',unknown_requests:0}]);
  assert.equal(result.rows[0].knownRequestCostUsd,null);assert.equal(result.rows[0].differenceUsd,null);
  assert.equal(result.rows[0].status,'no_app_requests');assert.equal(result.rows[0].hasPackageOrPlan,true);
  assert.equal(result.rows[1].billedPreTaxUsd,null);assert.equal(result.rows[1].status,'no_mapped_sku');
});
test('unmapping moves costs back out of model totals; unknown evidence never becomes zero',()=>{
  const result=providerBillingSummary([{pre_tax_usd:null,mapping:{model:null}},{pre_tax_usd:'1',mapping:{model:'A'}}],[{model:'A',requests:1,known_cost_usd:null,unknown_requests:1}]);
  assert.equal(result.unmappedPreTaxUsd,null);assert.equal(result.rows[0].knownRequestCostUsd,null);
  assert.equal(result.rows[0].differenceUsd,null);
  assert.equal(providerBillingSummary([],[]).rows.length,0);
});
