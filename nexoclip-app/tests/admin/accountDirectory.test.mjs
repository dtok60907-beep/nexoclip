import test from 'node:test';
import assert from 'node:assert/strict';
import {accountDirectoryFilters} from '../../src/lib/accountDirectoryFilters.js';
import {createBackofficeService} from '../../src/services/backofficeService.js';
import {createBackofficeRepository} from '../../src/repositories/backofficeRepository.js';
import {createBackofficeHandlers} from '../../app/api/admin/backoffice/route.js';
const operator='550e8400-e29b-41d4-a716-446655440001';
const env={NEXOCLIP_OPERATOR_USER_IDS:operator};
test('directory filters normalize defaults and reject invalid pagination/status before querying',async()=>{
 assert.deepEqual(accountDirectoryFilters(),{q:'',status:'all',page:1,pageSize:25});
 assert.deepEqual(accountDirectoryFilters({q:' Alice ',status:'suspended',page:'2',pageSize:'50',history:null,from:null,to:null,category:null}),{q:'Alice',status:'suspended',page:2,pageSize:50});
 const repository={directory:()=>{throw Error('must not query');}},service=createBackofficeService({repository,env});
 for(const input of [{q:'x'.repeat(121)},{q:[]},{status:'owner'},{status:''},{page:0},{page:'1e2'},{page:'01'},{page:2.5},{page:1000001},{pageSize:500},{pageSize:''},{pageSize:true}]) {
  assert.throws(()=>accountDirectoryFilters(input),{status:400});
  await assert.rejects(service.read({userId:operator,...input}),{status:400});
 }
 await assert.rejects(service.read({userId:'customer',status:'all'}),{status:403});
});
test('directory query binds literal wildcard searches and shares its snapshot count with page rows',async()=>{
 const calls=[];
 const repository=createBackofficeRepository({query:async(sql,params)=>{calls.push({sql,params});return sql.startsWith('WITH')?{rows:[{users:[{id:'user'}],total:57}]}:{rows:[{id:'workspace'}]};}});
 const result=await repository.directory({q:'a%_\\',status:'active',page:3,pageSize:25});
 assert.deepEqual(calls[0].params,['%a\\%\\_\\\\%','active',25,50]);
 assert.match(calls[0].sql,/SELECT count\(\*\)::int FROM filtered/);
 assert.match(calls[0].sql,/SELECT \* FROM filtered ORDER BY created_at DESC,id LIMIT \$3 OFFSET \$4/);
 assert.doesNotMatch(calls[0].sql,/password_hash|token_hash/);
 assert.deepEqual(result.pagination,{page:3,pageSize:25,total:57,pages:3});
});
test('directory GET forwards only trusted operator identity and filters and denies customer access',async()=>{
 const request=new Request('http://localhost/api/admin/backoffice?q=Alice&status=suspended&page=2&pageSize=50&userId=forged');request.cookies={get:()=>({value:'session'})};
 let called=0;
 const service={read:async input=>{called++;assert.deepEqual(input,{userId:operator,workspaceId:null,customerId:null,q:'Alice',status:'suspended',page:'2',pageSize:'50',history:null,from:null,to:null,category:null});return {pagination:{page:2,pageSize:50,total:100,pages:2}};}};
 const response=await createBackofficeHandlers({env,service,sessionLookup:async()=>({user_id:operator})}).GET(request);
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
 assert.equal((await createBackofficeHandlers({env,service,sessionLookup:async()=>({user_id:'customer'})}).GET(request)).status,403);
 assert.equal((await createBackofficeHandlers({env,service,sessionLookup:async()=>null}).GET(request)).status,401);assert.equal(called,1);
});
