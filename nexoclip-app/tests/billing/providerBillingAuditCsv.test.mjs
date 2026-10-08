import test from 'node:test';
import assert from 'node:assert/strict';
import {providerBillingAuditCsv} from '../../src/lib/providerBillingAuditCsv.js';
const stamp=new Date('2026-10-08T03:00:00Z');
const fixture=()=>({bill:{id:'invoice',reference:'BytePlus invoice',provider_account_id:'123',environment:'development',billing_cycle:'2026-10',pre_tax_usd:'1.00000000',total_usd:'1.10000000',period_start:'2026-10-01T00:00:00Z',period_end:'2026-10-02T00:00:00Z'},groups:[{groupKey:'sku',configuration:'Seedream'}],payments:[{id:'p',reference:'BANK-1'}],reconciliations:[{id:'r',latest_correction_id:'c',current_cost_event_id:'2',workspace_id:'workspace',generation_job_id:'job',provider_request_id:'request',model:'model-at-job',group_key:'sku',payment_evidence_id:'p',cost_usd:'0.60000000',cost_idr:'10200.000000',usd_idr_rate:'17000.000000',original_cost_usd:'0.40000000',original_cost_idr:'6800.000000',original_evidence_reference:'INITIAL',original_note:'Initial evidence',original_created_by:'operator-1',created_at:stamp,evidence_reference:'CORRECTED',note:'Corrected evidence',current_created_by:'operator-2',current_created_at:stamp}],corrections:[{id:'c',reconciliation_id:'r',provider_request_id:'request',group_key:'sku',payment_evidence_id:'p',cost_event_id:'2',previous_cost_event_id:'1',previous_cost_usd:'0.40000000',previous_cost_idr:'6800.000000',cost_usd:'0.60000000',cost_idr:'10200.000000',usd_idr_rate:'17000.000000',evidence_reference:'CORRECTED',note:'Corrected evidence',created_by:'operator-2',created_at:stamp}]});
test('audit exports initial, effective and historical costs with immutable identities and UTC timestamps',()=>{
 const csv=providerBillingAuditCsv(fixture(),stamp);
 assert.ok(csv.startsWith('\uFEFF'));assert.equal(csv.split('\r\n').length,5);
 for(const text of ['current_reconciliation','cost_correction','0.40000000','0.60000000','6800.000000','10200.000000','operator-1','operator-2','INITIAL','CORRECTED','model-at-job','BANK-1','2026-10-08T03:00:00.000Z','not_search_filtered'])assert.ok(csv.includes(text),text);
});
test('quotes commas, quotes and multiline audit notes and neutralizes formulas and long IDs',()=>{
 const f=fixture();f.bill.reference='Invoice,"test"';f.bill.provider_account_id='12345678901234567890';
 f.reconciliations[0].note='Line one\nLine two,"quote"';f.corrections[0].note=' \t=HYPERLINK("https://example.test")';
 const csv=providerBillingAuditCsv(f,stamp);
 assert.ok(csv.includes('"Invoice,""test"""'));assert.ok(csv.includes('"Line one\nLine two,""quote"""'));
 assert.ok(csv.includes('"\' \t=HYPERLINK(""https://example.test"")"'));assert.ok(csv.includes('"\'12345678901234567890"'));
 for(const value of ['=1+1','+SUM(1)','-SUM(1)','@SUM(1)']) {f.bill.reference=value;assert.ok(providerBillingAuditCsv(f,stamp).includes(`"'${value}"`));}
});
test('empty audit exports invoice metadata and explicit incomplete cost scope',()=>{
 const f=fixture();f.reconciliations=[];f.corrections=[];
 const csv=providerBillingAuditCsv(f,stamp);assert.equal(csv.split('\r\n').length,3);assert.ok(csv.includes('billing_summary'));assert.ok(csv.includes('not final job COGS'));assert.ok(!csv.includes('current_reconciliation'));
});
