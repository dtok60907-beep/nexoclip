import test from 'node:test';
import assert from 'node:assert/strict';

const { adoptCanvasReference, createSaasVideoHandler } = await import('../../src/services/saasVideoGeneration.js');
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

function mediaHandler({ signedUrl }) {
  const submitted = [];
  const handler = createSaasVideoHandler({
    pool: {
      async query() { return { rows: [{ storage_key: 'clip-key', content_type: 'video/mp4' }] }; },
      async connect() { return { release() {} }; },
    },
    storage: {
      async createDownloadUrl({ key }) { return { url: signedUrl ? `${signedUrl}/${key}` : `local://download?key=${key}` }; },
      async get() { return { body: Buffer.from('media'), contentType: 'audio/mpeg' }; },
      async put() {},
    },
    providerRouter: {
      async submitVideo(request) { submitted.push(request); return { id: 'provider-job', provider: 'byteplus' }; },
      async pollVideo() { return { status: 'completed' }; },
      async downloadVideo() { return { buffer: Buffer.from('video'), contentType: 'video/mp4' }; },
    },
    createAsset: async () => ({ id: 'output-1' }),
    sleep: async () => {},
  });
  return { submitted, run: (parameters) => handler({ id: 'job-1', workspace_id: 'workspace-1', model: 'bytedance/seedance-2.5', prompt: 'extend', parameters }) };
}

test('reference videos and audio are sent as pre-signed HTTPS URLs, not base64', async () => {
  const setup = mediaHandler({ signedUrl: 'https://r2.example/signed' });

  await setup.run({ referenceVideos: [assetUrl('clip')], referenceAudios: [assetUrl('voice')] });

  assert.deepEqual(setup.submitted[0].referenceVideos, ['https://r2.example/signed/clip-key']);
  assert.deepEqual(setup.submitted[0].referenceAudios, ['https://r2.example/signed/clip-key']);
});

test('a reference video on storage without public URLs fails with a clear message; audio falls back to base64', async () => {
  const setup = mediaHandler({ signedUrl: null });

  await assert.rejects(
    setup.run({ referenceVideos: [assetUrl('clip')] }),
    (error) => error.code === 'REFERENCE_MEDIA_NOT_PUBLIC' && /public object storage/.test(error.publicMessage),
  );
  await setup.run({ referenceAudios: [assetUrl('voice')] });
  assert.match(setup.submitted[0].referenceAudios[0], /^data:audio\/mpeg;base64,/);
});

function lastFrameHandler({ lastFrameUrl, fetchOk = true }) {
  const assets = [];
  const handler = createSaasVideoHandler({
    pool: { async query() { return { rows: [] }; }, async connect() { return { release() {} }; } },
    storage: { async put() {} },
    providerRouter: {
      async submitVideo() { return { id: 'provider-job', provider: 'byteplus' }; },
      async pollVideo() { return { status: 'completed', content: { video_url: 'https://tos/v.mp4', last_frame_url: lastFrameUrl } }; },
      async downloadVideo() { return { buffer: Buffer.from('video'), contentType: 'video/mp4' }; },
    },
    fetch: async () => ({ ok: fetchOk, status: fetchOk ? 200 : 403, headers: { get: () => 'image/png' }, arrayBuffer: async () => new ArrayBuffer(4) }),
    createAsset: async (_client, input) => { assets.push(input); return { id: `asset-${assets.length}` }; },
    sleep: async () => {},
  });
  return { assets, run: (parameters) => handler({ id: 'job-1', workspace_id: 'workspace-1', model: 'bytedance/seedance-2.5', prompt: 'p', parameters }) };
}

test('returnLastFrame saves the last frame as a second, image output', async () => {
  const setup = lastFrameHandler({ lastFrameUrl: 'https://tos/last.png' });
  const result = await setup.run({ returnLastFrame: true });
  assert.deepEqual(result.outputs, [{ assetId: 'asset-1' }, { assetId: 'asset-2' }]);
  assert.equal(setup.assets[1].contentType, 'image/png');
});

