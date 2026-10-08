import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LocalObjectStorage } from '../../src/storage/localObjectStorage.js';
import { createAssetDownloadGetHandler } from '../../app/api/assets/[assetId]/download/route.js';
const context={params:Promise.resolve({assetId:'asset'})};
function request() { const req=new Request('http://app/api/assets/asset/download?workspace_id=untrusted');req.cookies={get:()=>({value:'session'})};return req; }
test('local uploaded image is returned as HTTP bytes after verified workspace lookup',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'nexo-preview-'));const storage=new LocalObjectStorage({root,secret:'test'});
 try {
 const bytes=Buffer.from('image bytes');const upload=await storage.createUploadUrl({key:'verified/uploads/photo.png',contentType:'image/png'});await storage.put(upload.url,bytes,'image/png');
 const handler=createAssetDownloadGetHandler({resolveContext:async()=>({workspace:{id:'verified'}}),storageFactory:()=>storage,getDownload:async(id)=>{assert.equal(id,'verified');return {download:await storage.createDownloadUrl({key:'verified/uploads/photo.png'})};}});
 const response=await handler(request(),context);assert.equal(response.status,200);assert.equal(response.headers.get('location'),null);assert.equal(response.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);assert.match(response.headers.get('cache-control'),/private/);assert.equal(response.headers.get('vary'),'Cookie');
 }finally{await rm(root,{recursive:true,force:true});}
});
test('R2 downloads keep redirect behavior',async()=>{
 const handler=createAssetDownloadGetHandler({resolveContext:async()=>({workspace:{id:'verified'}}),storageFactory:()=>({}),getDownload:async()=>({download:{url:'https://storage.example/image.png'}})});
 const response=await handler(request(),context);assert.equal(response.status,302);assert.equal(response.headers.get('location'),'https://storage.example/image.png');
});
test('unauthenticated and cross-workspace requests cannot read local files',async()=>{
 for(const message of ['Authentication required','Workspace access denied']){
 let read=false;const handler=createAssetDownloadGetHandler({resolveContext:async()=>{throw new Error(message);},storageFactory:()=>{read=true;}});
 const response=await handler(request(),context);assert.equal(response.status,message.startsWith('Authentication')?401:403);assert.equal(read,false);
 }
});
test('missing local objects return 404 and storage errors do not expose paths',async()=>{
 for(const [error,status] of [[Object.assign(new Error('/private/secret'),{code:'ENOENT'}),404],[new Error('/private/secret'),500]]){
 const handler=createAssetDownloadGetHandler({resolveContext:async()=>({workspace:{id:'verified'}}),storageFactory:()=>({get:async()=>{throw error;}}),getDownload:async()=>({download:{url:'local://download'}})});
 const response=await handler(request(),context);assert.equal(response.status,status);assert.doesNotMatch(JSON.stringify(await response.json()),/secret/);
 }
});
