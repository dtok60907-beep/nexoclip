import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actualGenerationCredits, estimateGenerationCredits, estimateVideoCostUsd, loadOpenRouterImagePrices,
  resetOpenRouterPriceCache, usdToCredits,
} from '../../src/services/generationPricing.js';
import { googleImageUsage, openAIImageUsage } from '../../src/providers/direct/imageAdapters.js';

const close = (actual, expected, tolerance) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected}`);

test('credits are provider USD x 1.3 markup x 100, rounded up to 0.1', () => {
  assert.equal(usdToCredits(1, {}), 130);
  assert.equal(usdToCredits(0.04, {}), 5.2);
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
  // 108,000 tokens x $10.70/M = $1.1556 -> x1.3 x100 = 150.3 credits
  assert.equal(await actualGenerationCredits(job, { completion_tokens: 108000 }, { env: {} }), 150.3);
  assert.equal(await actualGenerationCredits(job, {}, { env: {} }), null);
});

test('Seedream uses BytePlus per-image prices, never OpenRouter', async () => {
  let fetched = false;
  const fetchImpl = async () => { fetched = true; throw new Error('should not fetch'); };
  const priced = await estimateGenerationCredits({ kind: 'image', model: 'byteplus/seedream-4-5-251128', prompt: 'x', parameters: {} }, { fetchImpl, env: {} });
  assert.equal(priced.credits, 5.2);
  const pro2k = await estimateGenerationCredits({ kind: 'image', model: 'byteplus/seedream-5.0-pro-unfiltered', prompt: 'x', parameters: { resolution: '2K' } }, { fetchImpl, env: {} });
  assert.equal(pro2k.credits, 11.7);
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
  assert.equal(await actualGenerationCredits(gemini, { costUsd: 0.039 }, { fetchImpl: down, env: {} }), 5.1);
  const usage = googleImageUsage({ promptTokenCount: 100, candidatesTokensDetails: [{ modality: 'IMAGE', tokenCount: 1290 }] });
  // 100 x 0.0000003 + 1290 x 0.00003 = 0.03873 -> 5.1 credits
  assert.equal(await actualGenerationCredits(gemini, usage, { fetchImpl: down, env: {} }), 5.1);
  assert.deepEqual(openAIImageUsage({ input_tokens: 50, output_tokens: 4160 }), { inputTokens: 50, imageOutputTokens: 4160 });
  resetOpenRouterPriceCache();
});

test('the legacy NEXT_PUBLIC markup variable does not remove the generation markup', () => {
  assert.equal(usdToCredits(1, { NEXT_PUBLIC_CREDIT_MARKUP_PERCENT: '0' }), 130);
});

test('prices per-second video models from their published rates', async () => {
  const { perSecondVideoCostUsd } = await import('../../src/services/generationPricing.js');
  // Veo 3.1: $0.40/s with audio and $0.20/s silent at 1080p.
  assert.equal(perSecondVideoCostUsd('google/veo-3.1', { resolution: '1080p', duration: 8 }), 3.2);
  assert.equal(perSecondVideoCostUsd('google/veo-3.1', { resolution: '1080p', duration: 8, generateAudio: false }), 1.6);
  // A resolution between listed tiers uses the next tier up (Veo Fast lists 720p and 4K).
  assert.equal(perSecondVideoCostUsd('google/veo-3.1-fast', { resolution: '1080p', duration: 10 }), 3);
  // Above the highest tier, the highest applies.
  assert.equal(Math.round(perSecondVideoCostUsd('x-ai/grok-imagine-video', { resolution: '1080p', duration: 10 }) * 100) / 100, 0.7);
  // Wan bills image-to-video at its own, higher tiers; Grok adds a per-image fee.
  assert.equal(perSecondVideoCostUsd('alibaba/wan-2.6', { resolution: '1080p', duration: 5 }), 0.6);
  assert.equal(perSecondVideoCostUsd('alibaba/wan-2.6', { resolution: '1080p', duration: 5, frameImages: [{}] }), 0.75);
  assert.equal(perSecondVideoCostUsd('x-ai/grok-imagine-video-1.5', { resolution: '480p', duration: 8, referenceImages: ['a', 'b'] }), 0.66);
  // Sora 2 Pro runs on OpenAI directly under either id.
  assert.equal(perSecondVideoCostUsd('openai/sora-2-pro', { resolution: '720p', duration: 10 }), 3);
  assert.equal(perSecondVideoCostUsd('unknown/video-model', { duration: 5 }), null);
});

test('every Studio video model has a price, so none falls back to the flat rule', async () => {
  const { estimateVideoCostUsd } = await import('../../src/services/generationPricing.js');
  const { OPENROUTER_VIDEO_MODEL_MAP } = await import('../../packages/studio/src/models.js');
  const unpriced = [...new Set(Object.values(OPENROUTER_VIDEO_MODEL_MAP))]
    .filter((model) => estimateVideoCostUsd({ model, parameters: { resolution: '1080p', duration: 5 } }) === null);
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
