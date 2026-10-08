import test from 'node:test';
import assert from 'node:assert/strict';
import { billingGroupRates } from '../../src/lib/providerBillingRates.js';

const group = overrides => ({ usage:'10.000000000000',package_usage:'0.000000000000',pre_tax_usd:'0.10000000',savings_plan_gross_usd:'0.00000000',...overrides });

test('historical rates exclude tax and preserve tiny token costs', () => {
  const result=billingGroupRates(group({usage:'1000000',pre_tax_usd:'0.15',total_usd:'0.165'}));
  assert.equal(result.effective_rate_usd,'0.000000150000');
  assert.equal(result.payg_rate_usd,'0.000000150000');
  assert.equal(result.rate_status,'payg_observed');
});
test('package and savings plan ratios never claim a PAYG unit price', () => {
  for (const changes of [{package_usage:'9'}, {savings_plan_gross_usd:'1'}]) {
    const result=billingGroupRates(group(changes));
    assert.equal(result.payg_rate_usd,null);
    assert.equal(result.rate_status,'package_or_plan');
  }
  assert.equal(billingGroupRates(group({package_usage:'9'})).non_package_usage,'1.000000000000');
});
test('zero usage and missing evidence stay unknown; all-package zero bill is only a billed ratio', () => {
  assert.equal(billingGroupRates(group({usage:'0'})).effective_rate_usd,null);
  assert.equal(billingGroupRates(group({pre_tax_usd:null})).rate_status,'unknown');
  const result=billingGroupRates(group({package_usage:'10',pre_tax_usd:'0'}));
  assert.equal(result.effective_rate_usd,'0.000000000000');
  assert.equal(result.payg_rate_usd,null);
});
test('BigInt ratio preserves large values, fractional usage and half-up rounding', () => {
  assert.equal(billingGroupRates(group({usage:'3',pre_tax_usd:'1'})).effective_rate_usd,'0.333333333333');
  assert.equal(billingGroupRates(group({usage:'0.000000000001',pre_tax_usd:'0.00000001'})).effective_rate_usd,'10000.000000000000');
  assert.equal(billingGroupRates(group({usage:'100000000000000000',pre_tax_usd:'100000000000000000'})).effective_rate_usd,'1.000000000000');
  assert.throws(()=>billingGroupRates(group({package_usage:'11'})),/exceeds/);
});
