import test from 'node:test';
import assert from 'node:assert/strict';
import {providerBillingJobPath} from '../../src/lib/providerBillingNavigation.js';
test('billing navigation carries both identities and refuses missing or malformed job scope',()=>{
 const workspace='11111111-1111-1111-1111-111111111111',job='22222222-2222-2222-2222-222222222222';
 const path=providerBillingJobPath(workspace,job);
 const url=new URL(path,'http://localhost');
 assert.equal(url.pathname,'/admin/provider-billing');assert.equal(url.searchParams.get('jobId'),job);assert.equal(url.searchParams.get('workspaceId'),workspace);
 for(const [w,j] of [[null,job],[workspace,null],[workspace,'../admin'],[[workspace],job]])assert.equal(providerBillingJobPath(w,j),null);
});
