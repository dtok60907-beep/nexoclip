'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, Plus, Search, Sparkles, X } from 'lucide-react';
import {
  DRAMA_CURATED_IDS,
  PORTFOLIO_VIDEOS,
  buildExampleFromPortfolioVideo,
  formatPortfolioName,
  getPreviewUrl,
} from './homeShowcaseVideos';
import { VideoPlayer } from './ui/video-player';
import { LoaderGooeyBlobs } from './ui/loader-gooey-blobs';

const PRIMARY_TABS = [
  { id: 'all', label: 'All Templates' },
  { id: 'ugc', label: 'UGC Video' },
  { id: 'promo', label: 'Promo Video' },
  { id: 'film', label: 'Film & Drama' },
  { id: 'motion', label: '3D & VFX' },
];

const USE_CASES_BY_TAB = {
  all: [
    { id: 'all', label: 'All Use Cases' },
    { id: 'ugc-commercial', label: 'UGC Ads' },
    { id: 'cinematic-ads', label: 'Product Commercial' },
    { id: 'affiliate-ugc', label: 'Affiliate Hooks' },
    { id: 'ads-fnb', label: 'Food & Drink' },
    { id: 'drama', label: 'Micro Drama' },
    { id: '3d-animation', label: '3D Animation' },
    { id: 'experimental-vfx', label: 'Sci-Fi & VFX' },
    { id: 'music-videos', label: 'Music Film' },
  ],
  ugc: [
    { id: 'all', label: 'All Use Cases' },
    { id: 'ugc-commercial', label: 'Social Ad' },
    { id: 'affiliate-ugc', label: 'Affiliate & Review' },
    { id: 'ads-fnb', label: 'Food & Drink' },
  ],
  promo: [
    { id: 'all', label: 'All Use Cases' },
    { id: 'cinematic-ads', label: 'Brand Commercial' },
    { id: 'ads-fnb', label: 'F&B Promo' },
  ],
  film: [
    { id: 'all', label: 'All Use Cases' },
    { id: 'drama', label: 'Micro Drama' },
    { id: 'music-videos', label: 'Music Video' },
  ],
  motion: [
    { id: 'all', label: 'All Use Cases' },
    { id: '3d-animation', label: '3D & Animation' },
    { id: 'experimental-vfx', label: 'Experimental VFX' },
  ],
};

const CATEGORY_LABEL = {
  'ugc-commercial': 'UGC Video',
  'cinematic-ads': 'Product Commercial',
  'affiliate-ugc': 'Affiliate UGC',
  'ads-fnb': 'Food & Drink',
  'micro-drama-movie': 'Micro Drama',
  'experimental-vfx': 'Sci-Fi & VFX',
  '3d-animation': '3D & Motion',
  'music-videos': 'Music Film',
};

