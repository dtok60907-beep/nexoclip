'use client';

import { useEffect, useState } from 'react';
import { toJobListItem } from '../src/lib/jobs/jobDisplay.js';
import { restoreActiveJobs, forgetActiveJob } from '../src/lib/jobs/durableJobStore.js';

const REATTACH_POLL_MS = 5000;
const REATTACH_MAX_ATTEMPTS = 180;
const TERMINAL_JOB_STATUSES = ['succeeded', 'failed', 'canceled'];
const TERMINAL_POLL_STATUSES = ['completed', 'failed', 'cancelled', 'expired'];

// Header panel: polls active jobs while any are running, shows recent on open.
export default function JobListPanel() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function poll(query) {
      try {
        const res = await fetch(`/api/jobs${query}`, { credentials: 'include' });
        if (!res.ok) return;
        const { jobs } = await res.json();
        if (!cancelled) setItems((jobs || []).map(toJobListItem));
      } catch { /* transient — keep last state */ }
    }
    // Keep recent jobs loaded even while the panel is closed. Fetching only
    // active jobs made completed/failed rows disappear after refresh.
    poll('');
    const timer = window.setInterval(() => poll(''), 3000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [open]);

  // Reattach polling for jobs that were still active when the page was last unloaded.
  // Runs once on mount so a mid-generation refresh doesn't strand the durable job in
  // 'queued' forever (the OpenRouter video route only advances when a browser polls it).
  useEffect(() => {
    let cancelled = false;
    const timers = [];

    async function reattach(workspaceId, durableId) {
      let job;
      try {
        const res = await fetch(`/api/jobs/${durableId}`, { credentials: 'include' });
        if (!res.ok) return;
        ({ job } = await res.json());
      } catch {
        return;
      }
      if (cancelled || !job) return;
      if (TERMINAL_JOB_STATUSES.includes(job.status)) {
        forgetActiveJob(workspaceId, durableId, window.localStorage);
        return;
      }

      let pollUrl;
      if (job.kind === 'video') {
        const providerId = job.params?.providerId;
        if (!providerId) {
          forgetActiveJob(workspaceId, durableId, window.localStorage);
          return;
        }
        pollUrl = `/api/openrouter/videos/${providerId}?job_id=${encodeURIComponent(durableId)}`;
      } else if (job.kind === 'clipping') {
        const pythonJobId = job.params?.pythonJobId;
        if (!pythonJobId) {
          forgetActiveJob(workspaceId, durableId, window.localStorage);
          return;
        }
        pollUrl = `/api/ai-clip/jobs/${pythonJobId}?job_id=${encodeURIComponent(durableId)}`;
      } else {
        // Other job kinds are advanced by their server workers. Keep them in
        // the durable store until /api/jobs reports a terminal status.
        return;
      }

      let attempts = 0;
      const tick = async () => {
        if (cancelled) return;
        attempts += 1;
        try {
          const res = await fetch(
            pollUrl,
            { credentials: 'include', headers: { 'x-workspace-id': workspaceId } },
          );
          if (res.ok) {
            const data = await res.json();
            if (TERMINAL_POLL_STATUSES.includes(data.status)) {
              forgetActiveJob(workspaceId, durableId, window.localStorage);
              window.clearInterval(timer);
              return;
            }
          }
        } catch {
          /* transient — keep polling */
        }
        if (attempts >= REATTACH_MAX_ATTEMPTS) {
          window.clearInterval(timer);
        }
      };
      const timer = window.setInterval(tick, REATTACH_POLL_MS);
      timers.push(timer);
      tick();
    }

    const workspaceId = window.sessionStorage.getItem('nexoclip_workspace_id');
    if (workspaceId) {
      const ids = restoreActiveJobs(workspaceId, window.localStorage);
      ids.forEach((durableId) => reattach(workspaceId, durableId));
    }

    return () => { cancelled = true; timers.forEach((t) => window.clearInterval(t)); };
  }, []);

  const activeCount = items.filter((i) => i.status === 'queued' || i.status === 'running').length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-[#110C2A]/70 hover:bg-[#A175FF]/15 hover:text-[#110C2A]"
        title="Jobs"
        aria-label="Jobs"
      >
        <span aria-hidden>▤</span>
        {activeCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-[16px] rounded-full bg-[#22d3ee] px-1 text-[10px] font-bold text-black">
            {activeCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 max-h-96 w-80 overflow-auto rounded-[24px] border border-[#110C2A]/10 bg-[#FFF6DE] p-2 text-[#110C2A] shadow-[0_20px_60px_rgba(17,12,42,0.16)]">
          {items.length === 0 ? (
            <p className="px-2 py-3 text-xs text-[#110C2A]/50">No jobs yet.</p>
          ) : (
            items.map((it) => (
              <div key={it.id} className="flex items-center gap-2 rounded-[14px] px-2 py-1.5 hover:bg-[#A175FF]/10">
                {it.thumbnailUrl ? (
                  <img src={it.thumbnailUrl} alt="" className="h-8 w-8 rounded object-cover" />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#A175FF]/15 text-[10px] text-[#110C2A]/55">
                    {it.kind.slice(0, 3)}
                  </span>
                )}
                <span className="flex-1 truncate text-xs text-[#110C2A]/80">{it.title}</span>
                <span className="text-[10px] uppercase text-[#110C2A]/50">{it.status}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
