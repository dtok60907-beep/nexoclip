import { buildPublicModelPrices } from '../../../../src/services/publicModelPrices.js';

export const dynamic = 'force-dynamic';

// Credit price of every public model at every option, for the price calculator in the
// pricing dialog. No account data. Built once an hour: a build prices a few hundred
// options and the inputs (rates, markup, FX) change rarely.
const TTL_MS = 60 * 60 * 1000;
let cache = { expiresAt: 0, data: null, pending: null };

async function load(now = Date.now()) {
  if (cache.data && cache.expiresAt > now) return cache.data;
  if (!cache.pending) {
    cache.pending = buildPublicModelPrices()
      .then((data) => { cache = { expiresAt: Date.now() + TTL_MS, data, pending: null }; return data; })
      .catch((error) => { cache.pending = null; throw error; });
  }
  return cache.pending;
}

export async function GET() {
  try {
    return Response.json(await load(), { headers: { 'Cache-Control': 'public, max-age=600' } });
  } catch (error) {
    console.error('[pricing] public model prices failed', error?.message);
    return Response.json({ error: 'Prices are unavailable right now' }, { status: 503 });
  }
}
