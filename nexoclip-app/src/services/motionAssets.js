// Pictures and animations the Motion AI can put in a drawn story: stock photos, illustrations and vectors from
// Pixabay (downloaded into the workspace's storage as its terms require, never hotlinked) and Google's animated
// Noto emoji (Lottie, CC BY 4.0). Each found asset gets a short key the scene code uses (s.image / s.lottie) and
// a credit line for the video description.
import { importWorkspaceAsset, createStorage } from './assetService.js';
import { findNoto, searchNoto, NOTO_CREDIT } from '../../components/motion/lottieLibrary.js';

const PIXABAY = 'https://pixabay.com/api/';
const CACHE_MS = 24 * 60 * 60 * 1000; // Pixabay asks for every search to be cached for 24 hours
const cache = new Map();
const KINDS = { photo: 'photo', illustration: 'illustration', vector: 'vector' };

const slug = (text) => String(text || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 28) || 'gambar';

export async function searchPixabay({ query, kind = 'illustration', orientation = 'vertical', count = 3, env = process.env, fetchImpl = fetch }) {
  const key = env.PIXABAY_API_KEY;
  if (!key) throw Object.assign(new Error('Pencarian gambar stok belum diatur.'), { status: 503 });
  const q = String(query || '').trim().slice(0, 100);
  if (!q) return [];
  const params = new URLSearchParams({
    key, q, image_type: KINDS[kind] || 'all', orientation: ['vertical', 'horizontal', 'all'].includes(orientation) ? orientation : 'all',
    safesearch: 'true', per_page: String(Math.min(20, Math.max(3, count * 3))),
  });
  const cacheKey = params.toString();
  const hit = cache.get(cacheKey);
  let hits;
  if (hit && hit.at > Date.now() - CACHE_MS) hits = hit.hits;
  else {
    const response = await fetchImpl(`${PIXABAY}?${params}`, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw Object.assign(new Error(`Pixabay ${response.status}`), { status: 502 });
    hits = (await response.json())?.hits || [];
    cache.set(cacheKey, { at: Date.now(), hits });
    if (cache.size > 500) cache.delete(cache.keys().next().value);
  }
  return hits.slice(0, count).map((h) => ({
    id: h.id, tags: h.tags, url: h.largeImageURL || h.webformatURL, width: h.imageWidth, height: h.imageHeight,
    credit: `${h.user} / Pixabay (${h.pageURL})`,
  }));
}

// Finds assets for a request and stores them: { key: { type, ... } } to merge into the story's assets.
// Images are downloaded into the workspace now (Pixabay URLs expire after a day and may not be hotlinked).
export async function findAssets({ pool, workspaceId, query, kind = 'illustration', count = 2, taken = {}, env = process.env, fetchImpl = fetch, importAsset = importWorkspaceAsset, loadStorage = createStorage }) {
  const found = {};
  const uniqueKey = (base) => {
    let key = base;
    for (let i = 2; taken[key] || found[key]; i += 1) key = `${base}-${i}`;
    return key;
  };
  if (kind === 'emoji') {
    const names = [findNoto(query), ...searchNoto(query, 6)].filter(Boolean);
    for (const name of [...new Set(names)].slice(0, Math.max(1, count))) {
      found[`noto:${name}`] = { type: 'lottie', source: 'noto', name, description: name.replace(/-/g, ' '), credit: NOTO_CREDIT };
    }
    return found;
  }
  const hits = await searchPixabay({ query, kind, count, env, fetchImpl });
  for (const hit of hits) {
    const response = await fetchImpl(hit.url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) continue;
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) continue;
    const body = Buffer.from(await response.arrayBuffer());
    const imported = await importAsset(workspaceId, { filename: `pixabay-${hit.id}.${contentType.includes('png') ? 'png' : 'jpg'}`, contentType, body }, loadStorage(), pool);
    found[uniqueKey(slug(query))] = {
      type: 'image', source: 'pixabay', url: imported.url, assetId: imported.asset.id, width: hit.width, height: hit.height,
      description: hit.tags, credit: hit.credit,
    };
  }
  return found;
}

// The credit lines a finished video owes (for its description).
export function assetCredits(assets) {
  return [...new Set(Object.values(assets || {}).map((asset) => asset.credit).filter(Boolean))];
}
