'use client';

import { useEffect, useState } from 'react';

// Keep failures separate: an unavailable channel must not hide a user's projects.
export default function useDashboardData(authStatus) {
  const [state, setState] = useState({ projects: [], assets: [], accounts: [], errors: {}, loading: true });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    if (authStatus !== 'authenticated') {
      setState({ projects: [], assets: [], accounts: [], errors: {}, loading: authStatus === 'loading' });
      return () => controller.abort();
    }
    setState({ projects: [], assets: [], accounts: [], errors: {}, loading: true });
    const headers = { 'x-workspace-id': window.sessionStorage.getItem('nexoclip_workspace_id') || '' };
    const sources = [['projects', '/api/projects'], ['assets', '/api/assets'], ['accounts', '/api/tiktok/accounts']];
    Promise.all(sources.map(async ([key, url]) => {
      try {
        const response = await fetch(url, { headers, credentials: 'include', cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Unable to load');
        const data = await response.json();
        if (!Array.isArray(data[key])) throw new Error('Invalid response');
        return [key, data[key], false];
      } catch { return [key, [], true]; }
    })).then((results) => {
      if (controller.signal.aborted) return;
      const next = { errors: {}, loading: false };
      for (const [key, items, failed] of results) { next[key] = items; next.errors[key] = failed; }
      setState(next);
    });
    return () => controller.abort();
  }, [authStatus, revision]);
  return { ...state, retry: () => setRevision((value) => value + 1) };
}
