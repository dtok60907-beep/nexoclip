import test from 'node:test';
import assert from 'node:assert/strict';
import {economicsIssuesCsv} from '../../src/lib/economicsIssuesCsv.js';
import {mapEconomicsTotals} from '../../src/services/economicsService.js';
function parse(csv){const rows=[];let row=[],cell='',quoted=false;const text=csv.replace(/^\uFEFF/,'');for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if(c==='\r'&&text[i+1]==='\n'&&!quoted){row.push(cell);rows.push(row);row=[];cell='';i++;}else cell+=c;}return rows.slice(1).map(row=>Object.fromEntries(rows[0].map((key,i)=>[key,row[i]])));}
const workspaceId='11111111-1111-1111-1111-111111111111';
const filters={since:'2026-10-01T00:00:00Z',until:'2026-10-08T00:00:00Z',issue:'any',environment:'production',costStatus:'all'};
const fixture=items=>economicsIssuesCsv({workspaceId,filters,data:{total:items.length,totals:{},items},mapTotals:mapEconomicsTotals,exportedAt:new Date('2026-10-08T00:00:00Z')});
test('CSV round-trips quoted/newline text, neutralizes formulas, and preserves raw monetary precision',()=>{
 const [summary,row]=parse(fixture([{id:'22222222-2222-2222-2222-222222222222',model:'\t=HYPERLINK("danger")\nsecond line',job_count:1,provider_request_count:1,estimated_request_count:1,provider_cost_idr:'12345678901234.12345678',recognized_revenue_idr:'0.00000000',payment_fee_idr:'0.00000000',unknown_fx_requests:1,simulated_revenue_addition_idr:'1490.12345678'}]));
 assert.equal(row.model,'\'\t=HYPERLINK("danger")\nsecond line');assert.equal(row.known_provider_cost_idr,'12345678901234.12345678');assert.equal(row.known_revenue_idr,'0.00000000');assert.equal(row.simulation_additional_revenue_idr,'1490.12345678');assert.equal(row.cost_data_complete,'false');
 assert.match(row.issue_codes,/unknown_fx/);assert.match(row.issue_codes,/provider_evidence/);assert.match(row.job_billing_path,/workspaceId=.*&jobId=/);assert.match(summary.scope_note,/Simulasi bukan pendapatan aktual/);assert.equal(summary.issue_filter,'any');assert.equal(summary.matched_jobs,'1');
});
test('all financial causes survive export even when provider evidence is complete; no missing costs masquerade as zero',()=>{
 const [,row]=parse(fixture([{id:'job',job_count:1,provider_request_count:1,estimated_request_count:0,matched_request_count:1,unknown_fee_credits:5,unknown_revenue_credits:5}]));
 assert.equal(row.provider_evidence_status,'reconciled');assert.equal(row.issue_codes,'unknown_revenue | unknown_fee');assert.equal(row.known_provider_cost_idr,'');assert.equal(row.revenue_data_complete,'false');assert.equal(row.payment_fee_data_complete,'false');assert.equal(row.job_billing_path,'');
});
test('an empty export retains one summary row with scope and an exclusive UTC boundary',()=>{
 const rows=parse(fixture([]));assert.equal(rows.length,1);assert.equal(rows[0].record_type,'export_summary');assert.equal(rows[0].matched_jobs,'0');assert.equal(rows[0].period_end_exclusive_utc,filters.until);
});
