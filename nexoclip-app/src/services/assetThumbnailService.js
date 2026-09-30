// Canvas and gallery tiles showed full-size originals (2K/4K generations,
// multi-MB storyboards). Tiles now use a 512px WebP rendered once on first
// request and stored next to the original; the original is still used for
// the lightbox, downloads and provider references.
export const THUMBNAIL_SIZE = 512;
const RESIZABLE = /^image\/(png|jpe?g|webp|avif|heic|heif|tiff)$/i;
const inFlight = new Map();

export function thumbnailKeyFor(storageKey) {
  return `${storageKey}.thumb-${THUMBNAIL_SIZE}.webp`;
}

async function defaultResize(body) {
  const { default: sharp } = await import('sharp');
  return sharp(body)
    .rotate()
    .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
}

// Returns the thumbnail's storage key, or null when this asset or storage
// can't have one (callers then serve the original).
export async function ensureAssetThumbnail(storage, asset, { resize = defaultResize } = {}) {
  if (!asset?.storage_key || !RESIZABLE.test(asset.content_type || '')) return null;
  if (typeof storage?.exists !== 'function') return null;
  const key = thumbnailKeyFor(asset.storage_key);
  if (inFlight.has(key)) return inFlight.get(key);
  const work = (async () => {
    if (await storage.exists(key)) return key;
    const original = await storage.get(asset.storage_key);
    const body = await resize(Buffer.from(original.body));
    await storage.put(key, body, 'image/webp');
    return key;
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, work);
  return work;
}
