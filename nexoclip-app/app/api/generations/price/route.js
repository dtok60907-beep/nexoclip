import { estimateGenerationCredits } from '../../../../src/services/generationPricing.js';

export const dynamic = 'force-dynamic';

// Credit price of one generation, computed exactly like the reservation, so
// Canvas and Flow can show what will actually be charged. Pure pricing: no
// tenant data, so no session is required.
export function createGenerationPriceHandler({ price = estimateGenerationCredits } = {}) {
  return async function GET(request) {
    const query = new URL(request.url).searchParams;
    const kind = query.get('kind') === 'video' ? 'video' : 'image';
    const model = String(query.get('model') || '').trim();
    if (!model || model.length > 120) return Response.json({ error: 'model is required' }, { status: 400 });

    const parameters = {};
    for (const key of ['resolution', 'aspectRatio', 'omniReferenceTaskType']) {
      const value = query.get(key);
      if (value) parameters[key] = value.slice(0, 40);
    }
    const duration = Number(query.get('duration'));
    if (Number.isInteger(duration)) parameters.duration = duration;
    if (query.get('draft') === '1') parameters.draft = true;
    if (query.get('generateAudio') === '0') parameters.generateAudio = false;
    const videos = Math.min(10, Math.max(0, Number(query.get('referenceVideos')) || 0));
    if (videos) parameters.referenceVideos = Array.from({ length: videos }, () => '');
    const images = Math.min(10, Math.max(0, Number(query.get('referenceImages')) || 0));
    if (images) parameters.referenceImages = Array.from({ length: images }, () => '');
    const promptLength = Math.min(10000, Math.max(0, Number(query.get('promptLength')) || 0));

    try {
      const priced = await price({ kind, model, prompt: 'x'.repeat(promptLength), parameters });
      if (!priced) return Response.json({ credits: null }, { headers: { 'Cache-Control': 'public, max-age=300' } });
      return Response.json(
        { credits: priced.credits, usd: Math.round(priced.usd * 10000) / 10000 },
        { headers: { 'Cache-Control': 'public, max-age=300' } },
      );
    } catch (error) {
      return Response.json({ error: error?.message || 'Pricing failed' }, { status: 500 });
    }
  };
}

export const GET = createGenerationPriceHandler();
