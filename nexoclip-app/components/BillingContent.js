'use client';

import { useCallback, useEffect, useState } from 'react';
import { saasFetch } from '../src/lib/saas/api.js';

const POLL_INTERVAL_MS = 5000;
const POLL_LIMIT = 36; // About three minutes after returning from checkout.

const STATUS_STYLES = {
  pending: ['Waiting for payment', 'bg-amber-400/10 text-amber-200'],
  completed: ['Paid', 'bg-emerald-400/10 text-emerald-200'],
  canceled: ['Canceled', 'bg-white/[.06] text-white/50'],
  failed: ['Failed', 'bg-red-400/10 text-red-200'],
};

const NOTICE_STYLES = {
  info: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-200',
  success: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
  error: 'border-red-400/20 bg-red-400/10 text-red-200',
};

export function formatRupiah(value) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function formatNumber(value) {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(Number(value) || 0);
}

// What a package buys, priced live by the same rules as the charge.
const EXAMPLES = [
  { label: 'Nano Banana images', query: 'kind=image&model=google%2Fgemini-2.5-flash-image' },
  { label: 'Kling 3 videos (5s)', query: 'kind=video&model=kwaivgi%2Fkling-v3.0-std&duration=5' },
  { label: 'Seedance 2.5 videos (720p, 5s)', query: 'kind=video&model=bytedance%2Fseedance-2.5&resolution=720p&duration=5' },
];

function useExamplePrices() {
  const [prices, setPrices] = useState([]);
  useEffect(() => {
    let cancelled = false;
    Promise.all(EXAMPLES.map(async (example) => {
      try {
        const response = await fetch(`/api/generations/price?${example.query}`);
        const { credits } = await response.json();
        return credits > 0 ? { label: example.label, credits } : null;
      } catch { return null; }
    })).then((results) => { if (!cancelled) setPrices(results.filter(Boolean)); });
    return () => { cancelled = true; };
  }, []);
  return prices;
}

