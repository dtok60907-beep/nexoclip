const MODELS_ENDPOINT = '/api/openrouter/models';
const CREDIT_USD = 0.01;
// Set NEXT_PUBLIC_CREDIT_MARKUP_PERCENT=0 for cost-only pricing.
// This is public because the client uses it to show the estimate; do not put secrets here.
const MARKUP_PERCENT = Number.parseFloat(process.env.NEXT_PUBLIC_CREDIT_MARKUP_PERCENT || '0');
const MARKUP = 1 + (Number.isFinite(MARKUP_PERCENT) ? MARKUP_PERCENT : 0) / 100;

export function findOpenRouterModel(models, slug) {
  return models.find(
    (model) => model.id === slug || model.canonical_slug === slug,
  ) ?? null;
}

export function usdToCredits(usd, markup = MARKUP) {
  if (!Number.isFinite(usd) || usd <= 0) return 1;
  return Math.max(1, Math.ceil((usd * markup) / CREDIT_USD));
}

export function estimateImagePrice({
  pricing = {},
  inputImageCount = 0,
  outputImageCount = 1,
  promptTokens = 0,
  completionTokens = 0,
}) {
  const number = (value) => Number(value || 0);
  const usd =
    number(pricing.request) +
    inputImageCount * number(pricing.image) +
    outputImageCount * number(pricing.image_output) +
    promptTokens * number(pricing.prompt) +
    completionTokens * number(pricing.completion);

  return { usd, credits: usdToCredits(usd) };
}

export async function fetchOpenRouterModels() {
  const response = await fetch(MODELS_ENDPOINT);
  if (!response.ok) throw new Error('Unable to load OpenRouter pricing');
  const payload = await response.json();
  return Array.isArray(payload?.data) ? payload.data : [];
}
