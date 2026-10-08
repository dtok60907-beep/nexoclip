import test from 'node:test';
import assert from 'node:assert/strict';
import {createEconomicsService} from '../../src/services/economicsService.js';
import {createEconomicsGetHandler} from '../../app/api/admin/economics/route.js';
const env={NEXOCLIP_OPERATOR_USER_IDS:'operator'};
const now=()=>new Date('2026-10-08T00:00:00Z');
const row={id:'22222222-2222-2222-2222-222222222222',model:'model',job_count:1,provider_request_count:1,unknown_provider_requests:1,estimated_request_count:0};
test('export excludes healthy jobs by default, uses one bounded snapshot, and preserves active cause/cost filters',async()=>{
 let calls=0,selected;const service=createEconomicsService({env,now,repository:async input=>{calls++;selected=input;return {total:'1',totals:row,items:[row]};}});
 await assert.rejects(service.exportIssues({userId:'customer',workspaceId:'w'}),{status:403});assert.equal(calls,0);
 const result=await service.exportIssues({userId:'operator',workspaceId:'w',filters:{issue:'all',costStatus:'estimated',environment:'production',page:999,pageSize:100000}});
 assert.equal(calls,1);assert.equal(selected.issue,'any');assert.equal(selected.costStatus,'estimated');assert.equal(selected.environment,'production');assert.equal(selected.page,1);assert.equal(selected.pageSize,5001);
 assert.equal(result.filename,'economics-job-issues-2026-09-09.csv');assert.match(result.csv,/unknown_provider/);
 await service.exportIssues({userId:'operator',workspaceId:'w',filters:{issue:'unknown_fee',costStatus:'reconciled'}});assert.equal(selected.issue,'unknown_fee');assert.equal(selected.costStatus,'reconciled');
 await assert.rejects(service.exportIssues({userId:'operator',workspaceId:'w',filters:{issue:'bad'}}),{status:400});
});
test('export fails explicitly for an oversized or incomplete snapshot rather than silently truncating CSV',async()=>{
 const service=createEconomicsService({env,now,repository:async()=>({total:5001,items:[]})});
 await assert.rejects(service.exportIssues({userId:'operator',workspaceId:'w'}),{status:413});
 const incomplete=createEconomicsService({env,now,repository:async()=>({total:2,items:[row]})});
 await assert.rejects(incomplete.exportIssues({userId:'operator',workspaceId:'w'}),{status:500});
 const empty=createEconomicsService({env,now,repository:async()=>({total:0,totals:{},items:[]})});
 assert.match((await empty.exportIssues({userId:'operator',workspaceId:'w'})).csv,/export_summary/);
});
const request=(query='',workspace='requested')=>({url:`http://localhost/api/admin/economics?export=job-issues-csv${query}`,headers:new Headers({'x-workspace-id':workspace}),cookies:{get:()=>({value:'session'})}});
test('CSV endpoint uses resolved tenant identity and protects operator-only exports with private no-store headers',async()=>{
 let captured;
 const handler=createEconomicsGetHandler({env,resolveContext:async()=>({user:{id:'operator'},workspace:{id:'resolved'}}),service:{exportIssues:async input=>{captured=input;return {filename:'export.csv',csv:'CSV'};}}});
 const result=await handler(request('&issue=unknown_fee&costStatus=reconciled'));
 assert.equal(result.status,200);assert.equal(await result.text(),'CSV');assert.equal(captured.workspaceId,'resolved');assert.equal(captured.userId,'operator');assert.equal(captured.filters.issue,'unknown_fee');assert.equal(captured.filters.costStatus,'reconciled');
 assert.equal(result.headers.get('cache-control'),'private, no-store');assert.equal(result.headers.get('vary'),'Cookie');assert.equal(result.headers.get('x-content-type-options'),'nosniff');assert.match(result.headers.get('content-disposition'),/attachment/);
});
test('CSV endpoint denies customers and cross-workspace access before export and masks internal failures',async()=>{
 let calls=0;const service={exportIssues:async()=>{calls++;throw Object.assign(new Error('database secret'),{status:500});}};
 const customer=createEconomicsGetHandler({env,service,resolveContext:async()=>({user:{id:'customer'},workspace:{id:'w'}})});
 assert.equal((await customer(request())).status,403);assert.equal(calls,0);
 const denied=createEconomicsGetHandler({env,service,resolveContext:async()=>{throw new Error('Workspace access denied');}});
 assert.equal((await denied(request())).status,403);assert.equal(calls,0);
 const operator=createEconomicsGetHandler({env,service,resolveContext:async()=>({user:{id:'operator'},workspace:{id:'w'}})});
 const invalid=await operator({...request(),url:'http://localhost/api/admin/economics?export=bad'});assert.equal(invalid.status,400);assert.equal(calls,0);
 const failed=await operator(request());assert.equal(failed.status,500);assert.doesNotMatch(await failed.text(),/secret/);
});
