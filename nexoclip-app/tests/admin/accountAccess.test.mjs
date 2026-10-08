import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountAccessService} from '../../src/services/accountAccessService.js';
import {createAccountAccessHandlers} from '../../app/api/admin/account-access/route.js';
const actor='11111111-1111-1111-1111-111111111111',target='22222222-2222-2222-2222-222222222222',otherOperator='33333333-3333-3333-3333-333333333333',key='44444444-4444-4444-4444-444444444444';
const env={NEXOCLIP_OPERATOR_USER_IDS:`${actor},${otherOperator}`};
const input={targetUserId:target,action:'suspend',expectedVersion:'0',requestKey:key,reason:'Investigate account access'};
test('operator authorization and protected accounts run before all lifecycle mutations',async()=>{
 let calls=0;const service=createAccountAccessService({env,repository:{transaction:async()=>{calls++;}}});
 await assert.rejects(service.mutate({userId:target,input}),{status:403});
 for(const id of [actor,otherOperator,otherOperator.toUpperCase()])await assert.rejects(service.mutate({userId:actor,input:{...input,targetUserId:id}}),{status:409});
 for(const change of [{expectedVersion:0},{expectedVersion:'9223372036854775807'},{reason:'short'},{action:'delete'},{targetUserId:[target]},{requestKey:'bad'}])await assert.rejects(service.mutate({userId:actor,input:{...input,...change}}),{status:400});
 assert.equal(calls,0);
});
test('stale state and mismatched replay cannot revoke sessions, while an exact replay is side-effect free',async()=>{
 let revoked=0;const repository={transaction:async fn=>fn({}),account:async()=>({access_version:'1',suspended_at:null}),replay:async()=>null,revokeSessions:async()=>{revoked++;}};
 const service=createAccountAccessService({env,repository});
 await assert.rejects(service.mutate({userId:actor,input}),{status:409});assert.equal(revoked,0);
 repository.replay=async()=>({target_user_id:target,action:'suspend',reason:input.reason,previous_version:'0'});
 assert.equal((await service.mutate({userId:actor,input})).replayed,true);assert.equal(revoked,0);
 await assert.rejects(service.mutate({userId:actor,input:{...input,reason:'Another reason for same request'}}),{status:409});
});
const post=body=>new Request('http://localhost/api/admin/account-access',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify(body)});
const wrap=request=>Object.assign(request,{cookies:{get:()=>({value:'session'})}});
test('route rejects unauthenticated/customer/foreign-origin requests and takes actor identity from session',async()=>{
 let captured,calls=0;const service={mutate:async data=>{captured=data;calls++;return {};},read:async()=>{calls++;return {};}};
 const denied=createAccountAccessHandlers({env,service,sessionLookup:async()=>null});assert.equal((await denied.POST(wrap(post(input)))).status,401);
 const customer=createAccountAccessHandlers({env,service,sessionLookup:async()=>({user_id:target})});assert.equal((await customer.POST(wrap(post(input)))).status,403);assert.equal((await customer.GET(wrap(new Request(`http://localhost/api/admin/account-access?targetUserId=${target}`)))).status,403);
 const operator=createAccountAccessHandlers({env,service,sessionLookup:async()=>({user_id:actor})});
 const foreign=post(input);foreign.headers.set('origin','https://elsewhere.test');assert.equal((await operator.POST(wrap(foreign))).status,403);assert.equal(calls,0);
 const result=await operator.POST(wrap(post({...input,userId:target})));assert.equal(result.status,200);assert.equal(captured.userId,actor);assert.equal(result.headers.get('cache-control'),'private, no-store');
 assert.equal((await operator.POST(wrap(post({reason:'x'.repeat(5000)})))).status,413);
});
