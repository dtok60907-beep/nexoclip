import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import React,{act} from 'react';
import {transformSync} from '@babel/core';
const require=createRequire(import.meta.url),canvasRequire=createRequire(new URL('../../services/spite/package.json',import.meta.url));
const {JSDOM}=canvasRequire('jsdom');
const url=new URL('../../components/BackofficeDashboard.js',import.meta.url);
const {code}=transformSync(await readFile(url,'utf8'),{filename:url.pathname,configFile:false,babelrc:false,presets:[['@babel/preset-react',{runtime:'automatic'}]],plugins:['@babel/plugin-transform-modules-commonjs']});

test('history pagers are independent, discard stale data, reset with account and refetch shrinking pages',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/admin/accounts'});
 const previous=new Map(['window','document','navigator','IS_REACT_ACT_ENVIRONMENT'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 Object.defineProperties(globalThis,{window:{value:dom.window,configurable:true},document:{value:dom.window.document,configurable:true},navigator:{value:dom.window.navigator,configurable:true},IS_REACT_ACT_ENVIRONMENT:{value:true,configurable:true}});
 const calls=[],exports=[],module={exports:{}};
 vm.runInNewContext(code,{module,exports:module.exports,URLSearchParams,AbortController,require:name=>{
  if(['./AdminShell','./AccountAccessPanel'].includes(name))return ()=>null;
  if(name.endsWith('/saas/downloadCsv.js'))return {downloadCsv:(path,options)=>new Promise((resolve,reject)=>exports.push({params:new URL(path,'http://localhost').searchParams,...options,resolve,reject}))};
  if(name.endsWith('/saas/api.js'))return {saasFetch:(path,options)=>new Promise((resolve,reject)=>calls.push({params:new URL(path,'http://localhost').searchParams,signal:options?.signal,resolve,reject}))};
  return createRequire(url)(name);
 }});
 const {createRoot}=await import('react-dom/client'),root=createRoot(dom.window.document.getElementById('root'));
 let workspaceId='22222222-2222-2222-2222-222222222222';
 const profile=id=>({workspace:{id:workspaceId,name:'Shared',balance:'50',reserved:'0'},account:{id,email:`${id}@fixture.test`,role:'member',created_at:'2026-10-01'},jobs:[],lots:[],audit:[],economics:null,
  sessions:[{id:'session',action:`initial-${id}`}],payments:[{id:'payment',order_id:'initial-payment'}],ledger:[{id:'entry',reason:'initial-credit',amount:'1',balance_after:'50'}],
  historyPagination:Object.fromEntries(['sessions','payments','ledger'].map(history=>[history,{page:1,pageSize:25,total:63,pages:3}]))});
 const mount=id=>act(async()=>root.render(React.createElement(module.exports.CustomerProfile,{data:profile(id)})));
 const section=history=>dom.window.document.querySelector(`section[aria-label="${history==='sessions'?'Aktivitas sesi akun (UTC)':history==='payments'?'Pembayaran workspace (UTC)':'Ledger kredit workspace (UTC)'}"]`);
 const click=(history,label)=>act(async()=>[...section(history).querySelectorAll('button')].find(button=>button.textContent===label).click());
 const resize=(history,size)=>act(async()=>{const select=section(history).querySelector('select');select.value=String(size);select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
 const result=(call,rows,total=63)=>({rows,pagination:{page:Number(call.params.get('page')),pageSize:Number(call.params.get('pageSize')),total,pages:Math.max(1,Math.ceil(total/Number(call.params.get('pageSize'))))}});
 try {
  await mount('first');assert.equal(calls.length,0);
  await click('sessions','Berikutnya');const stale=calls.at(-1);assert.equal(stale.params.get('history'),'sessions');assert.equal(stale.params.get('page'),'2');assert.equal(stale.params.get('customerId'),'first');
  assert.match(section('payments').textContent,/initial-payment/);assert.match(section('payments').textContent,/Halaman 1 \/ 3/);
  await resize('payments',50);const payment=calls.at(-1);assert.equal(payment.params.get('history'),'payments');assert.equal(payment.params.get('page'),'1');assert.equal(payment.params.get('pageSize'),'50');
  await act(async()=>payment.resolve(result(payment,[{id:'new-payment',order_id:'payment-page-50'}])));assert.match(section('payments').textContent,/payment-page-50/);
  await resize('sessions',10);const session=calls.at(-1);assert.equal(stale.signal.aborted,true);assert.equal(session.params.get('page'),'1');
  await act(async()=>{session.resolve(result(session,[{id:'new-session',action:'current-session'}]));stale.resolve(result(stale,[{id:'stale-session',action:'stale-session'}]));});
  assert.match(section('sessions').textContent,/current-session/);assert.doesNotMatch(section('sessions').textContent,/stale-session/);assert.match(section('payments').textContent,/payment-page-50/);
  const dateInput=(history,index,value)=>act(async()=>{const input=section(history).querySelectorAll('input[type="date"]')[index];Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
  const beforeDates=calls.length;
  await dateInput('sessions',0,'2024-03-01');await dateInput('sessions',1,'2024-02-29');
  assert.equal(calls.length,beforeDates,'draft dates should not fetch');
  await click('sessions','Terapkan filter');assert.equal(calls.length,beforeDates);assert.match(section('sessions').textContent,/Tanggal awal harus/);assert.match(section('sessions').textContent,/Sejak awal/);
  await dateInput('sessions',0,'2024-02-29');await click('sessions','Terapkan filter');const dated=calls.at(-1);
  assert.equal(dated.params.get('from'),'2024-02-29');assert.equal(dated.params.get('to'),'2024-02-29');assert.equal(dated.params.get('page'),'1');assert.equal(dated.params.get('pageSize'),'10');
  await act(async()=>dated.resolve(result(dated,[{id:'dated',action:'dated-session'}])));assert.match(section('sessions').textContent,/2024-02-29 — 2024-02-29/);
  assert.match(section('payments').textContent,/payment-page-50/);assert.match(section('payments').textContent,/Sejak awal/);
  await dateInput('sessions',0,'2024-02-28');await click('sessions','Ekspor CSV');const exported=exports.at(-1);
  assert.equal(exported.params.get('from'),'2024-02-29','export uses applied dates, not draft');assert.equal(exported.params.get('export'),'history-csv');assert.equal(exported.params.has('page'),false);assert.equal(exported.params.has('pageSize'),false);
  assert.equal([...section('sessions').querySelectorAll('button')].find(b=>b.textContent==='Mengekspor…').disabled,true);
  await act(async()=>exported.reject(new Error('Persempit rentang tanggal')));assert.match(section('sessions').textContent,/Persempit rentang tanggal/);
  await click('sessions','Ekspor CSV');const canceledExport=exports.at(-1);

  await dateInput('sessions',0,'2024-02-29');
  await click('sessions','Berikutnya');const staleDate=calls.at(-1);assert.equal(staleDate.params.get('from'),'2024-02-29');assert.equal(staleDate.params.get('page'),'2');
  await dateInput('sessions',1,'2024-03-01');await click('sessions','Terapkan filter');const updatedDate=calls.at(-1);assert.equal(staleDate.signal.aborted,true);assert.equal(canceledExport.signal.aborted,true);assert.equal(updatedDate.params.get('page'),'1');assert.equal(updatedDate.params.get('to'),'2024-03-01');
  await act(async()=>{updatedDate.resolve(result(updatedDate,[{id:'current-date',action:'current-date-session'}]));staleDate.resolve(result(staleDate,[{id:'stale-date',action:'stale-date-session'}]));});assert.doesNotMatch(section('sessions').textContent,/stale-date-session/);
  await click('sessions','Reset filter');const resetDate=calls.at(-1);assert.equal(resetDate.params.get('from'),'');assert.equal(resetDate.params.get('to'),'');assert.equal(resetDate.params.get('page'),'1');assert.equal(section('sessions').querySelector('input').value,'');
  await act(async()=>resetDate.resolve(result(resetDate,[{id:'reset-date',action:'reset-date-session'}])));assert.match(section('sessions').textContent,/Sejak awal — Tanpa batas akhir/);
  const categorySelect=section('payments').querySelector('select[aria-label^="Jenis riwayat"]');
  await act(async()=>{categorySelect.value='completed';categorySelect.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
  const beforeCategory=calls.length;await click('payments','Ekspor CSV');const draftCategoryExport=exports.at(-1);assert.equal(draftCategoryExport.params.get('category'),'all');await act(async()=>draftCategoryExport.resolve());
  await click('payments','Terapkan filter');const categoryPage=calls.at(-1);assert.equal(calls.length,beforeCategory+1);assert.equal(categoryPage.params.get('category'),'completed');assert.equal(categoryPage.params.get('page'),'1');
  await act(async()=>categoryPage.resolve(result(categoryPage,[{id:'completed',order_id:'completed-order'}])));
  await click('payments','Ekspor CSV');const categoryExport=exports.at(-1);assert.equal(categoryExport.params.get('category'),'completed');await act(async()=>categoryExport.resolve());
  await click('payments','Berikutnya');const categoryNext=calls.at(-1);assert.equal(categoryNext.params.get('category'),'completed');await act(async()=>categoryNext.resolve(result(categoryNext,[])));
  await click('payments','Reset filter');const categoryReset=calls.at(-1);assert.equal(categoryReset.params.get('category'),'all');await act(async()=>categoryReset.resolve(result(categoryReset,[])));
  await click('ledger','Berikutnya');const oldAccount=calls.at(-1);
  await mount('second');assert.equal(oldAccount.signal.aborted,true);assert.match(section('sessions').textContent,/initial-second/);assert.match(section('sessions').textContent,/Halaman 1 \/ 3/);
  await act(async()=>oldAccount.resolve(result(oldAccount,[{id:'stale-credit',reason:'old-account-credit'}])));assert.doesNotMatch(section('ledger').textContent,/old-account-credit/);
  await click('sessions','Berikutnya');const failed=calls.at(-1);assert.equal(failed.params.get('customerId'),'second');
  await act(async()=>failed.reject(new Error('History access denied')));assert.match(section('sessions').textContent,/History access denied/);assert.doesNotMatch(section('sessions').textContent,/initial-second/);
  await click('sessions','Coba lagi');const retry=calls.at(-1);assert.equal(retry.params.get('page'),'2');
  await act(async()=>retry.resolve(result(retry,[],0)));const clamped=calls.at(-1);assert.notEqual(clamped,retry);assert.equal(clamped.params.get('page'),'1');
  await act(async()=>clamped.resolve(result(clamped,[],0)));assert.match(section('sessions').textContent,/0–0 dari 0 entri/);assert.match(section('sessions').textContent,/Belum ada data/);
  assert.match(section('payments').textContent,/initial-payment/);
  await click('payments','Berikutnya');const oldWorkspace=calls.at(-1);
  workspaceId='44444444-4444-4444-4444-444444444444';await mount('second');
  assert.equal(oldWorkspace.signal.aborted,true);assert.match(section('payments').textContent,/Halaman 1 \/ 3/);
  await click('payments','Berikutnya');assert.equal(calls.at(-1).params.get('workspaceId'),workspaceId);
  await act(async()=>oldWorkspace.resolve(result(oldWorkspace,[{id:'old-workspace',order_id:'other-workspace-payment'}])));assert.doesNotMatch(section('payments').textContent,/other-workspace-payment/);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});
