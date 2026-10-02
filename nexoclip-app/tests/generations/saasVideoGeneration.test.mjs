import test from 'node:test';
import assert from 'node:assert/strict';

const { createSaasVideoHandler } = await import('../../src/services/saasVideoGeneration.js');
const { isTrustedAssetRequest } = await import('../../src/providers/providerRouter.js');

test('durable video handler submits, polls, downloads, and persists a tenant asset', async () => {
  const puts = [];
  const handler = createSaasVideoHandler({
    pool: { async connect() { return { async query() { return { rows: [{ id: 'asset-1' }] }; }, release() {} }; } },
    storage: { async createUploadUrl() { return { url: 'upload' }; }, async put(...args) { puts.push(args); } },
    providerRouter: {
      async submitVideo() { return { id: 'provider-job', provider: 'openrouter' }; },
      async pollVideo() { return { status: 'completed' }; },
      async downloadVideo() { return { buffer: Buffer.from('video'), contentType: 'video/mp4' }; },
    },
    createAsset: async () => ({ id: 'asset-1' }),
    sleep: async () => {},
  });
  const result = await handler({ id: 'job-1', workspace_id: 'workspace-1', model: 'bytedance/seedance-2.0', prompt: 'hello', parameters: { aspectRatio: '9:16', duration: 5 } });
  assert.equal(result.outputs[0].assetId, 'asset-1');
  assert.equal(puts.length, 1);
});

function trustedHandler({ links = {}, exactMatches = {}, model = 'bytedance/seedance-2.5', env = {}, assets = {}, submitError } = {}) {
  const submitted = [];
  const downloads = [];
  const lookups = [];
  const staleMappings = [];
  const pool = {
    async query(_sql, values) {
      const assetId = values[1];
      return { rows: assets[assetId] === false ? [] : [{ storage_key: `key-${assetId}`, content_type: 'image/png' }] };
    },
    async connect() { return { release() {} }; },
  };
  const handler = createSaasVideoHandler({
    pool,
    storage: {
      async createDownloadUrl({ key }) { return { url: `download-${key}` }; },
      async get(url) { downloads.push(url); return { body: Buffer.from(url), contentType: 'image/png' }; },
      async put() {},
    },
    providerRouter: {
      async submitVideo(request) { submitted.push(request); if (submitError) throw submitError; return { id: 'provider-job', provider: 'byteplus' }; },
      async pollVideo() { return { status: 'completed' }; },
      async downloadVideo() { return { buffer: Buffer.from('video'), contentType: 'video/mp4' }; },
    },
    findBytePlusAssetLink: async (_client, workspaceId, assetId, canvasProjectId = 'workspace') => {
      lookups.push(canvasProjectId === 'workspace' ? [workspaceId, assetId] : [workspaceId, assetId, canvasProjectId]);
      const link = links[`${workspaceId}:${assetId}`];
      return link ? { project_name: env.BYTEPLUS_PROJECT_NAME || 'default', ...link } : null;
    },
    findExactTrustedAsset: async ({ excludeAssetId }) => exactMatches[excludeAssetId] || null,
    markBytePlusAssetLinkStale: async (_client, input) => { staleMappings.push(input); return true; },
    createAsset: async () => ({ id: 'output-1' }),
    sleep: async () => {},
    env,
  });
  return { handler, submitted, downloads, lookups, staleMappings, model };
}

const assetUrl = (id) => `/api/assets/${id}/download`;

async function runTrusted(setup, parameters) {
  await setup.handler({ id: 'job-1', workspace_id: 'workspace-1', model: setup.model, prompt: 'hello', parameters });
  return setup.submitted[0];
}

test('active workspace mapping substitutes an asset URI before download for standard Seedance', async () => {
  const setup = trustedHandler({ links: { 'workspace-1:asset-1': { workspace_id: 'workspace-1', local_asset_id: 'asset-1', status: 'active', provider_asset_id: 'provider-1' } } });

  const request = await runTrusted(setup, { referenceImages: [assetUrl('asset-1')] });

  assert.deepEqual(request.referenceImages, ['asset://provider-1']);
  assert.equal(isTrustedAssetRequest(request), true);
  assert.deepEqual(setup.lookups, [['workspace-1', 'asset-1']]);
  assert.deepEqual(setup.downloads, []);
});

test('Seedance resolves trust in the Canvas project carried by the generation job', async () => {
  const canvasProjectId = '11111111-1111-4111-8111-111111111111';
  const setup = trustedHandler({ links: {
    'workspace-1:asset-1': { workspace_id: 'workspace-1', local_asset_id: 'asset-1', status: 'active', provider_asset_id: 'provider-1' },
  } });

  await runTrusted(setup, { canvasProjectId, referenceImages: [assetUrl('asset-1')] });

  assert.deepEqual(setup.lookups, [['workspace-1', 'asset-1', canvasProjectId]]);
});

