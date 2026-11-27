'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, AlertCircle, X } from 'lucide-react';
import { clearBrandAnalyzeJob, getBrandAnalyzeJob, subscribeBrandAnalyze } from './brandAnalyzeStore.js';

function currentWorkspaceId() {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem('nexoclip_workspace_id');
  } catch {
    return null;
  }
}

export default function BrandAnalyzeToast({ currentTab, onOpenBrandKit }) {
  const [job, setJob] = useState(null);

  useEffect(() => {
    const sync = () => {
      const id = currentWorkspaceId();
      setJob(id ? getBrandAnalyzeJob(id) : null);
    };
    sync();
    return subscribeBrandAnalyze(sync);
  }, [currentTab]);

  if (!job || currentTab === 'brand-kit') return null;
  if (!['running', 'done', 'error'].includes(job.status)) return null;

  const dismiss = () => {
    const id = currentWorkspaceId();
    if (id && job.status !== 'running') clearBrandAnalyzeJob(id);
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex max-w-sm items-center gap-2.5 rounded-2xl border border-violet-200 bg-white px-4 py-3 shadow-lg shadow-violet-900/10">
      {job.status === 'running' && (
        <>
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#5B45F2]" />
          <div className="min-w-0 text-xs">
            <div className="font-semibold text-zinc-900">Menganalisis Brand Kit…</div>
            <div className="truncate text-zinc-500">{job.url}</div>
          </div>
        </>
      )}
      {job.status === 'done' && (
        <>
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1 text-xs">
            <div className="font-semibold text-zinc-900">Brand Kit siap ditinjau</div>
            <div className="truncate text-zinc-500">{job.brandKit?.brandName || job.url}</div>
          </div>
          <button
            type="button"
            onClick={() => onOpenBrandKit?.()}
            className="shrink-0 rounded-lg bg-[#5B45F2] px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#4731D8]"
          >
            Buka My Brand
          </button>
        </>
      )}
      {job.status === 'error' && (
        <>
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
          <div className="min-w-0 flex-1 text-xs">
            <div className="font-semibold text-zinc-900">Analisis website gagal</div>
            <div className="truncate text-zinc-500">{job.error}</div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            aria-label="Tutup notifikasi"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  );
}
