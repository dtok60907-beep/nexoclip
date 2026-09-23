'use client';

import { useEffect, useState } from 'react';

export default function AssetsContent() {
  const [assets, setAssets] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    const workspaceId = window.sessionStorage.getItem('nexoclip_workspace_id');
    if (!workspaceId) { setError('Workspace belum tersedia. Buka Studio terlebih dahulu.'); setStatus('error'); return; }
    fetch('/api/assets', { headers: { 'x-workspace-id': workspaceId }, credentials: 'include' })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Gagal memuat assets'); return body.assets || []; })
      .then((items) => { setAssets(items); setStatus('ready'); })
      .catch((reason) => { setError(reason.message); setStatus('error'); });
  }, []);

  return <section className="min-h-full bg-[#FCEED1] px-5 py-8 text-[#110C2A] md:px-10"><header className="mx-auto mb-8 flex max-w-7xl items-center justify-between"><div><h1 className="text-2xl font-semibold">Assets</h1><p className="mt-1 text-sm text-[#110C2A]/55">Semua hasil image yang tersimpan di workspace.</p></div><a href="/studio" className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-black hover:bg-cyan-300">Generate image</a></header>{status === 'loading' && <p className="text-sm text-[#110C2A]/55">Loading assets…</p>}{status === 'error' && <p className="rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">{error}</p>}{status === 'ready' && assets.length === 0 && <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-12 text-center text-white/45">Belum ada assets. Generate image pertama kamu di Studio.</div>}{assets.length > 0 && <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">{assets.map((asset) => <article key={asset.id} className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03]"><div className="aspect-square bg-black">{asset.content_type.startsWith('image/') && asset.url ? <img src={asset.url} alt={asset.filename} className="h-full w-full object-cover" loading="lazy" /> : <div className="grid h-full place-items-center text-xs text-[#110C2A]/55">{asset.content_type}</div>}</div><div className="p-3"><p className="truncate text-xs text-[#110C2A]/80">{asset.filename}</p><p className="mt-1 text-[11px] text-[#110C2A]/50">{new Date(asset.created_at).toLocaleString()}</p>{asset.url && <a href={asset.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-cyan-300 hover:text-cyan-200">Open</a>}</div></article>)}</div>}</section>;
}
