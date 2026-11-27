'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  BarChart3,
  Bookmark,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clapperboard,
  Film,
  FolderKanban,
  Image as ImageIcon,
  Images,
  Megaphone,
  Search,
  Send,
  Settings,
  Sparkles,
  UserRound,
  Video,
  Wand2,
  Workflow,
  X,
} from 'lucide-react';
import {
  DRAMA_CURATED_IDS,
  PORTFOLIO_VIDEOS,
  buildExampleFromPortfolioVideo,
  formatPortfolioName,
  getPreviewUrl,
} from './homeShowcaseVideos';
import { VideoPlayer } from './ui/video-player';
import { LoaderGooeyBlobs } from './ui/loader-gooey-blobs';

const HERO_BANNERS = [
  {
    id: 'video',
    title: 'Video Studio 2.5',
    subtitle: 'Create authentic UGC creator ads, product demos, and social reels.',
    cta: 'Try',
    image: '/showcase/workflow-ugc.webp',
    objectPosition: 'center 22%',
    fallbackGradient: 'linear-gradient(135deg, #1d1638 0%, #37249f 55%, #6552f5 100%)',
  },
  {
    id: 'director',
    title: 'AI Creative Marketing',
    subtitle: 'Research competitor ads, craft creative strategies, build campaigns, and launch in Canvas.',
    cta: 'Try',
    image: '/showcase/cinematic-1600.webp',
    objectPosition: '76% center',
    fallbackGradient: 'linear-gradient(135deg, #120d2e 0%, #2a1d7c 50%, #5b45f2 100%)',
  },
  {
    id: 'image',
    title: 'Image Studio',
    subtitle: 'Produce editorial product photography and studio campaign stills.',
    cta: 'Try',
    image: '/showcase/workflow-product.webp',
    objectPosition: 'center 42%',
    fallbackGradient: 'linear-gradient(135deg, #1a1530 0%, #3a2d7c 52%, #7c6bf7 100%)',
  },
];

const APP_CATEGORIES = [
  { id: 'all', label: 'All Apps' },
  { id: 'video-film', label: 'Video & Film' },
  { id: 'visuals', label: 'Visuals & Avatar' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'workspace', label: 'Workspace' },
];

export const APPS_CATALOG = [
  {
    id: 'director',
    title: 'AI Creative Marketing',
    category: 'marketing',
    categoryLabel: 'Marketing',
    pill: 'New',
    tone: 'violet',
    icon: Sparkles,
    description: 'Research trends & ads, craft strategies, plan campaigns & open in Canvas',
  },
  {
    id: 'video',
    title: 'Video Studio',
    category: 'video-film',
    categoryLabel: 'Video & Film',
    tag: 'Classic',
    tone: 'sky',
    icon: Video,
    description: 'Generate UGC ads, product demos & commercial clips',
  },
  {
    id: 'ai-influencer',
    title: 'AI Influencer',
    category: 'visuals',
    categoryLabel: 'Visuals & Avatar',
    tag: 'Classic',
    tone: 'emerald',
    icon: UserRound,
    description: 'Build branded virtual creators & presenter personas',
  },
  {
    id: 'canvas',
    title: 'Canvas Editor',
    category: 'visuals',
    categoryLabel: 'Visuals & Avatar',
    pill: 'New',
    tone: 'indigo',
    icon: Workflow,
    description: 'Connect prompts & multi-step visual generation nodes',
  },
  {
    id: 'cinema',
    title: 'Cinema Studio',
    category: 'video-film',
    categoryLabel: 'Video & Film',
    tone: 'amber',
    icon: Film,
    description: 'Direct widescreen narrative shots & camera lighting',
  },
  {
    id: 'image',
    title: 'Image Studio',
    category: 'visuals',
    categoryLabel: 'Visuals & Avatar',
    tag: 'Classic',
    tone: 'sky',
    icon: ImageIcon,
    description: 'Produce studio product photos & campaign keyframes',
  },
  {
    id: 'media',
    title: 'Media Library',
    category: 'workspace',
    categoryLabel: 'Workspace',
    tone: 'sky',
    icon: Images,
    description: 'Browse, search & download all generated assets',
  },
  {
    id: 'ads',
    title: 'Ads Manager',
    category: 'marketing',
    categoryLabel: 'Marketing',
    tone: 'emerald',
    icon: Megaphone,
    description: 'Launch & monitor Meta and TikTok paid ad campaigns',
  },
  {
    id: 'publish',
    title: 'Social Publishing',
    category: 'marketing',
    categoryLabel: 'Marketing',
    tone: 'amber',
    icon: Send,
    description: 'Schedule & auto-publish reels to TikTok & Instagram',
  },
  {
    id: 'projects',
    title: 'Projects',
    category: 'workspace',
    categoryLabel: 'Workspace',
    tone: 'violet',
    icon: FolderKanban,
    description: 'Organize multi-scene productions & saved briefs',
  },
  {
    id: 'usage',
    title: 'Usage & Billing',
    category: 'workspace',
    categoryLabel: 'Workspace',
    tone: 'emerald',
    icon: BarChart3,
    description: 'Review credit usage, active plan & billing history',
  },
  {
    id: 'settings',
    title: 'Settings',
    category: 'workspace',
    categoryLabel: 'Workspace',
    tone: 'slate',
    icon: Settings,
    description: 'Manage profile details, security & workspace prefs',
  },
];

