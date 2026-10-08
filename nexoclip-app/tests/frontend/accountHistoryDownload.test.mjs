import test from 'node:test';
import assert from 'node:assert/strict';
import {downloadCsv} from '../../src/lib/saas/downloadCsv.js';
test('CSV download sends same-origin session, handles errors and cancellation, and releases resources',async()=>{
 const previous=new Map(['fetch','document'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const create=URL.createObjectURL,revoke=URL.revokeObjectURL;let downloaded=0,removed=0,revoked=0,appended=0,link;
 const controller=new AbortController();
 try{
  globalThis.document={createElement:()=>link={click:()=>downloaded++,remove:()=>removed++},body:{appendChild:()=>appended++}};
  URL.createObjectURL=()=> 'blob:fixture';URL.revokeObjectURL=()=>revoked++;
  globalThis.fetch=async(path,options)=>{assert.equal(path,'/api/admin/backoffice?export=history-csv');assert.equal(options.credentials,'include');assert.equal(options.signal,controller.signal);return new Response('csv',{headers:{'content-type':'text/csv'}});};
  await downloadCsv('/api/admin/backoffice?export=history-csv',{signal:controller.signal,filename:'history.csv'});
  assert.equal(downloaded,1);assert.equal(link.download,'history.csv');assert.equal(removed,1);assert.equal(revoked,1);assert.equal(appended,1);
  globalThis.fetch=async()=>Response.json({error:'Persempit rentang tanggal'},{status:413});await assert.rejects(downloadCsv('/export'),/Persempit/);
  globalThis.fetch=async()=>new Response('<html>login</html>',{headers:{'content-type':'text/html'}});await assert.rejects(downloadCsv('/export'),/Format ekspor/);
  globalThis.fetch=async()=>{controller.abort();return new Response('csv',{headers:{'content-type':'text/csv'}});};await downloadCsv('/export',{signal:controller.signal});assert.equal(downloaded,1);
  await assert.rejects(downloadCsv('//external.test/export'),/URL unduhan/);
 }finally{URL.createObjectURL=create;URL.revokeObjectURL=revoke;for(const [key,value] of previous){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}
});
