// Per-model generation pricing. Credits used to be a flat 2.5 per image and
// 10 per video whatever the model, resolution or duration, far below provider
// cost (a 5s 1080p Seedance 2.5 video costs ~$2.84; we charged $0.10).
//
// Charge = provider cost (USD) x markup (1.6x by default) x CREDITS_PER_USD
// x FX factor. A job reserves an upper-bound estimate up front; on success it
// is settled at the actual provider usage when the provider reports it (the
// difference is refunded). Each new quote freezes provider rates, markup and
// FX so later price changes cannot alter an accepted customer quote.
//
// Sources:
// - Seedance video and Seedream images: BytePlus ModelArk list prices.
// - Other image models (Gemini, GPT-image): live OpenRouter pricing
//   (/api/v1/models?output_modalities=image), with the snapshot below as the
//   fallback when OpenRouter is unreachable.

export const CREDITS_PER_USD = 100;
const CREDIT_PRECISION = 10;

// Generation markup only. NEXT_PUBLIC_CREDIT_MARKUP_PERCENT is not read here:
// it is baked into the browser bundle for Studio estimates at build time, and
// an empty or stale value there must not change what is charged.
export function markupMultiplier(env = process.env) {
  const raw = env.CREDIT_MARKUP_PERCENT;
  const percent = raw === undefined || raw === '' ? 60 : Number(raw);
  return Number.isFinite(percent) && percent >= 0 ? 1 + percent / 100 : 1.6;
}

// Providers bill in USD but credits are sold in rupiah, so a weaker rupiah
// would eat the margin. Credits scale with USD/IDR relative to the rate the
// current prices were set at (5 Oct 2026), so prices are unchanged at that
// rate and the margin holds as it moves.
export const PRICING_REFERENCE_USD_IDR = 17915;
const SANE_USD_IDR = [10000, 40000];

function validRate(value) {
  const rate = Number(value);
  return Number.isFinite(rate) && rate >= SANE_USD_IDR[0] && rate <= SANE_USD_IDR[1] ? rate : null;
}

export function fxFactor(rate) {
  const valid = validRate(rate);
  return valid ? valid / PRICING_REFERENCE_USD_IDR : 1;
}

export function usdToCredits(usd, env = process.env, usdIdrRate = env.USD_IDR_RATE) {
  const cost = Number(usd);
  if (!Number.isFinite(cost) || cost < 0) throw new Error('Provider cost is invalid');
  if (cost === 0) return 0;
  return Math.ceil(cost * markupMultiplier(env) * CREDITS_PER_USD * fxFactor(usdIdrRate) * CREDIT_PRECISION - 1e-9) / CREDIT_PRECISION;
}

// USD_IDR_RATE pins the rate; otherwise a daily public rate is used, and the
// reference rate when it cannot be fetched.
let fxCache = { expiresAt: 0, rate: null };
const FX_TTL_MS = 12 * 60 * 60 * 1000;

