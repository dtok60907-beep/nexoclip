'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, X } from 'lucide-react';

const QUICK_CREATE_ITEMS = [
  {
    id: 'director',
    title: 'AI Director',
    badge: 'New',
    badgeVariant: 'ink',
    description: 'Turn any creative brief into multi-scene scripts, storyboards & final video.',
    video: '/media/preview/micro-drama-movie-148.mp4',
    poster: '/media/homepage/micro-drama-movie-148.jpg',
    objectPosition: 'center 25%',
  },
  {
    id: 'motion',
    title: 'AI Motion',
    badge: 'New',
    badgeVariant: 'ink',
    description: 'Create animated explainer & kinetic 3D motion videos through chat.',
    video: '/media/preview/3d-animation-3.mp4',
    poster: '/media/homepage/3d-animation-3.jpg',
    objectPosition: 'center 56%',
  },
  {
    id: 'canvas',
    title: 'Canvas Filmmaking',
    badge: 'New',
    badgeVariant: 'ink',
    description: 'Connect prompts, references, and visual generation nodes on one board.',
    video: '/media/preview/music-videos-168.mp4',
    poster: '/media/homepage/music-videos-168.jpg',
    objectPosition: 'center 28%',
  },
  {
    id: 'ai-influencer',
    title: 'AI Influencer',
    badge: null,
    description: 'Build branded virtual creators and consistent talking personas.',
    video: '/media/preview/ugc-commercial-152.mp4',
    poster: '/media/homepage/ugc-commercial-152.jpg',
    objectPosition: 'center 22%',
  },
  {
    id: 'video',
    title: 'Video Studio',
    badge: 'Classic',
    badgeVariant: 'subtle',
    description: 'Turn text prompts or product photos into cinematic 1080p AI clips.',
    video: '/media/preview/cinematic-ads-22.mp4',
    poster: '/media/homepage/cinematic-ads-22.jpg',
    objectPosition: 'center 45%',
  },
  {
    id: 'image',
    title: 'Image Studio',
    badge: 'Classic',
    badgeVariant: 'subtle',
    description: 'Generate studio product photography, portraits & campaign keyframes.',
    video: '/media/preview/ads-fnb-69.mp4',
    poster: '/media/homepage/ads-fnb-69.jpg',
    objectPosition: 'center 52%',
  },
];

const BADGE_CLASSES = {
  ink: 'bg-[#ececf3] text-[#14141f] border border-[#dcdde8]',
  subtle: 'bg-[#f6f6fa] text-[#6d6e80] border border-[#e8e8f0]',
};

export default function CreateQuickModal({ open, onClose, onSelect }) {
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[220] flex items-center justify-center bg-[#0c0c16]/58 p-4 md:p-6 backdrop-blur-[6px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="nx-create-modal-title"
          initial={prefersReducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={prefersReducedMotion ? false : { opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            className="w-full max-w-[1060px] max-h-[calc(100dvh-32px)] overflow-y-auto rounded-[28px] border border-[#e6e6ef] bg-white p-6 shadow-[0_36px_100px_-16px_rgba(12,12,24,0.34),0_4px_18px_rgba(12,12,24,0.06)] md:p-9"
            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.965, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={prefersReducedMotion ? false : { opacity: 0, scale: 0.975, y: 8 }}
            transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#f0f0f6] pb-5">
              <div>
                <h2
                  id="nx-create-modal-title"
                  className="text-[22px] font-semibold tracking-[-0.025em] text-[#14141f]"
                >
                  Create Video &amp; Visuals
                </h2>
                <p className="mt-1 text-[13.5px] text-[#6d6e80]">
                  Choose a Nexoclip studio to start creating right away.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close Create dialog"
                className="grid h-9 w-9 flex-none place-items-center rounded-full border border-[#ebebf2] bg-[#f7f7fa] text-[#5e5f70] transition hover:border-[#d5d6e2] hover:bg-[#eeeef4] hover:text-[#14141f]"
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {QUICK_CREATE_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onClose();
                    onSelect?.(item.id);
                  }}
                  className="group flex flex-col rounded-[20px] border border-[#e9e9f2] bg-white p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[#cfd0de] hover:shadow-[0_20px_40px_-16px_rgba(14,14,28,0.16)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14141f]"
                >
                  <div className="relative w-full aspect-[16/10] overflow-hidden rounded-[14px] bg-[#11131a] ring-1 ring-inset ring-black/[0.08]">
                    {prefersReducedMotion ? (
                      <img
                        src={item.poster}
                        alt={item.title}
                        loading="eager"
                        style={{ objectPosition: item.objectPosition }}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <video
                        src={item.video}
                        poster={item.poster}
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="auto"
                        aria-hidden="true"
                        style={{ objectPosition: item.objectPosition }}
                        className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                      />
                    )}
                    <div
                      className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/22 via-transparent to-white/[0.03]"
                      aria-hidden="true"
                    />
                  </div>

                  <div className="flex flex-1 flex-col px-1.5 pt-3.5 pb-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-[15.5px] font-semibold tracking-[-0.015em] text-[#14141f]">
                          {item.title}
                        </span>
                        {item.badge && (
                          <span
                            className={`flex-none rounded-full px-2 py-[2px] text-[10px] font-medium tracking-[0.02em] leading-none ${
                              BADGE_CLASSES[item.badgeVariant] || BADGE_CLASSES.subtle
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <ArrowUpRight
                        size={15}
                        strokeWidth={2}
                        aria-hidden="true"
                        className="flex-none text-[#8e8fa2] opacity-0 -translate-x-0.5 translate-y-0.5 transition-all duration-200 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:text-[#14141f] group-hover:opacity-100"
                      />
                    </div>
                    <p className="mt-1.5 text-[12.5px] leading-[1.55] text-[#6d6e80]">
                      {item.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
