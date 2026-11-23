'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Clapperboard,
  Compass,
  Film,
  FolderKanban,
  Home,
  Image as ImageIcon,
  Images,
  LayoutGrid,
  Lightbulb,
  Megaphone,
  Palette,
  Plug,
  Settings,
  Sparkles,
  UserRound,
  Video,
  Wand2,
  Workflow,
  X,
} from 'lucide-react';
import {
  OVERVIEW_TOUR_STEPS,
  getPageTour,
  resolveFeatureTipId,
} from './featureTips';

export const TOUR_STEPS = OVERVIEW_TOUR_STEPS;

const FEATURE_ICONS = {
  home: Home,
  apps: LayoutGrid,
  projects: FolderKanban,
  media: Images,
  director: Clapperboard,
  canvas: Workflow,
  image: ImageIcon,
  video: Video,
  cinema: Film,
  'ai-influencer': UserRound,
  motion: Wand2,
  marketing: Megaphone,
  accounts: Plug,
  usage: BarChart3,
  'brand-kit': Palette,
  settings: Settings,
};

const PAD = 8;
const CARD_WIDTH = 368;
const GAP = 16;

function visibleTarget(name) {
  if (!name || typeof document === 'undefined') return null;
  for (const element of document.querySelectorAll(`[data-tour="${name}"]`)) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return element;
  }
  return null;
}

function cardPosition(rect, cardHeight) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(CARD_WIDTH, vw - 28);
  const safeHeight = Math.min(cardHeight, vh - 32);
  if (!rect) {
    return {
      left: (vw - width) / 2,
      top: Math.max(16, (vh - safeHeight) / 2),
      width,
    };
  }
  const clampX = (x) => Math.min(Math.max(14, x), vw - width - 14);
  const clampY = (y) => Math.min(Math.max(14, y), vh - safeHeight - 14);
  const space = {
    right: vw - rect.right,
    left: rect.left,
    bottom: vh - rect.bottom,
    top: rect.top,
  };
  if (space.right >= width + GAP + 14) {
    return { left: rect.right + GAP, top: clampY(rect.top), width };
  }
  if (space.left >= width + GAP + 14) {
    return { left: rect.left - width - GAP, top: clampY(rect.top), width };
  }
  if (space.bottom >= safeHeight + GAP + 14) {
    return {
      left: clampX(rect.left + rect.width / 2 - width / 2),
      top: rect.bottom + GAP,
      width,
    };
  }
  if (space.top >= safeHeight + GAP + 14) {
    return {
      left: clampX(rect.left + rect.width / 2 - width / 2),
      top: rect.top - safeHeight - GAP,
      width,
    };
  }
  return {
    left: (vw - width) / 2,
    top: Math.max(16, vh - safeHeight - 20),
    width,
  };
}

