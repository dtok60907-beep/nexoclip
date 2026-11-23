import portfolioCatalog from './portfolio-videos.json';
import clearShowcaseMeta from './clearShowcaseMeta.json';
import { SHOWCASE_PROMPTS } from './showcasePrompts';

const CATALOG_BY_ID = new Map(portfolioCatalog.map((item) => [item.id, item]));

// Exclude HEVC (hvc1) / QuickTime (.mov) files that fail to decode in Chrome/Chromium on Windows
// so every single video in the showcase is guaranteed H.264 (avc1) MP4 and plays reliably on hover.
const UNPLAYABLE_HEVC_IDS = new Set([
  'micro-drama-movie-142',
  'micro-drama-movie-144',
  'micro-drama-movie-145',
  'cinematic-ads-32',
  'cinematic-ads-39',
  'experimental-vfx-105',
]);

// Curated narrative/action drama scenes from experimental-vfx that belong in Filmmaking → Drama.
export const DRAMA_CURATED_IDS = new Set([
  'micro-drama-movie-146',
  'micro-drama-movie-148',
  'micro-drama-movie-149',
  'micro-drama-movie-147',
  'micro-drama-movie-140',
  'experimental-vfx-133',
  'experimental-vfx-94',
  'experimental-vfx-110',
  'experimental-vfx-96',
]);

// Only include videos whose thumbnails passed strict visual clarity checks
// AND whose video stream is universally playable H.264 (avc1).
export const PORTFOLIO_VIDEOS = clearShowcaseMeta
  .filter((meta) => !UNPLAYABLE_HEVC_IDS.has(meta.id))
  .map((meta) => {
    const item = CATALOG_BY_ID.get(meta.id);
    if (!item) return null;
    const bespoke = SHOWCASE_PROMPTS[meta.id];
    return {
      ...item,
      displayTitle: bespoke?.title || item.title,
      thumbWidth: meta.w,
      thumbHeight: meta.h,
      isPortrait: meta.h >= meta.w,
      clarityScore: meta.score,
    };
  })
  .filter(Boolean);

export const UGC_SHOWCASE_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'cinematic-ads', label: 'Cinematic Ads' },
  { id: 'ugc-commercial', label: 'UGC' },
  { id: 'affiliate-ugc', label: 'Affiliate' },
  { id: 'ads-fnb', label: 'Food & Drink' },
];

export const FILMMAKING_SHOWCASE_CATEGORIES = [
  { id: 'drama', label: 'Drama' },
  { id: 'experimental-vfx', label: 'Sci-Fi & VFX' },
  { id: '3d-animation', label: '3D & Anime' },
  { id: 'music-videos', label: 'Music Film' },
];

// Keep backward-compatible export if referenced elsewhere.
export const SHOWCASE_CATEGORIES = [
  ...UGC_SHOWCASE_CATEGORIES,
  ...FILMMAKING_SHOWCASE_CATEGORIES,
];

const PREVIEW_IDS = new Set([
  '3d-animation-3',
  'ugc-commercial-152',
  'experimental-vfx-115',
  'cinematic-ads-22',
  'micro-drama-movie-148',
  'affiliate-ugc-79',
  'ads-fnb-69',
  'cinematic-ads-13',
  'experimental-vfx-103',
  'cinematic-ads-64',
  'music-videos-168',
  'affiliate-ugc-83',
  'ads-fnb-65',
  'ugc-commercial-163',
  '3d-animation-6',
]);

export function getVideoById(id) {
  return PORTFOLIO_VIDEOS.find((item) => item.id === id) || null;
}

export function getPreviewUrl(video) {
  if (!video) return '';
  return PREVIEW_IDS.has(video.id) ? `/media/preview/${video.id}.mp4` : video.url;
}

export function formatPortfolioName(video) {
  if (!video) return 'Showcase';
  const bespoke = SHOWCASE_PROMPTS[video.id];
  if (bespoke?.title) return bespoke.title;
  if (video.displayTitle) return video.displayTitle;
  try {
    const rawFile = decodeURIComponent(video.url.split('/').pop() || '')
      .replace(/\.(mp4|mov|webm)$/i, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (
      rawFile &&
      !/^(hf |cgt |lv |studio video |video |vid |img |reel |\d{5,}|ads?\d*)/i.test(rawFile) &&
      !/^[a-f0-9]{8,}$/i.test(rawFile.replace(/\s+/g, '')) &&
      rawFile.length >= 3 &&
      rawFile.length <= 32
    ) {
      return rawFile.replace(/\b\w/g, (char) => char.toUpperCase());
    }
  } catch {
    // Fall back below.
  }
  return video.categoryLabel || 'Showcase';
}

const CATEGORY_ICONS = {
  'cinematic-ads': 'video',
  'ugc-commercial': 'ai-influencer',
  'affiliate-ugc': 'ads',
  'ads-fnb': 'video',
  'micro-drama-movie': 'filmmaking',
  '3d-animation': 'cinema',
  'experimental-vfx': 'director',
  'music-videos': 'video',
};

export function buildExampleFromPortfolioVideo(video, override = {}) {
  const bespoke = video?.id ? SHOWCASE_PROMPTS[video.id] : null;
  const cleanName = formatPortfolioName(video);
  const title = override.title || bespoke?.title || cleanName;
  const subtitle = override.subtitle || bespoke?.subtitle || (video?.categoryLabel || 'Showcase');
  const icon = override.icon || CATEGORY_ICONS[video?.category] || 'video';

  return {
    id: video?.id || title,
    category: video?.category || 'cinematic-ads',
    categoryLabel: video?.categoryLabel || 'Cinematic',
    title,
    subtitle,
    icon,
    kind: override.kind || 'video',
    image: video?.thumbnailUrl || override.image || '/showcase/workflow-product.webp',
    videoUrl: video?.url || override.videoUrl || '',
    previewUrl: video ? getPreviewUrl(video) : override.previewUrl || '',
    width: video?.thumbWidth || 640,
    height: video?.thumbHeight || 1138,
    isPortrait: video ? Boolean(video.isPortrait) : true,
    prompt: override.prompt || bespoke?.prompt || cleanName,
    promptExtra: override.promptExtra || bespoke?.promptExtra || '',
    assistantLead: override.assistantLead || bespoke?.assistantLead || '',
    actionHeader: override.actionHeader || 'Production plan · 3 passes',
    actions: override.actions || bespoke?.actions || [],
  };
}
