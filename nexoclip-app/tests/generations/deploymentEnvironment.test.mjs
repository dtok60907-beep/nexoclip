import test from 'node:test';
import assert from 'node:assert/strict';
import { deploymentEnvironment } from '../../src/lib/deploymentEnvironment.js';
import { createImageGeneration } from '../../src/repositories/generationRepository.js';
import { imageWorkerConfig } from '../../src/queue/imageWorker.mjs';
import { videoWorkerConfig } from '../../src/queue/videoWorker.mjs';
test('BytePlus production account mismatches fail before either worker starts',()=>{
  const base={REDIS_URL:'redis://localhost',NEXOCLIP_ENVIRONMENT:'production',BYTEPLUS_API_KEY:'fake-test-key'};
  for(const config of [imageWorkerConfig,videoWorkerConfig]) {
    assert.throws(()=>config(base),/Production BytePlus requires/);
    assert.throws(()=>config({...base,BYTEPLUS_BILLING_ACCOUNT_ID:'111',BYTEPLUS_PRODUCTION_BILLING_ACCOUNT_ID:'222'}),/does not match/);
    assert.ok(config({...base,BYTEPLUS_BILLING_ACCOUNT_ID:'222',BYTEPLUS_PRODUCTION_BILLING_ACCOUNT_ID:'222'}));
    assert.throws(()=>config({...base,NEXOCLIP_ENVIRONMENT:'development',BYTEPLUS_BILLING_ACCOUNT_ID:'222',BYTEPLUS_PRODUCTION_BILLING_ACCOUNT_ID:'222'}),/Development must not/);
  }
});
test('deployment environment requires explicit server configuration, not NODE_ENV or customer input',async()=>{
  assert.equal(deploymentEnvironment({NODE_ENV:'production'}),'unclassified');
  assert.equal(deploymentEnvironment({NEXOCLIP_ENVIRONMENT:'development'}),'development');
  assert.equal(deploymentEnvironment({NEXOCLIP_ENVIRONMENT:'production'}),'production');
  assert.throws(()=>deploymentEnvironment({NEXOCLIP_ENVIRONMENT:'bad'}),/must be/);
  let values;
  await createImageGeneration({query:async(sql,args)=>{values=args;return {rows:[]};}},
    {workspaceId:'w',parameters:{},environment:deploymentEnvironment()==='production'?'development':'production'});
  assert.equal(values[7],deploymentEnvironment());
});
