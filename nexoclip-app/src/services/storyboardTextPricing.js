import { loadUsdIdrRate, usdToCredits } from './generationPricing.js';

// OpenAI list prices in USD per token for the text models the internal AI tools
// (the AI Storyboards Director / Jellyfish, and OpenDirector) use for script
// breakdown, extraction and prompt writing. Unknown models are refused rather
// than billed at a guess.
export const STORYBOARD_TEXT_PRICES = {
  'gpt-4.1': { input: 2 / 1e6, output: 8 / 1e6 },
  'gpt-4.1-mini': { input: 0.4 / 1e6, output: 1.6 / 1e6 },
  'gpt-5': { input: 1.25 / 1e6, cached: 0.125 / 1e6, output: 10 / 1e6 },
  'gpt-5-mini': { input: 0.25 / 1e6, cached: 0.025 / 1e6, output: 2 / 1e6 },
  // The AI Director (services/OpenMontage/director_service/llm.py, PRICES_PER_MILLION):
  // GPT-5 and newer, never -pro / -sol. Prices for contexts up to 272K tokens; `cached` is the rate for input
  // served from OpenAI's prompt cache (most of an agent turn, which resends the conversation every step).
  'gpt-5.1': { input: 1.25 / 1e6, cached: 0.125 / 1e6, output: 10 / 1e6 },
  'gpt-5.2': { input: 1.75 / 1e6, cached: 0.175 / 1e6, output: 14 / 1e6 },
  'gpt-5.4': { input: 2.5 / 1e6, cached: 0.25 / 1e6, output: 15 / 1e6 },
  'gpt-5.4-mini': { input: 0.75 / 1e6, cached: 0.075 / 1e6, output: 4.5 / 1e6 },
  'gpt-5.5': { input: 5 / 1e6, cached: 0.5 / 1e6, output: 30 / 1e6 },
  'gpt-5.6-terra': { input: 2 / 1e6, cached: 0.2 / 1e6, output: 12 / 1e6 },
  'gpt-5.6-luna': { input: 0.2 / 1e6, cached: 0.02 / 1e6, output: 1.2 / 1e6 },
  // OpenDirector's configurable OPENAI_MODEL defaults to gpt-4o-mini.
  'gpt-4o': { input: 2.5 / 1e6, output: 10 / 1e6 },
  'gpt-4o-mini': { input: 0.15 / 1e6, output: 0.6 / 1e6 },
};

export function storyboardTextCostUsd({ model, inputTokens, outputTokens, cachedInputTokens = 0 }) {
  const price = STORYBOARD_TEXT_PRICES[model];
  if (!price) throw Object.assign(new Error(`No price is configured for text model ${model}`), { status: 422 });
  const input = Number(inputTokens);
  const output = Number(outputTokens);
  const cached = Number(cachedInputTokens || 0);
  if (![input, output, cached].every((n) => Number.isSafeInteger(n) && n >= 0) || cached > input) {
    throw Object.assign(new Error('Token counts must be non-negative integers'), { status: 400 });
  }
  // Models without a cached rate bill every input token at the full rate.
  return (input - cached) * price.input + cached * (price.cached ?? price.input) + output * price.output;
}

// Credits for one text call, with the same markup and USD/IDR scaling as
// image and video generations (usdToCredits rounds up, so a paid call is never free).
export async function storyboardTextCredits(usage, { env = process.env, loadRate = loadUsdIdrRate } = {}) {
  const usd = storyboardTextCostUsd(usage);
  const credits = usdToCredits(usd, env, await loadRate({ env }));
  return { usd, credits };
}