// Compact light-kit UI micro-previews matching Nexoclip's visual design system.
function StepPreview({ kind }) {
  if (!kind) return null;

  return (
    <div
      className="relative mb-3.5 overflow-hidden rounded-[14px] border border-[#eae7f7] bg-[#f8f7fe] px-3.5 py-3"
      aria-hidden="true"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage: 'radial-gradient(#d8d3f2 0.8px, transparent 0.8px)',
          backgroundSize: '10px 10px',
        }}
      />

      <div className="relative z-[1]">
        {kind === 'sidebar' && (
          <div className="flex items-stretch gap-2.5">
            <div className="w-[104px] rounded-[10px] border border-[#e3dff5] bg-white p-1.5 shadow-[0_4px_12px_rgba(20,18,46,0.06)]">
              <div className="mb-1.5 flex items-center gap-1 px-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[#5b45f2]" />
                <span className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[#8d8ca3]">
                  Workspace
                </span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 rounded-md bg-[#f2f0ff] px-1.5 py-1 text-[9.5px] font-semibold text-[#5b45f2]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#5b45f2]" />
                  Home
                </div>
                <div className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[9px] text-[#6d6d82]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#d3d1e2]" />
                  AI Director
                </div>
                <div className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[9px] text-[#6d6d82]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#d3d1e2]" />
                  Canvas
                </div>
              </div>
            </div>
            <div className="flex flex-1 flex-col justify-between rounded-[10px] border border-dashed border-[#dcd7f5] bg-white/75 p-2">
              <div className="space-y-1.5">
                <div className="h-2 w-20 rounded-full bg-[#e6e3f5]" />
                <div className="h-1.5 w-28 rounded-full bg-[#efedf9]" />
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className="rounded-full bg-[#f2f0ff] px-2 py-0.5 text-[8.5px] font-semibold text-[#5b45f2]">
                  Collapsible rail
                </span>
                <span className="h-4 w-4 rounded-md border border-[#e3dff5] bg-white" />
              </div>
            </div>
          </div>
        )}

        {kind === 'composer' && (
          <div className="rounded-[12px] border border-[#e3dff5] bg-white p-2.5 shadow-[0_6px_16px_rgba(20,18,46,0.06)]">
            <div className="mb-2 flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-md border border-[#e6e2f8] bg-[#f8f7ff] px-1.5 py-0.5 text-[9px] font-medium text-[#4c38d6]">
                <span className="h-2 w-2 rounded-[3px] bg-[#5b45f2]/25" />
                product-shot.png
              </span>
              <span className="text-[9px] text-[#8d8ca3]">Reference attached</span>
            </div>
            <div className="h-2 w-4/5 rounded-full bg-[#ebe9f5]" />
            <div className="mt-1.5 h-2 w-3/5 rounded-full bg-[#f2f1f8]" />
            <div className="mt-2.5 flex items-center justify-between border-t border-[#f1eff9] pt-2">
              <div className="flex items-center gap-1.5">
                <span className="grid h-5 w-5 place-items-center rounded-full border border-[#dedaf5] bg-[#faf9ff] text-[11px] font-semibold text-[#5b45f2]">
                  +
                </span>
                <span className="rounded-full border border-[#e7e5f3] bg-[#fafafa] px-2 py-0.5 text-[9px] font-semibold text-[#3f3f52]">
                  Seedance 2.5
                </span>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#5b45f2] px-2.5 py-1 text-[9px] font-semibold text-white">
                Send
                <ArrowRight className="h-2.5 w-2.5" />
              </span>
            </div>
          </div>
        )}

        {kind === 'showcase' && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'UGC Hook', active: false },
              { label: 'Recreate', active: true },
              { label: 'Product', active: false },
            ].map((card) => (
              <div
                key={card.label}
                className={`relative flex h-[74px] flex-col justify-end overflow-hidden rounded-[10px] border p-2 ${
                  card.active
                    ? 'border-[#5b45f2] bg-gradient-to-br from-[#ede9ff] via-[#f6f4ff] to-[#ffffff] shadow-[0_6px_14px_-6px_rgba(91,69,242,0.35)]'
                    : 'border-[#e6e3f2] bg-white'
                }`}
              >
                {card.active && (
                  <span className="mb-auto inline-flex w-fit items-center gap-1 rounded-full bg-[#5b45f2] px-1.5 py-0.5 text-[8.5px] font-semibold text-white">
                    <Sparkles className="h-2.5 w-2.5" />
                    Recreate
                  </span>
                )}
                <div className="h-1.5 w-10 rounded-full bg-[#dcd8ef]" />
                <span className="mt-1 text-[8.5px] font-medium text-[#5e5e72]">{card.label}</span>
              </div>
            ))}
          </div>
        )}

        {kind === 'controls' && (
          <div className="rounded-[12px] border border-[#e3dff5] bg-white p-2.5 shadow-[0_4px_12px_rgba(20,18,46,0.05)]">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-lg border border-[#5b45f2] bg-[#f2f0ff] px-2 py-1 text-[9.5px] font-semibold text-[#5b45f2]">
                9:16 Reels
              </span>
              <span className="rounded-lg border border-[#e7e6f0] bg-[#fafafa] px-2 py-1 text-[9.5px] font-medium text-[#525263]">
                16:9 Wide
              </span>
              <span className="rounded-lg border border-[#e7e6f0] bg-[#fafafa] px-2 py-1 text-[9.5px] font-medium text-[#525263]">
                1080p
              </span>
              <span className="rounded-lg border border-[#e7e6f0] bg-[#fafafa] px-2 py-1 text-[9.5px] font-medium text-[#525263]">
                5s
              </span>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[9px] text-[#7b7b8e]">
              <span>Model · Ratio · Duration · Seed</span>
              <span className="font-semibold text-[#5b45f2]">Live preview</span>
            </div>
          </div>
        )}

        {kind === 'credits' && (
          <div className="flex items-center justify-between gap-2.5 rounded-[12px] border border-[#e3dff5] bg-white px-3 py-2.5 shadow-[0_4px_12px_rgba(20,18,46,0.05)]">
            <div className="min-w-0">
              <span className="block text-[9px] font-semibold uppercase tracking-[0.06em] text-[#848499]">
                Transparent pricing
              </span>
              <span className="mt-0.5 block text-[11px] font-semibold text-[#14141f]">
                Auto-refund on failed runs
              </span>
            </div>
            <span className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full bg-[#5b45f2] px-3 py-1.5 text-[10px] font-semibold text-white shadow-[0_6px_14px_-4px_rgba(91,69,242,0.5)]">
              <Sparkles className="h-3 w-3" />
              Generate · 12 cr
            </span>
          </div>
        )}

        {kind === 'cinema' && (
          <div className="rounded-[12px] border border-[#e3dff5] bg-white p-2.5 shadow-[0_4px_12px_rgba(20,18,46,0.05)]">
            <div className="relative flex h-[52px] items-center justify-center rounded-[8px] border border-[#e1dcf6] bg-[#f7f6fe]">
              <span className="absolute left-2 top-1.5 text-[8px] font-semibold tracking-[0.08em] text-[#5b45f2]">
                2.39:1
              </span>
              <span className="absolute right-2 top-1.5 text-[8px] font-medium text-[#7b7b8e]">
                50mm · f/1.8
              </span>
              <div className="h-6 w-12 rounded-[4px] border border-dashed border-[#5b45f2]/60" />
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[9px] font-medium text-[#525263]">
              <span className="rounded-md bg-[#f2f0ff] px-1.5 py-0.5 text-[#5b45f2]">Anamorphic</span>
              <span className="rounded-md bg-[#f5f5f9] px-1.5 py-0.5">35mm / 85mm</span>
              <span className="rounded-md bg-[#f5f5f9] px-1.5 py-0.5">4K Still</span>
            </div>
          </div>
        )}

        {kind === 'influencer' && (
          <div className="flex items-center gap-2.5 rounded-[12px] border border-[#e3dff5] bg-white p-2.5 shadow-[0_4px_12px_rgba(20,18,46,0.05)]">
            <div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-[10px] border border-[#ded9fb] bg-[#f2f0ff] text-[#5b45f2]">
              <UserRound className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex gap-1">
                {['Face', 'Body', 'Style'].map((tab, idx) => (
                  <span
                    key={tab}
                    className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${
                      idx === 0
                        ? 'bg-[#5b45f2] text-white'
                        : 'bg-[#f4f3f9] text-[#6a6a7d]'
                    }`}
                  >
                    {tab}
                  </span>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-1">
                <span className="h-4 w-4 rounded-md border border-[#e6e4f2] bg-[#fafafe]" />
                <span className="h-4 w-4 rounded-md border border-[#e6e4f2] bg-[#fafafe]" />
                <span className="h-4 w-4 rounded-md border border-[#d6cffb] bg-[#f2f0ff]" />
                <span className="ml-1 text-[8.5px] font-medium text-[#7b7b8e]">Saved cast</span>
              </div>
            </div>
          </div>
        )}

        {kind === 'director' && (
          <div className="grid grid-cols-[1.05fr_1fr] gap-2">
            <div className="rounded-[10px] border border-[#e3dff5] bg-white p-2">
              <span className="text-[8.5px] font-semibold uppercase tracking-[0.06em] text-[#5b45f2]">
                Director Chat
              </span>
              <div className="mt-1.5 space-y-1">
                <div className="ml-auto h-2 w-4/5 rounded-full bg-[#edeaff]" />
                <div className="h-2 w-full rounded-full bg-[#f0eff6]" />
                <div className="h-2 w-2/3 rounded-full bg-[#f0eff6]" />
              </div>
            </div>
            <div className="rounded-[10px] border border-[#e3dff5] bg-white p-2">
              <span className="text-[8.5px] font-semibold uppercase tracking-[0.06em] text-[#6d6d82]">
                Storyboard
              </span>
              <div className="mt-1.5 grid grid-cols-2 gap-1">
                <span className="h-7 rounded-md border border-[#ded9fb] bg-[#f5f3ff]" />
                <span className="h-7 rounded-md border border-[#eceaf5] bg-[#fafafa]" />
              </div>
            </div>
          </div>
        )}

        {kind === 'canvas' && (
          <div className="flex items-center justify-between gap-1 rounded-[12px] border border-[#e3dff5] bg-white px-2.5 py-3 shadow-[0_4px_12px_rgba(20,18,46,0.05)]">
            {[
              { label: 'Ref', sub: 'Photo', active: false },
              { label: 'Image', sub: 'Keyframe', active: true },
              { label: 'Video', sub: '1080p', active: false },
            ].map((node, idx) => (
              <div key={node.label} className="flex items-center gap-1">
                <div
                  className={`rounded-lg border px-2 py-1.5 text-center ${
                    node.active
                      ? 'border-[#5b45f2] bg-[#f4f2ff]'
                      : 'border-[#e6e4f0] bg-[#fafafa]'
                  }`}
                >
                  <span className="block text-[9px] font-semibold text-[#14141f]">{node.label}</span>
                  <span className="block text-[8px] text-[#7b7b8e]">{node.sub}</span>
                </div>
                {idx < 2 && (
                  <svg width="18" height="10" viewBox="0 0 18 10" fill="none" className="flex-shrink-0 text-[#5b45f2]">
                    <path d="M1 5h14m-3-3 3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        )}

        {kind === 'motion' && (
          <div className="rounded-[12px] border border-[#e3dff5] bg-white p-2.5 shadow-[0_4px_12px_rgba(20,18,46,0.05)]">
            <div className="flex items-center gap-2">
              <div className="grid h-10 w-14 place-items-center rounded-lg border border-[#ded9fb] bg-[#f4f2ff] text-[9px] font-semibold text-[#5b45f2]">
                9:16
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center gap-1">
                  <span className="h-2.5 flex-1 rounded-sm bg-[#5b45f2]" />
                  <span className="h-2.5 flex-1 rounded-sm bg-[#a89cf8]" />
                  <span className="h-2.5 flex-1 rounded-sm bg-[#dcd6fd]" />
                </div>
                <div className="h-1.5 w-full rounded-full bg-[#efedf8]" />
              </div>
            </div>
          </div>
        )}

        {kind === 'apps' && (
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { name: 'AI Director', pill: 'New' },
              { name: 'Video Studio', pill: 'Classic' },
              { name: 'Image Studio', pill: 'Classic' },
              { name: 'Canvas', pill: 'New' },
            ].map((app) => (
              <div
                key={app.name}
                className="flex items-center justify-between rounded-lg border border-[#e7e5f3] bg-white px-2 py-1.5"
              >
                <span className="truncate text-[9.5px] font-semibold text-[#1e1d2b]">{app.name}</span>
                <span className="rounded-full bg-[#f2f0ff] px-1.5 py-0.5 text-[7.5px] font-semibold text-[#5b45f2]">
                  {app.pill}
                </span>
              </div>
            ))}
          </div>
        )}

        {kind === 'library' && (
          <div className="rounded-[12px] border border-[#e3dff5] bg-white p-2.5">
            <div className="mb-2 flex items-center gap-1">
              {['Images', 'Videos', 'Audio'].map((tab, idx) => (
                <span
                  key={tab}
                  className={`rounded-full px-2 py-0.5 text-[8.5px] font-semibold ${
                    idx === 0 ? 'bg-[#5b45f2] text-white' : 'bg-[#f4f3f9] text-[#6d6d82]'
                  }`}
                >
                  {tab}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={`h-8 rounded-md border ${
                    i === 0 ? 'border-[#cfc8fa] bg-[#f2f0ff]' : 'border-[#eceaf5] bg-[#fafafa]'
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {kind === 'usage' && (
          <div className="rounded-[12px] border border-[#e3dff5] bg-white px-3 py-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[9px] font-semibold text-[#14141f]">Credit Usage Trend</span>
              <span className="rounded-full bg-[#f2f0ff] px-1.5 py-0.5 text-[8px] font-semibold text-[#5b45f2]">
                7D · 30D
              </span>
            </div>
            <svg viewBox="0 0 240 44" className="h-[42px] w-full" fill="none">
              <defs>
                <linearGradient id="nxTourSpark" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#5b45f2" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#5b45f2" stopOpacity="0.01" />
                </linearGradient>
              </defs>
              <path
                d="M4 36 L44 28 L88 31 L132 14 L180 20 L236 6 L236 42 L4 42 Z"
                fill="url(#nxTourSpark)"
              />
              <path
                d="M4 36 L44 28 L88 31 L132 14 L180 20 L236 6"
                stroke="#5b45f2"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="236" cy="6" r="3" fill="#ffffff" stroke="#5b45f2" strokeWidth="2" />
            </svg>
          </div>
        )}

        {kind === 'billing' && (
          <div className="flex items-center justify-between gap-2 rounded-[12px] border border-[#e3dff5] bg-white px-3 py-2.5">
            <div>
              <span className="block text-[8.5px] font-semibold uppercase tracking-[0.06em] text-[#848499]">
                Workspace balance
              </span>
              <span className="text-[13px] font-semibold tabular-nums text-[#14141f]">
                1,250 <span className="text-[10px] font-medium text-[#7b7b8e]">credits</span>
              </span>
            </div>
            <span className="rounded-full bg-[#5b45f2] px-2.5 py-1 text-[9.5px] font-semibold text-white">
              + Top up
            </span>
          </div>
        )}

        {kind === 'brandkit' && (
          <div className="flex items-center justify-between gap-2 rounded-[12px] border border-[#e3dff5] bg-white px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              {['#5b45f2', '#14141f', '#f2f0ff', '#16794c'].map((hex) => (
                <span
                  key={hex}
                  className="h-6 w-6 rounded-lg border border-[#e3e1ee]"
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
            <span className="rounded-full bg-[#f2f0ff] px-2 py-0.5 text-[9px] font-semibold text-[#5b45f2]">
              Brand Voice &amp; HEX
            </span>
          </div>
        )}

        {kind === 'settings' && (
          <div className="rounded-[12px] border border-[#e3dff5] bg-white p-2.5">
            <div className="flex gap-1">
              {['General', 'Workspaces', 'Security'].map((item, idx) => (
                <span
                  key={item}
                  className={`rounded-lg px-2 py-1 text-[9px] font-semibold ${
                    idx === 0 ? 'bg-[#f2f0ff] text-[#5b45f2]' : 'text-[#717184]'
                  }`}
                >
                  {item}
                </span>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-[#5b45f2] text-[9px] font-bold text-white">
                NX
              </span>
              <div className="space-y-1">
                <div className="h-1.5 w-20 rounded-full bg-[#dedcef]" />
                <div className="h-1.5 w-28 rounded-full bg-[#f0eff7]" />
              </div>
            </div>
          </div>
        )}

        {kind === 'integrations' && (
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { name: 'Instagram', on: true },
              { name: 'TikTok', on: false },
              { name: 'Drive', on: true },
            ].map((item) => (
              <div
                key={item.name}
                className="flex flex-col items-start gap-1.5 rounded-lg border border-[#e7e5f3] bg-white px-2 py-1.5"
              >
                <span className="text-[9.5px] font-semibold text-[#1c1b29]">{item.name}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[8px] font-semibold ${
                    item.on
                      ? 'bg-[#ecfdf3] text-[#16794c]'
                      : 'bg-[#f2f0ff] text-[#5b45f2]'
                  }`}
                >
                  {item.on ? 'Enabled' : 'Connect'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function StudioTour({
  open,
  mode = 'tips',
  onClose,
  activeTab,
  onTabChange,
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [searching, setSearching] = useState(false);
  const [cardHeight, setCardHeight] = useState(280);
  const [resolvedSteps, setResolvedSteps] = useState([]);
  const cardRef = useRef(null);

  const pageTour = useMemo(() => getPageTour(activeTab), [activeTab]);
  const isOverview = mode === 'tour';

  // Resolve the active step list whenever the walkthrough opens or activeTab changes.
  // For page-dedicated tips, optional steps whose DOM anchor is not mounted in the
  // current state (e.g. Director new-project vs open-project view) are filtered out
  // so every spotlight step highlights a real element on screen.
  useEffect(() => {
    if (!open) return;
    setStepIndex(0);
    setRect(null);

    if (isOverview) {
      setResolvedSteps(OVERVIEW_TOUR_STEPS);
      return;
    }

    const rawSteps = pageTour?.steps || [];
    const filtered = rawSteps.filter((candidate) => {
      if (!candidate.optional) return true;
      return Boolean(visibleTarget(candidate.target));
    });
    setResolvedSteps(filtered.length > 0 ? filtered : rawSteps.slice(0, 1));
  }, [open, isOverview, pageTour, activeTab]);

  const steps = resolvedSteps;
  const step = steps[stepIndex] || steps[0];

  const finish = useCallback(() => {
    setStepIndex(0);
    setRect(null);
    onClose();
  }, [onClose]);

  const go = useCallback(
    (delta) => {
      const next = stepIndex + delta;
      if (next < 0) return;
      if (next >= steps.length) finish();
      else setStepIndex(next);
    },
    [finish, stepIndex, steps.length],
  );

  // Only switch tabs in the post-onboarding overview tour (?tour=1).
  // Page-dedicated Tips never leave the user's current page.
  useEffect(() => {
    if (open && isOverview && step?.tab && step.tab !== activeTab) {
      onTabChange?.(step.tab);
    }
  }, [open, isOverview, step, activeTab, onTabChange]);

  // Track and spotlight the active step's DOM target.
  useEffect(() => {
    if (!open || !step) return undefined;
    setRect(null);
    if (!step.target) {
      setSearching(false);
      return undefined;
    }

    setSearching(true);
    let element = null;
    let frame;
    let last = '';
    const started = performance.now();

    const measure = () => {
      element = element?.isConnected ? element : visibleTarget(step.target);
      if (element) {
        const box = element.getBoundingClientRect();
        const key = `${Math.round(box.top)},${Math.round(box.left)},${Math.round(box.width)},${Math.round(box.height)}`;
        if (box.width > 0 && key !== last) {
          last = key;
          setRect({
            top: Math.max(4, box.top - PAD),
            left: Math.max(4, box.left - PAD),
            width: Math.min(window.innerWidth - 8, box.width + PAD * 2),
            height: Math.min(window.innerHeight - 8, box.height + PAD * 2),
            right: Math.min(window.innerWidth - 4, box.right + PAD),
            bottom: Math.min(window.innerHeight - 4, box.bottom + PAD),
          });
          setSearching(false);
        }
      } else if (performance.now() - started > 1600) {
        setSearching(false);
        return;
      }
      frame = requestAnimationFrame(measure);
    };

    const delay = isOverview && step.tab && step.tab !== activeTab ? 240 : 24;
    const timer = window.setTimeout(() => {
      visibleTarget(step.target)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      measure();
    }, delay);

    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
    // activeTab is read only to pick the initial tab-switch delay in overview mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isOverview, stepIndex, step?.target]);

  useLayoutEffect(() => {
    if (open && cardRef.current) {
      setCardHeight(cardRef.current.offsetHeight);
    }
  }, [open, stepIndex, rect, steps.length]);

  // Keyboard navigation: Esc closes, Left/Right/Enter step through.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish();
      } else if (event.key === 'ArrowRight' || event.key === 'Enter') {
        event.preventDefault();
        go(1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        go(-1);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, go, finish]);

  if (!open || !step || typeof document === 'undefined') return null;

  const position = cardPosition(searching ? null : rect, cardHeight);
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;
  const progress = steps.length > 0 ? ((stepIndex + 1) / steps.length) * 100 : 100;
  const PageIcon = isOverview
    ? Compass
    : FEATURE_ICONS[pageTour?.icon || resolveFeatureTipId(activeTab)] || Lightbulb;
  const badgeLabel = isOverview
    ? 'Studio Walkthrough'
    : `${pageTour?.shortTitle || 'Studio'} Tips`;

  return createPortal(
    <div
      className="fixed inset-0 z-[240] font-sans"
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-tour-title"
    >
      {/* Click outside closes the dedicated page spotlight */}
      <div className="absolute inset-0" onClick={finish} />

      {/* Spotlight Cutout or Soft Centered Backdrop */}
      {rect && !searching ? (
        <div
          className="pointer-events-none absolute rounded-[18px] transition-all duration-300 ease-out motion-reduce:transition-none"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow:
              '0 0 0 2px #5b45f2, 0 0 0 6px rgba(91,69,242,0.2), 0 0 0 9999px rgba(14,11,36,0.48)',
          }}
        />
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-[rgba(14,11,36,0.46)] backdrop-blur-[2px] transition-opacity duration-200 motion-reduce:transition-none" />
      )}

      {/* Nexoclip Light Web-Kit Popover Card */}
      <div
        ref={cardRef}
        onClick={(event) => event.stopPropagation()}
        className="absolute rounded-[22px] border border-[#e7e6f0] bg-white p-4.5 text-[#14141f] shadow-[0_26px_70px_-18px_rgba(18,15,44,0.34),0_4px_16px_rgba(18,15,44,0.08)] transition-[top,left] duration-300 ease-out motion-reduce:transition-none"
        style={{
          top: position.top,
          left: position.left,
          width: position.width,
          padding: 18,
        }}
      >
        {/* Top Header Row: Dedicated Page Pill + Counter + Close */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f2f0ff] px-2.5 py-1 text-[11px] font-semibold tracking-[0.02em] text-[#5b45f2]">
            <PageIcon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{badgeLabel}</span>
            <span className="text-[#9e94eb]" aria-hidden="true">·</span>
            <span className="tabular-nums">
              {stepIndex + 1} / {steps.length}
            </span>
          </span>

          <button
            type="button"
            onClick={finish}
            aria-label="Close tips"
            className="grid h-7 w-7 place-items-center rounded-lg text-[#71717a] transition hover:bg-[#f4f3f9] hover:text-[#14141f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b45f2]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Thin Progress Track */}
        <div className="mb-3.5 h-1 overflow-hidden rounded-full bg-[#efedf8]">
          <div
            className="h-full rounded-full bg-[#5b45f2] transition-[width] duration-300 ease-out motion-reduce:transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Visual Micro-Preview matching Nexoclip's light design system */}
        <StepPreview kind={step.preview} />

        {/* Concise Spotlight Copy */}
        <h2
          id="studio-tour-title"
          className="text-[16.5px] font-semibold leading-snug tracking-[-0.02em] text-[#14141f]"
        >
          {step.title}
        </h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#5e5e72]">
          {step.body}
        </p>

        {step.tip && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-[#ece9fc] bg-[#f8f7ff] px-3 py-2 text-[12px] leading-snug text-[#463a9e]">
            <Lightbulb className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[#5b45f2]" aria-hidden="true" />
            <span>{step.tip}</span>
          </div>
        )}

        {/* Footer Controls + Step Dots */}
        <div className="mt-4 flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1.5">
            {steps.length > 1 && (
              <div className="mr-1 flex items-center gap-1" role="tablist" aria-label="Walkthrough steps">
                {steps.map((item, idx) => {
                  const active = idx === stepIndex;
                  return (
                    <button
                      key={`${item.title}-${idx}`}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      aria-label={`Step ${idx + 1}: ${item.title}`}
                      onClick={() => setStepIndex(idx)}
                      className={`h-1.5 rounded-full transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b45f2] ${
                        active ? 'w-4 bg-[#5b45f2]' : 'w-1.5 bg-[#dad6f0] hover:bg-[#b7aef5]'
                      }`}
                    />
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {!isFirst && (
              <button
                type="button"
                onClick={() => go(-1)}
                className="inline-flex items-center gap-1 rounded-xl border border-[#e7e6f0] bg-white px-3 py-1.5 text-[13px] font-medium text-[#525263] transition hover:border-[#d2ccfa] hover:bg-[#f8f7ff] hover:text-[#14141f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b45f2]"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => (isLast ? finish() : go(1))}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#5b45f2] px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(91,69,242,0.55)] transition hover:bg-[#4731d8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b45f2] focus-visible:ring-offset-2"
            >
              <span>{isOverview && isFirst ? 'Start tour' : isLast ? 'Got it' : 'Next'}</span>
              {!isLast && <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