test('provider missing-asset failure invalidates the exact trusted mapping and stops reuse', async () => {
  const setup = trustedHandler({
    links: { 'workspace-1:asset-1': { workspace_id: 'workspace-1', local_asset_id: 'asset-1', status: 'active', provider_asset_id: 'provider-1', attempt_id: 'attempt-1' } },
    submitError: Object.assign(new Error('safe failure'), { code: 'BYTEPLUS_REQUEST_FAILED', assetNotFound: true }),
  });
  await assert.rejects(
    runTrusted(setup, { referenceImages: [assetUrl('asset-1')] }),
    error => error.code === 'BYTEPLUS_ASSET_STALE' && /Trust this asset again/.test(error.message),
  );
  assert.deepEqual(setup.staleMappings, [{
    workspaceId: 'workspace-1', localAssetId: 'asset-1', canvasProjectId: 'workspace', providerAssetId: 'provider-1',
    attemptId: 'attempt-1', errorCode: 'BYTEPLUS_ASSET_NOT_FOUND',
  }]);
});

test('dedicated Seedance alias resolves through its configured BytePlus endpoint', async () => {
  const setup = trustedHandler({
    model: 'byteplus/seedance-2.5-unfiltered',
    env: { BYTEPLUS_SEEDANCE_2_5_ENDPOINT: 'ep-private-seedance' },
    links: { 'workspace-1:asset-1': { workspace_id: 'workspace-1', local_asset_id: 'asset-1', status: 'active', provider_asset_id: 'provider-1' } },
  });

  const request = await runTrusted(setup, { referenceImages: [assetUrl('asset-1')] });

  assert.deepEqual(request.referenceImages, ['asset://provider-1']);
});

test('known Seedance deployment endpoint substitutes its active mapping', async () => {
  const setup = trustedHandler({
    model: 'ep-20260904190604-p8pjl',
    links: { 'workspace-1:asset-1': { status: 'active', provider_asset_id: 'provider-1' } },
  });

  const request = await runTrusted(setup, { referenceImages: [assetUrl('asset-1')] });

  assert.deepEqual(request.referenceImages, ['asset://provider-1']);
});

test('known BytePlus image deployment endpoint retains raw resolution', async () => {
  const setup = trustedHandler({
    model: 'ep-20260907150312-xx7gf',
    links: { 'workspace-1:asset-1': { status: 'active', provider_asset_id: 'provider-1' } },
  });

  const request = await runTrusted(setup, { referenceImages: [assetUrl('asset-1')] });

  assert.match(request.referenceImages[0], /^data:image\/png;base64,/);
  assert.deepEqual(setup.lookups, []);
});

test('processing duplicate mapping is sent as raw image instead of another trusted asset', async () => {
  const setup = trustedHandler({
    links: { 'workspace-1:asset-1': { status: 'processing', provider_asset_id: 'processing-provider' } },
    exactMatches: { 'asset-1': { id: 'trusted-original', provider_asset_id: 'active-provider' } },
  });

  const request = await runTrusted(setup, { referenceImages: [assetUrl('asset-1')] });

  assert.match(request.referenceImages[0], /^data:image\/png;base64,/);
  assert.equal(isTrustedAssetRequest(request), false);
  assert.equal(setup.downloads.length, 1);
});

test('untrusted duplicate is sent as raw image instead of reusing another trusted asset', async () => {
  const setup = trustedHandler({
    exactMatches: { 'asset-1': { id: 'trusted-original', provider_asset_id: 'provider-1' } },
  });

  const request = await runTrusted(setup, { referenceImages: [assetUrl('asset-1')] });

  assert.match(request.referenceImages[0], /^data:image\/png;base64,/);
  assert.equal(isTrustedAssetRequest(request), false);
  assert.equal(setup.downloads.length, 1);
});

test('missing Seedance mapping falls back to raw image submission', async () => {
  const setup = trustedHandler();

  const request = await runTrusted(setup, { referenceImages: [assetUrl('asset-1')] });

  assert.match(request.referenceImages[0], /^data:image\/png;base64,/);
  assert.equal(setup.submitted.length, 1);
});

for (const status of ['processing', 'failed']) {
  test(`${status} mapping falls back to a raw image`, async () => {
    const setup = trustedHandler({ links: { 'workspace-1:asset-1': { status, provider_asset_id: 'provider-1' } } });

    const request = await runTrusted(setup, { referenceImages: [assetUrl('asset-1')] });
    assert.match(request.referenceImages[0], /^data:image\/png;base64,/);
    assert.equal(setup.downloads.length, 1);
  });
}

