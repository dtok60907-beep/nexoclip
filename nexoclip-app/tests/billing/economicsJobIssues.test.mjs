import test from 'node:test';
import assert from 'node:assert/strict';
import {economicsJobIssues as issues,mapEconomicsAttention} from '../../src/lib/economicsJobIssues.js';
import {mapEconomicsTotals} from '../../src/services/economicsService.js';

test('a multi-request job lists causes once without treating request/credit quantities as job counts',()=>{
 const row=mapEconomicsTotals({job_count:1,provider_request_count:8,unknown_provider_requests:4,unknown_fx_requests:2,unknown_revenue_credits:750,estimated_request_count:2,matched_request_count:2});
 const result=issues(row);assert.deepEqual(result.map(item=>item.code),['unknown_provider','unknown_fx','provider_evidence','unknown_revenue']);
 assert.equal(new Set(result.map(item=>item.code)).size,result.length);
});
test('verified costs do not hide revenue or fee problems; a fully covered failed job has no invented problem',()=>{
 const row=mapEconomicsTotals({job_count:1,provider_request_count:1,estimated_request_count:0,matched_request_count:1,unknown_fee_credits:5});
 assert.deepEqual(issues(row).map(item=>item.code),['unknown_fee']);
 assert.equal(issues({...mapEconomicsTotals({job_count:1,failed_job_count:1,provider_request_count:1,estimated_request_count:0,matched_request_count:1}),status:'failed'}).length,0);
});
test('summary distinguishes unavailable from empty and retains overlapping category counts',()=>{
 assert.deepEqual(mapEconomicsAttention(null),{available:false});
 const empty=mapEconomicsAttention({total_jobs:'0',attention_jobs:'0'});assert.equal(empty.available,true);assert.equal(empty.attentionJobs,0);
 const data=mapEconomicsAttention({total_jobs:'10',attention_jobs:'2',unknown_provider:'2',unknown_fx:'2'});
 assert.equal(data.attentionJobs,2);assert.equal(data.totalJobs,10);assert.equal(data.categories.reduce((n,item)=>n+item.jobs,0),4);
 assert.equal(issues({coverage:{},providerRequestCount:1,costEvidence:{available:false}}).length,0);
});