export async function loadUsdIdrRate({ fetchImpl = globalThis.fetch, env = process.env, now = Date.now() } = {}) {
  const pinned = validRate(env.USD_IDR_RATE);
  if (pinned) return pinned;
  if (fxCache.rate && fxCache.expiresAt > now) return fxCache.rate;
  try {
    const response = await fetchImpl('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`exchange rate ${response.status}`);
    const rate = validRate((await response.json())?.rates?.IDR);
    if (!rate) throw new Error('exchange rate missing or out of range');
    fxCache = { expiresAt: now + FX_TTL_MS, rate };
    return rate;
  } catch (error) {
    console.error('[pricing] USD/IDR rate unavailable', error?.message);
    // Retry sooner, but keep serving the last known (or reference) rate.
    fxCache = { expiresAt: now + 30 * 60 * 1000, rate: fxCache.rate };
    return fxCache.rate || PRICING_REFERENCE_USD_IDR;
  }
}

export function resetUsdIdrRateCache() {
  fxCache = { expiresAt: 0, rate: null };
}

// ---------------------------------------------------------------- video ----

// USD per million tokens. `low` covers 480p and 720p.
const SEEDANCE_RATES = [
  { match: /seedance-2[.-]5/, rates: { low: [10.7, 6.4], '1080p': [11.7, 7.0] } },
  { match: /seedance-2[.-]0-fast/, rates: { low: [5.6, 3.3] } },
  { match: /seedance-2[.-]0-mini/, rates: { low: [3.5, 2.1] } },
  { match: /seedance-2[.-]0|seedance-v2\.0/, rates: { low: [7.0, 4.3], '1080p': [7.7, 4.7], '4k': [4.0, 2.4] } },
  { match: /seedance-1-5-pro/, audio: [2.4, 1.2] },
  { match: /seedance-1-0-pro-fast/, flat: 1.0 },
  { match: /seedance-1-0-pro/, flat: 2.5 },
];

// Largest output pixel count per resolution across supported aspect ratios
// (BytePlus bills width x height x fps x seconds / 1024 tokens).
const VIDEO_PIXELS = { '480p': 864 * 480, '720p': 1120 * 832, '1080p': 1920 * 1088, '4k': 3840 * 2160 };
const VIDEO_FPS = 24;
// Input video length is not known before the provider reads it; reserve for
// the longest accepted reference and settle at the reported usage.
// Seedance 2.5 doubles both limits to 30s (input total and auto output length).
const ASSUMED_INPUT_VIDEO_SECONDS = 15;
const ASSUMED_AUTO_DURATION_SECONDS = 15;
const SEEDANCE_25_MAX_SECONDS = 30;
const DEFAULT_VIDEO_SECONDS = 5;

// Dedicated BytePlus endpoints (the "Unfiltered" models) are addressed by an
// endpoint id with no model name in it; price them as the model they serve.
const ENDPOINT_PRICING_ALIASES = {
  'ep-20260904190604-p8pjl': 'seedance-2.5',
  'ep-20260907150312-xx7gf': 'seedream-4.5',
  'ep-20260907150433-zg8fr': 'seedream-5.0-lite',
};

// Canvas sends BytePlus models as `byteplus/<id>`.
export function pricingModelId(model) {
  const id = String(model).replace(/^byteplus\//, '');
  return ENDPOINT_PRICING_ALIASES[id] || String(model);
}

export function isSeedanceModel(model) {
  return SEEDANCE_RATES.some((entry) => entry.match.test(pricingModelId(model)));
}

// With no resolution the provider renders at its own default, which may be
// 1080p, so reserve as 1080p. Seedance settles at the reported usage, so a
// cheaper render refunds the difference.
function normalizedResolution(value) {
  if (!value) return '1080p';
  const res = String(value).toLowerCase();
  return VIDEO_PIXELS[res] ? res : '720p';
}

function videoInputs(parameters = {}) {
  return (Array.isArray(parameters.referenceVideos) && parameters.referenceVideos.length > 0)
    || parameters.omniReferenceTaskType === 'extend' || parameters.omniReferenceTaskType === 'edit';
}

// USD per million tokens for this job.
export function seedanceRatePerMillion(model, parameters = {}) {
  const entry = SEEDANCE_RATES.find((candidate) => candidate.match.test(pricingModelId(model)));
  if (!entry) return null;
  if (entry.flat) return entry.flat;
  if (entry.audio) return parameters.generateAudio === false ? entry.audio[1] : entry.audio[0];
  const resolution = billedResolution(parameters);
  const tier = resolution === '1080p' || resolution === '4k' ? (entry.rates[resolution] || entry.rates['1080p'] || entry.rates.low) : entry.rates.low;
  return videoInputs(parameters) ? tier[1] : tier[0];
}

// Draft generation is billed as 480p; finalization at the target resolution.
function billedResolution(parameters = {}) {
  return parameters.draft === true ? '480p' : normalizedResolution(parameters.resolution);
}

export function estimateSeedanceTokens(parameters = {}, model = '') {
  const isSeedance25 = /seedance-2[.-]5/.test(pricingModelId(model));
  const duration = Number(parameters.duration);
  const outputSeconds = duration === -1 ? (isSeedance25 ? SEEDANCE_25_MAX_SECONDS : ASSUMED_AUTO_DURATION_SECONDS) : (Number.isFinite(duration) && duration > 0 ? duration : DEFAULT_VIDEO_SECONDS);
  const inputSeconds = videoInputs(parameters) && !parameters.draftTaskId ? (isSeedance25 ? SEEDANCE_25_MAX_SECONDS : ASSUMED_INPUT_VIDEO_SECONDS) : 0;
  return Math.ceil(((inputSeconds + outputSeconds) * VIDEO_PIXELS[billedResolution(parameters)] * VIDEO_FPS) / 1024);
}

// Video models billed per second of output, in USD. Taken from the
// `pricing_skus` of OpenRouter's video catalog (GET /api/v1/videos/models) in
// October 2026; Sora 2 Pro runs on OpenAI's own API at the same rates. Update
// these by hand when a provider changes its prices.
// Tiers are keyed by resolution. A resolution between listed tiers is billed
// at the next listed tier above it, so a run is never undercharged; above the
// highest tier it uses the highest. `any` applies to every resolution.
const PER_SECOND_VIDEO_PRICES = [
  { match: /^google\/veo-3\.1-fast$/, audio: { '720p': 0.10, '1080p': 0.12, '4k': 0.30 }, silent: { '720p': 0.08, '1080p': 0.10, '4k': 0.25 } },
  { match: /^google\/veo-3\.1-lite$/, audio: { '720p': 0.05, '1080p': 0.08 }, silent: { '720p': 0.03, '1080p': 0.05 } },
  { match: /^google\/veo-3\.1$/, audio: { '1080p': 0.40, '4k': 0.60 }, silent: { '1080p': 0.20, '4k': 0.40 } },
  { match: /^kwaivgi\/kling-v3\.0-pro$/, audio: { any: 0.168 }, silent: { any: 0.112 } },
  { match: /^kwaivgi\/kling-v3\.0-std$/, audio: { any: 0.126 }, silent: { any: 0.084 } },
  { match: /^kwaivgi\/kling-video-o1$/, tiers: { any: 0.112 } },
  { match: /^minimax\/hailuo-2\.3$/, tiers: { any: 0.0817 } },
  { match: /^(openai\/)?sora-2-pro$/, tiers: { '720p': 0.30, '1080p': 0.50 } },
  { match: /^x-ai\/grok-imagine-video-1\.5$/, tiers: { '480p': 0.08, '720p': 0.14, '1080p': 0.25 }, perInputImage: 0.01 },
  { match: /^x-ai\/grok-imagine-video$/, tiers: { '480p': 0.05, '720p': 0.07 }, perInputImage: 0.002 },
  { match: /^alibaba\/happyhorse-1\.0$/, tiers: { '720p': 0.0988, '1080p': 0.1694 } },
  { match: /^alibaba\/happyhorse-1\.1$/, tiers: { '720p': 0.0988, '1080p': 0.1278 } },
  { match: /^alibaba\/wan-2\.6$/, tiers: { '480p': 0.04, '720p': 0.08, '1080p': 0.12 }, imageTiers: { '720p': 0.10, '1080p': 0.15 } },
  // Video-to-video: the output is as long as the source video.
  { match: /^runway\/aleph-2$/, tiers: { any: 0.28 }, minimum: 0.56, sourceLength: true },
  { match: /^alibaba\/wan-2\.7$/, tiers: { any: 0.10 }, sourceLength: true },
];
const RESOLUTION_ORDER = ['480p', '720p', '1080p', '4k'];
// Video Studio always sends a duration; this only covers a missing one.
const ASSUMED_PER_SECOND_VIDEO_SECONDS = 8;

function tierPrice(tiers, resolution) {
  if (tiers.any !== undefined) return tiers.any;
  const listed = RESOLUTION_ORDER.filter((key) => tiers[key] !== undefined);
  const wanted = RESOLUTION_ORDER.indexOf(resolution);
  const match = listed.find((key) => RESOLUTION_ORDER.indexOf(key) >= wanted) || listed[listed.length - 1];
  return tiers[match];
}

function inputImageCount(parameters = {}) {
  const frames = Array.isArray(parameters.frameImages) ? parameters.frameImages.length : 0;
  const references = Array.isArray(parameters.referenceImages) ? parameters.referenceImages.length : 0;
  return frames + references;
}

export function perSecondVideoCostUsd(model, parameters = {}) {
  const basis = videoSecondCostBasis(model, parameters);
  if (!basis) return null;
  const entry = PER_SECOND_VIDEO_PRICES.find((candidate) => candidate.match.test(String(model)));
  const duration = Number(parameters.duration);
  const assumed = entry.sourceLength ? ASSUMED_INPUT_VIDEO_SECONDS : ASSUMED_PER_SECOND_VIDEO_SECONDS;
  const seconds = Number.isFinite(duration) && duration > 0 ? duration : assumed;
  return Math.max(basis.minimumUsd, basis.usdPerSecond * seconds + basis.inputImageCount * basis.usdPerInputImage);
}

function videoSecondCostBasis(model, parameters = {}) {
  const entry = PER_SECOND_VIDEO_PRICES.find((candidate) => candidate.match.test(String(model)));
  if (!entry) return null;
  const resolution = String(parameters.resolution || '1080p').toLowerCase();
  const images = inputImageCount(parameters);
  const tiers = entry.imageTiers && images > 0 ? entry.imageTiers
    : entry.audio ? (parameters.generateAudio === false ? entry.silent : entry.audio)
      : entry.tiers;
  return {
    type: 'video_seconds',
    source: 'video-rate-table',
    usdPerSecond: tierPrice(tiers, resolution),
    minimumUsd: entry.minimum || 0,
    usdPerInputImage: entry.perInputImage || 0,
    inputImageCount: images,
  };
}

export function estimateVideoCostUsd({ model, parameters = {} }) {
  const rate = seedanceRatePerMillion(model, parameters);
  if (rate === null) return perSecondVideoCostUsd(model, parameters);
  return (estimateSeedanceTokens(parameters, model) * rate) / 1e6;
}

// OpenRouter reports the USD charge as usage.cost; BytePlus reports tokens.
// A zero cost (a provider free quota) is not what the user is charged.
export function actualVideoCostUsd({ model, parameters = {} }, usage = {}) {
  const cost = reportedCostUsd(usage);
  if (cost > 0) return cost;
  const tokens = usageCount(usage.completion_tokens ?? usage.total_tokens);
  const rate = seedanceRatePerMillion(model, parameters);
  if (rate === null || tokens === null || tokens <= 0) return null;
  return (tokens * rate) / 1e6;
}

// ---------------------------------------------------------------- image ----

// BytePlus Seedream, USD per output image. `high` applies above 1.5K.
const SEEDREAM_PRICES = [
  { match: /seedream-5[.-]0-pro|seedream-5\.0-pro/, low: 0.045, high: 0.09, extraInputImage: 0.003 },
  { match: /seedream-5-0-flash/, low: 0.018 },
  { match: /seedream-5-0(-lite)?|seedream-5\.0-lite/, low: 0.035 },
  { match: /seedream-4[.-]5/, low: 0.04 },
  { match: /seedream-4-0/, low: 0.03 },
  { match: /seededit-3-0/, low: 0.03 },
  { match: /seedream-3/, low: 0.03 },
];

export function seedreamCostUsd(model, parameters = {}) {
  const entry = SEEDREAM_PRICES.find((candidate) => candidate.match.test(pricingModelId(model)));
  if (!entry) return null;
  const resolution = String(parameters.resolution || '').toUpperCase();
  const high = entry.high && ['2K', '3K', '4K'].includes(resolution);
  const references = Array.isArray(parameters.referenceImages) ? parameters.referenceImages.length : 0;
  return (high ? entry.high : entry.low) + Math.max(0, references - 1) * (entry.extraInputImage || 0);
}

// OpenRouter snapshot (USD per token), used when the live list is unavailable.
const OPENROUTER_IMAGE_SNAPSHOT = {
  'google/gemini-2.5-flash-image': { prompt: 0.0000003, completion: 0.0000025, image: 0.0000003, image_output: 0.00003 },
  'google/gemini-3-pro-image': { prompt: 0.000002, completion: 0.000012, image: 0.000002, image_output: 0.00012 },
  'google/gemini-3-pro-image-preview': { prompt: 0.000002, completion: 0.000012, image: 0.000002, image_output: 0.00012 },
  'google/gemini-3.1-flash-image': { prompt: 0.0000005, completion: 0.000003, image_output: 0.00006 },
  'google/gemini-3.1-flash-image-preview': { prompt: 0.0000005, completion: 0.000003, image_output: 0.00006 },
  'google/gemini-3.1-flash-lite-image': { prompt: 0.00000025, completion: 0.0000015, image_output: 0.00003 },
  'openai/gpt-image-2': { prompt: 0.000008, completion: 0.000008, image_output: 0.00003 },
  'openai/gpt-image-1': { prompt: 0.00001, completion: 0.00001, image_output: 0.00004 },
  'openai/gpt-image-1-mini': { prompt: 0.0000025, completion: 0.0000025, image_output: 0.000008 },
  // Not on OpenRouter; Canvas calls OpenAI directly (OpenAI list price).
  'openai/gpt-image-1.5': { prompt: 0.000005, completion: 0.00001, image: 0.000008, image_output: 0.000032 },
  'openai/gpt-5.4-image-2': { prompt: 0.000008, completion: 0.000015, image_output: 0.00003 },
  'openai/gpt-5-image': { prompt: 0.00001, completion: 0.00001, image_output: 0.00004 },
  'openai/gpt-5-image-mini': { prompt: 0.0000025, completion: 0.000002, image_output: 0.000008 },
  'black-forest-labs/flux.2-pro': { prompt: 0, completion: 0, image_output: 0.00000732421875 },
  'black-forest-labs/flux.2-flex': { prompt: 0, completion: 0, image_token: 0.0000146484375, image_output: 0.0000146484375 },
  'black-forest-labs/flux.2-max': { prompt: 0, completion: 0, image_output: 0.00001708984375 },
  'qwen/qwen-image-3': { prompt: 0, completion: 0, image: 0.003, image_token: 0.00000718562874251497, image_output: 0.00000718562874251497 },
  'qwen/qwen-image-3-pro': { prompt: 0, completion: 0, image: 0.003, image_token: 0.00000958083832335329, image_output: 0.00000958083832335329 },
  'x-ai/grok-imagine-image-2.0': { prompt: 0, completion: 0, image: 0.01, image_token: 0.00000958083832335329, image_output: 0.00000958083832335329 },
};

// Output tokens per generated image, used for the reservation only (the
// settlement uses the provider's reported usage). Upper ends of the
// providers' published per-image token counts.
export function estimatedImageOutputTokens(model, parameters = {}) {
  const id = String(model);
  const resolution = String(parameters.resolution || '1K').toUpperCase();
  if (/gemini-2\.5-flash-image/.test(id)) return 1290;
  if (/gemini-3(\.\d)?-(pro|flash)/.test(id)) return resolution === '4K' ? 2520 : resolution === '2K' ? 1680 : 1120;
  if (/gpt-image|gpt-5(\.\d)?-image/.test(id)) return (parameters.aspectRatio && parameters.aspectRatio !== '1:1') ? 6240 : 4160;
  return 4160;
}

export const ESTIMATED_INPUT_TOKENS_PER_REFERENCE = 1300;

let openRouterCache = { expiresAt: 0, prices: null };
const OPENROUTER_TTL_MS = 60 * 60 * 1000;

function parsePricing(pricing = {}) {
  const out = {};
  for (const key of ['prompt', 'completion', 'image', 'image_token', 'image_output', 'request']) {
    const value = nonNegativeNumber(pricing[key]);
    if (value !== null) out[key] = value;
  }
  return out;
}

export async function loadOpenRouterImagePrices({ fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  if (openRouterCache.prices && openRouterCache.expiresAt > now) return openRouterCache.prices;
  try {
    const response = await fetchImpl('https://openrouter.ai/api/v1/models?output_modalities=image', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`OpenRouter models ${response.status}`);
    const payload = await response.json();
    const prices = {};
    for (const model of payload?.data || []) {
      if (model?.id && model.pricing) prices[model.id] = parsePricing(model.pricing);
    }
    openRouterCache = { expiresAt: now + OPENROUTER_TTL_MS, prices };
    return prices;
  } catch (error) {
    console.error('[pricing] OpenRouter price list unavailable, using snapshot', error?.message);
    // Retry sooner, but keep serving the last known (or snapshot) prices.
    openRouterCache = { expiresAt: now + 5 * 60 * 1000, prices: openRouterCache.prices || null };
    return openRouterCache.prices || {};
  }
}

export function resetOpenRouterPriceCache() {
  openRouterCache = { expiresAt: 0, prices: null };
}

function tokenPricing(model, livePrices = {}) {
  return livePrices[model] || OPENROUTER_IMAGE_SNAPSHOT[model] || null;
}

export function estimateTokenImageCostUsd({ model, prompt = '', parameters = {} }, livePrices = {}) {
  const pricing = tokenPricing(model, livePrices);
  if (!hasImageOutputRate(pricing)) return null;
  const references = Array.isArray(parameters.referenceImages) ? parameters.referenceImages.length : 0;
  const promptTokens = Math.ceil(String(prompt).length / 3);
  // Models that list `image_token` price `image` per input image, not per token.
  const referenceCost = pricing.image_token !== undefined
    ? (pricing.image || 0)
    : ESTIMATED_INPUT_TOKENS_PER_REFERENCE * (pricing.image ?? pricing.prompt ?? 0);
  const inputCost = promptTokens * (pricing.prompt || 0) + references * referenceCost;
  const outputCost = estimatedImageOutputTokens(model, parameters) * (pricing.image_output ?? pricing.completion ?? 0);
  return inputCost + outputCost + (pricing.request || 0);
}

// Actual cost from the usage a provider reported. OpenRouter reports USD
// directly; Google and OpenAI report token counts. A zero cost is not used.
export function actualTokenImageCostUsd({ model }, usage = {}, livePrices = {}) {
  const cost = nonNegativeNumber(usage.costUsd);
  if (cost > 0) return cost;
  const pricing = tokenPricing(model, livePrices);
  if (!pricing) return null;
  return tokenImageUsageCostUsd(usage, pricing, false);
}

// ---------------------------------------------------------------- jobs -----

// Provider cost estimate (USD) for a validated generation, or null when the
// model has no known price (the caller then refuses the job).
async function quoteGenerationCost({ kind, model, prompt, parameters = {} }, { fetchImpl } = {}) {
  if (kind === 'video') {
    const usd = estimateVideoCostUsd({ model, parameters });
    if (usd === null) return null;
    const rate = seedanceRatePerMillion(model, parameters);
    const costBasis = rate !== null
      ? { type: 'video_tokens', source: 'byteplus-rate-table', usdPerMillionTokens: rate }
      : videoSecondCostBasis(model, parameters);
    return { usd, costBasis };
  }
  const seedream = seedreamCostUsd(model, parameters);
  if (seedream !== null) return { usd: seedream, costBasis: { type: 'images', source: 'byteplus-rate-table', usdPerImage: seedream } };
  // Only OpenRouter-style ids (author/slug) can have an OpenRouter price.
  if (!OPENROUTER_IMAGE_SNAPSHOT[model] && !/^[a-z0-9-]+\/[^/\s]+$/i.test(String(model))) return null;
  const live = await loadOpenRouterImagePrices({ fetchImpl });
  const pricing = tokenPricing(model, live);
  if (!hasImageOutputRate(pricing)) return null;
  return {
    usd: estimateTokenImageCostUsd({ model, prompt, parameters }, live),
    costBasis: { type: 'image_tokens', source: live[model] ? 'openrouter-catalog' : 'image-rate-table', rates: parsePricing(pricing) },
  };
}

export async function estimateGenerationCostUsd(input, options = {}) {
  return (await quoteGenerationCost(input, options))?.usd ?? null;
}

export async function estimateGenerationCredits(input, options = {}) {
  const quote = await quoteGenerationCost(input, options);
  if (!quote) return null;
  const { usd, costBasis } = quote;
  const env = options.env || process.env;
  const usdIdrRate = await loadUsdIdrRate({ fetchImpl: options.fetchImpl, env });
  const credits = usdToCredits(usd, env, usdIdrRate);
  if (costBasis.rates) Object.freeze(costBasis.rates);
  const pricingSnapshot = Object.freeze({
    schemaVersion: 1,
    kind: input.kind,
    model: input.model,
    quotedAt: new Date(options.now ?? Date.now()).toISOString(),
    usdIdrRate,
    referenceUsdIdrRate: PRICING_REFERENCE_USD_IDR,
    creditsPerUsd: CREDITS_PER_USD,
    markupMultiplier: markupMultiplier(env),
    estimatedProviderCostUsd: usd,
    quotedCredits: credits,
    costBasis: Object.freeze(costBasis),
  });
  return { usd, credits, pricingSnapshot };
}

// Provider-reported zero is valid COGS. Missing, nonnumeric and negative
// amounts are unknown; never coerce null, blanks or booleans into zero.
function nonNegativeNumber(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function reportedCostUsd(usage) {
  return nonNegativeNumber(usage.costUsd) ?? nonNegativeNumber(usage.cost);
}

function hasImageOutputRate(pricing) {
  return pricing && nonNegativeNumber(pricing.image_output ?? pricing.completion) !== null;
}

function usageCount(value) {
  const count = nonNegativeNumber(value);
  return Number.isSafeInteger(count) ? count : null;
}

function tokenImageUsageCostUsd(usage, pricing, includeZero) {
  if (!hasImageOutputRate(pricing)) return null;
  const keys = ['inputTokens', 'imageOutputTokens', 'textOutputTokens'];
  const counts = keys.map((key) => usage[key] === undefined ? 0 : usageCount(usage[key]));
  if (!keys.some((key) => usage[key] !== undefined) || counts.some((count) => count === null)) return null;
  const [input, imageOutput, textOutput] = counts;
  if (!includeZero && !input && !imageOutput && !textOutput) return null;
  const cost = input * (pricing.prompt || 0)
    + imageOutput * (pricing.image_output ?? pricing.completion ?? 0)
    + textOutput * (pricing.completion || 0)
    + (pricing.request || 0);
  return nonNegativeNumber(cost);
}

function readPricingSnapshot(job) {
  if (job.pricing_snapshot === undefined || job.pricing_snapshot === null) return null;
  let snapshot;
  try {
    snapshot = typeof job.pricing_snapshot === 'string' ? JSON.parse(job.pricing_snapshot) : job.pricing_snapshot;
  } catch {
    throw new Error('Generation pricing snapshot is invalid');
  }
  const invalid = () => { throw new Error('Generation pricing snapshot is invalid'); };
  if (!snapshot || snapshot.schemaVersion !== 1 || snapshot.kind !== job.kind || snapshot.model !== job.model) invalid();
  for (const key of ['usdIdrRate', 'referenceUsdIdrRate', 'creditsPerUsd', 'markupMultiplier', 'estimatedProviderCostUsd', 'quotedCredits']) {
    if (typeof snapshot[key] !== 'number' || nonNegativeNumber(snapshot[key]) === null) invalid();
  }
  if (!snapshot.usdIdrRate || !snapshot.referenceUsdIdrRate || !snapshot.creditsPerUsd || snapshot.markupMultiplier < 1) invalid();
  const basis = snapshot.costBasis;
  if (!basis || typeof basis !== 'object') invalid();
  const basisFields = {
    video_tokens: ['usdPerMillionTokens'],
    video_seconds: ['usdPerSecond', 'minimumUsd', 'usdPerInputImage', 'inputImageCount'],
    images: ['usdPerImage'],
    image_tokens: [],
  };
  if (!Object.hasOwn(basisFields, basis.type) || (job.kind === 'video') !== basis.type.startsWith('video_')) invalid();
  for (const key of basisFields[basis.type]) {
    if (typeof basis[key] !== 'number' || nonNegativeNumber(basis[key]) === null) invalid();
  }
  if (basis.type === 'image_tokens') {
    if (!basis.rates || typeof basis.rates !== 'object' || Array.isArray(basis.rates)) invalid();
    for (const value of Object.values(basis.rates)) {
      if (typeof value !== 'number' || nonNegativeNumber(value) === null) invalid();
    }
    if (!hasImageOutputRate(basis.rates)) invalid();
  }
  return snapshot;
}

function snapshotUsageCostUsd(snapshot, usage, includeZero) {
  const cost = reportedCostUsd(usage);
  if (cost !== null && (includeZero || cost > 0)) return cost;
  const basis = snapshot.costBasis;
  let derived = null;
  if (basis.type === 'video_tokens') {
    const tokens = usageCount(usage.completion_tokens ?? usage.total_tokens);
    if (tokens !== null) derived = (tokens * basis.usdPerMillionTokens) / 1e6;
  } else if (basis.type === 'images') {
    const images = usageCount(usage.generated_images);
    if (images !== null) derived = images * basis.usdPerImage;
  } else if (basis.type === 'image_tokens') {
    derived = tokenImageUsageCostUsd(usage, basis.rates, includeZero);
  }
  derived = nonNegativeNumber(derived);
  return derived !== null && (includeZero || derived > 0) ? derived : null;
}

function snapshotUsdToCredits(usd, snapshot) {
  const credits = usd * snapshot.markupMultiplier * snapshot.creditsPerUsd
    * (snapshot.usdIdrRate / snapshot.referenceUsdIdrRate);
  if (!Number.isFinite(credits) || credits < 0) throw new Error('Generation pricing snapshot is invalid');
  return Math.ceil(credits * CREDIT_PRECISION - 1e-9) / CREDIT_PRECISION;
}

// Actual provider COGS in USD, separate from the customer credit charge.
// Token counts may reconstruct an actual cost, but an estimate must never
// fill an unknown provider charge. Snapshot jobs require no pricing fetch.
export async function actualGenerationCostUsd(job, usage = {}, { fetchImpl } = {}) {
  const snapshot = readPricingSnapshot(job);
  if (snapshot) return snapshotUsageCostUsd(snapshot, usage, true);
  const reported = reportedCostUsd(usage);
  if (reported !== null) return reported;
  const parameters = typeof job.parameters === 'string' ? JSON.parse(job.parameters) : (job.parameters || {});
  if (job.kind === 'video') {
    const rate = seedanceRatePerMillion(job.model, parameters);
    const tokens = usageCount(usage.completion_tokens ?? usage.total_tokens);
    return rate === null || tokens === null ? null : nonNegativeNumber(tokens * rate / 1e6);
  }
  const seedream = seedreamCostUsd(job.model, parameters);
  if (seedream !== null) {
    const images = usageCount(usage.generated_images);
    return images === null ? null : nonNegativeNumber(seedream * images);
  }
  if (!['inputTokens', 'imageOutputTokens', 'textOutputTokens'].some((key) => usage[key] !== undefined)) return null;
  const pricing = tokenPricing(job.model, await loadOpenRouterImagePrices({ fetchImpl }));
  return pricing ? tokenImageUsageCostUsd(usage, pricing, true) : null;
}

// Credits to capture for a finished job, from provider usage. Returns null
// when the provider reported nothing usable (the reservation is kept).
export async function actualGenerationCredits(job, usage = {}, { fetchImpl, env = process.env } = {}) {
  const snapshot = readPricingSnapshot(job);
  if (snapshot) {
    const usd = snapshotUsageCostUsd(snapshot, usage, false);
    return usd === null ? null : snapshotUsdToCredits(usd, snapshot);
  }
  const parameters = typeof job.parameters === 'string' ? JSON.parse(job.parameters) : (job.parameters || {});
  const input = { model: job.model, parameters };
  let usd = null;
  if (job.kind === 'video') {
    usd = actualVideoCostUsd(input, usage);
  } else if (seedreamCostUsd(job.model, parameters) !== null) {
    const images = Number(usage.generated_images);
    usd = Number.isFinite(images) && images > 0 ? seedreamCostUsd(job.model, parameters) * images : null;
  } else {
    usd = actualTokenImageCostUsd(input, usage, await loadOpenRouterImagePrices({ fetchImpl }));
  }
  return usd === null ? null : usdToCredits(usd, env, await loadUsdIdrRate({ fetchImpl, env }));
}
