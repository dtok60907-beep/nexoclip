'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

// A guided tour of the Studio. Each step can switch to a tab, then spotlights
// the first visible element marked with data-tour="<target>". Steps whose
// target is not on screen (e.g. the sidebar on mobile) fall back to a centred
// card, so the tour never gets stuck.

export const TOUR_STEPS = [
  {
    title: 'Welcome to your Studio',
    body: 'A one-minute tour of every tool. Use the buttons or your arrow keys, and press Esc to leave anytime.',
    tab: 'image',
  },
  {
    target: 'studio-nav',
    tab: 'image',
    title: 'Every tool lives in the sidebar',
    body: 'Tools are grouped by what they make.',
    points: ['Images: Image Studio, Cinema Studio, AI Influencer', 'Video: Video Studio', 'Credits: Top Up and Usage'],
  },
  {
    target: 'canvas-link',
    tab: 'image',
    title: 'Canvas, your production board',
    body: 'Wire prompts, reference photos, images and videos together as nodes on one board.',
    points: ['Draft cheaply at 480p, then render 1080p', 'Extend, Edit and Next shot for multi-scene stories', 'Opens in its own workspace with its own walkthrough'],
  },
  {
    target: 'prompt-composer',
    tab: 'image',
    title: 'Image Studio: describe your shot',
    body: 'Write what you want to see. Use the + button to add reference images, like your product photo, so results stay on-brand.',
  },
  {
    target: 'prompt-controls',
    tab: 'image',
    title: 'Pick the model and format',
    body: 'Choose the model, aspect ratio, how many images to make at once, and a seed to repeat a look. Draw lets you sketch a layout for the AI to follow.',
  },
  {
    target: 'prompt-generate',
    tab: 'image',
    title: 'The price is on the button',
    body: 'The credit cost updates as you change settings, so you always know what a run costs before you press Generate.',
  },
  {
    target: 'prompt-composer',
    tab: 'video',
    title: 'Video Studio: bring it to life',
    body: 'Describe the motion, or add a photo with + to animate it. Seedance turns text or images into videos up to 1080p.',
  },
  {
    target: 'prompt-controls',
    tab: 'video',
    title: 'Model, ratio and length',
    body: 'Switch between Seedance models, pick 9:16 for TikTok and Reels or 16:9 for YouTube, and set the duration.',
    points: ['Shorter clips and lower resolutions cost less', 'Test an idea first, then make the final cut'],
  },
  {
    target: 'prompt-generate',
    tab: 'video',
    title: 'Generate and keep working',
    body: 'Videos take a few minutes. They run in the background, so you can switch tools while they render. Credits are reserved up front and returned if a run fails.',
  },
  {
    target: 'prompt-controls',
    tab: 'cinema',
    title: 'Cinema Studio: direct like a DP',
    body: 'Choose the camera body, lens and focal length, then the resolution. Great for brand films, openers and hero shots.',
  },
  {
    target: 'influencer-builder',
    tab: 'ai-influencer',
    title: 'AI Influencer Studio: design a face',
    body: 'Build a virtual influencer step by step across Face, Body and Style: character type, gender, features and accessories.',
  },
  {
    target: 'influencer-generate',
    tab: 'ai-influencer',
    title: 'Generate, or let us surprise you',
    body: 'Generate Character renders your design. Shuffle picks random traits when you want inspiration.',
  },
  {
    target: 'influencer-gallery',
    tab: 'ai-influencer',
    title: 'Your cast, saved',
    body: 'Every character you make appears here, so you can reuse the same face across your content.',
  },
  {
    target: 'credit-balance',
    title: 'Your credit balance',
    body: 'Every studio and Canvas draw from this one balance. Click it to see what each generation used.',
  },
  {
    target: 'top-up',
    title: 'Top up anytime',
    body: 'Packages start at Rp 249.000 for 1,250 credits, paid with QRIS or a bank virtual account. Credits never expire.',
  },
  {
    target: 'jobs',
    title: 'Jobs in progress',
    body: 'Running and recent generations appear here, so you can check on long videos without waiting on one screen.',
  },
  {
    target: 'tour-button',
    title: 'Need a refresher?',
    body: 'Replay this tour anytime from here. Your account and sign-out are right next to it.',
  },
  {
    title: "You're ready to create",
    body: 'Start with an image to explore ideas cheaply, then turn your favourite into a video. Have fun!',
    tab: 'image',
    finish: true,
  },
];

const PAD = 8;
const CARD_WIDTH = 360;
const GAP = 16;

function visibleTarget(name) {
  if (!name) return null;
  for (const element of document.querySelectorAll(`[data-tour="${name}"]`)) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return element;
  }
  return null;
}

// Places the card beside the spotlight where there is room, else centres it.
function cardPosition(rect, cardHeight) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(CARD_WIDTH, vw - 32);
  if (!rect) return { left: (vw - width) / 2, top: Math.max(16, (vh - cardHeight) / 2), width };
  const clampX = (x) => Math.min(Math.max(16, x), vw - width - 16);
  const clampY = (y) => Math.min(Math.max(16, y), vh - cardHeight - 16);
  const space = { right: vw - rect.right, left: rect.left, bottom: vh - rect.bottom, top: rect.top };
  if (space.right >= width + GAP + 16) return { left: rect.right + GAP, top: clampY(rect.top), width };
  if (space.left >= width + GAP + 16) return { left: rect.left - width - GAP, top: clampY(rect.top), width };
  if (space.bottom >= cardHeight + GAP + 16) return { left: clampX(rect.left + rect.width / 2 - width / 2), top: rect.bottom + GAP, width };
  if (space.top >= cardHeight + GAP + 16) return { left: clampX(rect.left + rect.width / 2 - width / 2), top: rect.top - cardHeight - GAP, width };
  return { left: (vw - width) / 2, top: Math.max(16, vh - cardHeight - 24), width };
}