const TemplateCard = memo(function TemplateCard({ video, index, onOpen, prefersReducedMotion }) {
  const [hovered, setHovered] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef(null);
  const title = useMemo(() => formatPortfolioName(video), [video]);
  const previewUrl = useMemo(() => getPreviewUrl(video), [video]);

  const tryPlay = useCallback((el) => {
    if (!el) return;
    el.muted = true;
    el.defaultMuted = true;
    el.playsInline = true;
    const p = el.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (hovered) {
      tryPlay(el);
    } else {
      try {
        el.pause();
        el.currentTime = 0;
      } catch {
        // Ignore pause cleanup errors
      }
    }
  }, [hovered, tryPlay]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(video)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(video);
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="group flex flex-col text-left cursor-pointer focus:outline-none"
    >
      <div className="relative w-full aspect-[9/15] rounded-[14px] overflow-hidden bg-[#12131a] border border-[#e7e7f0] shadow-[0_2px_8px_rgba(16,16,28,0.04)] transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-[#c8c9d8] group-hover:shadow-[0_14px_30px_-10px_rgba(16,16,28,0.16)]">
        <img
          src={video.thumbnailUrl}
          alt={title}
          loading={index < 12 ? 'eager' : 'lazy'}
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.035]"
        />
        {hovered && previewUrl && !prefersReducedMotion && (
          <video
            ref={videoRef}
            src={previewUrl}
            poster={video.thumbnailUrl}
            muted
            loop
            playsInline
            autoPlay
            preload="auto"
            aria-hidden="true"
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${videoReady ? 'opacity-100' : 'opacity-0'}`}
            onCanPlay={(e) => {
              tryPlay(e.currentTarget);
              setVideoReady(true);
            }}
            onPlaying={() => setVideoReady(true)}
          />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b0c12]/80 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center opacity-0 translate-y-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-y-0">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-[11.5px] font-semibold text-[#14141f] shadow-lg">
            <span>Use Template</span>
            <ArrowUpRight size={12} strokeWidth={2.2} />
          </span>
        </div>
        <span className="absolute left-2.5 top-2.5 rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-medium text-[#14141f] backdrop-blur-sm">
          {CATEGORY_LABEL[video.category] || 'Template'}
        </span>
      </div>
      <span className="mt-2 truncate px-0.5 text-[12.5px] font-medium text-[#1f202c] transition-colors group-hover:text-[#14141f]">
        {title}
      </span>
    </div>
  );
});

export default function TemplatesHub({ onNavigate }) {
  const prefersReducedMotion = useReducedMotion();
  const [primaryTab, setPrimaryTab] = useState('all');
  const [useCase, setUseCase] = useState('all');
  const [query, setQuery] = useState('');
  const [previewVideo, setPreviewVideo] = useState(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [portalMounted, setPortalMounted] = useState(false);

  useEffect(() => {
    setPortalMounted(true);
  }, []);

  useEffect(() => {
    if (!previewVideo) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setPreviewVideo(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewVideo]);

  const useCases = USE_CASES_BY_TAB[primaryTab] || USE_CASES_BY_TAB.all;

  const filteredVideos = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PORTFOLIO_VIDEOS.filter((v) => {
      if (primaryTab === 'ugc' && !['ugc-commercial', 'affiliate-ugc', 'ads-fnb'].includes(v.category)) return false;
      if (primaryTab === 'promo' && !['cinematic-ads', 'ads-fnb'].includes(v.category)) return false;
      if (primaryTab === 'film' && !DRAMA_CURATED_IDS.has(v.id) && !['micro-drama-movie', 'music-videos'].includes(v.category)) return false;
      if (primaryTab === 'motion' && !['3d-animation', 'experimental-vfx'].includes(v.category)) return false;

      if (useCase === 'drama') {
        if (!DRAMA_CURATED_IDS.has(v.id) && v.category !== 'micro-drama-movie') return false;
      } else if (useCase !== 'all' && v.category !== useCase) {
        return false;
      }

      if (!q) return true;
      const name = formatPortfolioName(v).toLowerCase();
      const cat = (CATEGORY_LABEL[v.category] || v.category || '').toLowerCase();
      return name.includes(q) || cat.includes(q);
    });
  }, [primaryTab, useCase, query]);

  const previewExample = useMemo(
    () => (previewVideo ? buildExampleFromPortfolioVideo(previewVideo) : null),
    [previewVideo],
  );

  const handleUseTemplate = (video) => {
    const ex = buildExampleFromPortfolioVideo(video);
    const fullPrompt = ex.promptExtra ? `${ex.prompt}\n\n${ex.promptExtra}` : ex.prompt;
    setPreviewVideo(null);
    onNavigate?.('director', fullPrompt);
  };

  return (
    <main className="h-full w-full overflow-y-auto bg-white text-[#14141f] px-5 py-7 md:px-8 md:py-7">
      <div className="mx-auto max-w-[1280px]">
        {/* Page Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-[#14141f]">Templates</h1>
            <p className="mt-1 text-[13.5px] text-[#6d6e80]">
              Curated video formats ready to customize with your product, script, or AI Director brief.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate?.('products')}
              className="inline-flex h-[36px] items-center gap-1.5 rounded-full border border-[#e4e5ef] bg-white px-4 text-[13px] font-medium text-[#3c3d4e] transition hover:border-[#cfd0de] hover:bg-[#f4f4f7] hover:text-[#14141f]"
            >
              <span>Manage Products</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate?.('director')}
              className="inline-flex h-[36px] items-center gap-1.5 rounded-full border border-[#dfe0ea] bg-[#f4f4f7] px-4 text-[13px] font-semibold text-[#14141f] transition hover:border-[#cfd0de] hover:bg-[#e9e9f0]"
            >
              <Plus size={14} strokeWidth={2.2} />
              <span>New Template</span>
            </button>
          </div>
        </div>

        {/* All-Apps Style Pill Tab Bar + Inline Search */}
        <section className="mt-6">
          <div className="nx-apps-toolbar">
            <div className="nx-apps-pill-bar" role="tablist" aria-label="Filter templates by category">
              {PRIMARY_TABS.map((t) => {
                const active = primaryTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setPrimaryTab(t.id);
                      setUseCase('all');
                    }}
                    className={`nx-apps-pill-tab${active ? ' is-active' : ''}`}
                  >
                    <span>{t.label}</span>
                    {t.id === 'all' && (
                      <span className="nx-apps-pill-count">{PORTFOLIO_VIDEOS.length}</span>
                    )}
                  </button>
                );
              })}

              <div className="nx-apps-inline-search">
                <Search className="nx-apps-inline-search-icon w-3.5 h-3.5" aria-hidden="true" />
                <label htmlFor="nx-templates-search" className="nx-reference-sr">Search Templates</label>
                <input
                  id="nx-templates-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search Templates"
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

            <span className="text-[12.5px] font-medium text-[#7a7b8c] tabular-nums">
              {filteredVideos.length} templates
            </span>
          </div>

          {/* Secondary Use-Case Pill Bar (matching All Apps pill aesthetic) */}
          <div className="flex flex-wrap items-center gap-1.5">
            {useCases.map((chip) => {
              const active = useCase === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setUseCase(chip.id)}
                  className={`rounded-full px-3 py-1 text-[12px] transition-all ${
                    active
                      ? 'bg-[#ececf3] font-semibold text-[#14141f] border border-[#d8d9e4]'
                      : 'bg-transparent font-medium text-[#656674] border border-[#ececf3] hover:bg-[#f4f4f7] hover:text-[#14141f]'
                  }`}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>

          {/* Poster Grid */}
          {filteredVideos.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-[#e4e4ee] bg-[#fafafc] py-14 text-center">
              <p className="text-[14px] font-medium text-[#5e5e72]">No templates matched your filter.</p>
              <button
                type="button"
                onClick={() => {
                  setPrimaryTab('all');
                  setUseCase('all');
                  setQuery('');
                }}
                className="mt-3 rounded-full border border-[#dcdde8] bg-[#f4f4f7] px-4 py-1.5 text-[12.5px] font-semibold text-[#14141f] transition hover:bg-[#e8e8f0]"
              >
                Reset filters
              </button>
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 pb-10">
              {filteredVideos.map((video, idx) => (
                <TemplateCard
                  key={video.id}
                  video={video}
                  index={idx}
                  onOpen={(v) => {
                    setPreviewReady(false);
                    setPreviewVideo(v);
                  }}
                  prefersReducedMotion={Boolean(prefersReducedMotion)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Template Quick Preview Modal */}
      {portalMounted &&
        createPortal(
          <AnimatePresence>
            {previewVideo && previewExample && (
              <motion.div
                className="nx-example-modal-backdrop"
                role="dialog"
                aria-modal="true"
                aria-label={previewExample.title}
                initial={prefersReducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={prefersReducedMotion ? false : { opacity: 0 }}
                transition={{ duration: 0.16 }}
                onClick={(e) => {
                  if (e.target === e.currentTarget) setPreviewVideo(null);
                }}
              >
                <motion.div
                  className="nx-apps-preview-modal"
                  initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={prefersReducedMotion ? false : { opacity: 0, scale: 0.97, y: 8 }}
                  transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 30 }}
                >
                  <div className="nx-apps-preview-media">
                    {!previewReady && (
                      <div className="nx-modal-buffering" aria-hidden="true">
                        <LoaderGooeyBlobs size={12} color="#7c6bf7" duration={1.4} />
                      </div>
                    )}
                    <VideoPlayer
                      key={previewVideo.id}
                      src={previewVideo.url || getPreviewUrl(previewVideo)}
                      poster={previewVideo.thumbnailUrl}
                      size="full"
                      fit="contain"
                      autoPlay
                      muted
                      loop
                      playsInline
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
                        <span className="nx-apps-preview-cat">
                          {CATEGORY_LABEL[previewVideo.category] || 'Template'}
                        </span>
                        <h3>{previewExample.title}</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPreviewVideo(null)}
                        aria-label="Close preview"
                        className="nx-example-panel-close"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="nx-apps-preview-prompt">{previewExample.prompt}</p>
                    <button
                      type="button"
                      className="nx-example-use-btn"
                      onClick={() => handleUseTemplate(previewVideo)}
                    >
                      <Sparkles className="w-4 h-4 mr-1.5" />
                      <span>Use Template in AI Director</span>
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
