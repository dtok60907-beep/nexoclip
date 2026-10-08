import test from 'node:test';
import assert from 'node:assert/strict';
import {accountHistoryFilters} from '../../src/lib/accountHistoryFilters.js';
import {createBackofficeService} from '../../src/services/backofficeService.js';
import {createBackofficeRepository} from '../../src/repositories/backofficeRepository.js';
import {createBackofficeHandlers} from '../../app/api/admin/backoffice/route.js';
const operator='11111111-1111-1111-1111-111111111111',workspaceId='22222222-2222-2222-2222-222222222222',customerId='33333333-3333-3333-3333-333333333333';
const env={NEXOCLIP_OPERATOR_USER_IDS:operator};
test('history enforces operator, identifiers, allowed types and bounded pagination before querying',async()=>{
 const service=createBackofficeService({env,repository:{history:()=>{throw Error('must not query');}}});
 assert.deepEqual(accountHistoryFilters({history:'ledger'}),{history:'ledger',page:1,pageSize:25,category:'',from:null,to:null,since:null,until:null});
 for(const fields of [{history:'users'},{history:"ledger; DROP TABLE users"},{page:0},{page:'01'},{page:'1e3'},{pageSize:250},{workspaceId:''},{customerId:''},{customerId:'invalid'}])await assert.rejects(service.read({userId:operator,workspaceId,customerId,history:'sessions',...fields}),{status:400});
 await assert.rejects(service.read({userId:customerId,workspaceId,customerId,history:'ledger'}),{status:403});
});
test('history requires target membership and preserves account versus shared workspace scopes',async()=>{
 let input;
 const service=createBackofficeService({env,repository:{history:async(...args)=>{input=args;return null;}}});
 await assert.rejects(service.read({userId:operator,workspaceId,customerId,history:'payments',page:'2',pageSize:'50'}),{status:404});
 assert.deepEqual(input,[workspaceId,customerId,{history:'payments',page:2,pageSize:50,category:'all',from:null,to:null,since:null,until:null}]);
 for(const history of ['sessions','payments','ledger']){
  let query;
  const repository=createBackofficeRepository({query:async(sql,params)=>{query={sql,params};return {rows:[{authorized:true,total:72,rows:[{id:'record'}]}]};}});
  const result=await repository.history(workspaceId,customerId,{history,page:2,pageSize:25});
  assert.deepEqual(query.params,[workspaceId,customerId,25,25,null,null,history==='ledger'?'%%':'all']);assert.match(query.sql,/workspace_memberships WHERE workspace_id=\$1 AND user_id=\$2/);assert.match(query.sql,/SELECT count\(\*\)::int FROM filtered/);assert.match(query.sql,/ORDER BY created_at DESC,id DESC LIMIT \$3 OFFSET \$4/);
  assert.match(query.sql,history==='sessions'?/FROM account_session_events WHERE user_id=\$2/:history==='payments'?/FROM credit_topups WHERE workspace_id=\$1/:/FROM credit_ledger WHERE workspace_id=\$1/);
  assert.doesNotMatch(query.sql,/token_hash|password_hash|metadata/);
  assert.equal(result.scope,history==='sessions'?'account':'workspace');assert.deepEqual(result.pagination,{page:2,pageSize:25,total:72,pages:3});
 }
});
test('history GET ignores browser identity, returns no-store and rejects customer/anonymous sessions',async()=>{
 const request=new Request(`http://localhost/api/admin/backoffice?workspaceId=${workspaceId}&customerId=${customerId}&history=ledger&page=2&pageSize=10&userId=forged`);request.cookies={get:()=>({value:'session'})};
 let called=0;
 const service={read:async input=>{called++;assert.equal(input.userId,operator);assert.equal(input.history,'ledger');assert.equal(input.customerId,customerId);assert.equal(input.page,'2');return {rows:[]};}};
 const response=await createBackofficeHandlers({env,service,sessionLookup:async()=>({user_id:operator})}).GET(request);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
 for(const session of [null,{user_id:customerId}])assert.equal((await createBackofficeHandlers({env,service,sessionLookup:async()=>session}).GET(request)).status,session?403:401);
 assert.equal(called,1);
});

