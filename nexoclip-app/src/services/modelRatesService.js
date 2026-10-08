import { t2iModels, i2iModels, t2vModels, i2vModels, OPENROUTER_IMAGE_MODEL_MAP, OPENROUTER_VIDEO_MODEL_MAP } from '../../packages/studio/src/models.js';
import { estimateGenerationCredits, estimateSeedanceTokens, estimatedImageOutputTokens, ESTIMATED_INPUT_TOKENS_PER_REFERENCE } from './generationPricing.js';
import { isPlatformOperator, operatorError } from './economicsService.js';

const groups = [['text-to-image', 'image', t2iModels, OPENROUTER_IMAGE_MODEL_MAP], ['image-to-image', 'image', i2iModels, OPENROUTER_IMAGE_MODEL_MAP], ['text-to-video', 'video', t2vModels, OPENROUTER_VIDEO_MODEL_MAP], ['image-to-video', 'video', i2vModels, OPENROUTER_VIDEO_MODEL_MAP]];
function options(model, names) {
  for (const name of names) { const input = model.inputs?.[name]; if (input?.enum?.length) return input.enum.map(String); }
  return [];
}
export function modelRateCatalog() {
  return groups.flatMap(([operation, kind, models, mapping]) => models.filter(m => mapping[m.id]).map(m => {
    const resolutions = /-480p$/.test(m.id) && !m.inputs?.resolution ? ['480p'] : options(m, ['resolution']);
    const durations = options(m, ['duration']).map(Number).filter(n => Number.isFinite(n) && n > 0);
    const durationInput = m.inputs?.duration;
    return { key: `${operation}:${m.id}`, id: m.id, name: m.name, model: mapping[m.id], kind, operation,
      resolutions, durations, maxDuration: durationInput?.maxValue || null, minDuration: durationInput?.minValue || 1,
      defaultResolution: String((resolutions.length && !resolutions.includes(String(m.inputs?.resolution?.default)) ? resolutions[0] : m.inputs?.resolution?.default) || resolutions[0] || (kind === 'video' ? '1080p' : '1K')),
      aspectRatio: m.inputs?.aspect_ratio?.default || '1:1',
      defaultDuration: Number(durationInput?.default) > 0 ? Number(durationInput.default) : durations[0] || 5 };
  }));
}
const invalid = message => Object.assign(new Error(message), { status: 400 });
function integer(value, fallback, max, name) {
  const n = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isSafeInteger(n) || n < 0 || n > max) throw invalid(`${name} tidak valid`);
  return n;
}
export function createModelRatesService({ price = estimateGenerationCredits, env = process.env, fetchImpl = globalThis.fetch, catalog = modelRateCatalog } = {}) {
  return { async read({ userId, key, input = {} }) {
    if (!isPlatformOperator(userId, env)) throw operatorError();
    const models = catalog();
    const selected = key ? models.filter(m => m.key === key) : models;
    if (key && !selected.length) throw invalid('Model tidak dikenal');
    // Public pricing metadata only, shared across all quotes in this request.
    const requests = new Map();
    const metadataFetch = async (url, options) => {
      if (!requests.has(url)) requests.set(url, Promise.resolve(fetchImpl(url, options)));
      return (await requests.get(url)).clone();
    };
    const items = await Promise.all(selected.map(async row => {
      const resolution = String(input.resolution || row.defaultResolution);
      if (key && row.resolutions.length && !row.resolutions.includes(resolution)) throw invalid('Resolusi tidak didukung model');
      const duration = integer(input.duration, row.defaultDuration, row.maxDuration || 60, 'Durasi');
      if (row.kind === 'video' && (duration < row.minDuration || (key && row.durations.length && !row.durations.includes(duration)))) throw invalid('Durasi tidak didukung model');
      const referenceImages = integer(input.referenceImages, row.operation.startsWith('image-to') ? 1 : 0, 30, 'Gambar referensi');
      const promptLength = integer(input.promptLength, 300, 20000, 'Panjang prompt');
      if (input.audio && !['0','1'].includes(input.audio)) throw invalid('Pilihan audio tidak valid');
      const generateAudio = input.audio !== '0';
      const parameters = { resolution, duration, aspectRatio: row.aspectRatio || '1:1', referenceImages: Array(referenceImages).fill(''), generateAudio };
      const quote = await price({ kind: row.kind, model: row.model, prompt: 'x'.repeat(promptLength), parameters }, { env, fetchImpl: metadataFetch });
      const snapshot = quote?.pricingSnapshot;
      const basis = snapshot?.costBasis;
      const usage = basis?.type === 'video_tokens' ? { outputAndReferenceTokens: estimateSeedanceTokens(parameters, row.model) }
        : basis?.type === 'image_tokens' ? { promptTokens: Math.ceil(promptLength / 3), referenceTokens: referenceImages * ESTIMATED_INPUT_TOKENS_PER_REFERENCE, outputTokens: estimatedImageOutputTokens(row.model, parameters) } : null;
      return { ...row, configuration: { resolution, duration: row.kind === 'video' ? duration : null, referenceImages, promptLength, generateAudio },
        usd: quote?.usd ?? null, idr: snapshot ? quote.usd * snapshot.usdIdrRate : null, credits: quote?.credits ?? null,
        usdIdrRate: snapshot?.usdIdrRate ?? null, markupMultiplier: snapshot?.markupMultiplier ?? null, source: basis?.source || 'unknown', basis: basis || null, usage };
    }));
    return { items, generatedAt: new Date().toISOString(), scope: 'configured-studio-models', certainty: 'estimate' };
  } };
}
export const modelRatesService = createModelRatesService();
