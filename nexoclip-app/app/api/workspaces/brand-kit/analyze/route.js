import { createHash } from 'node:crypto';
import { SESSION_COOKIE } from '../../../../../src/lib/auth/session.js';
import { isSameOriginRequest } from '../../../../../src/lib/auth/sameOrigin.js';
import { resolveTenantContext } from '../../../../../src/services/tenantContext.js';
import { getPool } from '../../../../../src/db/pool.js';
import {
  analyzeBrandWebsite,
  extractDeepBrandBundle,
} from '../../../../../src/services/brandWebsiteAnalysis.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 240;

const CACHE_TTL_HOURS = 24;
const MAX_FRESH_ANALYSES_PER_DAY = 5;

function normalizeUrlForCache(raw) {
  try {
    const u = new URL(String(raw || '').trim());
    u.hash = '';
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '') || '/';
    return `${u.protocol}//${host}${path}`;
  } catch {
    return String(raw || '').trim().toLowerCase();
  }
}

function brandCacheKey(normalizedUrl) {
  const hash = createHash('sha256').update(normalizedUrl).digest('hex').slice(0, 40);
  return `brand_setup_v2:${hash}`;
}

async function readCachedAnalysis(pool, key) {
  try {
    const res = await pool.query(
      'SELECT payload_json FROM research_cache WHERE cache_key = $1 AND expires_at > now() LIMIT 1',
      [key],
    );
    return res.rows[0]?.payload_json || null;
  } catch {
    return null;
  }
}

async function checkAndRecordRateLimit(pool, workspaceId) {
  try {
    const countRes = await pool.query(
      `SELECT count(*)::int AS cnt FROM research_cache
       WHERE provider = 'brand_setup_rate'
         AND endpoint = $1
         AND expires_at > now()`,
      [String(workspaceId)],
    );
    const used = countRes.rows[0]?.cnt || 0;
    if (used >= MAX_FRESH_ANALYSES_PER_DAY) {
      throw Object.assign(
        new Error(`Batas analisis website (${MAX_FRESH_ANALYSES_PER_DAY}× / 24 jam per workspace) tercapai. Coba lagi besok atau isi manual.`),
        { status: 429 },
      );
    }
  } catch (err) {
    if (err?.status === 429) throw err;
    // Ignore if research_cache table is temporarily unavailable
  }
}

async function persistCacheAndRateLog(pool, { cacheKey, normalizedUrl, workspaceId, payload }) {
  try {
    await pool.query(
      `INSERT INTO research_cache (cache_key, provider, endpoint, params_json, payload_json, credits_used, expires_at)
       VALUES ($1, 'brand_setup', $2, $3::jsonb, $4::jsonb, 1, now() + ($5::text || ' hours')::interval)
       ON CONFLICT (cache_key) DO UPDATE SET
         payload_json = EXCLUDED.payload_json,
         expires_at = EXCLUDED.expires_at,
         created_at = now()`,
      [cacheKey, normalizedUrl, JSON.stringify({ url: normalizedUrl }), JSON.stringify(payload), String(CACHE_TTL_HOURS)],
    );
    const rateKey = `brand_rate:${workspaceId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    await pool.query(
      `INSERT INTO research_cache (cache_key, provider, endpoint, params_json, payload_json, credits_used, expires_at)
       VALUES ($1, 'brand_setup_rate', $2, '{}'::jsonb, '{}'::jsonb, 0, now() + interval '24 hours')`,
      [rateKey, String(workspaceId)],
    );
  } catch {
    // Cache write must never fail the user response
  }
}

export async function POST(request) {
  try {
    if (!isSameOriginRequest(request)) return Response.json({ error: 'Origin tidak valid.' }, { status: 403 });
    const workspaceId = request.headers.get('x-workspace-id');
    if (!workspaceId) return Response.json({ error: 'Workspace belum dipilih.' }, { status: 400 });
    const context = await resolveTenantContext({ token: request.cookies.get(SESSION_COOKIE)?.value, workspaceId });
    if (!['owner', 'admin'].includes(context.workspace.role)) {
      return Response.json({ error: 'Hanya owner atau admin workspace yang bisa mengatur Brand Kit.' }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const rawUrl = String(body?.url || '').trim();
    if (!rawUrl) return Response.json({ error: 'Masukkan alamat website brand terlebih dahulu.' }, { status: 400 });

    const pool = getPool();
    const normalizedUrl = normalizeUrlForCache(rawUrl);
    const cacheKey = brandCacheKey(normalizedUrl);

    // Guardrail 1: 24h URL cache (Rp 0 on repeat analysis — ignore incomplete cached shells)
    if (!body?.forceRefresh) {
      const cached = await readCachedAnalysis(pool, cacheKey);
      if (cached?.brandKit?.brandName && cached?.brandKit?.about) {
        return Response.json(
          { ...cached, meta: { ...(cached.meta || {}), cached: true } },
          { headers: { 'Cache-Control': 'private, no-store' } },
        );
      }
    }

    // Guardrail 2: Max 5 fresh website analyses per 24h per workspace
    await checkAndRecordRateLimit(pool, workspaceId);

    // Step 1: Deep multi-page HTML + CSS + Logo + Product sub-pages extraction (Rp 0)
    let bundle;
    try {
      bundle = await extractDeepBrandBundle({ url: rawUrl });
    } catch (fetchErr) {
      if (/timeout|abort/i.test(String(fetchErr?.message || ''))) {
        throw Object.assign(
          new Error('Website terlalu lambat merespons (>18 detik) atau memblokir akses otomatis. Pastikan URL bisa dibuka publik lalu coba lagi.'),
          { status: 504, cause: fetchErr },
        );
      }
      throw fetchErr;
    }

    // Step 2: Strategic reasoning (BytePlus Seed 2.1 Turbo + fast OpenRouter Gemini Flash fallback)
    const result = await analyzeBrandWebsite(bundle, { poolFactory: () => pool });

    await persistCacheAndRateLog(pool, {
      cacheKey,
      normalizedUrl,
      workspaceId,
      payload: result,
    });

    return Response.json(
      { ...result, meta: { ...(result.meta || {}), cached: false } },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    const status =
      error.status ||
      (error.message === 'Authentication required' ? 401 : error.message === 'Workspace access denied' ? 403 : 502);
    if (status >= 500) console.error('Brand website analysis failed:', error.message, error.cause?.message || '');
    return Response.json(
      {
        error:
          status === 504 || status < 500
            ? error.message
            : 'Website belum bisa dianalisis (timeout atau gangguan provider AI). Coba lagi sebentar atau isi manual.',
      },
      { status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
