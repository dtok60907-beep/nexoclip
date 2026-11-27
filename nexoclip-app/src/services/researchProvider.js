// Thin research provider wrapping ScrapeAtlas REST API with Postgres TTL cache and strict caps.
// Never throws raw secrets; degrades gracefully when SCRAPEATLAS_API_KEY is missing or upstream fails.
import { createHash } from 'node:crypto';
import { getPool } from '../db/pool.js';

const SCRAPEATLAS_BASE = 'https://api.scrapeatlas.com';
const DEFAULT_TTL_HOURS = 12;
const REQUEST_TIMEOUT_MS = 25_000;

function stableCacheKey(endpoint, params) {
  const sorted = Object.keys(params || {})
    .sort()
    .reduce((acc, k) => {
      if (params[k] !== undefined && params[k] !== null && params[k] !== '') acc[k] = params[k];
      return acc;
    }, {});
  const hash = createHash('sha256').update(`${endpoint}:${JSON.stringify(sorted)}`).digest('hex');
  return `sa:${hash.slice(0, 40)}`;
}

async function readCache(pool, cacheKey) {
  if (!pool) return null;
  try {
    const res = await pool.query(
      'SELECT payload_json, credits_used, created_at FROM research_cache WHERE cache_key = $1 AND expires_at > now() LIMIT 1',
      [cacheKey],
    );
    return res.rows[0] || null;
  } catch {
    return null;
  }
}

