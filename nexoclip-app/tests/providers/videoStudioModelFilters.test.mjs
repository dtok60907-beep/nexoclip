import test from 'node:test';
import assert from 'node:assert/strict';
import {
  v2vModels,
  openRouterV2VModels,
  OPENROUTER_V2V_MODEL_MAP,
  OPENROUTER_VIDEO_MODEL_MAP,
  OPENROUTER_MULTI_REFERENCE_MODELS,
} from '../../packages/studio/src/models.js';

test('openRouterV2VModels only contains models present in OPENROUTER_V2V_MODEL_MAP', () => {
  assert.ok(openRouterV2VModels.length > 0, 'expected at least one mapped V2V model');
  for (const model of openRouterV2VModels) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(OPENROUTER_V2V_MODEL_MAP, model.id),
      `${model.id} should be a key in OPENROUTER_V2V_MODEL_MAP`,
    );
  }
});

test('openRouterV2VModels excludes pure-MuAPI V2V models with no OpenRouter mapping', () => {
  const unmapped = v2vModels.find((m) => !OPENROUTER_V2V_MODEL_MAP[m.id]);
  assert.ok(unmapped, 'fixture assumption broken: expected at least one unmapped v2v model to exist');
  assert.equal(
    openRouterV2VModels.some((m) => m.id === unmapped.id),
    false,
    `${unmapped.id} has no OpenRouter mapping and must not appear in openRouterV2VModels`,
  );
});

test('openRouterV2VModels includes the three known-mapped models', () => {
  const ids = openRouterV2VModels.map((m) => m.id);
  assert.ok(ids.includes('runway-aleph-v2v'));
  assert.ok(ids.includes('wan2.7-video-extend'));
  assert.ok(ids.includes('wan2.7-video-edit'));
});

test('OPENROUTER_VIDEO_MODEL_MAP includes the new T2V/I2V mappings', () => {
  const expected = {
    'kling-o1-text-to-video': 'kwaivgi/kling-video-o1',
    'kling-o1-image-to-video': 'kwaivgi/kling-video-o1',
    'kling-o1-reference-to-video': 'kwaivgi/kling-video-o1',
    'kling-o1-standard-image-to-video': 'kwaivgi/kling-video-o1',
    'kling-o1-standard-reference-to-video': 'kwaivgi/kling-video-o1',
    'grok-imagine-text-to-video': 'x-ai/grok-imagine-video',
    'grok-imagine-image-to-video': 'x-ai/grok-imagine-video',
    'grok-imagine-video-1-5-preview': 'x-ai/grok-imagine-video-1.5',
    'happy-horse-1-text-to-video-1080p': 'alibaba/happyhorse-1.0',
    'happy-horse-1-text-to-video-720p': 'alibaba/happyhorse-1.0',
    'happy-horse-1-image-to-video-1080p': 'alibaba/happyhorse-1.0',
    'happy-horse-1-image-to-video-720p': 'alibaba/happyhorse-1.0',
    'happy-horse-1-reference-to-video-1080p': 'alibaba/happyhorse-1.0',
    'happy-horse-1-reference-to-video-720p': 'alibaba/happyhorse-1.0',
    'happy-horse-1.1-text-to-video-1080p': 'alibaba/happyhorse-1.1',
    'happy-horse-1.1-text-to-video-720p': 'alibaba/happyhorse-1.1',
    'happy-horse-1.1-image-to-video-1080p': 'alibaba/happyhorse-1.1',
    'happy-horse-1.1-image-to-video-720p': 'alibaba/happyhorse-1.1',
    'happy-horse-1.1-reference-to-video-1080p': 'alibaba/happyhorse-1.1',
    'happy-horse-1.1-reference-to-video-720p': 'alibaba/happyhorse-1.1',
    'wan2.6-text-to-video': 'alibaba/wan-2.6',
    'wan2.6-image-to-video': 'alibaba/wan-2.6',
    'seedance-2.5-text-to-video': 'bytedance/seedance-2.5',
    'seedance-2.5-text-to-video-480p': 'bytedance/seedance-2.5',
    'seedance-2.5-image-to-video': 'bytedance/seedance-2.5',
    'seedance-2.5-image-to-video-480p': 'bytedance/seedance-2.5',
    'seedance-2.5-first-last-frame': 'bytedance/seedance-2.5',
    'seedance-2.5-first-last-frame-480p': 'bytedance/seedance-2.5',
    'seedance-2.5-omni-reference': 'bytedance/seedance-2.5',
    'seedance-2.5-omni-reference-480p': 'bytedance/seedance-2.5',
    'seedance-2.5-unfiltered-text-to-video': 'ep-20260904190604-p8pjl',
    'seedance-2.5-unfiltered-text-to-video-480p': 'ep-20260904190604-p8pjl',
    'seedance-2.5-unfiltered-image-to-video': 'ep-20260904190604-p8pjl',
    'seedance-2.5-unfiltered-image-to-video-480p': 'ep-20260904190604-p8pjl',
    'seedance-2.5-unfiltered-first-last-frame': 'ep-20260904190604-p8pjl',
    'seedance-2.5-unfiltered-first-last-frame-480p': 'ep-20260904190604-p8pjl',
    'seedance-2.5-unfiltered-omni-reference': 'ep-20260904190604-p8pjl',
    'seedance-2.5-unfiltered-omni-reference-480p': 'ep-20260904190604-p8pjl',
    'seedance-2-text-to-video-fast': 'bytedance/seedance-2.0-fast',
    'seedance-2-image-to-video-fast': 'bytedance/seedance-2.0-fast',
  };
  for (const [muapiId, openRouterModel] of Object.entries(expected)) {
    assert.equal(OPENROUTER_VIDEO_MODEL_MAP[muapiId], openRouterModel, `mapping for ${muapiId}`);
  }
});