const INSPIRATION_SLOTS = [
  { id: 'trending', label: 'Trending', category: 'cinematic-ads', pickIndex: 0 },
  { id: 'ugc-style', label: 'UGC Style', category: 'ugc-commercial', pickIndex: 0 },
  { id: 'hooks', label: 'Hooks', category: 'affiliate-ugc', pickIndex: 0 },
  { id: 'product-ads', label: 'Product Ads', category: 'cinematic-ads', pickIndex: 1 },
  { id: 'food-drink', label: 'Food & Drink', category: 'ads-fnb', pickIndex: 0 },
  { id: 'creator-reels', label: 'Creator Reels', category: 'ugc-commercial', pickIndex: 1 },
  { id: 'drama', label: 'Micro Drama', category: 'drama', pickIndex: 0 },
  { id: 'scifi-vfx', label: 'Sci-Fi & VFX', category: 'experimental-vfx', pickIndex: 0 },
  { id: '3d-anime', label: '3D & Anime', category: '3d-animation', pickIndex: 0 },
  { id: 'music-film', label: 'Music Film', category: 'music-videos', pickIndex: 0 },
];

const SAVED_STORAGE_KEY = 'nexoclip_saved_inspiration_v1';

function InspirationCard({
  item,
  index,
  isSaved,
  onToggleSave,
  onOpen,
  pausePlayback,
  prefersReducedMotion,
}) {
  const [isVisible, setIsVisible] = useState(index < 6);
  const [hovered, setHovered] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const cardRef = useRef(null);
  const videoRef = useRef(null);
  const previewUrl = useMemo(() => getPreviewUrl(item.video), [item.video]);

  const tryPlay = useCallback((el) => {
    if (!el) return;
    el.muted = true;
    el.defaultMuted = true;
    el.playsInline = true;
    const p = el.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }, []);

  useEffect(() => {
    const node = cardRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { rootMargin: '80px 200px', threshold: 0.05 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const shouldMountVideo = Boolean(previewUrl) && (isVisible || hovered) && (!prefersReducedMotion || hovered);
  const shouldPlayVideo = shouldMountVideo && !pausePlayback;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (shouldPlayVideo) {
      tryPlay(el);
    } else {
      try {
        el.pause();
      } catch {
        // Ignore media pause error.
      }
    }
  }, [shouldPlayVideo, tryPlay]);

  useEffect(() => {
    return () => {
      const el = videoRef.current;
      if (!el) return;
      try {
        el.pause();
        el.removeAttribute('src');
        el.load();
      } catch {
        // Ignore cleanup errors.
      }
    };
  }, []);

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      aria-label={item.label}
      className="nx-apps-inspo-card"
      onClick={() => onOpen(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(item);
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <img
        src={item.video.thumbnailUrl}
        alt={item.label}
        loading={index < 6 ? 'eager' : 'lazy'}
        decoding="async"
        className="nx-apps-inspo-thumb"
      />
      {shouldMountVideo && (
        <video
          ref={videoRef}
          src={previewUrl}
          poster={item.video.thumbnailUrl}
          muted
          loop
          playsInline
          autoPlay={!pausePlayback}
          preload={index < 6 ? 'auto' : 'metadata'}
          aria-hidden="true"
          className={`nx-apps-inspo-video${videoReady ? ' is-ready' : ''}`}
          onLoadedData={(e) => {
            if (!pausePlayback) tryPlay(e.currentTarget);
            setVideoReady(true);
          }}
          onCanPlay={(e) => {
            if (!pausePlayback) tryPlay(e.currentTarget);
            setVideoReady(true);
          }}
          onPlaying={() => setVideoReady(true)}
          onTimeUpdate={(e) => {
            if (!videoReady && e.currentTarget.currentTime > 0) setVideoReady(true);
          }}
        />
      )}
      <span className="nx-reel-hover-scrim" aria-hidden="true">
        <span className="nx-reel-recreate-pill nx-reel-recreate-pill--compact">
          <Sparkles className="w-3 h-3" aria-hidden="true" />
          <span>Recreate</span>
        </span>
      </span>
      <button
        type="button"
        className={`nx-apps-inspo-save${isSaved ? ' is-saved' : ''}`}
        aria-label={isSaved ? `Remove ${item.label} from saved` : `Save ${item.label}`}
        aria-pressed={isSaved}
        onClick={(e) => {
          e.stopPropagation();
          onToggleSave(item.slotId);
        }}
      >
        <Bookmark className="w-3.5 h-3.5" fill={isSaved ? 'currentColor' : 'none'} />
      </button>
      <span className="nx-apps-inspo-scrim" aria-hidden="true" />
      <span className="nx-apps-inspo-label">{item.label}</span>
    </div>
  );
}

export default function AppsHub({ onNavigate }) {
  const prefersReducedMotion = useReducedMotion();
  const [activeBanner, setActiveBanner] = useState(0);
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [savedIds, setSavedIds] = useState(() => new Set());
  const [previewItem, setPreviewItem] = useState(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [portalMounted, setPortalMounted] = useState(false);
  const [inspoCanLeft, setInspoCanLeft] = useState(false);
  const [inspoCanRight, setInspoCanRight] = useState(true);
  const inspoRailRef = useRef(null);

  useEffect(() => {
    setPortalMounted(true);
    try {
      const raw = window.localStorage.getItem(SAVED_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setSavedIds(new Set(parsed));
      }
    } catch {
      // Ignore storage errors.
    }
  }, []);

  const toggleSave = useCallback((slotId) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(slotId)) next.delete(slotId);
      else next.add(slotId);
      try {
        window.localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(Array.from(next)));
      } catch {
        // Ignore storage errors.
      }
      return next;
    });
  }, []);

  const stepBanner = useCallback((delta) => {
    setActiveBanner((prev) => (prev + delta + HERO_BANNERS.length) % HERO_BANNERS.length);
  }, []);

  const filteredApps = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return APPS_CATALOG.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (!normalized) return true;
      return (
        item.title.toLowerCase().includes(normalized) ||
        item.description.toLowerCase().includes(normalized) ||
        item.categoryLabel.toLowerCase().includes(normalized) ||
        (item.pill && item.pill.toLowerCase().includes(normalized)) ||
        (item.tag && item.tag.toLowerCase().includes(normalized))
      );
    });
  }, [category, query]);

  const isCollapsedAll = category === 'all' && !query.trim() && !expanded;
  const visibleApps = isCollapsedAll ? filteredApps.slice(0, 8) : filteredApps;

  const inspirationItems = useMemo(() => {
    const usedIds = new Set();
    const list = [];
    for (const slot of INSPIRATION_SLOTS) {
      let pool;
      if (slot.category === 'drama') {
        pool = PORTFOLIO_VIDEOS.filter((v) => DRAMA_CURATED_IDS.has(v.id));
      } else {
        pool = PORTFOLIO_VIDEOS.filter((v) => v.category === slot.category);
      }
      const portraitPool = pool.filter((v) => v.isPortrait && !usedIds.has(v.id));
      const candidatePool = portraitPool.length ? portraitPool : pool.filter((v) => !usedIds.has(v.id));
      const video = candidatePool[slot.pickIndex] || candidatePool[0] || PORTFOLIO_VIDEOS.find((v) => !usedIds.has(v.id));
      if (video) {
        usedIds.add(video.id);
        list.push({
          slotId: slot.id,
          label: slot.label,
          video,
          example: buildExampleFromPortfolioVideo(video),
        });
      }
    }
    return list;
  }, []);

  const visibleInspiration = useMemo(() => {
    if (!showSavedOnly) return inspirationItems;
    return inspirationItems.filter((item) => savedIds.has(item.slotId));
  }, [inspirationItems, showSavedOnly, savedIds]);

  const updateInspoScroll = useCallback(() => {
    const el = inspoRailRef.current;
    if (!el) return;
    setInspoCanLeft(el.scrollLeft > 6);
    setInspoCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    const raf = window.requestAnimationFrame(updateInspoScroll);
    window.addEventListener('resize', updateInspoScroll, { passive: true });
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', updateInspoScroll);
    };
  }, [visibleInspiration.length, updateInspoScroll]);

  const scrollInspo = (dir) => {
    const el = inspoRailRef.current;
    if (!el) return;
    el.scrollBy({
      left: dir * Math.max(el.clientWidth * 0.65, 280),
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  };

  const openApp = (item) => {
    if (item.disabled) return;
    if (item.href) {
      window.location.href = item.href;
      return;
    }
    onNavigate?.(item.id);
  };

  const handleRecreateFromInspo = (item) => {
    if (!item?.example) return;
    const fullPrompt = item.example.promptExtra
      ? `${item.example.prompt}\n\n${item.example.promptExtra}`
      : item.example.prompt;
    setPreviewItem(null);
    onNavigate?.('home', fullPrompt);
  };

  useEffect(() => {
    if (!previewItem) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setPreviewItem(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewItem]);

  const getSlideSlot = (index) => {
    const total = HERO_BANNERS.length;
    const diff = (index - activeBanner + total) % total;
    if (diff === 0) return 'center';
    if (diff === 1) return 'right';
    return 'left';
  };

  return (
    <main className="nx-apps-page" aria-labelledby="nx-apps-heading">
      <h1 id="nx-apps-heading" className="nx-reference-sr">Apps &amp; Studios</h1>

      <div className="nx-apps-container">
        {/* Top 3-Card Overlapping Spotlight Carousel */}
        <section data-tour="apps-hero" className="nx-apps-hero" aria-label="Featured studios">
          <button
            type="button"
            className="nx-apps-hero-nav is-prev"
            aria-label="Previous spotlight"
            onClick={() => stepBanner(-1)}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="nx-apps-hero-stage">
            {HERO_BANNERS.map((banner, index) => {
              const slot = getSlideSlot(index);
              const isCenter = slot === 'center';
              return (
                <div
                  key={banner.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${banner.title} — ${banner.subtitle}`}
                  className={`nx-apps-hero-card is-${slot}`}
                  style={{ backgroundImage: banner.fallbackGradient }}
                  onClick={() => {
                    if (isCenter) onNavigate?.(banner.id);
                    else setActiveBanner(index);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (isCenter) onNavigate?.(banner.id);
                      else setActiveBanner(index);
                    }
                  }}
                >
                  <img
                    src={banner.image}
                    alt=""
                    aria-hidden="true"
                    className="nx-apps-hero-img"
                    style={banner.objectPosition ? { objectPosition: banner.objectPosition } : undefined}
                    loading="eager"
                  />
                  <div className="nx-apps-hero-scrim" aria-hidden="true" />
                  <div className="nx-apps-hero-overlay">
                    <div className="nx-apps-hero-copy">
                      <h2>{banner.title}</h2>
                      <p>{banner.subtitle}</p>
                    </div>
                    {isCenter && (
                      <button
                        type="button"
                        className="nx-apps-hero-try"
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigate?.(banner.id);
                        }}
                      >
                        {banner.cta}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            className="nx-apps-hero-nav is-next"
            aria-label="Next spotlight"
            onClick={() => stepBanner(1)}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </section>

        {/* Category Pill Bar + Inline Search + Show all */}
        <section data-tour="apps-grid" className="nx-apps-directory" aria-label="Apps directory">
          <div data-tour="apps-toolbar" className="nx-apps-toolbar">
            <div className="nx-apps-pill-bar" role="tablist" aria-label="Filter apps by category">
              {APP_CATEGORIES.map((cat) => {
                const active = category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setCategory(cat.id)}
                    className={`nx-apps-pill-tab${active ? ' is-active' : ''}`}
                  >
                    <span>{cat.label}</span>
                    {cat.id === 'all' && (
                      <span className="nx-apps-pill-count">{APPS_CATALOG.length}</span>
                    )}
                  </button>
                );
              })}

              <div className="nx-apps-inline-search">
                <Search className="nx-apps-inline-search-icon w-3.5 h-3.5" aria-hidden="true" />
                <label htmlFor="nx-apps-search" className="nx-reference-sr">Search Apps</label>
                <input
                  id="nx-apps-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search Apps"
                  className="nx-apps-inline-search-input"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="nx-apps-inline-search-clear"
                    aria-label="Clear search"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {category === 'all' && !query.trim() && APPS_CATALOG.length > 8 && (
              <button
                type="button"
                className="nx-apps-show-all"
                onClick={() => setExpanded((prev) => !prev)}
                aria-expanded={expanded}
              >
                <span>{expanded ? 'Show less' : 'Show all'}</span>
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            )}
          </div>

          {visibleApps.length === 0 ? (
            <div className="nx-apps-empty" role="status">
              <p>No apps match &ldquo;{query}&rdquo;.</p>
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setCategory('all');
                }}
              >
                Reset filters
              </button>
            </div>
          ) : (
            <div className="nx-apps-compact-grid">
              {visibleApps.map((item) => {
                const IconComponent = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={item.disabled}
                    onClick={() => openApp(item)}
                    className={`nx-app-row-card${item.disabled ? ' is-disabled' : ''}`}
                  >
                    <span className={`nx-app-row-icon is-${item.tone || 'violet'}`}>
                      <IconComponent className="w-[18px] h-[18px]" strokeWidth={1.9} />
                    </span>
                    <span className="nx-app-row-copy">
                      <span className="nx-app-row-title-line">
                        <span className="nx-app-row-title">{item.title}</span>
                        {item.pill && <span className="nx-app-row-pill">{item.pill}</span>}
                      </span>
                      <span className="nx-app-row-desc">{item.description}</span>
                    </span>
                    {item.tag && <span className="nx-app-row-tag">{item.tag}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Bottom Inspiration Strip */}
        <section data-tour="apps-inspo" className="nx-apps-inspo" aria-labelledby="nx-apps-inspo-heading">
          <div className="nx-apps-inspo-head">
            <h2 id="nx-apps-inspo-heading">Inspiration</h2>
            <div className="nx-apps-inspo-actions">
              <button
                type="button"
                className={`nx-apps-inspo-action${showSavedOnly ? ' is-active' : ''}`}
                onClick={() => setShowSavedOnly((prev) => !prev)}
                aria-pressed={showSavedOnly}
              >
                <Bookmark className="w-3.5 h-3.5" fill={showSavedOnly ? 'currentColor' : 'none'} />
                <span>Saved{savedIds.size > 0 ? ` (${savedIds.size})` : ''}</span>
              </button>
              <button
                type="button"
                className="nx-apps-inspo-action"
                onClick={() => onNavigate?.('home')}
              >
                <span>Explore all</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {visibleInspiration.length === 0 ? (
            <div className="nx-apps-inspo-empty">
              <p>No saved inspiration yet. Hover any card and click the bookmark icon to save it.</p>
              <button type="button" onClick={() => setShowSavedOnly(false)}>
                View all inspiration
              </button>
            </div>
          ) : (
            <div className="nx-apps-inspo-rail-wrap">
              {inspoCanLeft && (
                <button
                  type="button"
                  className="nx-apps-inspo-edge is-left"
                  aria-label="Scroll inspiration left"
                  onClick={() => scrollInspo(-1)}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}

              <div
                ref={inspoRailRef}
                className="nx-apps-inspo-track"
                onScroll={updateInspoScroll}
              >
                {visibleInspiration.map((item, idx) => (
                  <InspirationCard
                    key={item.slotId}
                    item={item}
                    index={idx}
                    isSaved={savedIds.has(item.slotId)}
                    onToggleSave={toggleSave}
                    onOpen={(clicked) => {
                      setPreviewReady(false);
                      setPreviewItem(clicked);
                    }}
                    pausePlayback={Boolean(previewItem)}
                    prefersReducedMotion={Boolean(prefersReducedMotion)}
                  />
                ))}
              </div>

              {inspoCanRight && (
                <button
                  type="button"
                  className="nx-apps-inspo-edge is-right"
                  aria-label="Scroll inspiration right"
                  onClick={() => scrollInspo(1)}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Inspiration Quick Preview Modal */}
      {portalMounted &&
        createPortal(
          <AnimatePresence>
            {previewItem && (
              <motion.div
                key="apps-inspo-modal"
                className="nx-example-modal-backdrop"
                role="dialog"
                aria-modal="true"
                aria-label={formatPortfolioName(previewItem.video)}
                initial={prefersReducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={prefersReducedMotion ? false : { opacity: 0 }}
                transition={{ duration: 0.16 }}
                onClick={(e) => {
                  if (e.target === e.currentTarget) setPreviewItem(null);
                }}
              >
                <motion.div
                  className="nx-apps-preview-modal"
                  initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={prefersReducedMotion ? false : { opacity: 0, scale: 0.97, y: 8 }}
                  transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32 }}
                >
                  <div className="nx-apps-preview-media">
                    {!previewReady && (
                      <div className="nx-modal-buffering" aria-hidden="true">
                        <LoaderGooeyBlobs size={11} color="#7c6bf7" duration={1.4} />
                      </div>
                    )}
                    <VideoPlayer
                      key={previewItem.video.id}
                      src={previewItem.example.videoUrl || previewItem.example.previewUrl}
                      poster={previewItem.video.thumbnailUrl}
                      size="full"
                      fit="contain"
                      autoPlay
                      muted
                      loop
                      playsInline
                      preload="auto"
                      className={`nx-custom-video-player${previewReady ? ' is-ready' : ''}`}
                      onLoadedData={() => setPreviewReady(true)}
                      onCanPlay={() => setPreviewReady(true)}
                      onPlaying={() => setPreviewReady(true)}
                      onError={() => setPreviewReady(true)}
                    />
                  </div>
                  <div className="nx-apps-preview-side">
                    <div className="nx-apps-preview-head">
                      <div>
                        <span className="nx-apps-preview-cat">{previewItem.label}</span>
                        <h3>{previewItem.example.title}</h3>
                      </div>
                      <button
                        type="button"
                        className="nx-example-panel-close"
                        aria-label="Close preview"
                        onClick={() => setPreviewItem(null)}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="nx-apps-preview-prompt">{previewItem.example.prompt}</p>
                    <button
                      type="button"
                      className="nx-example-use-btn"
                      onClick={() => handleRecreateFromInspo(previewItem)}
                    >
                      <Sparkles className="w-4 h-4 mr-2" aria-hidden="true" />
                      <span>Recreate</span>
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </main>
  );
}
