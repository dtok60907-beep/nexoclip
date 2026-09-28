import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const CACHE_TTL_MS = 5 * 60 * 1000;

let cache = { expiresAt: 0, data: null };

export async function GET() {
  const now = Date.now();
  if (cache.data && cache.expiresAt > now) {
    return NextResponse.json(cache.data);
  }

  try {
    const response = await fetch(OPENROUTER_MODELS_URL, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `OpenRouter returned ${response.status}` },
        { status: 502 },
      );
    }

    const payload = await response.json();
    const data = Array.isArray(payload?.data)
      ? payload.data.map((model) => ({
          id: model.id,
          canonical_slug: model.canonical_slug ?? null,
          name: model.name,
          architecture: model.architecture ?? null,
          pricing: model.pricing ?? null,
          supported_parameters: model.supported_parameters ?? [],
        }))
      : [];

    cache = { expiresAt: now + CACHE_TTL_MS, data: { data } };
    return NextResponse.json(cache.data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'OpenRouter request failed' },
      { status: 502 },
    );
  }
}