test('reference-to-video / omni-reference ids are flagged as multi-reference', () => {
  const expectedMultiRef = [
    'kling-o1-reference-to-video',
    'kling-o1-standard-reference-to-video',
    'happy-horse-1-reference-to-video-1080p',
    'happy-horse-1-reference-to-video-720p',
    'happy-horse-1.1-reference-to-video-1080p',
    'happy-horse-1.1-reference-to-video-720p',
    'seedance-2.5-omni-reference',
    'seedance-2.5-omni-reference-480p',
    'seedance-2.5-unfiltered-omni-reference',
    'seedance-2.5-unfiltered-omni-reference-480p',
  ];
  for (const id of expectedMultiRef) {
    assert.ok(OPENROUTER_MULTI_REFERENCE_MODELS.has(id), `${id} should be in OPENROUTER_MULTI_REFERENCE_MODELS`);
  }
});

test('first-last-frame and plain image-to-video ids are NOT flagged as multi-reference', () => {
  const notMultiRef = [
    'seedance-2.5-first-last-frame',
    'seedance-2.5-first-last-frame-480p',
    'seedance-2.5-unfiltered-first-last-frame',
    'seedance-2.5-unfiltered-first-last-frame-480p',
    'kling-o1-image-to-video',
    'happy-horse-1.1-image-to-video-1080p',
    'wan2.6-image-to-video',
  ];
  for (const id of notMultiRef) {
    assert.equal(OPENROUTER_MULTI_REFERENCE_MODELS.has(id), false, `${id} should NOT be in OPENROUTER_MULTI_REFERENCE_MODELS`);
  }
});

test('no new OPENROUTER_V2V_MODEL_MAP entries were added this pass', () => {
  assert.deepEqual(Object.keys(OPENROUTER_V2V_MODEL_MAP).sort(), [
    'runway-aleph-v2v',
    'wan2.7-video-edit',
    'wan2.7-video-extend',
  ]);
});

test('every credited Seedance model in the Studio sends a resolution, defaulting to 720p where offered', async () => {
  const models = await import('../../packages/studio/src/models.js');
  const seedance = [...models.t2vModels.map((m) => [m, models.getResolutionsForVideoModel(m.id)]), ...models.i2vModels.map((m) => [m, models.getResolutionsForI2VModel(m.id)])]
    .filter(([m]) => /seedance|^ep-/.test(models.OPENROUTER_VIDEO_MODEL_MAP[m.id] || ''));
  assert.ok(seedance.length > 10);
  for (const [model, resolutions] of seedance) {
    assert.ok(resolutions.length > 0, `${model.id} offers no resolution`);
    if (model.id.endsWith('-480p')) assert.deepEqual(resolutions, ['480p'], model.id);
  }
  const seedance20 = models.t2vModels.find((m) => m.id === 'seedance-v2.0-t2v');
  assert.equal(seedance20.inputs.resolution.default, '720p');
  assert.equal(seedance20.inputs.quality, undefined);
});
