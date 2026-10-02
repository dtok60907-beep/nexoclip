'use client';

import { createElement, useEffect, useState } from 'react';
import { toJobListItem } from '../src/lib/jobs/jobDisplay.js';

// Pure: map durable jobs to history entries, keeping only those with a real output.
export function historyItemsFromJobs(jobs) {
  return (jobs || [])
    .map(toJobListItem)
    .filter((it) => it.outputUrl)
    .map((it) => ({ id: it.id, url: it.outputUrl, title: it.title, kind: it.kind, thumbnailUrl: it.thumbnailUrl }));
}

// Reads the durable job list for one feature kind, replacing per-studio localStorage history.
export default function DurableJobHistory({ kind, onSelect }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/jobs?kind=${encodeURIComponent(kind)}`, { credentials: 'include' });
        if (!res.ok) return;
        const { jobs } = await res.json();
        if (!cancelled) setItems(historyItemsFromJobs(jobs));
      } catch { /* transient — keep last */ }
    }
    load();
    const timer = window.setInterval(load, 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [kind]);

  if (items.length === 0) return null;
  // Rendered via React.createElement (not JSX) so this module stays parseable by
  // plain `node --test`, which has no JSX transform in this repo.
  return createElement(
    'div',
    { className: 'grid grid-cols-2 gap-2 md:grid-cols-3' },
    items.map((it) =>
      createElement(
        'button',
        {
          key: it.id,
          type: 'button',
          onClick: () => onSelect?.(it),
          className: 'overflow-hidden rounded-lg border border-white/10 hover:border-white/30',
        },
        it.thumbnailUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? createElement('img', { src: it.thumbnailUrl, alt: it.title, className: 'h-full w-full object-cover' })
          : it.kind === 'image'
            // eslint-disable-next-line @next/next/no-img-element
            ? createElement('img', { src: it.url, alt: it.title, className: 'h-full w-full object-cover' })
            : createElement('video', { src: it.url, muted: true, className: 'h-full w-full object-cover' }),
      ),
    ),
  );
}
