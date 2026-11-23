'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronLeft, ChevronRight, Film, Image as ImageIcon, Sparkles, Video, X } from 'lucide-react';
import HomeComposer from './HomeComposer';
import { NxIcon } from './ui/nx-icon';
import { VideoPlayer } from './ui/video-player';
import { LoaderGooeyBlobs } from './ui/loader-gooey-blobs';
import { Button } from './animate-ui/components/buttons/button';
import {
  DRAMA_CURATED_IDS,
  FILMMAKING_SHOWCASE_CATEGORIES,
  PORTFOLIO_VIDEOS,
  UGC_SHOWCASE_CATEGORIES,
  buildExampleFromPortfolioVideo,
  formatPortfolioName,
  getPreviewUrl,
} from './homeShowcaseVideos';

const HOME_TABS = [
  {
    id: 'ugc',
    label: 'AI Ads & UGC',
    icon: 'chat',
    targetTab: 'video',
    heading: 'Create, produce, and share your next UGC story.',
    placeholder: 'Describe your UGC ad, creator hook, product demo, or social creative...',
    defaultCategory: 'all',
    categories: UGC_SHOWCASE_CATEGORIES,
    interleaveCategories: ['ugc-commercial', 'cinematic-ads', 'affiliate-ugc', 'ads-fnb'],
    typingPrompts: [
      'Create a TikTok UGC product ad with a 3-second pattern-interrupt hook and a sunny kitchen demo...',
      'Turn our skincare bottle photo into a studio-lit 9:16 launch video with macro water droplets...',
      'Clone our top-performing morning coffee creator reel with fresh hooks and auto-captions...',
      'Generate an editorial travertine plinth keyframe for our summer fragrance campaign...',
    ],
  },
  {
    id: 'director',
    label: 'AI Director',
    icon: 'director',
    targetTab: 'director',
    heading: 'Direct drama series, commercials, and multi-scene films.',
    placeholder: 'Describe your campaign brief, scenes, pacing, and visual mood for AI Director...',
    defaultCategory: 'drama',
    categories: FILMMAKING_SHOWCASE_CATEGORIES,
    interleaveCategories: ['micro-drama-movie', 'cinematic-ads', 'experimental-vfx', 'music-videos'],
    typingPrompts: [
      'Direct a tense micro-drama confrontation in a rain-lit hallway with 50mm anamorphic push-in...',
      'Create a 20-second 9:16 F&B commercial with macro ice pour, hook, and voiceover...',
      'Shoot a 35mm twilight establishing shot with volumetric fog and slow dolly motion...',
      'Assemble a three-act cinematic trailer montage with golden-hour crane rise...',
    ],
  },
  {
    id: 'motion',
    label: 'AI Motion',
    icon: 'motion',
    targetTab: 'motion',
    heading: 'Design animated explainers and motion stories from chat.',
    placeholder: 'Describe the animated explainer, educational video, or promo motion you want...',
    defaultCategory: '3d-animation',
    categories: FILMMAKING_SHOWCASE_CATEGORIES,
    interleaveCategories: ['3d-animation', 'experimental-vfx', 'cinematic-ads'],
    typingPrompts: [
      'A 30-second editorial explainer video on how AI works with engaging kinetic illustrations...',
      'Weekend iced brown-sugar latte 20% off promo with energetic typography and motion...',
      'Animated SaaS product launch teaser with crisp kinetic typography and clean transitions...',
      'Short illustrated story about building daily creative habits, warm narration...',
    ],
  },
  {
    id: 'canvas',
    label: 'Canvas AI Filmmaking',
    icon: 'canvas',
    targetTab: 'canvas',
    heading: 'Build visual filmmaking workflows on an infinite node canvas.',
    placeholder: 'Start a multi-step node workflow or open Canvas AI Filmmaking...',
    defaultCategory: 'experimental-vfx',
    categories: FILMMAKING_SHOWCASE_CATEGORIES,
    interleaveCategories: ['experimental-vfx', 'micro-drama-movie', '3d-animation', 'cinematic-ads'],
    typingPrompts: [
      'Chain a character sheet, environment keyframe, and 3 camera-angle video nodes on Canvas...',
      'Build a reusable multi-shot product ad workflow from one packshot image...',
      'Storyboard a sci-fi sequence with linked lighting references and motion passes...',
    ],
  },
  {
    id: 'ai-influencer',
    label: 'AI Influencer',
    icon: 'ai-influencer',
    targetTab: 'ai-influencer',
    heading: 'Build consistent virtual creators and talking brand avatars.',
    placeholder: 'Describe your virtual creator look, outfit, studio backdrop, and vibe...',
    defaultCategory: 'ugc-commercial',
    categories: UGC_SHOWCASE_CATEGORIES,
    interleaveCategories: ['ugc-commercial', 'affiliate-ugc', 'cinematic-ads'],
    typingPrompts: [
      'Friendly Indonesian female beauty creator in a bright sunlit bedroom holding a skincare bottle...',
      'Energetic tech reviewer in a modern minimalist desk setup with soft key lighting...',
      'Lifestyle coffee host presenting a morning cold-brew routine in a sunlit cafe...',
    ],
  },
];

