import test from 'node:test';
import assert from 'node:assert/strict';
import { createModelRatesService, modelRateCatalog } from '../../src/services/modelRatesService.js';
import { resetOpenRouterPriceCache } from '../../src/services/generationPricing.js';
import { createModelRatesGetHandler } from '../../app/api/admin/models/route.js';
const env={NEXOCLIP_OPERATOR_USER_IDS:'operator',USD_IDR_RATE:'17915',CREDIT_MARKUP_PERCENT:'30'};
const offline=async()=>new Response(JSON.stringify({data:[]}),{headers:{'content-type':'application/json'}});
test('catalog includes image/video families without jobs and all modes map to Studio',()=>{
 const rows=modelRateCatalog(); assert.ok(rows.length>50); assert.equal(new Set(rows.map(x=>x.key)).size,rows.length);
 for(const family of ['seedream','gemini','gpt-image','seedance']) assert.ok(rows.some(r=>r.model.includes(family)));
 assert.ok(rows.every(r=>!r.resolutions.includes('basic')));
 assert.equal(rows.find(r=>r.id==='seedance-2.5-text-to-video-480p').defaultResolution,'480p');
});
test('catalog quotes use pricing engine, FX and markup and fetch metadata once',async()=>{
 resetOpenRouterPriceCache(); let calls=0;
 const service=createModelRatesService({env,fetchImpl:async(...args)=>{calls++;return offline(...args);}});
 const data=await service.read({userId:'operator'}); assert.equal(calls,1);
 const image=data.items.find(r=>r.model.includes('seedream')&&r.operation==='text-to-image');
 assert.equal(image.usd,0.04); assert.equal(image.idr,0.04*17915); assert.equal(image.credits,5.2); assert.equal(image.source,'byteplus-rate-table');
 const gemini=data.items.find(r=>r.model.includes('gemini')); assert.ok(gemini.usage.outputTokens>0); assert.equal(gemini.source,'image-rate-table');
});
test('selected quotes change with duration and reject unsupported parameters and nonoperators',async()=>{
 const service=createModelRatesService({env,fetchImpl:offline});
 const row=modelRateCatalog().find(r=>r.id==='seedance-2.5-text-to-video');
 const a=(await service.read({userId:'operator',key:row.key,input:{duration:'5'}})).items[0];
 const b=(await service.read({userId:'operator',key:row.key,input:{duration:'15'}})).items[0];
 assert.ok(b.usd>a.usd); assert.equal(b.configuration.duration,15); assert.ok(b.usage.outputAndReferenceTokens>a.usage.outputAndReferenceTokens);
 for(const input of [{duration:'2'},{duration:'100'},{resolution:'360p'},{referenceImages:'-1'}]) await assert.rejects(service.read({userId:'operator',key:row.key,input}),{status:400});
 await assert.rejects(service.read({userId:'owner'}),{status:403});
});
test('unknown rates remain unknown and route enforces membership and hides errors',async()=>{
 const service=createModelRatesService({env,price:async()=>null,catalog:()=>[{key:'x',kind:'image',model:'x',defaultResolution:'1K',defaultDuration:5,resolutions:[],durations:[],minDuration:1,operation:'text-to-image'}]});
 const row=(await service.read({userId:'operator'})).items[0]; assert.equal(row.usd,null);assert.equal(row.credits,null);assert.equal(row.idr,null);
 for(const [error,status] of [[new Error('Workspace access denied'),403],[new Error('database secret'),500]]) {
 const handler=createModelRatesGetHandler({resolveContext:async()=>{throw error;}});
 const request=new Request('http://app/api/admin/models',{headers:{'x-workspace-id':'other'}});request.cookies={get:()=>null};
 const response=await handler(request);assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.doesNotMatch(JSON.stringify(await response.json()),/secret/);
 }
});