export default function BillingContent({ workspaceId, balance, onCompleted }) {
  const [packages, setPackages] = useState(null);
  const [topups, setTopups] = useState([]);
  const [buying, setBuying] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const examples = useExamplePrices();

  const load = useCallback(async () => {
    const data = await saasFetch('/api/billing/topups', { headers: { 'x-workspace-id': workspaceId } });
    setPackages(data.packages);
    setTopups(data.topups);
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    load().catch((reason) => setError(reason.message));
  }, [workspaceId, load]);

  // After checkout Pakasir redirects back with ?topup=<id>; poll until settled.
  useEffect(() => {
    if (!workspaceId) return undefined;
    const topupId = new URLSearchParams(window.location.search).get('topup');
    if (!topupId) return undefined;
    let attempts = 0;
    let timer;
    let cancelled = false;
    setNotice({ tone: 'info', text: 'Confirming your payment…' });

    const clearQuery = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete('topup');
      window.history.replaceState(null, '', url.pathname + url.search);
    };

    const poll = async () => {
      attempts += 1;
      try {
        const { topup } = await saasFetch(`/api/billing/topups/${encodeURIComponent(topupId)}`, { headers: { 'x-workspace-id': workspaceId } });
        if (cancelled) return;
        if (topup.status === 'completed') {
          setNotice({ tone: 'success', text: `Payment received. ${formatNumber(topup.credits)} credits were added to your balance.` });
          clearQuery();
          load().catch(() => {});
          onCompleted?.();
          return;
        }
        if (topup.status !== 'pending') {
          setNotice({ tone: 'error', text: `This top-up was ${topup.status}. You were not charged.` });
          clearQuery();
          load().catch(() => {});
          return;
        }
      } catch (reason) {
        if (cancelled) return;
        if (reason.status === 404 || reason.status === 409) {
          setNotice({ tone: 'error', text: reason.message });
          clearQuery();
          return;
        }
      }
      if (attempts >= POLL_LIMIT) {
        setNotice({ tone: 'info', text: 'Payment not confirmed yet. Credits are added automatically once it clears.' });
        return;
      }
      timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    };
    poll();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [workspaceId, load, onCompleted]);

  const buy = async (packageCode) => {
    setBuying(packageCode);
    setError(null);
    try {
      const { topup } = await saasFetch('/api/billing/topups', {
        method: 'POST',
        headers: { 'x-workspace-id': workspaceId, 'content-type': 'application/json' },
        body: JSON.stringify({ packageCode }),
      });
      window.location.assign(topup.paymentUrl);
    } catch (reason) {
      setError(reason.message);
      setBuying(null);
    }
  };

  return <main className="h-full overflow-auto p-5 text-white md:p-8">
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Top up credits</h1>
          <p className="mt-1 text-sm text-white/45">Credits pay for every image and video you generate. They never expire.</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[.03] px-4 py-3 text-right">
          <p className="text-xs text-white/45">Current balance</p>
          <p className="mt-1 text-xl font-bold"><span className="text-cyan-300">◈</span> {balance !== null && balance !== undefined ? formatNumber(balance) : '—'} <span className="text-xs font-medium text-white/45">credits</span></p>
        </div>
      </div>

      {notice && <p className={`mt-6 rounded-lg border px-4 py-3 text-sm ${NOTICE_STYLES[notice.tone]}`}>{notice.text}</p>}
      {error && <p className="mt-6 rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</p>}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {packages === null && !error && [0, 1, 2, 3].map((key) => <div key={key} className="h-64 animate-pulse rounded-2xl border border-white/10 bg-white/[.03]" />)}
        {packages?.map((pkg) => <div
          key={pkg.code}
          className={`relative flex flex-col rounded-2xl border p-5 ${pkg.popular ? 'border-cyan-300/50 bg-cyan-300/[.05] shadow-[0_0_60px_-20px_rgba(34,211,238,0.35)]' : 'border-white/10 bg-white/[.03]'}`}
        >
          {pkg.popular && <span className="absolute -top-2.5 left-5 rounded-full bg-[#22d3ee] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black">Most popular</span>}
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-white/80">{pkg.name}</p>
            {pkg.bonusPercent > 0 && <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold text-emerald-200">+{pkg.bonusPercent}% bonus</span>}
          </div>
          <p className="mt-3 text-3xl font-bold">{formatNumber(pkg.credits)}<span className="ml-1 text-sm font-medium text-white/45">credits</span></p>
          <p className="mt-1 text-lg font-semibold text-white/90">{formatRupiah(pkg.priceIdr)}</p>
          <p className="mt-3 text-sm text-white/55">{pkg.description}</p>
          <ul className="mt-3 flex-1 space-y-1 text-xs text-white/45">
            {examples.map((example) => <li key={example.label}>≈ {formatNumber(Math.floor(pkg.credits / example.credits))} {example.label}</li>)}
          </ul>
          <button
            type="button"
            disabled={buying !== null}
            onClick={() => buy(pkg.code)}
            className={`mt-5 w-full rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:opacity-50 ${pkg.popular ? 'bg-[#22d3ee] text-black hover:bg-cyan-300' : 'bg-white/[.08] text-white hover:bg-white/[.12]'}`}
          >
            {buying === pkg.code ? 'Opening checkout…' : `Buy ${pkg.name}`}
          </button>
        </div>)}
      </div>

      <p className="mt-4 text-xs text-white/40">Pay with QRIS (any e-wallet or mobile banking) or a bank virtual account. Payments are processed by Pakasir; credits arrive within a minute of payment.</p>

      <section className="mt-8 overflow-hidden rounded-xl border border-white/10 bg-white/[.03]">
        <h2 className="border-b border-white/10 p-3 text-sm font-bold">Payment history</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs text-white/45"><tr><th className="p-3">Date</th><th>Package</th><th>Amount</th><th>Credits</th><th>Status</th><th /></tr></thead>
            <tbody>
              {topups.length ? topups.map((topup) => {
                const [label, style] = STATUS_STYLES[topup.status] || [topup.status, 'bg-white/[.06] text-white/60'];
                const pkg = packages?.find((item) => item.code === topup.packageCode);
                return <tr key={topup.id} className="border-t border-white/10">
                  <td className="p-3 text-white/60">{new Date(topup.createdAt).toLocaleString('id-ID')}</td>
                  <td>{pkg?.name || topup.packageCode}</td>
                  <td>{formatRupiah(topup.amountIdr)}</td>
                  <td>{formatNumber(topup.credits)}</td>
                  <td><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${style}`}>{label}{topup.isSandbox ? ' · sandbox' : ''}</span></td>
                  <td className="pr-3 text-right">{topup.paymentUrl && <a className="font-semibold text-cyan-300 hover:underline" href={topup.paymentUrl}>Pay now</a>}</td>
                </tr>;
              }) : <tr><td colSpan="6" className="p-5 text-center text-white/45">No payments yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </main>;
}
