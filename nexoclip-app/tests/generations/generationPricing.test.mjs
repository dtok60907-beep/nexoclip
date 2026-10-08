import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actualGenerationCredits, actualGenerationCostUsd, estimateGenerationCredits, estimateVideoCostUsd, loadOpenRouterImagePrices,
  resetOpenRouterPriceCache, usdToCredits, fxFactor, loadUsdIdrRate, resetUsdIdrRateCache, PRICING_REFERENCE_USD_IDR,
} from '../../src/services/generationPricing.js';
import { googleImageUsage, openAIImageUsage } from '../../src/providers/direct/imageAdapters.js';

// Pins USD/IDR at the reference rate so no test fetches a live rate.
const FX = { USD_IDR_RATE: '17915' };
const close = (actual, expected, tolerance) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected}`);

test('credits are provider USD x 1.6 markup x 100, rounded up to 0.1', () => {
  assert.equal(usdToCredits(1, {}), 160);
  assert.equal(usdToCredits(0.04, {}), 6.4);
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
  // 108,000 tokens x $10.70/M = $1.1556 -> x1.6 x100 = 184.9 credits
  assert.equal(await actualGenerationCredits(job, { completion_tokens: 108000 }, { env: FX }), 184.9);
  assert.equal(await actualGenerationCredits(job, {}, { env: FX }), null);
});

test('Seedream uses BytePlus per-image prices, never OpenRouter', async () => {
  let fetched = false;
  const fetchImpl = async () => { fetched = true; throw new Error('should not fetch'); };
  const priced = await estimateGenerationCredits({ kind: 'image', model: 'byteplus/seedream-4-5-251128', prompt: 'x', parameters: {} }, { fetchImpl, env: FX });
  assert.equal(priced.credits, 6.4);
  const pro2k = await estimateGenerationCredits({ kind: 'image', model: 'byteplus/seedream-5.0-pro-unfiltered', prompt: 'x', parameters: { resolution: '2K' } }, { fetchImpl, env: FX });
  assert.equal(pro2k.credits, 14.4);
  assert.equal(fetched, false);
});

test('other image models use live OpenRouter prices, falling back to the snapshot', async () => {
  resetOpenRouterPriceCache();
  const live = async () => new Response(JSON.stringify({ data: [{ id: 'google/gemini-2.5-flash-image', pricing: { prompt: '0', completion: '0', image_output: '0.0001' } }] }));
  const priced = await estimateGenerationCredits({ kind: 'image', model: 'google/gemini-2.5-flash-image', prompt: '', parameters: {} }, { fetchImpl: live, env: FX });
  close(priced.usd, 1290 * 0.0001, 1e-9);

  resetOpenRouterPriceCache();
  const down = async () => { throw new Error('offline'); };
  assert.deepEqual(await loadOpenRouterImagePrices({ fetchImpl: down }), {});
  const fallback = await estimateGenerationCredits({ kind: 'image', model: 'google/gemini-2.5-flash-image', prompt: '', parameters: {} }, { fetchImpl: down, env: FX });
  close(fallback.usd, 1290 * 0.00003, 1e-9);
  resetOpenRouterPriceCache();
});

test('image jobs settle at reported usage: OpenRouter USD, Google/OpenAI tokens', async () => {
  resetOpenRouterPriceCache();
  const down = async () => { throw new Error('offline'); };
  const gemini = { kind: 'image', model: 'google/gemini-2.5-flash-image', parameters: {} };
  assert.equal(await actualGenerationCredits(gemini, { costUsd: 0.039 }, { fetchImpl: down, env: FX }), 6.3);
  const usage = googleImageUsage({ promptTokenCount: 100, candidatesTokensDetails: [{ modality: 'IMAGE', tokenCount: 1290 }] });
  // 100 x 0.0000003 + 1290 x 0.00003 = 0.03873 -> 6.2 credits
  assert.equal(await actualGenerationCredits(gemini, usage, { fetchImpl: down, env: FX }), 6.2);
  assert.deepEqual(openAIImageUsage({ input_tokens: 50, output_tokens: 4160 }), { inputTokens: 50, imageOutputTokens: 4160 });
  resetOpenRouterPriceCache();
});

test('the legacy NEXT_PUBLIC markup variable does not remove the generation markup', () => {
  assert.equal(usdToCredits(1, { NEXT_PUBLIC_CREDIT_MARKUP_PERCENT: '0' }), 160);
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
  // $1.40 x1.6 x100 = 224 credits
  assert.equal(await actualGenerationCredits(job, { cost: 1.4 }, { env: FX }), 224);
  assert.equal(await actualGenerationCredits(job, { cost: 0 }, { env: FX }), null);
  const seedance = { kind: 'video', model: 'byteplus/seedance-2.5-unfiltered', parameters: { resolution: '720p', duration: 5 } };
  assert.equal(await actualGenerationCredits(seedance, { cost: 0, completion_tokens: 108000 }, { env: FX }), 184.9);
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
    if (!await estimateGenerationCredits({ kind: 'image', model, prompt: 'x', parameters: {} }, { fetchImpl: offline, env: FX })) unpriced.push(model);
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
    if (!await estimateGenerationCredits({ kind: config.category, model, prompt: 'x', parameters }, { fetchImpl: offline, env: FX })) unpriced.push(model);
  }
  resetOpenRouterPriceCache();
  assert.deepEqual(unpriced, []);
});

test('credits follow USD/IDR relative to the reference rate', () => {
  assert.equal(fxFactor(PRICING_REFERENCE_USD_IDR), 1);
  // A 10% weaker rupiah charges 10% more credits for the same provider cost.
  assert.equal(usdToCredits(1, {}, PRICING_REFERENCE_USD_IDR * 1.1), 176);
  assert.equal(usdToCredits(1, { USD_IDR_RATE: String(PRICING_REFERENCE_USD_IDR * 0.9) }), 144);
  // A missing or implausible rate leaves prices at the reference.
  assert.equal(usdToCredits(1, {}, undefined), 160);
  assert.equal(usdToCredits(1, {}, 179), 160);
});

test('the USD/IDR rate is pinned by env, fetched daily otherwise, and falls back to the reference', async () => {
  resetUsdIdrRateCache();
  let fetches = 0;
  const live = async () => { fetches += 1; return new Response(JSON.stringify({ rates: { IDR: 18500 } })); };
  assert.equal(await loadUsdIdrRate({ fetchImpl: live, env: { USD_IDR_RATE: '19000' } }), 19000);
  assert.equal(fetches, 0);
  assert.equal(await loadUsdIdrRate({ fetchImpl: live, env: {}, now: 0 }), 18500);
  assert.equal(await loadUsdIdrRate({ fetchImpl: live, env: {}, now: 1000 }), 18500);
  assert.equal(fetches, 1);

  resetUsdIdrRateCache();
  const down = async () => { throw new Error('offline'); };
  assert.equal(await loadUsdIdrRate({ fetchImpl: down, env: {} }), PRICING_REFERENCE_USD_IDR);
  const garbage = async () => new Response(JSON.stringify({ rates: { IDR: 5 } }));
  resetUsdIdrRateCache();
  assert.equal(await loadUsdIdrRate({ fetchImpl: garbage, env: {} }), PRICING_REFERENCE_USD_IDR);
  resetUsdIdrRateCache();
});

test('estimates and settlements apply the live rate', async () => {
  const job = { kind: 'video', model: 'byteplus/seedance-2.5-unfiltered', parameters: { resolution: '720p', duration: 5 } };
  const weak = { USD_IDR_RATE: String(PRICING_REFERENCE_USD_IDR * 1.1) };
  // $1.1556 x1.6 x100 x1.1 = 203.4 credits
  assert.equal(await actualGenerationCredits(job, { completion_tokens: 108000 }, { env: weak }), 203.4);
  const priced = await estimateGenerationCredits({ kind: 'image', model: 'byteplus/seedream-4-5-251128', prompt: 'x', parameters: {} }, { env: weak });
  assert.equal(priced.credits, 7.1);
});

const noSettlementFetch = async () => { assert.fail('Snapshot settlement must not fetch provider prices or exchange rates'); };

test('quotes contain immutable provider pricing, currency and sale conversion details', async () => {
  const input = { kind: 'image', model: 'byteplus/seedream-4-5-251128', parameters: {} };
  const quote = await estimateGenerationCredits(input, { env: FX, fetchImpl: noSettlementFetch, now: 0 });
  assert.deepEqual(quote.pricingSnapshot, {
    schemaVersion: 1,
    kind: input.kind,
    model: input.model,
    quotedAt: '1970-01-01T00:00:00.000Z',
    usdIdrRate: 17915,
    referenceUsdIdrRate: 17915,
    creditsPerUsd: 100,
    markupMultiplier: 1.6,
    estimatedProviderCostUsd: 0.04,
    quotedCredits: 6.4,
    costBasis: { type: 'images', source: 'byteplus-rate-table', usdPerImage: 0.04 },
  });
  assert.ok(Object.isFrozen(quote.pricingSnapshot));
  assert.ok(Object.isFrozen(quote.pricingSnapshot.costBasis));
  assert.throws(() => { quote.pricingSnapshot.markupMultiplier = 3; }, TypeError);
});

test('Seedance snapshots settle with the reserved rate, FX and markup after configuration changes', async () => {
  const input = { kind: 'video', model: 'byteplus/seedance-2.5-unfiltered', parameters: { resolution: '720p', duration: 5 } };
  const quote = await estimateGenerationCredits(input, { env: FX, fetchImpl: noSettlementFetch });
  // Altering job parameters cannot replace the rate selected at reservation.
  const job = { ...input, parameters: { resolution: '1080p' }, pricing_snapshot: quote.pricingSnapshot };
  const changed = { env: { CREDIT_MARKUP_PERCENT: '200', USD_IDR_RATE: '25000' }, fetchImpl: noSettlementFetch };
  assert.equal(quote.pricingSnapshot.costBasis.usdPerMillionTokens, 10.7);
  assert.equal(await actualGenerationCredits(job, { completion_tokens: 108000 }, changed), 184.9);
  assert.equal(await actualGenerationCostUsd(job, { completion_tokens: 108000 }, changed), 1.1556);
});

test('image snapshots freeze the live token rates and never reload prices during settlement', async () => {
  resetOpenRouterPriceCache();
  const input = { kind: 'image', model: 'google/gemini-2.5-flash-image', prompt: '', parameters: {} };
  const oldPrice = async () => new Response(JSON.stringify({ data: [{ id: input.model, pricing: { prompt: '0.0000003', completion: '0.0000025', image_output: '0.00003' } }] }));
  const quote = await estimateGenerationCredits(input, { fetchImpl: oldPrice, env: FX });
  assert.ok(Object.isFrozen(quote.pricingSnapshot.costBasis.rates));
  assert.throws(() => { quote.pricingSnapshot.costBasis.rates.image_output = 1; }, TypeError);

  resetOpenRouterPriceCache();
  const changedPrice = async () => new Response(JSON.stringify({ data: [{ id: input.model, pricing: { prompt: '0.01', image_output: '0.1' } }] }));
  assert.equal((await loadOpenRouterImagePrices({ fetchImpl: changedPrice }))[input.model].image_output, 0.1);
  const job = { ...input, pricing_snapshot: JSON.stringify(quote.pricingSnapshot) };
  const changed = { env: { USD_IDR_RATE: '25000', CREDIT_MARKUP_PERCENT: '200' }, fetchImpl: noSettlementFetch };
  const usage = { inputTokens: 100, imageOutputTokens: 1290 };
  close(await actualGenerationCostUsd(job, usage, changed), 0.03873, 1e-12);
  assert.equal(await actualGenerationCredits(job, usage, changed), 6.2);
  assert.equal(await actualGenerationCredits(job, { costUsd: 0.039 }, changed), 6.3);
  assert.equal(await actualGenerationCredits(job, { cost: 0.039 }, changed), 6.3);
  resetOpenRouterPriceCache();
});

test('per-image snapshots use frozen rates and quoted FX for multiple generated outputs', async () => {
  const input = { kind: 'image', model: 'byteplus/seedream-5.0-pro-unfiltered', parameters: { resolution: '2K' } };
  const quote = await estimateGenerationCredits(input, { env: { USD_IDR_RATE: String(PRICING_REFERENCE_USD_IDR * 1.1), CREDIT_MARKUP_PERCENT: '50' }, fetchImpl: noSettlementFetch });
  const job = { ...input, parameters: {}, pricing_snapshot: quote.pricingSnapshot };
  const options = { env: { USD_IDR_RATE: '10000', CREDIT_MARKUP_PERCENT: '0' }, fetchImpl: noSettlementFetch };
  assert.equal(await actualGenerationCostUsd(job, { generated_images: 2 }, options), 0.18);
  assert.equal(await actualGenerationCredits(job, { generated_images: 2 }, options), 29.7);
});

test('per-second video snapshots retain selected tier, reference fees and minimum charge', async () => {
  const grok = { kind: 'video', model: 'x-ai/grok-imagine-video-1.5', parameters: { resolution: '480p', duration: 8, referenceImages: ['a', 'b'] } };
  const quote = await estimateGenerationCredits(grok, { env: FX, fetchImpl: noSettlementFetch });
  assert.deepEqual(quote.pricingSnapshot.costBasis, {
    type: 'video_seconds', source: 'video-rate-table', usdPerSecond: 0.08,
    minimumUsd: 0, usdPerInputImage: 0.01, inputImageCount: 2,
  });
  const job = { ...grok, pricing_snapshot: quote.pricingSnapshot };
  const options = { env: { USD_IDR_RATE: '25000', CREDIT_MARKUP_PERCENT: '200' }, fetchImpl: noSettlementFetch };
  assert.equal(await actualGenerationCostUsd(job, { cost: '0.66' }, options), 0.66);
  assert.equal(await actualGenerationCredits(job, { cost: '0.66' }, options), 105.6);
  assert.equal(await actualGenerationCostUsd(job, {}, options), null);
  const aleph = await estimateGenerationCredits({ kind: 'video', model: 'runway/aleph-2', parameters: { duration: 1 } }, { env: FX });
  assert.equal(aleph.pricingSnapshot.costBasis.minimumUsd, 0.56);
});

test('reported zero USD is actual COGS while promotional provider usage keeps the customer charge', async () => {
  const input = { kind: 'video', model: 'byteplus/seedance-2.5-unfiltered', parameters: { resolution: '720p', duration: 5 } };
  const quote = await estimateGenerationCredits(input, { env: FX, fetchImpl: noSettlementFetch });
  const job = { ...input, pricing_snapshot: quote.pricingSnapshot };
  const options = { fetchImpl: noSettlementFetch };
  for (const zero of [0, '0']) {
    assert.equal(await actualGenerationCostUsd(job, { costUsd: zero, completion_tokens: 108000 }, options), 0);
    assert.equal(await actualGenerationCredits(job, { costUsd: zero, completion_tokens: 108000 }, options), 184.9);
    assert.equal(await actualGenerationCostUsd(job, { cost: zero }, options), 0);
    assert.equal(await actualGenerationCredits(job, { cost: zero }, options), null);
  }
});

test('unknown and invalid reported costs remain unknown instead of becoming zero or an estimate', async () => {
  const input = { kind: 'image', model: 'byteplus/seedream-4-5-251128', parameters: {} };
  const quote = await estimateGenerationCredits(input, { env: FX });
  const options = { fetchImpl: noSettlementFetch };
  for (const pricing_snapshot of [undefined, quote.pricingSnapshot]) {
    const job = { ...input, pricing_snapshot };
    assert.equal(await actualGenerationCostUsd(job, {}, options), null);
    for (const value of [null, undefined, '', '   ', false, [], {}, -1, '-1', Infinity, 'Infinity', NaN, 'bad']) {
      assert.equal(await actualGenerationCostUsd(job, { costUsd: value }, options), null);
      assert.equal(await actualGenerationCostUsd(job, { cost: value }, options), null);
    }
    assert.equal(await actualGenerationCostUsd(job, { costUsd: '0.035' }, options), 0.035);
    assert.equal(await actualGenerationCostUsd(job, { cost: 0.04 }, options), 0.04);
  }
});

test('legacy jobs normalize reported or counted USD without treating their credit estimate as cost', async () => {
  const video = { kind: 'video', model: 'byteplus/seedance-2.5-unfiltered', parameters: { resolution: '720p' }, estimated_cost: 184.9 };
  assert.equal(await actualGenerationCostUsd(video, { completion_tokens: 108000 }), 1.1556);
  assert.equal(await actualGenerationCostUsd(video, { completion_tokens: 0 }), 0);
  assert.equal(await actualGenerationCostUsd(video, {}), null);
  const seedream = { kind: 'image', model: 'byteplus/seedream-4-5-251128', parameters: '{}' };
  assert.equal(await actualGenerationCostUsd(seedream, { generated_images: 2 }), 0.08);
  assert.equal(await actualGenerationCostUsd(seedream, { costUsd: 0, generated_images: 2 }), 0);

  resetOpenRouterPriceCache();
  const catalog = async () => new Response(JSON.stringify({ data: [] }));
  const tokenImage = { kind: 'image', model: 'google/gemini-2.5-flash-image', parameters: {} };
  close(await actualGenerationCostUsd(tokenImage, { inputTokens: 100, imageOutputTokens: 1290 }, { fetchImpl: catalog }), 0.03873, 1e-12);
  assert.equal(await actualGenerationCostUsd(tokenImage, { cost: 0.04 }, { fetchImpl: noSettlementFetch }), 0.04);
  assert.equal(await actualGenerationCostUsd(tokenImage, {}, { fetchImpl: noSettlementFetch }), null);
  resetOpenRouterPriceCache();
});

test('unknown image output prices are refused while an explicitly reported zero rate remains known', async () => {
  const input = { kind: 'image', model: 'example/unknown-output-image', prompt: 'x', parameters: {} };
  for (const pricing of [{}, { prompt: '0.1' }, { image_output: null }, { image_output: '-1' }]) {
    resetOpenRouterPriceCache();
    const catalog = async () => new Response(JSON.stringify({ data: [{ id: input.model, pricing }] }));
    assert.equal(await estimateGenerationCredits(input, { fetchImpl: catalog, env: FX }), null);
    assert.equal(await actualGenerationCostUsd(input, { imageOutputTokens: 1290 }, { fetchImpl: catalog }), null);
  }
  resetOpenRouterPriceCache();
  const zeroRate = async () => new Response(JSON.stringify({ data: [{ id: input.model, pricing: { image_output: '0' } }] }));
  const quote = await estimateGenerationCredits(input, { fetchImpl: zeroRate, env: FX });
  assert.equal(quote.usd, 0);
  assert.equal(quote.pricingSnapshot.costBasis.rates.image_output, 0);
  const job = { ...input, pricing_snapshot: quote.pricingSnapshot };
  assert.equal(await actualGenerationCostUsd(job, { imageOutputTokens: 1290 }, { fetchImpl: noSettlementFetch }), 0);
  assert.equal(await actualGenerationCredits(job, { imageOutputTokens: 1290 }, { fetchImpl: noSettlementFetch }), null);

  const corrupt = { ...job, pricing_snapshot: { ...quote.pricingSnapshot, costBasis: { type: 'image_tokens', rates: {} } } };
  await assert.rejects(actualGenerationCostUsd(corrupt, { imageOutputTokens: 1290 }, { fetchImpl: noSettlementFetch }), /pricing snapshot is invalid/);
  await assert.rejects(actualGenerationCredits(corrupt, { costUsd: 0.04 }, { fetchImpl: noSettlementFetch }), /pricing snapshot is invalid/);
  resetOpenRouterPriceCache();
});

test('USD aliases prefer a valid costUsd value and accept a valid cost when costUsd is unusable', async () => {
  const input = { kind: 'image', model: 'byteplus/seedream-4-5-251128', parameters: {} };
  const quote = await estimateGenerationCredits(input, { env: FX });
  const job = { ...input, pricing_snapshot: quote.pricingSnapshot };
  const options = { fetchImpl: noSettlementFetch };
  assert.equal(await actualGenerationCostUsd(job, { costUsd: 0.04, cost: 1 }, options), 0.04);
  assert.equal(await actualGenerationCostUsd(job, { costUsd: 0, cost: 1 }, options), 0);
  assert.equal(await actualGenerationCostUsd(job, { costUsd: -1, cost: 0.04 }, options), 0.04);
  assert.equal(await actualGenerationCredits(job, { costUsd: 'bad', cost: 0.04 }, options), 6.4);
});

test('invalid token and image counters cannot reduce provider COGS or customer credits', async () => {
  resetOpenRouterPriceCache();
  const input = { kind: 'image', model: 'google/gemini-2.5-flash-image', parameters: {} };
  const catalog = async () => new Response(JSON.stringify({ data: [] }));
  const quote = await estimateGenerationCredits(input, { env: FX, fetchImpl: catalog });
  const job = { ...input, pricing_snapshot: quote.pricingSnapshot };
  const options = { fetchImpl: noSettlementFetch };
  for (const badCount of [-100, 'bad', Infinity, null, false, '', Number.MAX_VALUE]) {
    const usage = { inputTokens: badCount, imageOutputTokens: badCount };
    assert.equal(await actualGenerationCostUsd(job, usage, options), null);
    assert.equal(await actualGenerationCredits(job, usage, options), null);
  }
  assert.equal(await actualGenerationCostUsd(job, { imageOutputTokens: 0 }, options), 0);
  assert.equal(await actualGenerationCredits(job, { imageOutputTokens: 0 }, options), null);

  const seedream = { kind: 'image', model: 'byteplus/seedream-4-5-251128', parameters: {} };
  const seedreamQuote = await estimateGenerationCredits(seedream, { env: FX });
  seedream.pricing_snapshot = seedreamQuote.pricingSnapshot;
  assert.equal(await actualGenerationCostUsd(seedream, { generated_images: -1 }, options), null);
  assert.equal(await actualGenerationCostUsd(seedream, { generated_images: 0 }, options), 0);
  assert.equal(await actualGenerationCredits(seedream, { generated_images: 0 }, options), null);
  resetOpenRouterPriceCache();
});

test('corrupt or mismatched snapshots fail closed without fetching replacement prices', async () => {
  const input = { kind: 'image', model: 'byteplus/seedream-4-5-251128', parameters: {} };
  const { pricingSnapshot } = await estimateGenerationCredits(input, { env: FX });
  const invalid = [
    'not-json',
    {},
    { ...pricingSnapshot, model: 'another/model' },
    { ...pricingSnapshot, kind: 'video' },
    { ...pricingSnapshot, usdIdrRate: 0 },
    { ...pricingSnapshot, creditsPerUsd: null },
    { ...pricingSnapshot, markupMultiplier: -1 },
    { ...pricingSnapshot, costBasis: { type: 'images', usdPerImage: -1 } },
    { ...pricingSnapshot, costBasis: { type: 'video_tokens', usdPerMillionTokens: 10.7 } },
  ];
  for (const pricing_snapshot of invalid) {
    const job = { ...input, pricing_snapshot };
    await assert.rejects(actualGenerationCredits(job, { costUsd: 0.04 }, { fetchImpl: noSettlementFetch }), /pricing snapshot is invalid/);
    await assert.rejects(actualGenerationCostUsd(job, { costUsd: 0.04 }, { fetchImpl: noSettlementFetch }), /pricing snapshot is invalid/);
  }
});
