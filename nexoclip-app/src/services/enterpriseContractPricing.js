import {
  CREDITS_PER_USD,
  PRICING_REFERENCE_USD_IDR,
  estimateTokenImageCostUsd,
  estimateVideoCostUsd,
  markupMultiplier,
  seedreamCostUsd,
  usdToCredits,
} from './generationPricing.js';

// What one credit costs us in provider spend, in rupiah. Generation charges
// provider USD × markup × CREDITS_PER_USD × (rate / reference rate), so the rate
// cancels out: a credit always buys reference-rate rupiah ÷ (100 × markup) of
// provider spend (about Rp112 at the 1.6x markup).
export function costIdrPerCredit(env = process.env) {
  return PRICING_REFERENCE_USD_IDR / (CREDITS_PER_USD * markupMultiplier(env));
}

// An enterprise deal: the operator keeps `profitPercent` of the deal value and
// the rest buys credits at cost.
export function contractCredits(dealIdr, profitPercent, env = process.env) {
  const spend = Number(dealIdr) * (1 - Number(profitPercent) / 100);
  return Math.floor(spend / costIdrPerCredit(env));
}

const VIDEO_EXAMPLES = [
  ['Seedance 2.0 · 720p', 'bytedance/seedance-2.0', '720p'],
  ['Seedance 2.0 · 1080p', 'bytedance/seedance-2.0', '1080p'],
  ['Seedance 2.0 Fast · 720p', 'bytedance/seedance-2.0-fast', '720p'],
  ['Seedance 2.5 · 720p', 'bytedance/seedance-2.5', '720p'],
  ['Seedance 2.5 · 1080p', 'bytedance/seedance-2.5', '1080p'],
];
const IMAGE_EXAMPLES = [
  ['Nano Banana Pro · 1K', () => estimateTokenImageCostUsd({ model: 'google/gemini-3-pro-image', prompt: '', parameters: {} })],
  ['Seedream 4.5', () => seedreamCostUsd('bytedance-seed/seedream-4.5', {})],
];

// Credits per second of video and per image for the models clients ask about,
// at the reference rate (a weaker rupiah raises them, see fxFactor).
export function contractPricing(env = process.env) {
  const credits = (usd) => usdToCredits(usd, env, PRICING_REFERENCE_USD_IDR);
  return {
    costIdrPerCredit: costIdrPerCredit(env),
    referenceUsdIdr: PRICING_REFERENCE_USD_IDR,
    videos: VIDEO_EXAMPLES.map(([label, model, resolution]) => ({
      label,
      creditsPerSecond: Math.round(credits(estimateVideoCostUsd({ model, parameters: { resolution, duration: 10, aspectRatio: '16:9' } })) * 10) / 100,
    })),
    images: IMAGE_EXAMPLES.map(([label, usd]) => ({ label, creditsPerImage: credits(usd()) })),
  };
}
