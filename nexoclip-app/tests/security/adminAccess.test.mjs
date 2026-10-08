import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,readdir } from 'node:fs/promises';
import { createAdminPageGuard } from '../../src/lib/auth/adminPageAccess.js';
import { createAdminConsoleGetHandler } from '../../app/api/admin/console/route.js';
import { createAdminAuditGetHandler } from '../../app/api/admin/audit/route.js';
import { createModelRatesGetHandler } from '../../app/api/admin/models/route.js';
import { createEconomicsGetHandler } from '../../app/api/admin/economics/route.js';
import { createPaymentFeeGetHandler,createPaymentFeeHandler } from '../../app/api/admin/economics/payment-fees/route.js';
import { createBackofficeHandlers } from '../../app/api/admin/backoffice/route.js';
import { createProviderBillingHandlers } from '../../app/api/admin/provider-billing/route.js';
const env={NEXOCLIP_OPERATOR_USER_IDS:'operator'};
function request(method='GET'){
  const r=new Request('http://localhost/api/admin/test?userId=operator&isPlatformOperator=true',{
    method,headers:{'x-workspace-id':'customer-workspace',origin:'http://localhost','content-type':'application/json'},
    ...(method==='POST'?{body:JSON.stringify({userId:'operator',role:'owner',isPlatformOperator:true})}:{})});
  r.cookies={get:()=>({value:'verified-token'})};return r;
}
test('page guard sends anonymous users to login and every ordinary customer role to Studio',async()=>{
  for(const role of ['member','admin','owner']){
    let destination;
    const guard=createAdminPageGuard({env,cookieStore:async()=>({get:()=>({value:'token'})}),sessionLookup:async()=>({user_id:'customer',role,isPlatformOperator:true}),redirectTo:value=>{destination=value;throw Error('redirect');}});
    await assert.rejects(guard(),/redirect/);assert.equal(destination,'/studio');
  }
  let destination;
  const guard=createAdminPageGuard({env,cookieStore:async()=>({get:()=>undefined}),sessionLookup:async()=>null,redirectTo:value=>{destination=value;throw Error('redirect');}});
  await assert.rejects(guard(),/redirect/);assert.equal(destination,'/login');
});
test('page guard fails closed without allowlist and never trusts capability flags',async()=>{
  const make=configuration=>createAdminPageGuard({env:configuration,cookieStore:async()=>({get:()=>({value:'token'})}),sessionLookup:async()=>({user_id:'operator'}),redirectTo:value=>{throw Error(value);}});
  await assert.rejects(make({})(),/\/studio/);
  assert.equal((await make(env)()).user_id,'operator');
});
test('all admin page entry points and root layout are protected during direct and partial navigation',async()=>{
  const base=new URL('../../app/admin/',import.meta.url);
  const layout=await readFile(new URL('layout.js',base),'utf8');assert.match(layout,/await requireAdminPage\(/);
  for(const entry of await readdir(base,{withFileTypes:true})){
    const name=entry.isDirectory()?`${entry.name}/page.js`:entry.name==='page.js'?'page.js':null;if(!name)continue;
    const source=await readFile(new URL(name,base),'utf8');
    if(/AdminConsolePage/.test(source))assert.match(await readFile(new URL('../../components/AdminConsolePage.js',import.meta.url),'utf8'),/await requireAdminPage\(/);
    else if(/BackofficePage/.test(source))assert.match(await readFile(new URL('../../components/BackofficePage.js',import.meta.url),'utf8'),/await requireAdminPage\(/);
    else assert.match(source,/await requireAdminPage\(/,name);
  }
});
test('every tenant admin endpoint denies customers including workspace owners before report queries',async()=>{
  for(const role of ['owner','admin','member']){
    let called=0;
    const reject=async()=>{called++;throw Error('report must not run');};
    const resolveContext=async()=>({user:{id:'customer',isPlatformOperator:true},workspace:{id:'customer-workspace',role}});
    const handlers=[
      createAdminConsoleGetHandler({env,resolveContext,service:{read:reject}}),
      createAdminAuditGetHandler({env,resolveContext,service:{listJobs:reject}}),
      createModelRatesGetHandler({env,resolveContext,service:{read:reject}}),
      createEconomicsGetHandler({env,resolveContext,service:{getReport:reject}}),
      createPaymentFeeGetHandler({env,resolveContext,list:reject}),
      createPaymentFeeHandler({env,resolveContext,reconcile:reject}),
    ];
    for(let i=0;i<handlers.length;i++)assert.equal((await handlers[i](request(i===5?'POST':'GET'))).status,403);
    assert.equal(called,0);
  }
});
test('global backoffice and supplier billing deny customer reads and writes before services',async()=>{
  for(const factory of [createBackofficeHandlers,createProviderBillingHandlers]){
    let called=0;
    const service={read:async()=>called++,mutate:async()=>called++};
    const handlers=factory({env,sessionLookup:async()=>({user_id:'customer',isPlatformOperator:true}),service});
    for(const method of ['GET','POST'])assert.equal((await handlers[method](request(method))).status,403);
    assert.equal(called,0);
    const unsigned=factory({env,sessionLookup:async()=>null,service});
    for(const method of ['GET','POST'])assert.equal((await unsigned[method](request(method))).status,401);
  }
});
test('operator can read each report with only session-owned identity and tenant scope',async()=>{
  const resolveContext=async()=>({user:{id:'operator'},workspace:{id:'verified-workspace',role:'owner'}});
  const assertActor=async args=>{assert.equal(args.userId,'operator');assert.equal(args.workspaceId,'verified-workspace');return {};};
  for(const handler of [createAdminConsoleGetHandler({env,resolveContext,service:{read:assertActor}}),createAdminAuditGetHandler({env,resolveContext,service:{listJobs:assertActor}}),createModelRatesGetHandler({env,resolveContext,service:{read:async args=>{assert.equal(args.userId,'operator');return {};}}}),createEconomicsGetHandler({env,resolveContext,service:{getReport:assertActor}})])assert.equal((await handler(request())).status,200);
});
