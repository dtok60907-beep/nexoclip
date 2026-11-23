'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronLeft, ChevronRight, Sparkles, X } from 'lucide-react';
import { NxIcon } from '../ui/nx-icon';
import { VideoPlayer } from '../ui/video-player';
import { LoaderGooeyBlobs } from '../ui/loader-gooey-blobs';
import { Button } from '../animate-ui/components/buttons/button';
import {
  DRAMA_CURATED_IDS,
  PORTFOLIO_VIDEOS,
  buildExampleFromPortfolioVideo,
  formatPortfolioName,
  getPreviewUrl,
} from '../homeShowcaseVideos';

const DIRECTOR_SHOWCASE_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'cinematic-ads', label: 'Cinematic Ads' },
  { id: 'ugc-commercial', label: 'UGC' },
  { id: 'affiliate-ugc', label: 'Affiliate' },
  { id: 'ads-fnb', label: 'Food & Drink' },
  { id: 'drama', label: 'Drama' },
  { id: '3d-animation', label: '3D & Anime' },
  { id: 'experimental-vfx', label: 'Sci-Fi & VFX' },
];

const INTERLEAVE_CATEGORIES = ['ugc-commercial', 'cinematic-ads', 'affiliate-ugc', 'ads-fnb', '3d-animation'];
const RAIL_LIMIT = 16;

const ShowcaseCard = memo(function ShowcaseCard({
  video,
  index,
  onOpen,
  onBroken,
  pausePlayback,
  prefersReducedMotion,
}) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [isVisible, setIsVisible] = useState(index < 5);
  const [isHovered, setIsHovered] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const cardRef = useRef(null);
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

  useEffect(() => {
    const node = cardRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { rootMargin: '80px 220px', threshold: 0.05 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const shouldMountVideo = Boolean(previewUrl) && (isVisible || isHovered) && (!prefersReducedMotion || isHovered);
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
      ref={cardRef}
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
        {!imgLoaded && <span className="nx-skel nx-showcase-media-skel" aria-hidden="true" />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
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
            preload={index < 5 ? 'auto' : 'metadata'}
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

        {shouldPlayVideo && !videoReady && isHovered && <span className="nx-reel-buffering-bar" aria-hidden="true" />}
      </span>

      <span className="nx-reel-caption">
        <span className="nx-reel-title">{title}</span>
      </span>
    </div>
  );
});

export default function DirectorShowcase({ onRecreate }) {
  const prefersReducedMotion = useReducedMotion();
  const [portalMounted, setPortalMounted] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
  const [brokenIds, setBrokenIds] = useState(() => new Set());
  const [modalState, setModalState] = useState(null);
  const [modalMediaReady, setModalMediaReady] = useState(false);
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [approvedMap, setApprovedMap] = useState({});
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const railRef = useRef(null);
  const scrollRafRef = useRef(0);

  useEffect(() => {
    setPortalMounted(true);
  }, []);

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

    const buckets = INTERLEAVE_CATEGORIES.map((cat) => valid.filter((v) => v.category === cat));
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
  }, [activeCategory, brokenIds]);

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
  }, [activeCategory, showcaseVideos.length, updateScrollButtons]);

  const scrollRail = (direction) => {
    const el = railRef.current;
    if (!el) return;
    const step = Math.max(el.clientWidth * 0.72, 320);
    el.scrollBy({ left: direction * step, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  };

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

  const openVideoModal = useCallback(
    (index) => {
      const items = showcaseVideos.map((video) => buildExampleFromPortfolioVideo(video));
      setPromptExpanded(false);
      setModalMediaReady(false);
      setModalState({ items, index });
    },
    [showcaseVideos],
  );

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

  const handleUseExample = useCallback(
    (example) => {
      if (!example) return;
      const fullPrompt = example.promptExtra
        ? `${example.prompt}\n\n${example.promptExtra}`
        : example.prompt;
      closeExampleModal();
      onRecreate?.(fullPrompt);
    },
    [closeExampleModal, onRecreate],
  );

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
              key="dr-showcase-modal-backdrop"
              className="nx-example-modal-backdrop"
              role="dialog"
              aria-modal="true"
              aria-labelledby="nx-dr-example-modal-title"
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
                        // eslint-disable-next-line @next/next/no-img-element
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
                          key={`dr-thumb-${item.id}`}
                          type="button"
                          role="tab"
                          aria-selected={isCurrent}
                          aria-label={`Preview ${item.title}`}
                          className={`nx-example-modal-thumb${isCurrent ? ' is-active' : ''}`}
                          onClick={() => selectModalIndex(idx)}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
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
                      <NxIcon name={activeModalExample.icon || 'director'} size={18} />
                    </div>
                    <div className="nx-example-panel-titles">
                      <h3 id="nx-dr-example-modal-title">{activeModalExample.title}</h3>
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
                      onClick={() => handleUseExample(activeModalExample)}
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
    <>
      <section data-tour="director-examples" className="nx-reel-section dr-reel-section" aria-labelledby="dr-showcase-title">
        <div className="nx-reel-head">
          <h2 id="dr-showcase-title">Showcase</h2>

          <div className="nx-reel-filters" role="tablist" aria-label="Showcase categories">
            {DIRECTOR_SHOWCASE_CATEGORIES.map((category) => {
              const isActive = activeCategory === category.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`nx-reel-chip${isActive ? ' is-active' : ''}`}
                  onClick={() => setActiveCategory(category.id)}
                >
                  {isActive && (
                    <motion.span
                      layoutId="dr-reel-cat-pill"
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
                key="dr-rail-left"
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

          <div ref={railRef} className="nx-reel-track" onScroll={handleRailScroll}>
            {showcaseVideos.map((video, index) => (
              <ShowcaseCard
                key={`${activeCategory}-${video.id}`}
                video={video}
                index={index}
                onOpen={openVideoModal}
                onBroken={markBroken}
                pausePlayback={Boolean(modalState)}
                prefersReducedMotion={Boolean(prefersReducedMotion)}
              />
            ))}
          </div>

          <AnimatePresence>
            {canScrollRight && (
              <motion.div
                key="dr-rail-right"
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
    </>
  );
}
