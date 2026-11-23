'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Download,
  ExternalLink,
  Film,
  Image as ImageIcon,
  Images,
  Music,
  Play,
  Search,
  Volume2,
  X,
} from 'lucide-react';
import { NxCardGridSkeleton } from './ui/nx-loading';

const MEDIA_TABS = [
  { id: 'all', label: 'All Media' },
  { id: 'image', label: 'Images' },
  { id: 'video', label: 'Videos' },
  { id: 'audio', label: 'Audio' },
];

const TYPE_LABEL = {
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
};

const formatDate = (value) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
};

const MediaCard = memo(function MediaCard({ item, onPreview, prefersReducedMotion }) {
  const [hovered, setHovered] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const videoRef = useRef(null);

  const tryPlay = useCallback((el) => {
    if (!el) return;
    el.muted = true;
    el.defaultMuted = true;
    el.playsInline = true;
    const p = el.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }, []);

  useEffect(() => {
    if (item.type !== 'video') return;
    const el = videoRef.current;
    if (!el) return;
    if (hovered && !prefersReducedMotion) {
      tryPlay(el);
    } else {
      try {
        el.pause();
        el.currentTime = 0;
      } catch {
        // Ignore pause errors
      }
    }
  }, [hovered, item.type, prefersReducedMotion, tryPlay]);

  const dateLabel = formatDate(item.created_at || item.updated_at);

  return (
    <article
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="group flex flex-col overflow-hidden rounded-xl border border-[#e6e7ef] bg-white transition hover:border-[#cfd0de] hover:shadow-[0_12px_26px_-14px_rgba(16,16,32,0.14)]"
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => onPreview(item)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onPreview(item);
          }
        }}
        className="relative grid aspect-video w-full place-items-center overflow-hidden bg-[#f4f5f8] cursor-pointer"
      >
        {item.type === 'image' ? (
          <img
            src={item.url}
            alt={item.filename || 'Workspace image'}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : item.type === 'video' ? (
          videoFailed ? (
            <div className="flex flex-col items-center gap-1.5 text-[#8a8b9e]">
              <Film size={24} strokeWidth={1.6} />
              <span className="text-[11.5px]">Preview unavailable</span>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                src={`${item.url.split('#')[0]}#t=0.1`}
                muted
                loop
                playsInline
                preload="metadata"
                aria-label={`Preview of ${item.filename}`}
                onError={() => setVideoFailed(true)}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              />
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute grid h-9 w-9 place-items-center rounded-full bg-white/90 text-[#14141f] shadow-md backdrop-blur-sm transition-opacity duration-200 ${
                  hovered && !prefersReducedMotion ? 'opacity-0' : 'opacity-100'
                }`}
              >
                <Play size={14} fill="currentColor" className="translate-x-[1px]" />
              </span>
            </>
          )
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2.5 bg-gradient-to-br from-[#f6f6fa] to-[#ececf3] text-[#4c4d5e]">
            <span className="grid h-11 w-11 place-items-center rounded-xl border border-[#e2e3ec] bg-white shadow-xs">
              <Music size={20} strokeWidth={1.8} />
            </span>
            <div className="flex items-end gap-1" aria-hidden="true">
              {[10, 18, 13, 22, 15, 19, 11].map((h, i) => (
                <span
                  key={i}
                  className="w-[3px] rounded-full bg-[#b8b9c8]"
                  style={{ height: `${h}px` }}
                />
              ))}
            </div>
          </div>
        )}

        <span className="absolute left-2.5 top-2.5 rounded-md bg-white/90 px-2 py-0.5 text-[10.5px] font-medium text-[#14141f] backdrop-blur-sm">
          {TYPE_LABEL[item.type] || 'Asset'}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-3.5">
        <small className="text-[11.5px] text-[#7a7b8c]">
          {TYPE_LABEL[item.type] || 'Asset'}
          {dateLabel ? ` · ${dateLabel}` : ''}
        </small>
        <h3
          className="mt-0.5 truncate text-[13.5px] font-semibold text-[#14141f]"
          title={item.filename}
        >
          {item.filename || 'Untitled asset'}
        </h3>
      </div>

      <div className="mt-auto flex items-center gap-1.5 border-t border-[#f1f1f6] px-3.5 py-2.5">
        <button
          type="button"
          onClick={() => onPreview(item)}
          className="flex-1 inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-[#dfe0ea] bg-[#f4f4f7] px-3 text-[12px] font-semibold text-[#14141f] transition hover:border-[#cfd0de] hover:bg-[#e9e9f0]"
        >
          <span>Preview</span>
        </button>
        <a
          href={item.url}
          download={item.filename || undefined}
          aria-label={`Download ${item.filename}`}
          title="Download"
          className="grid h-8 w-8 place-items-center rounded-lg border border-[#e5e5ee] bg-white text-[#5c5d70] transition hover:border-[#cfd0de] hover:bg-[#f6f6fa] hover:text-[#14141f]"
        >
          <Download size={13} />
        </a>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${item.filename} in new tab`}
          title="Open in new tab"
          className="grid h-8 w-8 place-items-center rounded-lg border border-[#e5e5ee] bg-white text-[#5c5d70] transition hover:border-[#cfd0de] hover:bg-[#f6f6fa] hover:text-[#14141f]"
        >
          <ExternalLink size={13} />
        </a>
      </div>
    </article>
  );
});

