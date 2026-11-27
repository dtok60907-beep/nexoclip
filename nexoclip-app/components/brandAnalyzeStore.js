'use client';

// Module-level background job store for Brand Kit website analysis.
// Survives tab switches / unmounting BrandKitContent, and persists completed drafts in sessionStorage.

const DRAFT_KEY_PREFIX = 'nexoclip_brand_analyze_draft:';
const jobs = new Map(); // workspaceId -> { status, url, brandKit, error, startedAt, completedAt }
const listeners = new Set();

function notify() {
  for (const fn of listeners) {
    try { fn(); } catch {}
  }
}

function readStoredDraft(workspaceId) {
  if (!workspaceId || typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(`${DRAFT_KEY_PREFIX}${workspaceId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.status === 'done' && parsed.brandKit) return parsed;
  } catch {}
  return null;
}

function writeStoredDraft(workspaceId, job) {
  if (!workspaceId || typeof window === 'undefined') return;
  try {
    if (job && job.status === 'done' && job.brandKit) {
      window.sessionStorage.setItem(`${DRAFT_KEY_PREFIX}${workspaceId}`, JSON.stringify(job));
    } else {
      window.sessionStorage.removeItem(`${DRAFT_KEY_PREFIX}${workspaceId}`);
    }
  } catch {}
}

export function getBrandAnalyzeJob(workspaceId) {
  if (!workspaceId) return null;
  if (jobs.has(workspaceId)) return jobs.get(workspaceId);
  const stored = readStoredDraft(workspaceId);
  if (stored) {
    jobs.set(workspaceId, stored);
    return stored;
  }
  return null;
}

export function subscribeBrandAnalyze(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearBrandAnalyzeJob(workspaceId) {
  if (!workspaceId) return;
  jobs.delete(workspaceId);
  writeStoredDraft(workspaceId, null);
  notify();
}

export function startBrandWebsiteAnalysis({ workspaceId, url }) {
  const cleanUrl = String(url || '').trim();
  if (!workspaceId || !cleanUrl) return null;

  const existing = jobs.get(workspaceId);
  if (existing && existing.status === 'running') return existing;

  const runningJob = {
    status: 'running',
    url: cleanUrl,
    brandKit: null,
    error: '',
    startedAt: Date.now(),
    completedAt: null,
  };
  jobs.set(workspaceId, runningJob);
  writeStoredDraft(workspaceId, null);
  notify();

  fetch('/api/workspaces/brand-kit/analyze', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'x-workspace-id': workspaceId },
    body: JSON.stringify({ url: cleanUrl }),
  })
    .then(async (response) => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Website belum bisa dianalisis.');
      const doneJob = {
        status: 'done',
        url: cleanUrl,
        brandKit: result.brandKit,
        detectedProducts: Array.isArray(result.detectedProducts) ? result.detectedProducts : [],
        meta: result.meta || null,
        error: '',
        startedAt: runningJob.startedAt,
        completedAt: Date.now(),
      };
      jobs.set(workspaceId, doneJob);
      writeStoredDraft(workspaceId, doneJob);
      notify();
    })
    .catch((error) => {
      const errJob = {
        status: 'error',
        url: cleanUrl,
        brandKit: null,
        error: error?.message || 'Website belum bisa dianalisis. Coba lagi atau isi manual.',
        startedAt: runningJob.startedAt,
        completedAt: Date.now(),
      };
      jobs.set(workspaceId, errJob);
      writeStoredDraft(workspaceId, null);
      notify();
    });

  return runningJob;
}
