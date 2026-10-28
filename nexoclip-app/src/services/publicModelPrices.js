// Credit price of every publicly sold model, at every option the Studio offers. Used by
// the price calculator in the Studio pricing dialog (/api/public/model-prices) and on
// nexoclip.com (scripts/export-public-model-prices.mjs writes the same data to a file).
// Prices come from the engine that charges users, so they match the Generate button.
// Unfiltered endpoints and video-to-video tools are not listed publicly.
import { estimateGenerationCredits, loadUsdIdrRate } from './generationPricing.js';

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

// name, provider model id as priced by the app, and the options the Studio offers.
export const PUBLIC_VIDEO_MODELS = [
  // Up to 30 s (first/last frame and omni reference); 4K only up to 16 s.
  { id: 'seedance-2.5', name: 'Seedance 2.5', model: 'bytedance/seedance-2.5', resolutions: ['480p', '720p', '1080p', '4k'], durations: range(4, 30), maxSeconds: { '4k': 16 } },
  { id: 'seedance-2.0', name: 'Seedance 2.0', model: 'bytedance/seedance-2.0', resolutions: ['480p', '720p', '1080p'], durations: [5, 10, 15] },
  { id: 'seedance-2.0-fast', name: 'Seedance 2.0 Fast', model: 'bytedance/seedance-2.0-fast', resolutions: ['480p', '720p'], durations: range(4, 15) },
  { id: 'seedance-2.0-mini', name: 'Seedance 2.0 Mini', model: 'bytedance/seedance-2.0-mini', resolutions: ['480p', '720p'], durations: range(4, 15) },
  { id: 'veo-3.1', name: 'Veo 3.1', model: 'google/veo-3.1', resolutions: ['1080p'], durations: [8], audio: true },
  { id: 'veo-3.1-fast', name: 'Veo 3.1 Fast', model: 'google/veo-3.1-fast', resolutions: ['1080p'], durations: [8], audio: true },
  { id: 'veo-3.1-lite', name: 'Veo 3.1 Lite', model: 'google/veo-3.1-lite', resolutions: ['1080p'], durations: [8], audio: true },
  { id: 'kling-3.0-pro', name: 'Kling 3.0 Pro', model: 'kwaivgi/kling-v3.0-pro', durations: range(3, 15), audio: true },
  { id: 'kling-3.0-std', name: 'Kling 3.0 Standard', model: 'kwaivgi/kling-v3.0-std', durations: range(3, 15), audio: true },
  { id: 'kling-o1', name: 'Kling O1', model: 'kwaivgi/kling-video-o1', durations: range(3, 10) },
  { id: 'hailuo-2.3', name: 'Hailuo 2.3', model: 'minimax/hailuo-2.3', durations: [6, 10] },
  { id: 'grok-imagine-1.5', name: 'Grok Imagine Video 1.5', model: 'x-ai/grok-imagine-video-1.5', resolutions: ['480p', '720p'], durations: range(1, 15) },
  { id: 'grok-imagine', name: 'Grok Imagine Video', model: 'x-ai/grok-imagine-video', resolutions: ['720p'], durations: [6, 10, 15] },
  { id: 'happyhorse-1.1', name: 'Happy Horse 1.1', model: 'alibaba/happyhorse-1.1', resolutions: ['720p', '1080p'], durations: range(3, 15) },
  { id: 'happyhorse-1.0', name: 'Happy Horse 1.0', model: 'alibaba/happyhorse-1.0', resolutions: ['720p', '1080p'], durations: range(3, 15) },
  { id: 'wan-2.6', name: 'Wan 2.6', model: 'alibaba/wan-2.6', resolutions: ['720p', '1080p'], durations: [5, 10, 15] },
];

// Without reference images; each option is one output image.
export const PUBLIC_IMAGE_MODELS = [
  { id: 'nano-banana-2', name: 'Nano Banana 2', model: 'google/gemini-3.1-flash-image', options: ['1K', '2K', '4K'] },
  { id: 'nano-banana-2-lite', name: 'Nano Banana 2 Lite', model: 'google/gemini-3.1-flash-lite-image' },
  { id: 'nano-banana-pro', name: 'Nano Banana Pro', model: 'google/gemini-3-pro-image', options: ['1K', '2K', '4K'] },
  { id: 'nano-banana', name: 'Nano Banana', model: 'google/gemini-2.5-flash-image' },
  { id: 'gpt-image-2', name: 'GPT Image 2', model: 'openai/gpt-image-2' },
  { id: 'seedream-5.0', name: 'Seedream 5.0', model: 'bytedance-seed/seedream-5-0-pro', options: ['1K', '4K'] },
  { id: 'seedream-4.5', name: 'Seedream 4.5', model: 'bytedance-seed/seedream-4.5' },
  { id: 'flux-2-max', name: 'Flux 2 Max', model: 'black-forest-labs/flux.2-max' },
  { id: 'flux-2-pro', name: 'Flux 2 Pro', model: 'black-forest-labs/flux.2-pro' },
  { id: 'flux-2-flex', name: 'Flux 2 Flex', model: 'black-forest-labs/flux.2-flex' },
  { id: 'qwen-image-pro', name: 'Qwen Image Pro', model: 'qwen/qwen-image-3-pro' },
  { id: 'qwen-image', name: 'Qwen Image', model: 'qwen/qwen-image-3' },
  { id: 'grok-imagine-image', name: 'Grok Imagine Image', model: 'x-ai/grok-imagine-image-2.0' },
];

async function credits(kind, model, parameters) {
  const quote = await estimateGenerationCredits({ kind, model, prompt: '', parameters });
  if (!quote) throw new Error(`no price for ${model} ${JSON.stringify(parameters)}`);
  return quote.credits;
}

export async function buildPublicModelPrices() {
  const video = [];
  for (const entry of PUBLIC_VIDEO_MODELS) {
    const prices = {};
    for (const resolution of entry.resolutions || ['']) {
      for (const duration of entry.durations.filter((d) => d <= (entry.maxSeconds?.[resolution] ?? Infinity))) {
        for (const audio of entry.audio ? [true, false] : [true]) {
          const parameters = { duration, generateAudio: audio, ...(resolution && { resolution }) };
          prices[`${resolution}|${duration}|${audio ? 1 : 0}`] = await credits('video', entry.model, parameters);
        }
      }
    }
    video.push({ id: entry.id, name: entry.name, resolutions: entry.resolutions || [], durations: entry.durations, maxSeconds: entry.maxSeconds || {}, audio: Boolean(entry.audio), prices });
  }

  const image = [];
  for (const entry of PUBLIC_IMAGE_MODELS) {
    const prices = {};
    for (const resolution of entry.options || ['']) {
      prices[resolution] = await credits('image', entry.model, resolution ? { resolution } : {});
    }
    image.push({ id: entry.id, name: entry.name, resolutions: entry.options || [], prices });
  }
  const usdIdrRate = await loadUsdIdrRate();
  return { exportedAt: new Date().toISOString(), usdIdrRate, video, image };
}
