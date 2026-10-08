import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePaymentEvidence,evidenceFx} from '../../src/lib/providerPaymentEvidence.js';
const valid={kind:'invoice_payment',amountUsd:'0.4',amountIdr:'6800',paidAt:'2026-10-08T00:00:00.000Z',reference:'BANK-1',note:'Invoice bank settlement'};
test('payment evidence normalizes exact decimals and derives effective paid FX',()=>{
  const evidence=validatePaymentEvidence(valid);
  assert.equal(evidence.amountUsd,'0.40000000');assert.equal(evidence.amountIdr,'6800.00');
  assert.equal(evidenceFx({amount_usd:evidence.amountUsd,amount_idr:evidence.amountIdr}),'17000.000000');
  assert.equal(evidenceFx({amount_usd:'3.00000000',amount_idr:'1.00'}),'0.333333');
});
test('invalid amounts, unsupported precision and impossible dates are rejected',()=>{
  for(const change of [{amountUsd:'0'},{amountIdr:'-1'},{amountUsd:'NaN'},{amountUsd:'1,2'},{amountUsd:'1.000000001'},{paidAt:'2026-02-30T00:00:00.000Z'},{kind:'refund'},{reference:'x'},{note:'tiny'}])assert.throws(()=>validatePaymentEvidence({...valid,...change}),error=>error.status===400);
});
