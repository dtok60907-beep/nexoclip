'use client';

import { useEffect, useState } from 'react';
import { saasFetch } from '../src/lib/saas/api.js';

export function formatCredits(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '0';
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(amount);
}

export function formatUnits(units) {
  const entries = Object.entries(units || {}).filter(([, value]) => value !== null && value !== undefined);
  if (!entries.length) return '—';
  return entries.map(([name, value]) => `${typeof value === 'number' ? new Intl.NumberFormat().format(value) : value} ${name}`).join(', ');
}

export function usagePath({ scope, page }) {
  return `/api/usage?scope=${encodeURIComponent(scope)}&page=${page}&pageSize=25`;
}

export default function UsageContent({ workspaceId, onBalanceChange, onTopUp }) {
  const [scope, setScope] = useState('me');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    setError(null);
    saasFetch(usagePath({ scope, page }), { headers: { 'x-workspace-id': workspaceId } })
      .then((next) => {
        if (cancelled) return;
        setData(next);
        onBalanceChange?.(next.balance);
      })
      .catch((reason) => !cancelled && setError(reason.message));
    return () => { cancelled = true; };
  }, [workspaceId, scope, page, retry, onBalanceChange]);

  if (error) return <div className="p-6 text-red-300">{error} <button className="underline" onClick={() => setRetry((value) => value + 1)}>Retry</button></div>;
  if (!data) return <div className="p-6 text-white/50">Loading usage…</div>;
  const { summary, permissions, items, pagination } = data;
  return <main className="h-full overflow-auto p-5 md:p-8 text-white">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-bold">Usage</h1><p className="mt-1 text-sm text-white/45">Monitor your credit usage and generations.</p></div>{onTopUp && <button type="button" onClick={onTopUp} className="rounded-xl bg-[#22d3ee] px-4 py-2 text-sm font-bold text-black transition hover:bg-cyan-300">Top up credits</button>}</div>
    <div className="mt-6 grid gap-3 md:grid-cols-3">
      {[['Balance', `${formatCredits(data.balance)} credits`], ['Used this month', `${formatCredits(summary.creditsUsed)} credits`], ['Generations', summary.generationCount]].map(([label, value]) => <div key={label} className="rounded-xl border border-white/10 bg-white/[.03] p-4"><p className="text-xs text-white/45">{label}</p><p className="mt-2 text-xl font-bold">{value}</p></div>)}
    </div>
    <div className="mt-6 overflow-hidden rounded-xl border border-white/10 bg-white/[.03]">
      <div className="flex items-center gap-3 border-b border-white/10 p-3 text-sm"><button className={scope === 'me' ? 'font-bold text-cyan-300' : 'text-white/45'} onClick={() => { setScope('me'); setPage(1); }}>My usage</button>{permissions.canViewWorkspace && <button className={scope === 'workspace' ? 'font-bold text-cyan-300' : 'text-white/45'} onClick={() => { setScope('workspace'); setPage(1); }}>Workspace usage</button>}</div>
      <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="text-xs text-white/45"><tr><th className="p-3">Generation</th><th>Model</th><th>Status</th><th>Units</th><th>Credits</th></tr></thead><tbody>{items.length ? items.map((item) => <tr key={item.id} className="border-t border-white/10"><td className="max-w-[260px] truncate p-3">{item.prompt || item.kind}</td><td>{item.model}</td><td>{item.status}</td><td>{formatUnits(item.units)}</td><td>{formatCredits(item.credits)}{item.estimated ? ' est.' : ''}</td></tr>) : <tr><td colSpan="5" className="p-5 text-center text-white/45">No usage yet.</td></tr>}</tbody></table></div>
      <div className="flex justify-end gap-2 border-t border-white/10 p-3"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span className="px-2 text-white/45">{pagination.page} / {pagination.totalPages || 1}</span><button disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)}>Next</button></div>
    </div>
  </main>;
}