test('a last frame that cannot be downloaded does not fail the video', async () => {
  const setup = lastFrameHandler({ lastFrameUrl: 'https://tos/last.png', fetchOk: false });
  const result = await setup.run({ returnLastFrame: true });
  assert.deepEqual(result.outputs, [{ assetId: 'asset-1' }]);
});

const sharp = (await import('sharp')).default;

function realPersonError(...indexes) {
  return Object.assign(new Error(`BytePlus direct request failed: The request failed because the input image ${indexes.map((i) => `'content[${i}]'`).join(' ')} may contain real person. Request id: 0217abc`), {
    code: 'BYTEPLUS_REQUEST_FAILED', status: 400,
  });
}

// A Seedance handler whose trust lives in `links`; the fake auto trust activates what it borrows.
function autoTrustHandler({ submitErrors = [], flagged = [], trustFails = [], images = {}, copies = {} } = {}) {
  const links = {};
  const calls = { submitted: [], borrowed: [], marked: [], released: [], adopted: [] };
  const autoTrust = {
    async flagged(_workspaceId, assetIds) { return assetIds.filter((id) => flagged.includes(id)); },
    async markNeedsTrust(_workspaceId, assetIds) { calls.marked.push(...assetIds); },
    async borrow({ assetIds }) {
      calls.borrowed.push(...assetIds);
      for (const id of assetIds) if (!trustFails.includes(id)) links[id] = { status: 'active', provider_asset_id: `provider-${id}` };
      return assetIds.filter((id) => trustFails.includes(id));
    },
    async release(generationId) { calls.released.push(generationId); },
  };
  const handler = createSaasVideoHandler({
    pool: {
      async query(_sql, values) { return { rows: [{ storage_key: `key-${values[1]}`, content_type: 'image/png' }] }; },
      async connect() { return { release() {} }; },
    },
    storage: {
      async createDownloadUrl({ key }) { return { url: key }; },
      async get(key) { return { body: images[key.replace(/^key-/, '')] || Buffer.from(key), contentType: 'image/png' }; },
      async put() {},
    },
    providerRouter: {
      async submitVideo(request) {
        calls.submitted.push(request);
        const error = submitErrors.shift();
        if (error) throw error;
        return { id: 'provider-job', provider: 'byteplus' };
      },
      async pollVideo() { return { status: 'completed' }; },
      async downloadVideo() { return { buffer: Buffer.from('video'), contentType: 'video/mp4' }; },
    },
    findBytePlusAssetLink: async (_pool, _workspaceId, assetId) => (links[assetId] ? { project_name: 'default', ...links[assetId] } : null),
    createAsset: async () => ({ id: 'output-1' }),
    sleep: async () => {},
    autoTrust,
    // Canvas uploads copied into the workspace: `copies` holds the earlier copies.
    adoptReference: async ({ reference, create }) => {
      calls.adopted.push({ reference, create });
      if (!copies[reference] && create) copies[reference] = `copy-${reference.split('/').pop()}`;
      return copies[reference] || null;
    },
  });
  const run = (parameters) => handler({ id: 'job-1', workspace_id: 'workspace-1', model: 'bytedance/seedance-2.5', prompt: 'hello', parameters });
  return { run, calls };
}

test('a reference Seedance refuses as a real person is trusted and the video is submitted again', async () => {
  const setup = autoTrustHandler({ submitErrors: [realPersonError(2)] });

  const result = await setup.run({ referenceImages: [assetUrl('asset-1'), assetUrl('asset-2')] });

  assert.equal(result.status, 'succeeded');
  assert.deepEqual(setup.calls.marked, ['asset-2']);
  assert.deepEqual(setup.calls.borrowed, ['asset-2']);
  assert.equal(setup.calls.submitted.length, 2);
  assert.match(setup.calls.submitted[1].referenceImages[0], /^data:image\/png;base64,/);
  assert.equal(setup.calls.submitted[1].referenceImages[1], 'asset://provider-asset-2');
  assert.deepEqual(setup.calls.released, ['job-1']);
});

