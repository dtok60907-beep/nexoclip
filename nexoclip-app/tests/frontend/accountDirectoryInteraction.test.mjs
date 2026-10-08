import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import React,{act} from 'react';
import {transformSync} from '@babel/core';

const require=createRequire(import.meta.url);
const canvasRequire=createRequire(new URL('../../services/spite/package.json',import.meta.url));
const {JSDOM}=canvasRequire('jsdom');
const url=new URL('../../components/BackofficeDashboard.js',import.meta.url);
const {code}=transformSync(await readFile(url,'utf8'),{filename:url.pathname,configFile:false,babelrc:false,presets:[['@babel/preset-react',{runtime:'automatic'}]],plugins:['@babel/plugin-transform-modules-commonjs']});

test('Accounts resets pagination on filters, ignores stale responses, retries errors and clamps shrinking pages',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/admin/accounts'});
 const previous=new Map(['window','document','navigator','IS_REACT_ACT_ENVIRONMENT'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 Object.defineProperties(globalThis,{window:{value:dom.window,configurable:true},document:{value:dom.window.document,configurable:true},navigator:{value:dom.window.navigator,configurable:true},IS_REACT_ACT_ENVIRONMENT:{value:true,configurable:true}});
 const calls=[];
 const module={exports:{}};
 vm.runInNewContext(code,{module,exports:module.exports,URLSearchParams,AbortController,crypto:globalThis.crypto,require:name=>{
  if(name==='./AdminShell')return ({children})=>React.createElement('main',null,children);
  if(name==='./AccountAccessPanel')return ()=>null;
  if(name.endsWith('/saas/api.js'))return {saasFetch:(path,options)=>new Promise((resolve,reject)=>calls.push({params:new URL(path,'http://localhost').searchParams,signal:options?.signal,resolve,reject}))};
  return createRequire(url)(name);
 }});
 const {createRoot}=await import('react-dom/client');const root=createRoot(dom.window.document.getElementById('root'));
 const row=(email)=>({id:'customer',email,display_name:'Customer',created_at:'2026-10-01',suspended_at:null,workspaces:[]});
 const result=(call,email,total=61)=>({users:email?[row(email)]:[],workspaces:[],filters:{q:call.params.get('q'),status:call.params.get('status')},pagination:{page:Number(call.params.get('page')),pageSize:Number(call.params.get('pageSize')),total,pages:Math.max(1,Math.ceil(total/Number(call.params.get('pageSize'))))}});
 const latest=()=>calls.at(-1),text=()=>dom.window.document.body.textContent;
 const button=label=>[...dom.window.document.querySelectorAll('button')].find(node=>node.textContent===label);
 const click=async label=>act(async()=>button(label).click());
 try {
  await act(async()=>root.render(React.createElement(module.exports.default,{mode:'accounts'})));
  assert.equal(latest().params.get('page'),'1');assert.equal(latest().params.get('pageSize'),'25');
  await act(async()=>latest().resolve(result(latest(),'first@fixture.test')));
  await click('Berikutnya');const stale=latest();assert.equal(stale.params.get('page'),'2');
  const status=dom.window.document.querySelectorAll('select')[0];
  await act(async()=>{status.value='suspended';status.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
  assert.equal(stale.signal.aborted,true);assert.equal(latest().params.get('page'),'1');assert.equal(latest().params.get('status'),'suspended');
  const filtered=latest();await act(async()=>{filtered.resolve(result(filtered,'filtered@fixture.test'));stale.resolve(result(stale,'stale@fixture.test'));});
  assert.match(text(),/filtered@fixture.test/);assert.doesNotMatch(text(),/stale@fixture.test/);
  await click('Berikutnya');const failing=latest();await act(async()=>failing.reject(new Error('Directory unavailable')));assert.match(text(),/Directory unavailable/);assert.doesNotMatch(text(),/filtered@fixture.test/);
  await click('Coba lagi');const retry=latest();assert.equal(retry.params.get('page'),'2');
  await act(async()=>retry.resolve(result(retry,null,1)));assert.equal(latest().params.get('page'),'1');
  await act(async()=>latest().resolve(result(latest(),'remaining@fixture.test',1)));assert.match(text(),/Halaman 1 \/ 1/);
  const size=dom.window.document.querySelectorAll('select')[1];await act(async()=>{size.value='50';size.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
  assert.equal(latest().params.get('page'),'1');assert.equal(latest().params.get('pageSize'),'50');
  await act(async()=>latest().resolve(result(latest(),null,0)));assert.match(text(),/Tidak ada akun yang sesuai/);assert.match(text(),/0–0 dari 0 akun/);
  await click('Reset filter');assert.equal(latest().params.get('status'),'all');assert.equal(latest().params.get('q'),'');assert.equal(latest().params.get('pageSize'),'25');
  await act(async()=>latest().resolve(result(latest(),'reset@fixture.test')));
  const search=dom.window.document.querySelector('input');
  await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(search,'  email%_@fixture.test  ');search.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
  await click('Cari akun');assert.equal(latest().params.get('q'),'email%_@fixture.test');assert.equal(latest().params.get('page'),'1');
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});
