import test from 'node:test';
import assert from 'node:assert/strict';
import {accountHistoryCsv} from '../../src/lib/accountHistoryCsv.js';
import {accountHistoryFilters} from '../../src/lib/accountHistoryFilters.js';
import {createBackofficeService} from '../../src/services/backofficeService.js';
import {createBackofficeRepository} from '../../src/repositories/backofficeRepository.js';
import {createBackofficeHandlers} from '../../app/api/admin/backoffice/route.js';
const operator='11111111-1111-1111-1111-111111111111',workspaceId='22222222-2222-2222-2222-222222222222',customerId='33333333-3333-3333-3333-333333333333',env={NEXOCLIP_OPERATOR_USER_IDS:operator};
const input={userId:operator,workspaceId,customerId,history:'ledger',from:'2024-02-29',to:'2024-02-29'};
test('CSV exports only allowed columns, exact decimals, UTC dates and safe spreadsheet text',()=>{
 const filters=accountHistoryFilters(input);
 const csv=accountHistoryCsv({workspaceId,customerId,filters,exportedAt:new Date('2026-10-08T00:00:00Z'),data:{pagination:{total:1},rows:[{id:'1',reason:' \n=HYPERLINK("x")',amount:'-0.123456',balance_after:'9007199254740993.123456',created_at:'2024-02-29T07:00:00+07:00',metadata:'SECRET',token_hash:'SECRET'}]}});
 assert.ok(csv.startsWith('\uFEFF'));assert.match(csv,/"export_summary"/);assert.match(csv,/"-0.123456"/);assert.match(csv,/"9007199254740993.123456"/);assert.match(csv,/"2024-03-01T00:00:00.000Z"/);assert.match(csv,/"2024-02-29T00:00:00.000Z"/);assert.match(csv,/"' \n=HYPERLINK\(""x""\)"/);assert.doesNotMatch(csv,/SECRET|token_hash|metadata/);
 const empty=accountHistoryCsv({workspaceId,customerId,filters,data:{pagination:{total:0},rows:[]}});assert.equal(empty.split('\r\n').length,3);
 for(const history of ['sessions','payments']){const text=accountHistoryCsv({workspaceId,customerId,filters:accountHistoryFilters({history}),data:{pagination:{total:1},rows:[{id:'abc',action:'@cmd',amount_idr:'123',credits:'7.200000',created_at:'2024-02-29',completed_at:null}]}});assert.match(text,history==='sessions'?/"'@cmd"/:/"7.200000"/);}
});
test('history export authorizes and validates before queries and fails closed for missing/oversize snapshots',async()=>{
 let queries=0,total=1,rows=[{id:'1',reason:'credit'}];
 const service=createBackofficeService({env,repository:{history:async(w,c,filters,options)=>{queries++;assert.equal(w,workspaceId);assert.equal(c,customerId);assert.equal(filters.since,'2024-02-29T00:00:00.000Z');assert.deepEqual(options,{exportAll:true});return total===null?null:{rows,pagination:{total}};}}});
 for(const invalid of [{userId:customerId},{customerId:''},{history:'users'},{from:'2023-02-29'}])await assert.rejects(service.exportHistory({...input,...invalid}));assert.equal(queries,0);
 const exported=await service.exportHistory({...input,page:9,pageSize:10});assert.match(exported.filename,/account-ledger/);assert.match(exported.csv,/"entry"/);
 total=5001;await assert.rejects(service.exportHistory(input),{status:413});total=2;await assert.rejects(service.exportHistory(input),{status:503});total=null;await assert.rejects(service.exportHistory(input),{status:404});
 let params;const repo=createBackofficeRepository({query:async(sql,values)=>{params=values;assert.match(sql,/SELECT count\(\*\)::int FROM filtered/);return {rows:[{authorized:true,total:0,rows:[]}]};}});
 await repo.history(workspaceId,customerId,{history:'ledger',page:99,from:input.from,to:input.to},{exportAll:true});assert.deepEqual(params,[workspaceId,customerId,5001,0,'2024-02-29T00:00:00.000Z','2024-03-01T00:00:00.000Z','%%']);
});
test('CSV HTTP endpoint denies customer/anonymous, ignores forged identity and returns attachment no-store',async()=>{
 let called=0;const request=format=>{const r=new Request(`http://localhost/api/admin/backoffice?export=${format}&workspaceId=${workspaceId}&customerId=${customerId}&history=ledger&from=2024-02-29&to=2024-02-29&userId=forged&page=99`);r.cookies={get:()=>({value:'session'})};return r;};
 const service={exportHistory:async fields=>{called++;assert.deepEqual(fields,{...input,category:null});return {csv:'\uFEFFcsv',filename:'safe.csv'};}};
 const handlers=session=>createBackofficeHandlers({env,service,sessionLookup:async()=>session});
 for(const session of [null,{user_id:customerId}])assert.equal((await handlers(session).GET(request('history-csv'))).status,session?403:401);assert.equal(called,0);
 const response=await handlers({user_id:operator}).GET(request('history-csv'));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('vary'),'Cookie');assert.equal(response.headers.get('content-type'),'text/csv; charset=utf-8');assert.equal(response.headers.get('content-disposition'),'attachment; filename="safe.csv"');assert.equal(response.headers.get('x-content-type-options'),'nosniff');
 assert.equal((await handlers({user_id:operator}).GET(request('invalid'))).status,400);assert.equal(called,1);
});