test('content numbering continues from reference images into frames', async () => {
  const setup = autoTrustHandler({ submitErrors: [realPersonError(2)] });

  await setup.run({ referenceImages: [assetUrl('asset-1')], frameImages: [{ url: assetUrl('frame-1'), frameType: 'last_frame' }] });

  assert.deepEqual(setup.calls.borrowed, ['frame-1']);
});

test('an image Seedance refused before is trusted before the first submission', async () => {
  const setup = autoTrustHandler({ flagged: ['asset-1'] });

  await setup.run({ referenceImages: [assetUrl('asset-1')] });

  assert.equal(setup.calls.submitted.length, 1);
  assert.deepEqual(setup.calls.submitted[0].referenceImages, ['asset://provider-asset-1']);
});

test('a real-person refusal that cannot be trusted fails with a message naming the image', async () => {
  const setup = autoTrustHandler({ submitErrors: [realPersonError(1)], trustFails: ['asset-1'] });

  await assert.rejects(setup.run({ referenceImages: [assetUrl('asset-1')] }),
    (error) => /reference image 1 as showing a real person/.test(error.publicMessage) && !/Request id/.test(error.publicMessage));
  assert.equal(setup.calls.submitted.length, 1);
  assert.deepEqual(setup.calls.released, ['job-1']);
});

test('a second real-person refusal after trusting is not retried again', async () => {
  const setup = autoTrustHandler({ submitErrors: [realPersonError(1), realPersonError(1)] });

  await assert.rejects(setup.run({ referenceImages: [assetUrl('asset-1')] }), /may contain real person/);
  assert.equal(setup.calls.submitted.length, 2);
});

test('other Seedance parameter refusals reach the user without the request id', async () => {
  const refusal = Object.assign(new Error('BytePlus direct request failed: The parameter `ratio` is not valid. Request id: 0217xyz'), {
    code: 'BYTEPLUS_REQUEST_FAILED', status: 400,
  });
  const setup = autoTrustHandler({ submitErrors: [refusal] });

  await assert.rejects(setup.run({ referenceImages: [assetUrl('asset-1')] }),
    (error) => error.publicMessage === 'Seedance rejected the request: The parameter `ratio` is not valid.');
});

test('a reference image under the Seedance minimum is enlarged before it is sent', async () => {
  const small = await sharp({ create: { width: 350, height: 233, channels: 3, background: '#808080' } }).png().toBuffer();
  const setup = autoTrustHandler({ images: { 'asset-1': small } });

  await setup.run({ referenceImages: [assetUrl('asset-1')] });

  const sent = Buffer.from(setup.calls.submitted[0].referenceImages[0].split(',')[1], 'base64');
  const { width, height } = await sharp(sent).metadata();
  assert.ok(width * height >= 90_000 && Math.min(width, height) >= 300, `${width}x${height}`);
});

test('a reference image large enough for Seedance is sent unchanged', async () => {
  const large = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#808080' } }).png().toBuffer();
  const setup = autoTrustHandler({ images: { 'asset-1': large } });

  await setup.run({ referenceImages: [assetUrl('asset-1')] });

  assert.equal(setup.calls.submitted[0].referenceImages[0], `data:image/png;base64,${large.toString('base64')}`);
});

test('a refusal that names another image after trusting trusts that one too and sends again', async () => {
  const setup = autoTrustHandler({ submitErrors: [realPersonError(1), realPersonError(2)] });

  const result = await setup.run({ referenceImages: [assetUrl('asset-1'), assetUrl('asset-2')] });

  assert.equal(result.status, 'succeeded');
  assert.deepEqual(setup.calls.borrowed, ['asset-1', 'asset-2']);
  assert.equal(setup.calls.submitted.length, 3);
  assert.deepEqual(setup.calls.submitted[2].referenceImages, ['asset://provider-asset-1', 'asset://provider-asset-2']);
});

test('a trusted asset BytePlus lost is trusted again and the video is sent again', async () => {
  const lost = Object.assign(new Error('asset not found'), { code: 'BYTEPLUS_REQUEST_FAILED', assetNotFound: true });
  const setup = autoTrustHandler({ submitErrors: [realPersonError(1), lost] });

  const result = await setup.run({ referenceImages: [assetUrl('asset-1')] });

  assert.equal(result.status, 'succeeded');
  assert.deepEqual(setup.calls.borrowed, ['asset-1', 'asset-1']);
  assert.equal(setup.calls.submitted.length, 3);
});

