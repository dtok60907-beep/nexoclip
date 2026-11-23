'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Clapperboard, LayoutTemplate, Palette, Video, X } from 'lucide-react';

const CHECKLIST_STORAGE_KEY = 'nexoclip_get_started_v1';

const TASKS = [
  {
    id: 'brand-setup',
    title: 'Complete Brand Setup',
    badge: 'Recommended',
    description: 'Add your brand identity, products, and tone for AI-ready scripts.',
    cta: 'Go Setup',
    target: 'brand-kit',
    icon: Palette,
    tileClass: 'bg-[#fff0f3] text-[#db2777]',
  },
  {
    id: 'director-brief',
    title: 'Direct with AI Director',
    badge: 'Pro Flow',
    description: 'Turn one creative brief into scripts, storyboards & edited video.',
    cta: 'Create',
    target: 'director',
    icon: Clapperboard,
    tileClass: 'bg-[#f2f0ff] text-[#5b45f2]',
  },
  {
    id: 'video-clip',
    title: 'Generate a Studio Video',
    badge: 'Fast',
    description: 'Create 1080p UGC ads or commercial clips from text or product images.',
    cta: 'Create',
    target: 'video',
    icon: Video,
    tileClass: 'bg-[#ecfdf5] text-[#059669]',
  },
  {
    id: 'explore-templates',
    title: 'Explore Video Templates',
    badge: 'Library',
    description: 'Browse proven UGC, promo, and micro-drama templates ready to remix.',
    cta: 'Explore',
    target: 'templates',
    icon: LayoutTemplate,
    tileClass: 'bg-[#eff6ff] text-[#2563eb]',
  },
];

export default function GetStartedPopover({ open, onClose, onNavigate }) {
  const [doneIds, setDoneIds] = useState([]);
  const panelRef = useRef(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CHECKLIST_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setDoneIds(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target) && !e.target.closest?.('[data-get-started-trigger]')) {
        onClose();
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const markAndGo = (task) => {
    const next = doneIds.includes(task.id) ? doneIds : [...doneIds, task.id];
    setDoneIds(next);
    try {
      window.localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
    onClose();
    onNavigate?.(task.target);
  };

  if (!open) return null;

  const pct = Math.round((doneIds.length / TASKS.length) * 100);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Get Started with Nexoclip"
      className="fixed right-4 top-16 z-[180] w-[min(460px,calc(100vw-2rem))] rounded-[20px] border border-[#e6e7f0] bg-white p-5 shadow-[0_24px_64px_rgba(18,18,36,0.16)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[17px] font-semibold tracking-[-0.02em] text-[#14141f]">
            Get Started with Nexoclip
          </h3>
          <p className="mt-1 text-[12.5px] text-[#6e6f82]">
            Complete these quick steps to unlock your full creative workflow.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close checklist"
          className="grid h-7 w-7 place-items-center rounded-lg text-[#6e6f82] transition hover:bg-[#f3f4f8] hover:text-[#14141f]"
        >
          <X size={16} />
        </button>
      </div>

      {/* Progress Bar */}
      <div className="mt-4 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#efeff6]">
          <div
            className="h-full rounded-full bg-[#5b45f2] transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[12px] font-semibold tabular-nums text-[#5e5e72]">{pct}%</span>
      </div>

      {/* Checklist Items */}
      <div className="mt-4 space-y-2.5">
        {TASKS.map((task) => {
          const IconComp = task.icon;
          const isDone = doneIds.includes(task.id);
          return (
            <div
              key={task.id}
              className="flex items-center gap-3.5 rounded-2xl border border-[#f0f0f6] bg-[#fafafd] px-3.5 py-3 transition hover:border-[#dcd8f7] hover:bg-white"
            >
              <span className={`grid h-10 w-10 flex-none place-items-center rounded-xl ${task.tileClass}`}>
                <IconComp size={18} strokeWidth={1.9} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[13.5px] font-semibold text-[#14141f]">{task.title}</span>
                  <span className="rounded-md bg-[#eef2ff] px-1.5 py-0.5 text-[10.5px] font-semibold text-[#5b45f2]">
                    {task.badge}
                  </span>
                </div>
                <p className="mt-0.5 text-[11.5px] leading-snug text-[#6e6f82]">{task.description}</p>
              </div>
              <button
                type="button"
                onClick={() => markAndGo(task)}
                className={`flex-none rounded-xl px-3.5 py-2 text-[12px] font-semibold transition ${
                  isDone
                    ? 'bg-[#ecfdf3] text-[#147a49] border border-[#c5f0d6]'
                    : 'bg-[#f1f2f7] text-[#14141f] hover:bg-[#5b45f2] hover:text-white'
                }`}
              >
                {isDone ? (
                  <span className="inline-flex items-center gap-1">
                    <Check size={12} strokeWidth={2.6} /> Done
                  </span>
                ) : (
                  task.cta
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