const CLASSIC_FEATURES = [
  {
    id: 'video',
    title: 'Video Studio',
    description: 'Turn text or product photos into 1080p AI clips.',
    icon: Video,
    toneClass: 'is-sky',
  },
  {
    id: 'image',
    title: 'Image Studio',
    description: 'Generate studio product shots & campaign keyframes.',
    icon: ImageIcon,
    toneClass: 'is-violet',
  },
  {
    id: 'cinema',
    title: 'Cinema Studio',
    description: 'Direct widescreen shots & cinematic camera lighting.',
    icon: Film,
    toneClass: 'is-amber',
  },
];

const RAIL_LIMIT = 16;

const ShowcaseCard = memo(function ShowcaseCard({
  video,
  index,
  onOpen,
  onBroken,
  pausePlayback,
}) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const videoElRef = useRef(null);

  const title = useMemo(() => formatPortfolioName(video), [video]);
  const previewUrl = useMemo(() => getPreviewUrl(video), [video]);
  const cardRatio = useMemo(() => {
    const raw =
      video.thumbWidth && video.thumbHeight
        ? video.thumbWidth / video.thumbHeight
        : video.isPortrait
          ? 9 / 16
          : 16 / 9;
    return Number(Math.min(Math.max(raw, 0.56), 1.82).toFixed(4));
  }, [video.thumbWidth, video.thumbHeight, video.isPortrait]);

  const tryPlayVideo = useCallback((el) => {
    if (!el) return;
    el.muted = true;
    el.defaultMuted = true;
    el.playsInline = true;
    const p = el.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {});
    }
  }, []);

  const shouldMountVideo = Boolean(previewUrl) && isHovered;
  const shouldPlayVideo = shouldMountVideo && !pausePlayback;

  useEffect(() => {
    const el = videoElRef.current;
    if (!el) return;
    if (shouldPlayVideo) {
      tryPlayVideo(el);
    } else {
      try {
        el.pause();
      } catch {
        // Ignore pause errors on unmounted nodes.
      }
    }
  }, [shouldPlayVideo, previewUrl, tryPlayVideo]);

  useEffect(() => {
    return () => {
      const el = videoElRef.current;
      if (!el) return;
      try {
        el.pause();
        el.removeAttribute('src');
        el.load();
      } catch {
        // Ignore cleanup errors on unmounted media nodes.
      }
    };
  }, []);

  const handleCardKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen(index);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={`nx-reel-card${isHovered ? ' is-hovered' : ''}`}
      style={{ '--card-ratio': cardRatio }}
      aria-haspopup="dialog"
      aria-label={title}
      onClick={() => onOpen(index)}
      onKeyDown={handleCardKeyDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <span className={`nx-reel-media${video.isPortrait ? ' is-portrait' : ' is-landscape'}`}>
        {!imgLoaded && (
          <span className="nx-skel nx-showcase-media-skel" aria-hidden="true" />
        )}
        <img
          src={video.thumbnailUrl}
          alt={title}
          width={video.thumbWidth || 640}
          height={video.thumbHeight || 1138}
          loading={index < 5 ? 'eager' : 'lazy'}
          decoding="async"
          className={imgLoaded ? 'is-loaded' : 'is-loading'}
          onLoad={(event) => {
            const img = event.currentTarget;
            if (!img.naturalWidth || !img.naturalHeight) {
              onBroken?.(video.id);
              return;
            }
            setImgLoaded(true);
          }}
          onError={() => onBroken?.(video.id)}
        />

        {shouldMountVideo && (
          <video
            ref={videoElRef}
            src={previewUrl}
            poster={video.thumbnailUrl}
            muted
            loop
            playsInline
            autoPlay={!pausePlayback}
            preload="auto"
            aria-hidden="true"
            className={`nx-showcase-hover-video${videoReady ? ' is-ready' : ''}`}
            onLoadedData={(event) => {
              if (!pausePlayback) tryPlayVideo(event.currentTarget);
              setVideoReady(true);
            }}
            onCanPlay={(event) => {
              if (!pausePlayback) tryPlayVideo(event.currentTarget);
              setVideoReady(true);
            }}
            onPlaying={() => setVideoReady(true)}
            onTimeUpdate={(event) => {
              if (!videoReady && event.currentTarget.currentTime > 0) {
                setVideoReady(true);
              }
            }}
          />
        )}

        <span className="nx-reel-hover-scrim" aria-hidden="true">
          <span className="nx-reel-recreate-pill">
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Recreate</span>
          </span>
        </span>

        {shouldPlayVideo && !videoReady && isHovered && (
          <span className="nx-reel-buffering-bar" aria-hidden="true" />
        )}
      </span>

      <span className="nx-reel-caption">
        <span className="nx-reel-title">{title}</span>
      </span>
    </div>
  );
});

