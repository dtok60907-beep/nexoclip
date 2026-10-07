// Use a fresh browser cache key after switching local asset downloads from
// internal redirects to authenticated HTTP bodies. Generation keeps its URL.
export function assetPreviewUrl(value) {
  if (typeof value !== 'string' || !/^\/api\/assets\/[^/?]+\/download(?:\?|$)/.test(value)) return value;
  const url = new URL(value, 'http://preview.local');
  url.searchParams.set('preview', 'http-v1');
  return `${url.pathname}${url.search}`;
}
