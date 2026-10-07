import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackofficeService } from '../../src/services/backofficeService.js';
import { createBackofficeHandlers } from '../../app/api/admin/backoffice/route.js';
const operator='11111111-1111-1111-1111-111111111111',workspace='22222222-2222-2222-2222-222222222222',customer='33333333-3333-3333-3333-333333333333',key='44444444-4444-4444-4444-444444444444';
const env={NEXOCLIP_OPERATOR_USER_IDS:operator};
test('backoffice denies non-operators before reading any account or mutating credit',async()=>{
 const service=createBackofficeService({env,repository:{directory(){throw Error('must not query');},transaction(){throw Error('must not query');}}});
 await assert.rejects(service.read({userId:customer}),{status:403});
 await assert.rejects(service.mutate({userId:customer,input:{}}),{status:403});
});
test('workspace/customer membership and typed credit source are mandatory',async()=>{
 const repository={transaction:fn=>fn({}),lockWorkspace:async()=>({}),member:async()=>null};
 const service=createBackofficeService({env,repository});
 await assert.rejects(service.mutate({userId:operator,workspaceId:workspace,input:{action:'grant',customerId:customer,requestKey:key,credits:50,type:'trial',reason:'test'}}),{status:404});
 repository.member=async()=>({});
 for(const fields of [{credits:-1},{credits:'NaN'},{credits:10000001},{type:'paid'},{reason:''}])await assert.rejects(service.mutate({userId:operator,workspaceId:workspace,input:{action:'grant',customerId:customer,requestKey:key,credits:50,type:'trial',reason:'test',...fields}}),{status:400});
});
test('session identity is server-owned, POST requires same origin, errors do not leak SQL',async()=>{
 let called=false;
 const handlers=createBackofficeHandlers({env,sessionLookup:async()=>({user_id:operator}),service:{read:async v=>{assert.equal(v.userId,operator);return {};},mutate:async v=>{called=true;assert.equal(v.userId,operator);throw Error('secret SQL');}}});
 const req=(origin)=>{const r=new Request('http://localhost/api/admin/backoffice',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({userId:customer})});r.cookies={get:()=>({value:'session'})};return r;};
 assert.equal((await handlers.POST(req('https://hostile.example'))).status,403);assert.equal(called,false);
 const result=await handlers.POST(req('http://localhost'));assert.equal(result.status,500);assert.doesNotMatch(await result.text(),/secret SQL/);
 const unauth=createBackofficeHandlers({env,sessionLookup:async()=>null});assert.equal((await unauth.POST(req('http://localhost'))).status,401);
});