export default function StudioHome({ onNavigate, onCreate, initialPrompt = '', onPromptConsumed }) {
  const prefersReducedMotion = useReducedMotion();
  const [portalMounted, setPortalMounted] = useState(false);
  const [activeHomeTab, setActiveHomeTab] = useState('ugc');
  const [activeCategory, setActiveCategory] = useState('all');
  const [brokenIds, setBrokenIds] = useState(() => new Set());
  const [mode, setMode] = useState('video');
  const [prompt, setPrompt] = useState('');
  const [modalState, setModalState] = useState(null);
  const [modalMediaReady, setModalMediaReady] = useState(false);
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [approvedMap, setApprovedMap] = useState({});
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const homeRef = useRef(null);
  const promptRef = useRef(null);
  const railRef = useRef(null);
  const scrollRafRef = useRef(0);

  useEffect(() => {
    setPortalMounted(true);
  }, []);

  useEffect(() => {
    if (!initialPrompt) return;
    setPrompt(initialPrompt);
    onPromptConsumed?.();
    window.requestAnimationFrame(() => {
      promptRef.current?.focus({ preventScroll: true });
    });
  }, [initialPrompt, onPromptConsumed]);

  const currentTab = HOME_TABS.find((tab) => tab.id === activeHomeTab) || HOME_TABS[0];

  const markBroken = useCallback((videoId) => {
    setBrokenIds((prev) => {
      if (prev.has(videoId)) return prev;
      const next = new Set(prev);
      next.add(videoId);
      return next;
    });
  }, []);

  const showcaseVideos = useMemo(() => {
    const valid = PORTFOLIO_VIDEOS.filter((v) => !brokenIds.has(v.id));

    if (activeCategory === 'drama') {
      const dramaOrder = Array.from(DRAMA_CURATED_IDS);
      return valid
        .filter((v) => DRAMA_CURATED_IDS.has(v.id))
        .sort((a, b) => dramaOrder.indexOf(a.id) - dramaOrder.indexOf(b.id))
        .slice(0, RAIL_LIMIT);
    }

    if (activeCategory !== 'all') {
      return valid.filter((v) => v.category === activeCategory).slice(0, RAIL_LIMIT);
    }

    const tabCats = currentTab.interleaveCategories;
    const buckets = tabCats.map((cat) => valid.filter((v) => v.category === cat));
    const interleaved = [];
    let round = 0;
    while (interleaved.length < RAIL_LIMIT) {
      let added = false;
      for (const bucket of buckets) {
        if (bucket[round]) {
          interleaved.push(bucket[round]);
          added = true;
          if (interleaved.length >= RAIL_LIMIT) break;
        }
      }
      if (!added) break;
      round += 1;
    }
    return interleaved;
  }, [activeCategory, brokenIds, currentTab.interleaveCategories]);

  const updateScrollButtons = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const nextLeft = el.scrollLeft > 4;
    const nextRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 8;
    setCanScrollLeft((prev) => (prev === nextLeft ? prev : nextLeft));
    setCanScrollRight((prev) => (prev === nextRight ? prev : nextRight));
  }, []);

  const handleRailScroll = useCallback(() => {
    if (scrollRafRef.current) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = 0;
      updateScrollButtons();
    });
  }, [updateScrollButtons]);

  useEffect(() => {
    const el = railRef.current;
    if (!el) return undefined;
    el.scrollTo({ left: 0, behavior: 'auto' });
    const rafId = window.requestAnimationFrame(() => updateScrollButtons());
    const onResize = () => updateScrollButtons();
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      window.cancelAnimationFrame(rafId);
      if (scrollRafRef.current) {
        window.cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = 0;
      }
      window.removeEventListener('resize', onResize);
    };
  }, [activeHomeTab, activeCategory, showcaseVideos.length, updateScrollButtons]);

  const scrollRail = (direction) => {
    const el = railRef.current;
    if (!el) return;
    const step = Math.max(el.clientWidth * 0.72, 320);
    el.scrollBy({ left: direction * step, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  };

  const scrollToComposer = useCallback(() => {
    window.requestAnimationFrame(() => {
      if (homeRef.current && homeRef.current.scrollTop > 16) {
        homeRef.current.scrollTo({
          top: 0,
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
        });
      }
      promptRef.current?.focus({ preventScroll: true });
    });
  }, [prefersReducedMotion]);

  const activeModalList = modalState?.items || [];
  const activeModalIndex = modalState ? modalState.index : null;
  const activeModalExample =
    modalState && activeModalList.length
      ? activeModalList[(modalState.index + activeModalList.length) % activeModalList.length]
      : null;

  const modalThumbsWindow = useMemo(() => {
    if (!activeModalList.length || activeModalIndex === null) return [];
    const maxThumbs = 10;
    if (activeModalList.length <= maxThumbs) {
      return activeModalList.map((item, idx) => ({ item, idx }));
    }
    const half = Math.floor(maxThumbs / 2);
    let start = Math.max(0, activeModalIndex - half);
    if (start + maxThumbs > activeModalList.length) {
      start = Math.max(0, activeModalList.length - maxThumbs);
    }
    return activeModalList.slice(start, start + maxThumbs).map((item, offset) => ({
      item,
      idx: start + offset,
    }));
  }, [activeModalList, activeModalIndex]);

  const openVideoModal = useCallback((index) => {
    const items = showcaseVideos.map((video) => buildExampleFromPortfolioVideo(video));
    setPromptExpanded(false);
    setModalMediaReady(false);
    setModalState({ items, index });
  }, [showcaseVideos]);

  const closeExampleModal = useCallback(() => {
    setModalState(null);
    setPromptExpanded(false);
    setModalMediaReady(false);
  }, []);

  const stepModalExample = useCallback((delta) => {
    setPromptExpanded(false);
    setModalMediaReady(false);
    setModalState((prev) => {
      if (!prev || !prev.items.length) return prev;
      return {
        ...prev,
        index: (prev.index + delta + prev.items.length) % prev.items.length,
      };
    });
  }, []);

  const selectModalIndex = (idx) => {
    setPromptExpanded(false);
    setModalMediaReady(false);
    setModalState((prev) => (prev ? { ...prev, index: idx } : prev));
  };

  useEffect(() => {
    if (!modalState) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeExampleModal();
      } else if (event.key === 'ArrowLeft' && !event.target?.closest?.('[data-video-player]')) {
        event.preventDefault();
        stepModalExample(-1);
      } else if (event.key === 'ArrowRight' && !event.target?.closest?.('[data-video-player]')) {
        event.preventDefault();
        stepModalExample(1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalState, closeExampleModal, stepModalExample]);

  const applyPromptToComposer = useCallback((example) => {
    if (!example) return;
    const nextMode = example.kind === 'image' ? 'image' : 'video';
    setMode(nextMode);
    const fullPrompt = example.promptExtra
      ? `${example.prompt}\n\n${example.promptExtra}`
      : example.prompt;
    setPrompt(fullPrompt);
    closeExampleModal();
    scrollToComposer();
  }, [closeExampleModal, scrollToComposer]);

  const toggleActionApproval = (actionKey) => {
    setApprovedMap((prev) => ({
      ...prev,
      [actionKey]: !prev[actionKey],
    }));
  };

  const modalVideoSrc = activeModalExample?.videoUrl || activeModalExample?.previewUrl || '';

  const modalPortal = portalMounted
    ? createPortal(
        <AnimatePresence>
          {activeModalExample && (
            <motion.div
              key="showcase-modal-backdrop"
              className="nx-example-modal-backdrop"
              role="dialog"
              aria-modal="true"
              aria-labelledby="nx-example-modal-title"
              initial={prefersReducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={prefersReducedMotion ? false : { opacity: 0 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              onClick={(event) => {
                if (event.target === event.currentTarget) closeExampleModal();
              }}
            >
              <motion.div
                className="nx-example-modal"
                initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={prefersReducedMotion ? false : { opacity: 0, scale: 0.97, y: 8 }}
                transition={
                  prefersReducedMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 380, damping: 32 }
                }
              >
                <div className="nx-example-modal-stage">
                  <div className="nx-example-modal-counter">
                    {String(activeModalIndex + 1).padStart(2, '0')} / {String(activeModalList.length).padStart(2, '0')}
                  </div>

                  <div className="nx-example-modal-viewer">
                    <Button
                      variant="outline"
                      size="icon"
                      className="nx-example-modal-nav is-prev"
                      aria-label="Previous showcase"
                      onClick={() => stepModalExample(-1)}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>

                    <div
                      data-video-player="true"
                      className={`nx-example-modal-frame${activeModalExample.isPortrait ? ' is-portrait' : ' is-landscape'}`}
                    >
                      {!modalMediaReady && (
                        <div className="nx-modal-buffering" aria-hidden="true">
                          <LoaderGooeyBlobs size={12} color="#7c6bf7" duration={1.4} />
                        </div>
                      )}
                      {modalVideoSrc ? (
                        <VideoPlayer
                          key={activeModalExample.id}
                          src={modalVideoSrc}
                          poster={activeModalExample.image}
                          size="full"
                          fit="contain"
                          autoPlay
                          muted
                          loop
                          playsInline
                          preload="auto"
                          className={`nx-custom-video-player${modalMediaReady ? ' is-ready' : ''}`}
                          onLoadedData={() => setModalMediaReady(true)}
                          onCanPlay={() => setModalMediaReady(true)}
                          onPlaying={() => setModalMediaReady(true)}
                          onError={() => setModalMediaReady(true)}
                        />
                      ) : (
                        <img
                          src={activeModalExample.image}
                          alt={activeModalExample.title}
                          width={activeModalExample.width}
                          height={activeModalExample.height}
                          onLoad={() => setModalMediaReady(true)}
                          onError={() => setModalMediaReady(true)}
                        />
                      )}
                    </div>

                    <Button
                      variant="outline"
                      size="icon"
                      className="nx-example-modal-nav is-next"
                      aria-label="Next showcase"
                      onClick={() => stepModalExample(1)}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="nx-example-modal-thumbs" role="tablist" aria-label="Showcase thumbnails">
                    {modalThumbsWindow.map(({ item, idx }) => {
                      const isCurrent = idx === activeModalIndex;
                      return (
                        <button
                          key={`thumb-${item.id}`}
                          type="button"
                          role="tab"
                          aria-selected={isCurrent}
                          aria-label={`Preview ${item.title}`}
                          className={`nx-example-modal-thumb${isCurrent ? ' is-active' : ''}`}
                          onClick={() => selectModalIndex(idx)}
                        >
                          <img
                            src={item.image}
                            alt={item.title}
                            width={item.width}
                            height={item.height}
                            loading="lazy"
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <aside className="nx-example-modal-panel">
                  <div className="nx-example-panel-head">
                    <div className="nx-example-panel-icon">
                      <NxIcon name={activeModalExample.icon || currentTab.icon} size={18} />
                    </div>
                    <div className="nx-example-panel-titles">
                      <h3 id="nx-example-modal-title">{activeModalExample.title}</h3>
                      <p>{activeModalExample.subtitle}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="nx-example-panel-close"
                      aria-label="Close showcase preview"
                      onClick={closeExampleModal}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="nx-example-panel-body">
                    <div className="nx-example-prompt-bubble">
                      <p>{activeModalExample.prompt}</p>
                      {activeModalExample.promptExtra && (
                        <>
                          <p className="nx-example-prompt-extra">
                            {promptExpanded
                              ? activeModalExample.promptExtra
                              : `${activeModalExample.promptExtra.slice(0, 64)}...`}
                          </p>
                          <button
                            type="button"
                            className="nx-example-prompt-more"
                            onClick={() => setPromptExpanded((prev) => !prev)}
                          >
                            {promptExpanded ? 'Show less' : 'Show more'}
                          </button>
                        </>
                      )}
                    </div>

                    {activeModalExample.assistantLead && (
                      <div className="nx-example-assistant-copy">
                        <p>{activeModalExample.assistantLead}</p>
                      </div>
                    )}

                    {activeModalExample.actions?.length > 0 && (
                      <div className="nx-example-action-card">
                        <div className="nx-example-action-head">
                          <NxIcon name="bolt" size={14} />
                          <span>{activeModalExample.actionHeader || 'Production plan · 3 passes'}</span>
                        </div>
                        <div className="nx-example-action-list">
                          {activeModalExample.actions.map((action, actionIdx) => {
                            const actionKey = `${activeModalExample.id}-${actionIdx}`;
                            const isApproved = Boolean(approvedMap[actionKey]);
                            return (
                              <div key={actionKey} className="nx-example-action-row">
                                <div className="nx-example-action-text">
                                  <strong>{action.title}</strong>
                                  <span>{action.meta}</span>
                                </div>
                                <Button
                                  size="sm"
                                  variant={isApproved ? 'subtle' : 'dark'}
                                  className={`nx-example-action-btn${isApproved ? ' is-approved' : ''}`}
                                  onClick={() => toggleActionApproval(actionKey)}
                                >
                                  {isApproved ? 'Approved' : 'Approve'}
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="nx-example-panel-foot">
                    <Button
                      size="lg"
                      className="nx-example-use-btn"
                      onClick={() => applyPromptToComposer(activeModalExample)}
                    >
                      <Sparkles className="w-4 h-4" aria-hidden="true" />
                      <span>Recreate</span>
                    </Button>
                  </div>
                </aside>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )
    : null;

  return (
    <main id="studio-home" ref={homeRef} className="nx-dashboard">
      <section className="nx-dashboard-hero" aria-labelledby="suite-home-title">
        <div data-tour="home-mode-tabs" className="nx-home-tabs" role="tablist" aria-label="Production mode">
          {HOME_TABS.map((tab) => {
            const selected = tab.id === currentTab.id;
            return (
              <motion.button
                key={tab.id}
                type="button"
                role="tab"
                id={`nx-home-tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`nx-home-panel-${tab.id}`}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
                onClick={() => {
                  setActiveHomeTab(tab.id);
                  setActiveCategory(tab.defaultCategory);
                  setModalState(null);
                }}
                className={`nx-home-tab${selected ? ' is-active' : ''}`}
              >
                {selected && (
                  <motion.span
                    layoutId="nx-home-tab-pill"
                    aria-hidden="true"
                    className="nx-home-tab-pill"
                    transition={
                      prefersReducedMotion
                        ? { duration: 0 }
                        : { type: 'spring', stiffness: 420, damping: 32 }
                    }
                  />
                )}
                <span className="nx-home-tab-inner">
                  <NxIcon name={tab.icon} size={18} />
                  <span>{tab.label}</span>
                </span>
              </motion.button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          <motion.h1
            key={currentTab.id}
            id="suite-home-title"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            {currentTab.heading}
          </motion.h1>
        </AnimatePresence>

        <HomeComposer
          mode={mode}
          setMode={setMode}
          prompt={prompt}
          setPrompt={setPrompt}
          promptRef={promptRef}
          onCreate={(selectedMode, text, files, modelId) => {
            if (currentTab.id === 'director' && !files.length) return onCreate('director', text, files, modelId);
            if (currentTab.id === 'motion' && !files.length) {
              onNavigate?.('motion', text);
              return true;
            }
            if (currentTab.id === 'canvas' && !files.length) {
              onNavigate?.('canvas', text);
              return true;
            }
            if (currentTab.id === 'ai-influencer' && !files.length) {
              onNavigate?.('ai-influencer', text);
              return true;
            }
            return onCreate(selectedMode, text, files, modelId);
          }}
          placeholder={currentTab.placeholder}
          typingPrompts={currentTab.typingPrompts}
        />

        {/* Classic Feature Quick Cards right below the composer (Matching Image 5) */}
        <div className="nx-home-classic-row" aria-label="Classic Studios">
          {CLASSIC_FEATURES.map((item) => {
            const IconComp = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate?.(item.id)}
                className="nx-home-classic-card"
              >
                <span className={`nx-home-classic-icon ${item.toneClass}`} aria-hidden="true">
                  <IconComp size={18} strokeWidth={1.9} />
                </span>
                <span className="nx-home-classic-copy">
                  <strong>{item.title}</strong>
                  <span>{item.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section
        id={`nx-home-panel-${currentTab.id}`}
        data-tour="home-showcase"
        role="tabpanel"
        aria-labelledby={`nx-home-tab-${currentTab.id}`}
        className="nx-dashboard-section nx-reel-section"
      >
        <div className="nx-reel-head">
          <h2 id="nx-workflows-title">Showcase</h2>

          <div className="nx-reel-filters" role="tablist" aria-label="Showcase categories">
            {currentTab.categories.map((category) => {
              const isActive = activeCategory === category.id;
              return (
                <button
                  key={`${currentTab.id}-${category.id}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`nx-reel-chip${isActive ? ' is-active' : ''}`}
                  onClick={() => setActiveCategory(category.id)}
                >
                  {isActive && (
                    <motion.span
                      layoutId={`nx-reel-cat-pill-${currentTab.id}`}
                      aria-hidden="true"
                      className="nx-reel-chip-bg"
                      transition={
                        prefersReducedMotion
                          ? { duration: 0 }
                          : { type: 'spring', stiffness: 430, damping: 32 }
                      }
                    />
                  )}
                  <span className="nx-reel-chip-label">{category.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="nx-reel-rail-wrap">
          <AnimatePresence>
            {canScrollLeft && (
              <motion.div
                key="rail-left"
                className="nx-rail-edge-slot is-left"
                initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.88 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={prefersReducedMotion ? false : { opacity: 0, scale: 0.88 }}
                transition={{ duration: 0.14 }}
              >
                <Button
                  variant="outline"
                  size="icon"
                  className="nx-rail-edge-btn"
                  aria-label="Scroll showcase left"
                  onClick={() => scrollRail(-1)}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          <div
            ref={railRef}
            className="nx-reel-track"
            onScroll={handleRailScroll}
          >
            {showcaseVideos.map((video, index) => (
              <ShowcaseCard
                key={`${activeHomeTab}-${activeCategory}-${video.id}`}
                video={video}
                index={index}
                onOpen={openVideoModal}
                onBroken={markBroken}
                pausePlayback={Boolean(modalState)}
              />
            ))}
          </div>

          <AnimatePresence>
            {canScrollRight && (
              <motion.div
                key="rail-right"
                className="nx-rail-edge-slot is-right"
                initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.88 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={prefersReducedMotion ? false : { opacity: 0, scale: 0.88 }}
                transition={{ duration: 0.14 }}
              >
                <Button
                  variant="outline"
                  size="icon"
                  className="nx-rail-edge-btn"
                  aria-label="Scroll showcase right"
                  onClick={() => scrollRail(1)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {modalPortal}
    </main>
  );
}