for (const providerAssetId of [null, '   ']) {
  test(`corrupt active mapping with ${providerAssetId === null ? 'missing' : 'blank'} provider id falls back to raw`, async () => {
    const setup = trustedHandler({ links: { 'workspace-1:asset-1': { status: 'active', provider_asset_id: providerAssetId } } });

    const request = await runTrusted(setup, { referenceImages: [assetUrl('asset-1')] });
    assert.match(request.referenceImages[0], /^data:image\/png;base64,/);
  });
}

test('mapping from a different BytePlus project is rejected before substitution', async () => {
  const setup = trustedHandler({
    env: { BYTEPLUS_PROJECT_NAME: 'project-current' },
    links: { 'workspace-1:asset-1': { status: 'active', project_name: 'project-old', provider_asset_id: 'provider-1' } },
  });

  await assert.rejects(
    runTrusted(setup, { referenceImages: [assetUrl('asset-1')] }),
    (error) => error.code === 'BYTEPLUS_ASSET_PROJECT_MISMATCH' && /recreate/i.test(error.message),
  );
  assert.deepEqual(setup.downloads, []);
});

test('cross-workspace mapping is not used and falls back to a raw image', async () => {
  const setup = trustedHandler({ links: { 'workspace-2:asset-1': { status: 'active', provider_asset_id: 'other-workspace-provider' } } });

  const request = await runTrusted(setup, { referenceImages: [assetUrl('asset-1')] });
  assert.match(request.referenceImages[0], /^data:image\/png;base64,/);
  assert.deepEqual(setup.lookups, [['workspace-1', 'asset-1']]);
  assert.equal(setup.submitted.length, 1);
});

test('non-BytePlus models neither query mappings nor change raw resolution', async () => {
  const setup = trustedHandler({
    model: 'google/veo-3',
    links: { 'workspace-1:asset-1': { status: 'active', provider_asset_id: 'provider-1' } },
  });

  const request = await runTrusted(setup, { referenceImages: [assetUrl('asset-1')] });

  assert.match(request.referenceImages[0], /^data:image\/png;base64,/);
  assert.deepEqual(setup.lookups, []);
});

test('Seedance submits mixed trusted and raw frame/reference inputs', async () => {
  const setup = trustedHandler({ links: {
    'workspace-1:frame-1': { status: 'active', provider_asset_id: 'trusted-frame' },
    'workspace-1:reference-2': { status: 'active', provider_asset_id: 'trusted-reference' },
  } });

  const request = await runTrusted(setup, {
    frameImages: [
      { url: assetUrl('frame-1'), frameType: 'first_frame' },
      { url: assetUrl('frame-2'), frameType: 'last_frame' },
    ],
    referenceImages: [assetUrl('reference-1'), assetUrl('reference-2')],
  });

  assert.match(request.referenceImages[0], /^data:image\/png;base64,/);
  assert.equal(request.referenceImages[1], 'asset://trusted-reference');
  assert.equal(request.frameImages[0].image_url.url, 'asset://trusted-frame');
  assert.match(request.frameImages[1].image_url.url, /^data:image\/png;base64,/);
  assert.equal(isTrustedAssetRequest(request), true);
});

for (const uri of ['asset://attacker-controlled', 'ASSET://attacker-controlled', ' asset://attacker-controlled']) {
  test(`worker resolution rejects client-provided ${uri.slice(0, uri.indexOf(':'))} asset URI`, async () => {
    const setup = trustedHandler();

    await assert.rejects(
      runTrusted(setup, { referenceImages: [uri] }),
      (error) => error.code === 'INVALID_REFERENCE_IMAGE',
    );
    assert.deepEqual(setup.lookups, []);
  });
}

