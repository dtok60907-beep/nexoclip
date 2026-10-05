// Per-model generation pricing. Credits used to be a flat 2.5 per image and
// 10 per video whatever the model, resolution or duration, far below provider
// cost (a 5s 1080p Seedance 2.5 video costs ~$2.84; we charged $0.10).
//
// Charge = provider cost (USD) x markup x CREDITS_PER_USD. A job reserves an
// upper-bound estimate up front; on success it is settled at the actual
// provider usage when the provider reports it (the difference is refunded).
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
  const percent = raw === undefined || raw === '' ? 30 : Number(raw);
  return Number.isFinite(percent) && percent >= 0 ? 1 + percent / 100 : 1.3;
}

export function usdToCredits(usd, env = process.env) {
  const cost = Number(usd);
  if (!Number.isFinite(cost) || cost < 0) throw new Error('Provider cost is invalid');
  if (cost === 0) return 0;
  return Math.ceil(cost * markupMultiplier(env) * CREDITS_PER_USD * CREDIT_PRECISION - 1e-9) / CREDIT_PRECISION;
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
  const entry = PER_SECOND_VIDEO_PRICES.find((candidate) => candidate.match.test(String(model)));
  if (!entry) return null;
  const resolution = String(parameters.resolution || '1080p').toLowerCase();
  const images = inputImageCount(parameters);
  const tiers = entry.imageTiers && images > 0 ? entry.imageTiers
    : entry.audio ? (parameters.generateAudio === false ? entry.silent : entry.audio)
      : entry.tiers;
  const duration = Number(parameters.duration);
  const assumed = entry.sourceLength ? ASSUMED_INPUT_VIDEO_SECONDS : ASSUMED_PER_SECOND_VIDEO_SECONDS;
  const seconds = Number.isFinite(duration) && duration > 0 ? duration : assumed;
  return Math.max(entry.minimum || 0, tierPrice(tiers, resolution) * seconds + images * (entry.perInputImage || 0));
}

export function estimateVideoCostUsd({ model, parameters = {} }) {
  const rate = seedanceRatePerMillion(model, parameters);
  if (rate === null) return perSecondVideoCostUsd(model, parameters);
  return (estimateSeedanceTokens(parameters, model) * rate) / 1e6;
}

// OpenRouter reports the USD charge as usage.cost; BytePlus reports tokens.
// A zero cost (a provider free quota) is not what the user is charged.
export function actualVideoCostUsd({ model, parameters = {} }, usage = {}) {
  const cost = Number(usage.costUsd ?? usage.cost);
  if (Number.isFinite(cost) && cost > 0) return cost;
  const tokens = Number(usage.completion_tokens ?? usage.total_tokens);
  const rate = seedanceRatePerMillion(model, parameters);
  if (rate === null || !Number.isFinite(tokens) || tokens <= 0) return null;
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
function estimatedImageOutputTokens(model, parameters = {}) {
  const id = String(model);
  const resolution = String(parameters.resolution || '1K').toUpperCase();
  if (/gemini-2\.5-flash-image/.test(id)) return 1290;
  if (/gemini-3(\.\d)?-(pro|flash)/.test(id)) return resolution === '4K' ? 2520 : resolution === '2K' ? 1680 : 1120;
  if (/gpt-image|gpt-5(\.\d)?-image/.test(id)) return (parameters.aspectRatio && parameters.aspectRatio !== '1:1') ? 6240 : 4160;
  return 4160;
}

const ESTIMATED_INPUT_TOKENS_PER_REFERENCE = 1300;

let openRouterCache = { expiresAt: 0, prices: null };
const OPENROUTER_TTL_MS = 60 * 60 * 1000;

function parsePricing(pricing = {}) {
  const out = {};
  for (const key of ['prompt', 'completion', 'image', 'image_token', 'image_output', 'request']) {
    const value = Number(pricing[key]);
    if (Number.isFinite(value) && value >= 0) out[key] = value;
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
  if (!pricing) return null;
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
  if (Number(usage.costUsd) > 0) return Number(usage.costUsd);
  const pricing = tokenPricing(model, livePrices);
  if (!pricing) return null;
  const imageOutput = Number(usage.imageOutputTokens) || 0;
  const textOutput = Number(usage.textOutputTokens) || 0;
  const input = Number(usage.inputTokens) || 0;
  if (!imageOutput && !textOutput && !input) return null;
  return input * (pricing.prompt || 0)
    + imageOutput * (pricing.image_output ?? pricing.completion ?? 0)
    + textOutput * (pricing.completion || 0)
    + (pricing.request || 0);
}

// ---------------------------------------------------------------- jobs -----

// Provider cost estimate (USD) for a validated generation, or null when the
// model has no known price (the caller then refuses the job).
export async function estimateGenerationCostUsd({ kind, model, prompt, parameters = {} }, { fetchImpl, env = process.env } = {}) {
  if (kind === 'video') return estimateVideoCostUsd({ model, parameters });
  const seedream = seedreamCostUsd(model, parameters);
  if (seedream !== null) return seedream;
  // Only OpenRouter-style ids (author/slug) can have an OpenRouter price.
  if (!OPENROUTER_IMAGE_SNAPSHOT[model] && !/^[a-z0-9-]+\/[^/\s]+$/i.test(String(model))) return null;
  const live = await loadOpenRouterImagePrices({ fetchImpl });
  return estimateTokenImageCostUsd({ model, prompt, parameters }, live);
}

export async function estimateGenerationCredits(input, options = {}) {
  const usd = await estimateGenerationCostUsd(input, options);
  return usd === null ? null : { usd, credits: usdToCredits(usd, options.env) };
}

// Credits to capture for a finished job, from provider usage. Returns null
// when the provider reported nothing usable (the reservation is kept).
export async function actualGenerationCredits(job, usage = {}, { fetchImpl, env = process.env } = {}) {
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
  return usd === null ? null : usdToCredits(usd, env);
}
