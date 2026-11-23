import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseByteRange } from '../../src/lib/httpByteRange.mjs';
import { LocalObjectStorage } from '../../src/storage/localObjectStorage.js';
import { ensureAssetThumbnail,thumbnailKeyFor } from '../../src/services/assetThumbnailService.js';
import { createAssetDownloadGetHandler } from '../../app/api/assets/[assetId]/download/route.js';
import { listTikTokPublishMedia } from '../../src/repositories/tiktokPublishMediaRepository.mjs';

test('publisher reads one media type per bounded page and retains tenant ownership',async()=>{
  const calls=[],pool={query:async(sql,args)=>{calls.push({sql,args});return {rows:Array.from({length:25},(_,i)=>({id:`asset-${i}`,asset_id:`video-${i}`}))};}};
  const videos=await listTikTokPublishMedia(pool,{workspaceId:'workspace',userId:'user'});
  assert.equal(calls.length,1);assert.match(calls[0].sql,/g.created_by_user_id=\$2/);assert.deepEqual(calls[0].args,['workspace','user',0]);
  assert.equal(videos.videos.length,24);assert.deepEqual(videos.photos,[]);assert.equal(videos.nextOffset,24);
  const photos=await listTikTokPublishMedia(pool,{workspaceId:'workspace',userId:'user',mediaType:'photo',offset:24});
  assert.equal(calls.length,2);assert.deepEqual(calls[1].args,['workspace',24]);assert.match(photos.photos[0].thumbnailUrl,/variant=thumb/);assert.doesNotMatch(photos.photos[0].url,/variant=thumb/);
  for(const bad of [{mediaType:'audio'},{offset:-1},{offset:1.5},{offset:10001}])await assert.rejects(listTikTokPublishMedia(pool,{workspaceId:'workspace',userId:'user',...bad}),e=>e.status===400);
});

test('byte ranges support open, bounded and suffix reads and reject malformed requests',()=>{
  assert.deepEqual(parseByteRange('bytes=2-5',10),{start:2,end:5});
  assert.deepEqual(parseByteRange('bytes=8-',10),{start:8,end:9});
  assert.deepEqual(parseByteRange('bytes=-3',10),{start:7,end:9});
  assert.deepEqual(parseByteRange('bytes=2-999',10),{start:2,end:9});
  assert.deepEqual(parseByteRange('bytes=-30',10),{start:0,end:9});
  assert.equal(parseByteRange(null,10),null);
  for(const value of ['bytes=10-','bytes=5-2','bytes=-0','bytes=-','bytes=1-2,4-5','bytes=9007199254740992-','items=0-2'])assert.throws(()=>parseByteRange(value,10),e=>e.status===416&&e.size===10);
});

test('local video responses stream requested bytes with 206 rather than buffering the full file',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'nexo-video-range-'));
  try {
    const storage=new LocalObjectStorage({root,secret:'test'}),bytes=Buffer.from('0123456789');
    const upload=await storage.createUploadUrl({key:'workspace/video.mp4',contentType:'video/mp4'});await storage.put(upload.url,bytes,'video/mp4');
    storage.get=()=>assert.fail('Video range must not read the full object');
    const handler=createAssetDownloadGetHandler({resolveContext:async()=>({workspace:{id:'workspace'}}),storageFactory:()=>storage,
      getDownload:async(workspaceId)=>{assert.equal(workspaceId,'workspace');return {asset:{content_type:'video/mp4'},download:await storage.createDownloadUrl({key:'workspace/video.mp4'})};}});
    const request=range=>Object.assign(new Request('http://app/api/assets/id/download?workspace_id=untrusted',{headers:range?{range}:{}}),{cookies:{get:()=>({value:'session'})}});
    const context={params:Promise.resolve({assetId:'id'})};
    const response=await handler(request('bytes=3-5'),context);
    assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),'bytes 3-5/10');assert.equal(response.headers.get('content-length'),'3');assert.equal(await response.text(),'345');assert.equal(response.headers.get('vary'),'Cookie');
    const invalid=await handler(request('bytes=10-'),context);assert.equal(invalid.status,416);assert.equal(invalid.headers.get('content-range'),'bytes */10');
    const full=await handler(request(),context);assert.equal(full.status,200);assert.equal(full.headers.get('accept-ranges'),'bytes');assert.equal(await full.text(),'0123456789');
    const head=Object.assign(new Request('http://app/api/assets/id/download?workspace_id=workspace',{method:'HEAD'}),{cookies:{get:()=>({value:'session'})}});
    const metadata=await handler(head,context);assert.equal(metadata.status,200);assert.equal(metadata.headers.get('content-length'),'10');assert.equal(await metadata.text(),'');
    const download=await storage.createDownloadUrl({key:'workspace/video.mp4'});
    await assert.rejects(storage.getRange(download.url.replace('signature=','signature=bad'),'bytes=0-1'),/signature/);
    const escape=await storage.createDownloadUrl({key:'../escape'});await assert.rejects(storage.getRange(escape.url,'bytes=0-1'),/storage key/);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('local image thumbnails use signed capabilities and reuse the generated thumbnail',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'nexo-local-thumb-'));
  try {
    const storage=new LocalObjectStorage({root,secret:'test'}),key='workspace/image.png';
    const upload=await storage.createUploadUrl({key,contentType:'image/png'});await storage.put(upload.url,Buffer.from('original'),'image/png');
    let resized=0;const resize=async body=>{assert.equal(body.toString(),'original');resized++;return Buffer.from('small thumbnail');};
    const asset={storage_key:key,content_type:'image/png'};
    const thumbnail=await ensureAssetThumbnail(storage,asset,{resize});
    assert.equal(thumbnail,thumbnailKeyFor(key));assert.equal(await storage.exists(thumbnail),true);
    assert.equal(await ensureAssetThumbnail(storage,asset,{resize}),thumbnail);assert.equal(resized,1);
    const download=await storage.createDownloadUrl({key:thumbnail});assert.equal((await storage.get(download.url)).contentType,'image/webp');
    await assert.rejects(storage.exists('../escape'),/storage key/);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('range requests still require tenant authorization before touching storage',async()=>{
  for(const message of ['Authentication required','Workspace access denied']){
    const handler=createAssetDownloadGetHandler({resolveContext:async()=>{throw new Error(message);},storageFactory:()=>assert.fail('No storage access')});
    const request=Object.assign(new Request('http://app/api/assets/id/download?workspace_id=other',{headers:{range:'bytes=0-1'}}),{cookies:{get:()=>undefined}});
    const response=await handler(request,{params:Promise.resolve({assetId:'id'})});assert.equal(response.status,message.startsWith('Authentication')?401:403);
  }
});