async function writeCache(pool, { cacheKey, endpoint, params, payload, creditsUsed, ttlHours }) {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO research_cache (cache_key, provider, endpoint, params_json, payload_json, credits_used, expires_at)
       VALUES ($1, 'scrapeatlas', $2, $3, $4, $5, now() + ($6::text || ' hours')::interval)
       ON CONFLICT (cache_key) DO UPDATE SET
         payload_json = EXCLUDED.payload_json,
         credits_used = EXCLUDED.credits_used,
         expires_at = EXCLUDED.expires_at,
         created_at = now()`,
      [cacheKey, endpoint, JSON.stringify(params || {}), JSON.stringify(payload), creditsUsed, String(ttlHours)],
    );
  } catch {
    // Cache failure must never block research.
  }
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  const ts = Date.parse(dateStr);
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, Math.floor((Date.now() - ts) / 86_400_000));
}

function parseWebVttToPlain(vtt) {
  if (!vtt || typeof vtt !== 'string') return { plain: '', firstThreeSeconds: '' };
  const lines = vtt.split(/\r?\n/);
  const cues = [];
  let currentStart = null;
  let currentText = [];
  const flush = () => {
    if (currentStart !== null && currentText.length) {
      cues.push({ startSec: currentStart, text: currentText.join(' ').trim() });
    }
    currentStart = null;
    currentText = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line === 'WEBVTT') {
      if (!line) flush();
      continue;
    }
    const tsMatch = line.match(/^(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?\s*-->/);
    if (tsMatch) {
      flush();
      currentStart = Number(tsMatch[1]) * 3600 + Number(tsMatch[2]) * 60 + Number(tsMatch[3]) + Number(`0.${tsMatch[4] || '0'}`);
      continue;
    }
    if (/^\d+$/.test(line)) continue;
    if (currentStart !== null) currentText.push(line);
  }
  flush();
  const plain = cues.map((c) => c.text).join(' ').replace(/\s+/g, ' ').trim();
  const firstThreeSeconds = cues
    .filter((c) => c.startSec <= 4.0)
    .map((c) => c.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { plain, firstThreeSeconds, cues: cues.slice(0, 40) };
}

export function createResearchProvider({
  env = process.env,
  fetchImpl = fetch,
  poolFactory = getPool,
  ttlHours = DEFAULT_TTL_HOURS,
} = {}) {
  const apiKey = () => String(env.SCRAPEATLAS_API_KEY || '').trim();

  async function requestJson(endpoint, params = {}, { skipCache = false } = {}) {
    const key = apiKey();
    if (!key) {
      return {
        ok: false,
        cached: false,
        creditsUsed: 0,
        error: 'SCRAPEATLAS_API_KEY belum dikonfigurasi di server.',
        data: null,
      };
    }

    let pool = null;
    try { pool = poolFactory ? poolFactory() : null; } catch { pool = null; }
    const cacheKey = stableCacheKey(endpoint, params);
    if (!skipCache) {
      const hit = await readCache(pool, cacheKey);
      if (hit) {
        return { ok: true, cached: true, creditsUsed: 0, data: hit.payload_json };
      }
    }

    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    }
    const url = `${SCRAPEATLAS_BASE}${endpoint}${qs.toString() ? `?${qs.toString()}` : ''}`;

    let res;
    try {
      res = await fetchImpl(url, {
        method: 'GET',
        headers: { 'x-api-key': key, accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      return { ok: false, cached: false, creditsUsed: 0, error: `Research request gagal: ${error.message}`, data: null };
    }

    const creditsUsed = Number(res.headers?.get?.('x-credits-charged')) || 0;
    const creditsRemaining = res.headers?.get?.('x-credits-remaining');
    const json = await res.json().catch(() => null);
    if (!res.ok || !json) {
      return {
        ok: false,
        cached: false,
        creditsUsed,
        error: json?.error?.message || json?.message || `ScrapeAtlas HTTP ${res.status}`,
        data: null,
      };
    }

    await writeCache(pool, { cacheKey, endpoint, params, payload: json, creditsUsed, ttlHours });
    return {
      ok: true,
      cached: false,
      creditsUsed,
      creditsRemaining: creditsRemaining !== null && creditsRemaining !== undefined ? Number(creditsRemaining) : null,
      data: json,
    };
  }

  return {
    isConfigured() {
      return Boolean(apiKey());
    },

    async searchMetaAds({ query, country = 'ID', status = 'ACTIVE', mediaType = 'VIDEO', limit = 8 } = {}) {
      const safeLimit = Math.min(Math.max(Number(limit) || 8, 1), 15);
      const res = await requestJson('/v1/facebook/adLibrary/search/ads', {
        query,
        country,
        status,
        media_type: mediaType,
      });
      if (!res.ok) return { ...res, ads: [] };
      const raw = res.data?.searchResults || res.data?.ads || [];
      const ads = (Array.isArray(raw) ? raw : []).slice(0, safeLimit).map((ad) => {
        const snap = ad.snapshot || {};
        const videos = snap.videos || [];
        const cards = snap.cards || [];
        const images = snap.images || [];
        const startDate = ad.start_date_string || ad.start_date || null;
        const runningDays = daysSince(startDate);
        const videoUrl =
          videos[0]?.video_hd_url ||
          videos[0]?.video_sd_url ||
          cards[0]?.video_hd_url ||
          cards[0]?.video_sd_url ||
          null;
        const thumbnailUrl =
          videos[0]?.video_preview_image_url ||
          images[0]?.resized_image_url ||
          images[0]?.original_image_url ||
          cards[0]?.resized_image_url ||
          null;
        const copy = String(snap?.body?.text || ad.ad_creative_bodies?.[0] || '').trim();
        return {
          adId: String(ad.ad_archive_id || ad.id || ''),
          pageName: ad.page_name || snap.page_name || 'Unknown Advertiser',
          startDate,
          runningDays,
          likelyWinner: runningDays !== null && runningDays >= 14,
          platforms: Array.isArray(ad.publisher_platform) ? ad.publisher_platform : [],
          copy: copy.slice(0, 600),
          ctaText: snap?.cta_text || cards[0]?.cta_text || '',
          landingUrl: snap?.link_url || cards[0]?.link_url || '',
          videoUrl,
          thumbnailUrl,
          sourceUrl: ad.ad_archive_id ? `https://www.facebook.com/ads/library/?id=${ad.ad_archive_id}` : null,
        };
      });
      ads.sort((a, b) => (b.runningDays ?? -1) - (a.runningDays ?? -1));
      return { ...res, totalFound: Array.isArray(raw) ? raw.length : ads.length, ads };
    },

    async getMetaAdTranscript({ adId } = {}) {
      if (!adId) return { ok: false, cached: false, creditsUsed: 0, error: 'adId wajib diisi', transcript: '' };
      const res = await requestJson('/v1/facebook/adLibrary/ad/transcript', { id: adId });
      if (!res.ok) return { ...res, transcript: '' };
      const transcript = String(res.data?.data?.transcript || res.data?.transcript || '').trim();
      return {
        ...res,
        adId: String(adId),
        available: Boolean(res.data?.data?.transcript_available ?? transcript),
        transcript,
      };
    },

    async searchTikTokVideos({ query, region = 'ID', sortBy = '', limit = 8 } = {}) {
      const safeLimit = Math.min(Math.max(Number(limit) || 8, 1), 12);
      const res = await requestJson('/v1/tiktok/search/keyword', {
        query,
        region,
        sort_by: sortBy || undefined,
      });
      if (!res.ok) return { ...res, videos: [] };
      const raw = res.data?.item_list || res.data?.videos || [];
      const videos = (Array.isArray(raw) ? raw : []).slice(0, safeLimit).map((item) => {
        const v = item.aweme_info || item;
        const authorHandle = v.author?.uniqueId || v.author?.unique_id || '';
        const id = String(v.id || v.aweme_id || '');
        const stats = v.stats || v.statistics || {};
        const plays = Number(stats.playCount ?? stats.play_count ?? 0);
        const likes = Number(stats.diggCount ?? stats.digg_count ?? 0);
        const comments = Number(stats.commentCount ?? stats.comment_count ?? 0);
        const shares = Number(stats.shareCount ?? stats.share_count ?? 0);
        return {
          id,
          author: authorHandle ? `@${authorHandle}` : v.author?.nickname || 'creator',
          description: String(v.desc || '').trim().slice(0, 400),
          plays,
          likes,
          comments,
          shares,
          engagementRate: plays > 0 ? Number((((likes + comments + shares) / plays) * 100).toFixed(2)) : 0,
          durationSec: Number(v.video?.duration || 0),
          thumbnailUrl: v.video?.cover || v.video?.originCover || null,
          url: authorHandle && id ? `https://www.tiktok.com/@${authorHandle}/video/${id}` : null,
        };
      });
      videos.sort((a, b) => b.plays - a.plays);
      return { ...res, totalFound: Array.isArray(raw) ? raw.length : videos.length, videos };
    },

    async getTikTokTranscript({ url, language = '' } = {}) {
      if (!url) return { ok: false, cached: false, creditsUsed: 0, error: 'url wajib diisi', transcript: '' };
      const res = await requestJson('/v1/tiktok/video/transcript', { url, language: language || undefined });
      if (!res.ok) return { ...res, transcript: '', firstThreeSeconds: '' };
      const rawVtt = String(res.data?.transcript || res.data?.data?.transcript || '');
      const parsed = parseWebVttToPlain(rawVtt);
      return {
        ...res,
        url,
        transcript: parsed.plain.slice(0, 2500),
        firstThreeSeconds: parsed.firstThreeSeconds,
        cues: parsed.cues,
      };
    },

    async getTikTokTopAds({ country = 'ID', period = 30, limit = 6 } = {}) {
      const safeLimit = Math.min(Math.max(Number(limit) || 6, 1), 10);
      const res = await requestJson('/v1/tiktok/ads/top', { country, period, limit: safeLimit });
      if (!res.ok) return { ...res, ads: [] };
      const raw = res.data?.ads || [];
      const ads = (Array.isArray(raw) ? raw : []).slice(0, safeLimit).map((ad) => ({
        id: String(ad.id || ''),
        rank: ad.rank ?? null,
        title: String(ad.ad_title || '').trim(),
        brandName: ad.brand_name || '',
        ctr: ad.ctr ?? null,
        likes: ad.like ?? 0,
        objective: ad.objective_key || '',
        durationSec: ad.video_info?.duration ? Math.round(ad.video_info.duration) : null,
        thumbnailUrl: ad.video_info?.cover || null,
      }));
      return { ...res, ads };
    },

    async searchInstagramPosts({ query, limit = 6 } = {}) {
      const safeLimit = Math.min(Math.max(Number(limit) || 6, 1), 10);
      const res = await requestJson('/v1/instagram/search/posts', { query });
      if (!res.ok) return { ...res, posts: [] };
      const raw = res.data?.posts || res.data?.items || [];
      const posts = (Array.isArray(raw) ? raw : []).slice(0, safeLimit).map((p) => {
        const caption =
          p.caption?.text ||
          p.edge_media_to_caption?.edges?.[0]?.node?.text ||
          p.accessibility_caption ||
          '';
        return {
          id: String(p.id || p.pk || ''),
          shortcode: p.shortcode || p.code || '',
          mediaType: p.__typename || (p.is_video ? 'video' : 'image'),
          caption: String(caption).trim().slice(0, 400),
          likes: p.like_count ?? p.edge_liked_by?.count ?? null,
          comments: p.comment_count ?? p.edge_media_to_comment?.count ?? null,
          thumbnailUrl: p.thumbnail_src || p.display_url || null,
          url: p.shortcode || p.code ? `https://www.instagram.com/p/${p.shortcode || p.code}/` : null,
        };
      });
      return { ...res, posts };
    },

    async searchTikTokShop({ query, region = 'ID', limit = 6 } = {}) {
      const safeLimit = Math.min(Math.max(Number(limit) || 6, 1), 10);
      const res = await requestJson('/v1/tiktok/shop/search', { query, region });
      if (!res.ok) return { ...res, products: [] };
      const raw = res.data?.products || res.data?.data?.products || res.data?.items || [];
      const products = (Array.isArray(raw) ? raw : []).slice(0, safeLimit).map((item) => ({
        id: String(item.product_id || item.id || ''),
        title: String(item.title || item.name || '').trim(),
        price: item.price?.formatted_price || item.price_text || item.price || '',
        sold: item.sold_count ?? item.sales ?? null,
        rating: item.rating ?? item.review_score ?? null,
        seller: item.seller?.name || item.shop_name || '',
        url: item.url || item.product_url || null,
      }));
      return { ...res, products };
    },
  };
}

export { parseWebVttToPlain, stableCacheKey };