export default function WorkspaceLibrary({ kind, data, authStatus, onSignIn, selection }) {
  const prefersReducedMotion = useReducedMotion();
  const [mediaType, setMediaType] = useState('all');
  const [search, setSearch] = useState('');
  const [order, setOrder] = useState('newest');
  const [previewItem, setPreviewItem] = useState(null);
  const [portalMounted, setPortalMounted] = useState(false);

  useEffect(() => {
    setPortalMounted(true);
  }, []);

  useEffect(() => {
    if (!previewItem) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setPreviewItem(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewItem]);

  const projects = kind === 'projects';
  const rawItems = useMemo(() => (Array.isArray(data?.[kind]) ? data[kind] : []), [data, kind]);

  const counts = useMemo(() => {
    const map = { all: rawItems.length, image: 0, video: 0, audio: 0 };
    for (const item of rawItems) {
      if (item.type && map[item.type] !== undefined) map[item.type] += 1;
    }
    return map;
  }, [rawItems]);

  const visibleItems = useMemo(() => {
    if (projects) return rawItems;
    const q = search.trim().toLowerCase();
    const list = rawItems.filter((item) => {
      if (mediaType !== 'all' && item.type !== mediaType) return false;
      if (!q) return true;
      return (item.filename || '').toLowerCase().includes(q) || (item.type || '').toLowerCase().includes(q);
    });
    return [...list].sort((a, b) => {
      if (order === 'name') return (a.filename || '').localeCompare(b.filename || '');
      const ta = new Date(a.created_at || a.updated_at || 0).getTime();
      const tb = new Date(b.created_at || b.updated_at || 0).getTime();
      return order === 'oldest' ? ta - tb : tb - ta;
    });
  }, [projects, rawItems, mediaType, search, order]);

  if (authStatus === 'guest') {
    return (
      <main className="nx-library nx-content-page !bg-white">
        <h1 data-tour="library-header">{projects ? 'Projects' : 'Media Library'}</h1>
        <p>{projects ? 'Your workspace projects, all in one place.' : 'Images, videos, and audio saved to your workspace.'}</p>
        <button
          type="button"
          data-tour="library-content"
          onClick={onSignIn}
          className="mt-2 inline-flex h-[36px] items-center rounded-full border border-[#dfe0ea] bg-[#f4f4f7] px-4 text-[13px] font-semibold text-[#14141f] transition hover:border-[#cfd0de] hover:bg-[#e9e9f0]"
        >
          Sign in to view your workspace
        </button>
      </main>
    );
  }

  return (
    <main className="nx-library nx-content-page !bg-white">
      {/* Page Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 data-tour="library-header">{projects ? 'Projects' : 'Media Library'}</h1>
          <p className="mt-1 text-[13.5px] text-[#6d6e80]">
            {projects
              ? 'Your workspace projects, all in one place.'
              : 'All generated images, videos, and audio assets saved across your workspace.'}
          </p>
        </div>
        {!projects && !data.loading && (
          <span className="inline-flex h-[34px] items-center rounded-full border border-[#e6e7ef] bg-[#fafafc] px-3.5 text-[12.5px] font-medium text-[#6d6e80] tabular-nums">
            {visibleItems.length} {visibleItems.length === 1 ? 'asset' : 'assets'}
          </span>
        )}
      </div>

      {/* All-Apps Style Pill Tab Bar + Inline Search */}
      {!projects && (
        <div data-tour="library-filters" className="nx-apps-toolbar my-6">
          <div className="nx-apps-pill-bar" role="tablist" aria-label="Filter media by type">
            {MEDIA_TABS.map((tab) => {
              const active = mediaType === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMediaType(tab.id)}
                  className={`nx-apps-pill-tab${active ? ' is-active' : ''}`}
                >
                  <span>{tab.label}</span>
                  <span className="nx-apps-pill-count">{counts[tab.id]}</span>
                </button>
              );
            })}

            <div className="nx-apps-inline-search">
              <Search className="nx-apps-inline-search-icon w-3.5 h-3.5" aria-hidden="true" />
              <label htmlFor="nx-media-search" className="nx-reference-sr">Search media</label>
              <input
                id="nx-media-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search assets"
                className="nx-apps-inline-search-input"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="nx-apps-inline-search-clear"
                  aria-label="Clear search"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          <select
            className="h-[36px] rounded-full border border-[#e5e5ee] bg-white px-3.5 text-[12.5px] font-medium text-[#3c3d4e] outline-none transition focus:border-[#cfd0de]"
            aria-label="Sort assets"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>
      )}

      {/* Body States */}
      {data.loading ? (
        <NxCardGridSkeleton kind={projects ? 'projects' : 'media'} count={8} />
      ) : data.errors?.[kind] ? (
        <div
          data-tour="library-content"
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#fecdd3] bg-[#fff1f2] px-5 py-4 text-[13px] text-[#be123c]"
        >
          <span>Unable to load your {kind}.</span>
          <button
            type="button"
            onClick={data.retry}
            className="rounded-full border border-[#fda4af] bg-white px-3.5 py-1.5 text-[12px] font-semibold text-[#be123c] transition hover:bg-[#fff1f2]"
          >
            Try again
          </button>
        </div>
      ) : !visibleItems.length ? (
        <div
          data-tour="library-content"
          role="status"
          className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#e4e5ef] bg-[#fafafc] px-6 py-16 text-center"
        >
          <span className="grid h-12 w-12 place-items-center rounded-xl border border-[#e5e5ee] bg-white text-[#5c5d70]">
            {mediaType === 'video' ? (
              <Film size={22} strokeWidth={1.8} />
            ) : mediaType === 'audio' ? (
              <Volume2 size={22} strokeWidth={1.8} />
            ) : mediaType === 'image' ? (
              <ImageIcon size={22} strokeWidth={1.8} />
            ) : (
              <Images size={22} strokeWidth={1.8} />
            )}
          </span>
          <h2 className="mt-4 text-[15.5px] font-semibold text-[#14141f]">
            {search ? 'No matching assets' : 'No assets yet'}
          </h2>
          <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-[#6d6e80]">
            {search
              ? 'Try another keyword or reset your filters to view all workspace media.'
              : 'All images, videos, and audio you generate in Nexoclip Studio will automatically be saved here.'}
          </p>
          {(search || mediaType !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setMediaType('all');
              }}
              className="mt-4 inline-flex h-[34px] items-center rounded-full border border-[#dfe0ea] bg-[#f4f4f7] px-4 text-[12.5px] font-semibold text-[#14141f] transition hover:bg-[#e9e9f0]"
            >
              Reset filters
            </button>
          )}
        </div>
      ) : projects ? (
        <div data-tour="library-content" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleItems.map((item) => (
            <details
              key={item.id}
              open={selection === item.id || undefined}
              className="rounded-xl border border-[#e6e7ef] bg-white p-4"
            >
              <summary className="cursor-pointer font-semibold text-[#14141f]">{item.name}</summary>
              <p className="mt-2 text-[12.5px] text-[#6d6e80]">{item.description || 'No description yet.'}</p>
              <small className="mt-2 block text-[11.5px] text-[#8a8b9e]">
                Updated {formatDate(item.updated_at || item.created_at)}
              </small>
            </details>
          ))}
        </div>
      ) : (
        <div data-tour="library-content" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pb-8">
          {visibleItems.map((item) => (
            <MediaCard
              key={item.id}
              item={item}
              onPreview={setPreviewItem}
              prefersReducedMotion={Boolean(prefersReducedMotion)}
            />
          ))}
        </div>
      )}

      {/* Quick Preview Lightbox */}
      {portalMounted &&
        createPortal(
          <AnimatePresence>
            {previewItem && (
              <motion.div
                className="fixed inset-0 z-[220] flex items-center justify-center bg-[#0c0c16]/60 p-4 backdrop-blur-[6px]"
                role="dialog"
                aria-modal="true"
                aria-label={previewItem.filename || 'Media preview'}
                initial={prefersReducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={prefersReducedMotion ? false : { opacity: 0 }}
                transition={{ duration: 0.16 }}
                onClick={(e) => {
                  if (e.target === e.currentTarget) setPreviewItem(null);
                }}
              >
                <motion.div
                  className="w-full max-w-[820px] overflow-hidden rounded-[22px] border border-[#e6e6ef] bg-white shadow-[0_32px_90px_-16px_rgba(12,12,24,0.32)]"
                  initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={prefersReducedMotion ? false : { opacity: 0, scale: 0.97, y: 8 }}
                  transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 32 }}
                >
                  <div className="flex items-center justify-between gap-3 border-b border-[#f0f0f6] px-5 py-3.5">
                    <div className="min-w-0">
                      <h3 className="truncate text-[14.5px] font-semibold text-[#14141f]">
                        {previewItem.filename || 'Asset Preview'}
                      </h3>
                      <p className="text-[11.5px] text-[#7a7b8c]">
                        {TYPE_LABEL[previewItem.type] || 'Asset'}
                        {formatDate(previewItem.created_at) ? ` · ${formatDate(previewItem.created_at)}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={previewItem.url}
                        download={previewItem.filename || undefined}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#dfe0ea] bg-[#f4f4f7] px-3.5 text-[12px] font-semibold text-[#14141f] transition hover:bg-[#e9e9f0]"
                      >
                        <Download size={13} />
                        <span>Download</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => setPreviewItem(null)}
                        aria-label="Close preview"
                        className="grid h-8 w-8 place-items-center rounded-full border border-[#ebebf2] bg-[#fafafc] text-[#6b6c7e] transition hover:bg-[#f2f2f7] hover:text-[#14141f]"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </div>

                  <div className="flex max-h-[72vh] items-center justify-center bg-[#0f1017] p-4">
                    {previewItem.type === 'image' ? (
                      <img
                        src={previewItem.url}
                        alt={previewItem.filename || 'Preview'}
                        className="max-h-[65vh] w-auto max-w-full rounded-xl object-contain"
                      />
                    ) : previewItem.type === 'video' ? (
                      <video
                        src={previewItem.url}
                        controls
                        autoPlay
                        playsInline
                        className="max-h-[65vh] w-full rounded-xl bg-black"
                      />
                    ) : (
                      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-2xl bg-white p-6 text-center">
                        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#f4f4f7] text-[#14141f]">
                          <Music size={24} />
                        </span>
                        <audio src={previewItem.url} controls autoPlay className="w-full" />
                      </div>
                    )}
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