export default function StudioTour({ open, onClose, activeTab, onTabChange }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [searching, setSearching] = useState(false);
  const [cardHeight, setCardHeight] = useState(220);
  const cardRef = useRef(null);
  const step = TOUR_STEPS[index];

  const finish = useCallback(() => {
    setIndex(0);
    onClose();
  }, [onClose]);

  const go = useCallback((delta) => {
    const next = index + delta;
    if (next < 0) return;
    if (next >= TOUR_STEPS.length) finish();
    else setIndex(next);
  }, [finish, index]);

  // Switch tabs when a step needs one.
  useEffect(() => {
    if (open && step.tab && step.tab !== activeTab) onTabChange(step.tab);
  }, [open, step, activeTab, onTabChange]);

  // Find the target (studios load lazily, so wait for it briefly).
  useEffect(() => {
    if (!open) return undefined;
    setRect(null);
    if (!step.target) { setSearching(false); return undefined; }
    setSearching(true);
    let element = null;
    let frame;
    let last = '';
    const started = performance.now();
    const measure = () => {
      element = element?.isConnected ? element : visibleTarget(step.target);
      if (element) {
        const box = element.getBoundingClientRect();
        // Re-measured every frame so the spotlight follows layout shifts,
        // but state only changes when the box actually moves.
        const key = `${Math.round(box.top)},${Math.round(box.left)},${Math.round(box.width)},${Math.round(box.height)}`;
        if (box.width > 0 && key !== last) {
          last = key;
          setRect({ top: box.top - PAD, left: box.left - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2, right: box.right + PAD, bottom: box.bottom + PAD });
          setSearching(false);
        }
      } else if (performance.now() - started > 3000) {
        setSearching(false);
        return; // Not on screen: show the centred card.
      }
      frame = requestAnimationFrame(measure);
    };
    const first = setTimeout(() => {
      visibleTarget(step.target)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      measure();
    }, step.tab && step.tab !== activeTab ? 250 : 30);
    return () => { clearTimeout(first); cancelAnimationFrame(frame); };
    // activeTab is read only to pick the initial delay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index, step.target]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardHeight(cardRef.current.offsetHeight);
  }, [index, open, rect]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); finish(); }
      else if (event.key === 'ArrowRight' || event.key === 'Enter') { event.preventDefault(); go(1); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, go, finish]);

  if (!open) return null;

  const position = cardPosition(searching ? null : rect, cardHeight);
  const isLast = index === TOUR_STEPS.length - 1;
  const progress = ((index + 1) / TOUR_STEPS.length) * 100;

  return (
    <div className="fixed inset-0 z-[200]" role="dialog" aria-modal="true" aria-labelledby="studio-tour-title">
      {/* Click-catcher keeps the page still while the tour is open. */}
      <div className="absolute inset-0" onClick={(event) => event.stopPropagation()} />
      {rect && !searching ? (
        <div
          className="pointer-events-none absolute rounded-2xl transition-all duration-300 ease-out"
          // The ring lives in the same box-shadow as the dimmer: a Tailwind ring
          // class would be overridden by this inline shadow.
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height, boxShadow: '0 0 0 2px #22d3ee, 0 0 28px 4px rgba(34,211,238,0.45), 0 0 0 9999px rgba(3,3,8,0.78)' }}
        />
      ) : (
        <div className="absolute inset-0 bg-[rgba(3,3,8,0.74)] transition-opacity duration-300" />
      )}

      <div
        ref={cardRef}
        className="absolute rounded-2xl border border-white/10 bg-[#0d0d0f] p-5 text-white shadow-[0_30px_80px_rgba(0,0,0,0.6)] transition-[top,left] duration-300 ease-out"
        style={{ top: position.top, left: position.left, width: position.width }}
      >
        <div className="h-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-[#22d3ee] transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#22d3ee]">Tour · {index + 1} / {TOUR_STEPS.length}</span>
          {!isLast && <button type="button" onClick={finish} className="text-xs font-semibold text-white/45 transition hover:text-white">Skip tour</button>}
        </div>
        <h2 id="studio-tour-title" className="mt-2 text-lg font-bold leading-snug">{step.title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-white/65">{step.body}</p>
        {step.points && (
          <ul className="mt-3 space-y-1.5">
            {step.points.map((point) => (
              <li key={point} className="flex gap-2 text-[13px] leading-snug text-white/75">
                <span className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#22d3ee]" />{point}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={index === 0}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-white/60 transition hover:bg-white/5 hover:text-white disabled:invisible"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => (isLast ? finish() : go(1))}
            className="rounded-lg bg-[#22d3ee] px-4 py-2 text-sm font-bold text-black transition hover:bg-cyan-300"
          >
            {index === 0 ? 'Start tour' : isLast ? 'Start creating' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
