import test from 'node:test';
import assert from 'node:assert/strict';
import { assetPreviewUrl } from '../../packages/studio/src/assetPreviewUrl.js';
test('preview bypasses cached internal redirect and preserves tenant and thumb parameters',()=>{
 const original='/api/assets/asset/download?workspace_id=workspace&variant=thumb';
 const preview=assetPreviewUrl(original);
 assert.equal(preview,'/api/assets/asset/download?workspace_id=workspace&variant=thumb&preview=http-v1');
 assert.equal(assetPreviewUrl(preview),preview);assert.equal(original,'/api/assets/asset/download?workspace_id=workspace&variant=thumb');
});
test('external signed URLs and other preview schemes remain unchanged',()=>{
 for(const url of ['https://cdn.example/image.png?signature=abc','blob:example','data:image/png;base64,abc',null,'/other'])assert.equal(assetPreviewUrl(url),url);
});
