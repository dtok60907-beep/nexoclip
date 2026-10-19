import { useCallback, useEffect, useState } from "react";

// A studio's history from the server's generation jobs, so it follows the account to
// any device or browser (and to an operator impersonating it) instead of living in
// one browser's localStorage.
export function historyEntryFromJob(job) {
  const url = job?.result?.outputUrl;
  if (job?.status !== "succeeded" || !url) return null;
  const params = job.params || {};
  return {
    id: job.id,
    url,
    prompt: job.prompt || "",
    model: job.model || "",
    resolution: params.resolution || null,
    aspect_ratio: params.aspectRatio || null,
    duration: params.duration ?? null,
    timestamp: job.createdAt,
    fromServer: true,
  };
}

// Server entries first-class; entries made in this browser that the server does not
// list yet (just generated, or older local ones) are kept. One entry per generation id.
export function mergeHistory(serverEntries, localEntries, hiddenIds = []) {
  const hidden = new Set(hiddenIds);
  const seen = new Set();
  const merged = [];
  for (const entry of [...(localEntries || []), ...(serverEntries || [])]) {
    const key = entry.id || entry.url;
    if (!key || seen.has(key) || hidden.has(key)) continue;
    seen.add(key);
    merged.push(entry);
  }
  return merged.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
}

// Loads the account's succeeded jobs of one kind; `refresh` reloads after a generation.
export function useServerHistory(kind, { enabled = true, limit = 100 } = {}) {
  const [entries, setEntries] = useState([]);
  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const response = await fetch(`/api/jobs?kind=${encodeURIComponent(kind)}&limit=${limit}`, { credentials: "include" });
      if (!response.ok) return;
      const { jobs } = await response.json();
      setEntries((jobs || []).map(historyEntryFromJob).filter(Boolean));
    } catch {
      /* offline or signed out: the local history still shows */
    }
  }, [kind, enabled, limit]);
  useEffect(() => { refresh(); }, [refresh]);
  return { entries, refresh };
}