test('history dates accept leap days and open bounds, include the full final UTC day and reject invalid ranges',async()=>{
 const leap=accountHistoryFilters({history:'sessions',from:'2024-02-29',to:'2024-02-29'});
 assert.equal(leap.since,'2024-02-29T00:00:00.000Z');assert.equal(leap.until,'2024-03-01T00:00:00.000Z');
 assert.equal(accountHistoryFilters({history:'ledger',from:'2026-10-01'}).until,null);
 assert.equal(accountHistoryFilters({history:'payments',to:'2026-10-07'}).since,null);
 assert.equal(accountHistoryFilters({history:'ledger',from:'',to:''}).from,null);
 const service=createBackofficeService({env,repository:{history:()=>{throw Error('must not query');}}});
 for(const dates of [{from:'2026-02-29'},{to:'2026-04-31'},{from:'2026-2-01'},{from:'2026-10-08T00:00:00Z'},{from:'2026-10-08',to:'2026-10-07'},{from:123},{to:[]},{from:'0000-01-01'},{to:'9999-12-31'}])await assert.rejects(service.read({userId:operator,workspaceId,customerId,history:'sessions',...dates}),{status:400});
 let query;
 const repository=createBackofficeRepository({query:async(sql,params)=>{query={sql,params};return {rows:[{authorized:true,total:0,rows:[]}]};}});
 const report=await repository.history(workspaceId,customerId,{history:'payments',from:'2026-10-01',to:'2026-10-07',page:2,pageSize:25});
 assert.deepEqual(query.params,[workspaceId,customerId,25,25,'2026-10-01T00:00:00.000Z','2026-10-08T00:00:00.000Z','all']);
 assert.match(query.sql,/created_at >= \$5::timestamptz/);assert.match(query.sql,/created_at < \$6::timestamptz/);
 assert.deepEqual(report.period,{from:'2026-10-01',to:'2026-10-07',since:'2026-10-01T00:00:00.000Z',until:'2026-10-08T00:00:00.000Z',basis:'created_at',timeZone:'UTC'});
});
test('history GET forwards date bounds for validation under the trusted identity',async()=>{
 const request=new Request(`http://localhost/api/admin/backoffice?workspaceId=${workspaceId}&customerId=${customerId}&history=sessions&from=2024-02-29&to=2024-03-01`);request.cookies={get:()=>({value:'session'})};
 const handler=createBackofficeHandlers({env,sessionLookup:async()=>({user_id:operator}),service:{read:async input=>{assert.equal(input.userId,operator);assert.equal(input.from,'2024-02-29');assert.equal(input.to,'2024-03-01');return {rows:[]};}}});
 assert.equal((await handler.GET(request)).status,200);
});

test('history category filters validate enums and bind literal reason searches for pagination and CSV',async()=>{
 const service=createBackofficeService({env,repository:{history:()=>{throw Error('must not query');}}});
 for(const fields of [{history:'sessions',category:'completed'},{history:'payments',category:'session_created'},{history:'payments',category:"completed' OR true"},{history:'ledger',category:[]},{history:'ledger',category:'x'.repeat(121)}]){
  await assert.rejects(service.read({userId:operator,workspaceId,customerId,...fields}),{status:400});
  await assert.rejects(service.exportHistory({userId:operator,workspaceId,customerId,...fields}),{status:400});
 }
 let query;const repository=createBackofficeRepository({query:async(sql,params)=>{query={sql,params};return {rows:[{authorized:true,total:0,rows:[]}]};}});
 const ledger=await repository.history(workspaceId,customerId,{history:'ledger',category:'  50%_\\trial  '});
 assert.equal(query.params[6],'%50\\%\\_\\\\trial%');assert.match(query.sql,/reason ILIKE \$7/);assert.equal(ledger.filters.category,'50%_\\trial');
 for(const [history,category,field] of [['sessions','session_revoked','action'],['payments','failed','status']]){await repository.history(workspaceId,customerId,{history,category},{exportAll:true});assert.equal(query.params[6],category);assert.match(query.sql,new RegExp(`${field}=\\$7`));}
});
