import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actualGenerationCredits, estimateGenerationCredits, estimateVideoCostUsd, loadOpenRouterImagePrices,
  resetOpenRouterPriceCache, usdToCredits,
} from '../../src/services/generationPricing.js';
import { googleImageUsage, openAIImageUsage } from '../../src/providers/direct/imageAdapters.js';

const close = (actual, expected, tolerance) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected}`);

test('credits are provider USD x 2 markup x 100, rounded up to 0.1', () => {
  assert.equal(usdToCredits(1, {}), 200);
  assert.equal(usdToCredits(0.04, {}), 8);
  assert.equal(usdToCredits(1, { CREDIT_MARKUP_PERCENT: '50' }), 150);
  assert.equal(usdToCredits(0, {}), 0);
});

test('Seedance estimates match BytePlus published examples (within 2%)', () => {
  const model = 'byteplus/seedance-2.5-unfiltered';
  close(estimateVideoCostUsd({ model, parameters: { resolution: '480p', duration: 5 } }), 0.514, 0.011);
  close(estimateVideoCostUsd({ model, parameters: { resolution: '720p', duration: 5 } }), 1.156, 0.024);
  close(estimateVideoCostUsd({ model, parameters: { resolution: '1080p', duration: 5 } }), 2.843, 0.057);
  close(estimateVideoCostUsd({ model: 'dreamina-seedance-2-0-260128', parameters: { resolution: '4k', duration: 5 } }), 3.89, 0.08);
  close(estimateVideoCostUsd({ model: 'dreamina-seedance-2-0-mini-260615', parameters: { resolution: '720p', duration: 5 } }), 0.38, 0.01);
});

test('longer, higher-resolution and draft videos are priced accordingly', () => {
  const model = 'byteplus/seedance-2.5-unfiltered';
  const five = estimateVideoCostUsd({ model, parameters: { resolution: '1080p', duration: 5 } });
  const fifteen = estimateVideoCostUsd({ model, parameters: { resolution: '1080p', duration: 15 } });
  close(fifteen, five * 3, 0.001);
  const draft = estimateVideoCostUsd({ model, parameters: { resolution: '480p', duration: 5, draft: true } });
  close(draft, estimateVideoCostUsd({ model, parameters: { resolution: '480p', duration: 5 } }), 0.0001);
});

test('video jobs settle at the tokens BytePlus reports', async () => {
  const job = { kind: 'video', model: 'byteplus/seedance-2.5-unfiltered', parameters: { resolution: '720p', duration: 5 } };
  // 108,000 tokens x $10.70/M = $1.1556 -> x2 x100 = 231.2 credits
  assert.equal(await actualGenerationCredits(job, { completion_tokens: 108000 }, { env: {} }), 231.2);
  assert.equal(await actualGenerationCredits(job, {}, { env: {} }), null);
});

test('Seedream uses BytePlus per-image prices, never OpenRouter', async () => {
  let fetched = false;
  const fetchImpl = async () => { fetched = true; throw new Error('should not fetch'); };
  const priced = await estimateGenerationCredits({ kind: 'image', model: 'byteplus/seedream-4-5-251128', prompt: 'x', parameters: {} }, { fetchImpl, env: {} });
  assert.equal(priced.credits, 8);
  const pro2k = await estimateGenerationCredits({ kind: 'image', model: 'byteplus/seedream-5.0-pro-unfiltered', prompt: 'x', parameters: { resolution: '2K' } }, { fetchImpl, env: {} });
  assert.equal(pro2k.credits, 18);
  assert.equal(fetched, false);
});

test('other image models use live OpenRouter prices, falling back to the snapshot', async () => {
  resetOpenRouterPriceCache();
  const live = async () => new Response(JSON.stringify({ data: [{ id: 'google/gemini-2.5-flash-image', pricing: { prompt: '0', completion: '0', image_output: '0.0001' } }] }));
  const priced = await estimateGenerationCredits({ kind: 'image', model: 'google/gemini-2.5-flash-image', prompt: '', parameters: {} }, { fetchImpl: live, env: {} });
  close(priced.usd, 1290 * 0.0001, 1e-9);

  resetOpenRouterPriceCache();
  const down = async () => { throw new Error('offline'); };
  assert.deepEqual(await loadOpenRouterImagePrices({ fetchImpl: down }), {});
  const fallback = await estimateGenerationCredits({ kind: 'image', model: 'google/gemini-2.5-flash-image', prompt: '', parameters: {} }, { fetchImpl: down, env: {} });
  close(fallback.usd, 1290 * 0.00003, 1e-9);
  resetOpenRouterPriceCache();
});

test('image jobs settle at reported usage: OpenRouter USD, Google/OpenAI tokens', async () => {
  resetOpenRouterPriceCache();
  const down = async () => { throw new Error('offline'); };
  const gemini = { kind: 'image', model: 'google/gemini-2.5-flash-image', parameters: {} };
  assert.equal(await actualGenerationCredits(gemini, { costUsd: 0.039 }, { fetchImpl: down, env: {} }), 7.8);
  const usage = googleImageUsage({ promptTokenCount: 100, candidatesTokensDetails: [{ modality: 'IMAGE', tokenCount: 1290 }] });
  // 100 x 0.0000003 + 1290 x 0.00003 = 0.03873 -> 7.8 credits
  assert.equal(await actualGenerationCredits(gemini, usage, { fetchImpl: down, env: {} }), 7.8);
  assert.deepEqual(openAIImageUsage({ input_tokens: 50, output_tokens: 4160 }), { inputTokens: 50, imageOutputTokens: 4160 });
  resetOpenRouterPriceCache();
});

test('the legacy NEXT_PUBLIC markup variable does not remove the generation markup', () => {
  assert.equal(usdToCredits(1, { NEXT_PUBLIC_CREDIT_MARKUP_PERCENT: '0' }), 200);
});

test('prices per-second video models from their published rates', async () => {
  const { perSecondVideoCostUsd } = await import('../../src/services/generationPricing.js');
  // Veo 3.1: $0.40/s with audio and $0.20/s silent at 1080p.
  assert.equal(perSecondVideoCostUsd('google/veo-3.1', { resolution: '1080p', duration: 8 }), 3.2);
  assert.equal(perSecondVideoCostUsd('google/veo-3.1', { resolution: '1080p', duration: 8, generateAudio: false }), 1.6);
  // Veo Fast lists 1080p between its 720p and 4K tiers.
  assert.equal(Math.round(perSecondVideoCostUsd('google/veo-3.1-fast', { resolution: '1080p', duration: 10 }) * 100) / 100, 1.2);
  // A resolution below the lowest listed tier uses the next tier up (Sora lists 720p and 1080p).
  assert.equal(perSecondVideoCostUsd('openai/sora-2-pro', { resolution: '480p', duration: 10 }), 3);
  // Above the highest tier, the highest applies.
  assert.equal(Math.round(perSecondVideoCostUsd('x-ai/grok-imagine-video', { resolution: '1080p', duration: 10 }) * 100) / 100, 0.7);
  // Wan bills image-to-video at its own, higher tiers; Grok adds a per-image fee.
  assert.equal(perSecondVideoCostUsd('alibaba/wan-2.6', { resolution: '1080p', duration: 5 }), 0.6);
  assert.equal(perSecondVideoCostUsd('alibaba/wan-2.6', { resolution: '720p', duration: 5 }), 0.4);
  assert.equal(Math.round(perSecondVideoCostUsd('x-ai/grok-imagine-video-1.5', { resolution: '720p', duration: 10 }) * 100) / 100, 1.4);
  assert.equal(perSecondVideoCostUsd('alibaba/wan-2.6', { resolution: '1080p', duration: 5, frameImages: [{}] }), 0.75);
  assert.equal(perSecondVideoCostUsd('x-ai/grok-imagine-video-1.5', { resolution: '480p', duration: 8, referenceImages: ['a', 'b'] }), 0.66);
  // Sora 2 Pro runs on OpenAI directly under either id.
  assert.equal(perSecondVideoCostUsd('openai/sora-2-pro', { resolution: '720p', duration: 10 }), 3);
  assert.equal(perSecondVideoCostUsd('unknown/video-model', { duration: 5 }), null);
});

test('video-to-video models reserve for the longest source video and honour minimums', async () => {
  const { perSecondVideoCostUsd } = await import('../../src/services/generationPricing.js');
  // Runway Aleph 2: $0.28/s, at least $0.56 a generation.
  assert.equal(Math.round(perSecondVideoCostUsd('runway/aleph-2', {}) * 100) / 100, 4.2);
  assert.equal(perSecondVideoCostUsd('runway/aleph-2', { duration: 1 }), 0.56);
  assert.equal(Math.round(perSecondVideoCostUsd('alibaba/wan-2.7', {}) * 100) / 100, 1.5);
});

test('OpenRouter videos settle at the USD cost it reports; zero cost is ignored', async () => {
  const job = { kind: 'video', model: 'runway/aleph-2', parameters: {} };
  // $1.40 x2 x100 = 280 credits
  assert.equal(await actualGenerationCredits(job, { cost: 1.4 }, { env: {} }), 280);
  assert.equal(await actualGenerationCredits(job, { cost: 0 }, { env: {} }), null);
  const seedance = { kind: 'video', model: 'byteplus/seedance-2.5-unfiltered', parameters: { resolution: '720p', duration: 5 } };
  assert.equal(await actualGenerationCredits(seedance, { cost: 0, completion_tokens: 108000 }, { env: {} }), 231.2);
});

test('per-image reference fees are charged per image, not per token', async () => {
  const { estimateTokenImageCostUsd } = await import('../../src/services/generationPricing.js');
  const one = estimateTokenImageCostUsd({ model: 'x-ai/grok-imagine-image-2.0', prompt: 'x', parameters: { referenceImages: ['a'] } });
  const none = estimateTokenImageCostUsd({ model: 'x-ai/grok-imagine-image-2.0', prompt: 'x', parameters: {} });
  close(one - none, 0.01, 1e-9);
});

test('every Studio video model has a price, so none is refused', async () => {
  const { estimateVideoCostUsd } = await import('../../src/services/generationPricing.js');
  const { OPENROUTER_VIDEO_MODEL_MAP, OPENROUTER_V2V_MODEL_MAP } = await import('../../packages/studio/src/models.js');
  const unpriced = [...new Set([...Object.values(OPENROUTER_VIDEO_MODEL_MAP), ...Object.values(OPENROUTER_V2V_MODEL_MAP)])]
    .filter((model) => estimateVideoCostUsd({ model, parameters: { resolution: '1080p', duration: 5 } }) === null);
  assert.deepEqual(unpriced, []);
});

test('every Studio image model is priced even when OpenRouter is unreachable', async () => {
  const { OPENROUTER_IMAGE_MODEL_MAP } = await import('../../packages/studio/src/models.js');
  resetOpenRouterPriceCache();
  const offline = async () => { throw new Error('offline'); };
  const unpriced = [];
  for (const model of new Set(Object.values(OPENROUTER_IMAGE_MODEL_MAP))) {
    if (!await estimateGenerationCredits({ kind: 'image', model, prompt: 'x', parameters: {} }, { fetchImpl: offline, env: {} })) unpriced.push(model);
  }
  resetOpenRouterPriceCache();
  assert.deepEqual(unpriced, []);
});

test('prices dedicated BytePlus endpoints as the model they serve', async () => {
  const { estimateVideoCostUsd, seedreamCostUsd } = await import('../../src/services/generationPricing.js');
  const parameters = { resolution: '1080p', duration: 5 };
  assert.equal(estimateVideoCostUsd({ model: 'ep-20260904190604-p8pjl', parameters }), estimateVideoCostUsd({ model: 'bytedance/seedance-2.5', parameters }));
  assert.equal(seedreamCostUsd('ep-20260907150312-xx7gf'), 0.04);
  assert.equal(seedreamCostUsd('ep-20260907150433-zg8fr'), 0.035);
});

test('reserves a Seedance run with no resolution as 1080p', async () => {
  const { estimateVideoCostUsd } = await import('../../src/services/generationPricing.js');
  const model = 'bytedance/seedance-2.0';
  assert.equal(estimateVideoCostUsd({ model, parameters: { duration: 5 } }), estimateVideoCostUsd({ model, parameters: { duration: 5, resolution: '1080p' } }));
});

test('every Canvas model is priced under the id the Canvas submit route sends', async () => {
  const { FAL_MODELS } = await import('../../services/spite/lib/fal-models.ts');
  resetOpenRouterPriceCache();
  const offline = async () => { throw new Error('offline'); };
  const unpriced = [];
  for (const config of FAL_MODELS) {
    const model = `${config.provider}/${config.providerModel}`;
    const parameters = config.category === 'video' ? { resolution: '720p', duration: 5 } : {};
    if (!await estimateGenerationCredits({ kind: config.category, model, prompt: 'x', parameters }, { fetchImpl: offline, env: {} })) unpriced.push(model);
  }
  resetOpenRouterPriceCache();
  assert.deepEqual(unpriced, []);
});