const canvasUpload = (name) => `/canvas/api/r2-image/uploads/${name}`;

test('a Canvas upload Seedance refuses as a real person is copied to the workspace, trusted and sent again', async () => {
  const setup = autoTrustHandler({ submitErrors: [realPersonError(1, 2)] });

  const result = await setup.run({ referenceImages: [assetUrl('asset-1'), canvasUpload('face.webp'), canvasUpload('place.png')] });

  assert.equal(result.status, 'succeeded');
  assert.deepEqual(setup.calls.adopted.filter((call) => call.create).map((call) => call.reference), [canvasUpload('face.webp')]);
  assert.deepEqual(setup.calls.borrowed, ['asset-1', 'copy-face.webp']);
  assert.equal(setup.calls.submitted.length, 2);
  assert.deepEqual(setup.calls.submitted[1].referenceImages.slice(0, 2), ['asset://provider-asset-1', 'asset://provider-copy-face.webp']);
  assert.match(setup.calls.submitted[1].referenceImages[2], /^data:/);
});

test('a Canvas upload refused before goes as its trusted copy on the first submission', async () => {
  const setup = autoTrustHandler({ copies: { [canvasUpload('face.webp')]: 'copy-face' }, flagged: ['copy-face'] });

  await setup.run({ referenceImages: [canvasUpload('face.webp')] });

  assert.equal(setup.calls.submitted.length, 1);
  assert.deepEqual(setup.calls.submitted[0].referenceImages, ['asset://provider-copy-face']);
});

test('a Canvas upload Seedance accepts is not copied', async () => {
  const setup = autoTrustHandler();

  await setup.run({ referenceImages: [canvasUpload('place.png')] });

  assert.equal(setup.calls.adopted.some((call) => call.create), false);
  assert.match(setup.calls.submitted[0].referenceImages[0], /^data:/);
});

test('a Canvas upload is copied into the workspace once and the copy is reused', async () => {
  const assets = [];
  const puts = [];
  const pool = {
    async query(sql, values) {
      if (/^SELECT id FROM assets/.test(sql)) return { rows: assets.filter((a) => a.workspace_id === values[0] && a.storage_key === values[1]) };
      throw new Error(`unexpected query ${sql}`);
    },
    async connect() {
      return {
        async query(_sql, [workspaceId, storageKey, filename, contentType, sizeBytes]) {
          const row = { id: `asset-${assets.length + 1}`, workspace_id: workspaceId, storage_key: storageKey, filename, content_type: contentType, size_bytes: sizeBytes };
          assets.push(row);
          return { rows: [row] };
        },
        release() {},
      };
    },
  };
  const storage = { async put(key, body, contentType) { puts.push({ key, body, contentType }); } };
  const referenceStorage = {
    async createDownloadUrl({ key }) { return { url: `r2:${key}` }; },
    async get(url) { return { body: Buffer.from(url), contentType: 'image/webp' }; },
  };
  const reference = '/canvas/api/r2-image/uploads/face.webp';
  const args = { pool, storage, referenceStorage, workspaceId: 'ws-1', reference };

  assert.equal(await adoptCanvasReference({ ...args, create: false }), null);
  const first = await adoptCanvasReference(args);
  const again = await adoptCanvasReference(args);

  assert.equal(first, 'asset-1');
  assert.equal(again, 'asset-1');
  assert.equal(assets.length, 1);
  assert.equal(puts.length, 1);
  assert.match(puts[0].key, /^ws-1\/canvas-reference\/[0-9a-f]{32}$/);
  assert.equal(puts[0].body.toString(), 'r2:uploads/face.webp');
  assert.equal(assets[0].filename, 'canvas-face.webp');
  assert.equal(await adoptCanvasReference({ ...args, reference: '/api/assets/x/download' }), null);
});
