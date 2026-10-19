// Watching a video with a Seed vision model on BytePlus ModelArk (OpenAI-compatible chat completions with a
// video_url part), for the AI Director: a user's reference video is read from start to end. Billed in credits by
// the tokens it used.
import { loadUsdIdrRate, usdToCredits } from './generationPricing.js';

export const SEED_VIDEO_MODEL = 'dola-seed-2-1-turbo-260628';
// USD per million tokens (BytePlus ModelArk standard online inference, October 2026).
export const SEED_VIDEO_PRICES = { input: 0.5, output: 2.5 };
export const FRAMES_PER_SECOND = 1;
export const MAX_INLINE_BYTES = 30 * 1024 * 1024; // a video sent inline (base64) when its URL is not reachable

export const DEFAULT_QUESTION = [
  'Watch this video from the first to the last frame and describe it for a film director, in Indonesian.',
  'Give: 1) a timeline of what happens with timestamps (mm:ss), 2) shot types and camera movement,',
  '3) people/subjects and how they look, 4) setting, lighting and colour, 5) mood and pacing,',
  '6) any on-screen text or brands. Be concrete and concise (max 250 words). Do not invent sound.',
].join(' ');

export function videoAnalysisCostUsd(usage = {}) {
  const input = Number(usage.prompt_tokens) || 0;
  const output = Number(usage.completion_tokens) || 0;
  return (input * SEED_VIDEO_PRICES.input + output * SEED_VIDEO_PRICES.output) / 1e6;
}

export async function videoAnalysisCredits(usage, { env = process.env, loadRate = loadUsdIdrRate } = {}) {
  const usd = videoAnalysisCostUsd(usage);
  return { usd, credits: usdToCredits(usd, env, await loadRate({ env })) };
}

function providerError(message, status = 502) {
  return Object.assign(new Error(message), { status, code: 'VIDEO_ANALYSIS_FAILED' });
}

// url: an https URL the provider can fetch, or a data: URL. Returns { text, usage }.
export async function analyzeVideo({ url, question = DEFAULT_QUESTION, env = process.env, fetchImpl = fetch }) {
  const apiKey = env.BYTEPLUS_API_KEY;
  const baseUrl = String(env.BYTEPLUS_BASE_URL || '').replace(/\/+$/, '');
  if (!apiKey || !baseUrl) throw providerError('Video analysis is not configured', 503);
  const response = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: SEED_VIDEO_MODEL,
      max_tokens: 2000,
      // Without thinking the whole token budget goes to the description.
      thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: [
        { type: 'video_url', video_url: { url, fps: FRAMES_PER_SECOND } },
        { type: 'text', text: String(question).slice(0, 2000) },
      ] }],
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = providerError(data?.error?.message || `BytePlus returned HTTP ${response.status}`, response.status === 400 ? 400 : 502);
    error.invalidUrl = data?.error?.param === 'video_url';
    throw error;
  }
  const text = String(data?.choices?.[0]?.message?.content || '').trim();
  if (!text) throw providerError('The video model returned no description');
  return { text, usage: data.usage || {} };
}
