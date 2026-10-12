import { loadUsdIdrRate, usdToCredits } from './generationPricing.js';

// OpenAI list prices in USD per token for the text models the internal AI tools
// (the AI Storyboards Director / Jellyfish, and OpenDirector) use for script
// breakdown, extraction and prompt writing. Unknown models are refused rather
// than billed at a guess.
export const STORYBOARD_TEXT_PRICES = {
  'gpt-4.1': { input: 2 / 1e6, output: 8 / 1e6 },
  'gpt-4.1-mini': { input: 0.4 / 1e6, output: 1.6 / 1e6 },
  'gpt-5': { input: 1.25 / 1e6, output: 10 / 1e6 },
  'gpt-5-mini': { input: 0.25 / 1e6, output: 2 / 1e6 },
  // OpenDirector's configurable OPENAI_MODEL defaults to gpt-4o-mini.
  'gpt-4o': { input: 2.5 / 1e6, output: 10 / 1e6 },
  'gpt-4o-mini': { input: 0.15 / 1e6, output: 0.6 / 1e6 },
};

export function storyboardTextCostUsd({ model, inputTokens, outputTokens }) {
  const price = STORYBOARD_TEXT_PRICES[model];
  if (!price) throw Object.assign(new Error(`No price is configured for text model ${model}`), { status: 422 });
  const input = Number(inputTokens);
  const output = Number(outputTokens);
  if (!Number.isSafeInteger(input) || !Number.isSafeInteger(output) || input < 0 || output < 0) {
    throw Object.assign(new Error('Token counts must be non-negative integers'), { status: 400 });
  }
  return input * price.input + output * price.output;
}

// Credits for one text call, with the same markup and USD/IDR scaling as
// image and video generations (usdToCredits rounds up, so a paid call is never free).
export async function storyboardTextCredits(usage, { env = process.env, loadRate = loadUsdIdrRate } = {}) {
  const usd = storyboardTextCostUsd(usage);
  const credits = usdToCredits(usd, env, await loadRate({ env }));
  return { usd, credits };
}