test('durable video handler writes directly when storage has no presigned upload API', async () => {
  const puts = [];
  const handler = createSaasVideoHandler({
    pool: { async connect() { return { release() {} }; } },
    storage: { async put(...args) { puts.push(args); } },
    providerRouter: {
      async submitVideo() { return { id: 'provider-job', provider: 'byteplus' }; },
      async pollVideo() { return { status: 'completed' }; },
      async downloadVideo() { return { buffer: Buffer.from('video'), contentType: 'video/mp4' }; },
    },
    createAsset: async () => ({ id: 'asset-1' }),
    sleep: async () => {},
  });

  await handler({ id: 'job-1', workspace_id: 'workspace-1', model: 'byteplus/dreamina-seedance-2-0-260128', prompt: 'hello', parameters: {} });

  assert.equal(puts.length, 1);
  assert.match(puts[0][0], /^workspace-1\//);
  assert.equal(puts[0][1].toString(), 'video');
  assert.equal(puts[0][2], 'video/mp4');
});

function resumableHandler() {
  const calls = { submitted: 0, polled: [], recorded: [] };
  const handler = createSaasVideoHandler({
    pool: { async connect() { return { release() {} }; } },
    storage: { async put() {} },
    providerRouter: {
      async submitVideo() { calls.submitted += 1; return { id: 'cgt-new', provider: 'byteplus' }; },
      async pollVideo(provider, id) { calls.polled.push([provider, id]); return { status: 'completed' }; },
      async downloadVideo() { return { buffer: Buffer.from('video'), contentType: 'video/mp4' }; },
    },
    createAsset: async () => ({ id: 'output-1' }),
    recordProviderRequest: async (_pool, input) => { calls.recorded.push(input); return true; },
    sleep: async () => {},
  });
  return { handler, calls };
}

test('a submitted video records its provider task id for the current claim', async () => {
  const { handler, calls } = resumableHandler();
  const result = await handler({ id: 'job-1', workspace_id: 'w1', model: 'openai/sora', prompt: 'p', parameters: {}, claim_token: 'claim-1' });
  assert.equal(calls.submitted, 1);
  assert.deepEqual(calls.recorded, [{ generationId: 'job-1', claimToken: 'claim-1', provider: 'byteplus', providerRequestId: 'cgt-new' }]);
  assert.equal(result.providerRequestId, 'cgt-new');
});

test('a recovered video with a provider task resumes polling instead of submitting again', async () => {
  const { handler, calls } = resumableHandler();
  const result = await handler({
    id: 'job-1', workspace_id: 'w1', model: 'openai/sora', prompt: 'p', parameters: {}, claim_token: 'claim-2',
    provider: 'byteplus', provider_request_id: 'cgt-existing',
  });
  assert.equal(calls.submitted, 0);
  assert.deepEqual(calls.recorded, []);
  assert.deepEqual(calls.polled, [['byteplus', 'cgt-existing']]);
  assert.equal(result.providerRequestId, 'cgt-existing');
  assert.equal(result.status, 'succeeded');
});

test('a wired first/last frame with no other references is sent as a frame task', async () => {
  const setup = trustedHandler();

  // Canvas also lists the first frame among referenceImages.
  const request = await runTrusted(setup, {
    frameImages: [
      { url: assetUrl('frame-1'), frameType: 'first_frame' },
      { url: assetUrl('frame-2'), frameType: 'last_frame' },
    ],
    referenceImages: [assetUrl('frame-1')],
  });

  assert.equal(request.frameTask, true);
  assert.equal(request.referenceImages, undefined);
  assert.deepEqual(request.frameImages.map((frame) => frame.frame_type), ['first_frame', 'last_frame']);
});

test('frames mixed with other references stay an omni-reference task', async () => {
  const setup = trustedHandler();

  const request = await runTrusted(setup, {
    frameImages: [{ url: assetUrl('frame-1'), frameType: 'first_frame' }],
    referenceImages: [assetUrl('frame-1'), assetUrl('reference-1')],
  });

  assert.equal(request.frameTask, undefined);
  assert.equal(request.referenceImages.length, 2);
  assert.equal(request.frameImages, undefined);
});

test('reference audio clips and watermark reach the provider request', async () => {
  const setup = trustedHandler();

  const request = await runTrusted(setup, { referenceAudios: [assetUrl('audio-1')], watermark: true });

  assert.equal(request.referenceAudios.length, 1);
  assert.equal(request.watermark, true);
});

test('a Seedance task-type failure surfaces an actionable public message', async () => {
  const handler = createSaasVideoHandler({
    pool: { async query() { return { rows: [] }; }, async connect() { return { release() {} }; } },
    storage: { async put() {} },
    providerRouter: {
      async submitVideo() { return { id: 'provider-job', provider: 'byteplus' }; },
      async pollVideo() { return { status: 'failed', error: 'mismatch', error_code: 'InvalidParameter.TaskTypeMismatch' }; },
    },
    sleep: async () => {},
  });

  await assert.rejects(
    handler({ id: 'job-1', workspace_id: 'workspace-1', model: 'bytedance/seedance-2.5', prompt: 'hello', parameters: {} }),
    (error) => error.code === 'PROVIDER_GENERATION_FAILED'
      && error.providerErrorCode === 'InvalidParameter.TaskTypeMismatch'
      && /mode/i.test(error.publicMessage),
  );
});
