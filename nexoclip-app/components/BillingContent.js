'use client';

import { useCallback, useEffect, useState } from 'react';
import { saasFetch } from '../src/lib/saas/api.js';
import SubscriptionSection from './SubscriptionSection';
import { usualRows, useModelPrices } from './publicPricing';

const POLL_INTERVAL_MS = 5000;
const POLL_LIMIT = 36; // About three minutes after returning from checkout.

const STATUS_STYLES = {
  pending: ['Waiting for payment', 'bg-amber-400/10 text-amber-200'],
  completed: ['Paid', 'bg-emerald-400/10 text-emerald-200'],
  canceled: ['Canceled', 'bg-white/[.06] text-white/50'],
  failed: ['Failed', 'bg-red-400/10 text-red-200'],
};

const NOTICE_STYLES = {
  info: 'border-lime-400/20 bg-lime-400/10 text-lime-200',
  success: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
  error: 'border-red-400/20 bg-red-400/10 text-red-200',
};

export { ENTERPRISE_WHATSAPP_URL } from './publicPricing';

export function formatRupiah(value) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(Number(value) || 0);
}

// The models a pack is shown in, priced by the app's engine (/api/public/model-prices).
const HIGHLIGHTS = ['seedance-2.5', 'seedance-2.0', 'kling-3.0-pro', 'veo-3.1-fast', 'nano-banana-2'];

export default function BillingContent({ workspaceId, balance, onCompleted, onRequireAuth, embedded = false }) {
  const [packages, setPackages] = useState(null);
  const [topups, setTopups] = useState([]);
  const [buying, setBuying] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const rows = usualRows(useModelPrices());
  const highlights = HIGHLIGHTS.map((id) => [...rows.video, ...rows.image].find((r) => r.id === id)).filter(Boolean);

  const load = useCallback(async () => {
    const data = await saasFetch('/api/billing/topups', { headers: workspaceId ? { 'x-workspace-id': workspaceId } : {} });
    setPackages(data.packages);
    setTopups(data.topups);
  }, [workspaceId]);

  // Package prices are public, so signed-out visitors see them too.
  useEffect(() => {
    load().catch((reason) => setError(reason.message));
  }, [load]);

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
    if (!workspaceId) {
      onRequireAuth?.();
      return;
    }
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

  return <main className={`${embedded ? 'h-full overflow-auto p-4 text-white sm:p-6' : 'h-full overflow-auto p-5 text-white md:p-8'}`}>
    <div className={`mx-auto ${embedded ? 'max-w-[1280px]' : 'max-w-5xl'}`}>
      <SubscriptionSection workspaceId={workspaceId} onCompleted={onCompleted} onRequireAuth={onRequireAuth} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#d4ff64]">Add-on</p>
          <h1 className="mt-1 text-2xl font-bold">Top up credits</h1>
          <p className="mt-1 text-sm text-white/45">Extra credits for subscribers, on top of your plan. Top-up credits never expire, and bigger packs come with bonus credits.</p>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[linear-gradient(135deg,#1a1f17,#10120f)] px-4 py-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#d4ff64]/15 text-lg text-[#d4ff64]">◈</span>
          <div>
            <p className="text-[10px] uppercase tracking-[.14em] text-white/40">Current balance</p>
            <p className="text-xl font-bold leading-tight">{balance !== null && balance !== undefined ? formatNumber(balance) : '—'} <span className="text-xs font-medium text-white/45">credits</span></p>
          </div>
        </div>
      </div>

      {notice && <p className={`mt-6 rounded-lg border px-4 py-3 text-sm ${NOTICE_STYLES[notice.tone]}`}>{notice.text}</p>}
      {error && <p className="mt-6 rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</p>}

      <div className="mt-6 grid items-start gap-4 md:grid-cols-3">
        {packages === null && !error && [0, 1, 2].map((key) => <div key={key} className="h-80 animate-pulse rounded-[22px] border border-white/10 bg-white/[.03]" />)}
        {packages?.map((pkg) => {
          const base = Math.round(pkg.credits / (1 + pkg.bonusPercent / 100));
          const perCredit = pkg.priceIdr / pkg.credits;
          const smallest = packages[0];
          const saving = smallest ? Math.round((1 - perCredit / (smallest.priceIdr / smallest.credits)) * 100) : 0;
          return <article
            key={pkg.code}
            className={`relative flex flex-col overflow-hidden rounded-[22px] border ${pkg.popular ? 'border-[#d4ff64]/60 bg-[linear-gradient(165deg,#26301b_0%,#141812_45%,#0f120e_100%)] shadow-[0_24px_70px_-30px_rgba(212,255,100,.45)]' : 'border-white/10 bg-[linear-gradient(165deg,#1a1d19_0%,#121411_50%,#0f110e_100%)]'}`}
          >
            <div className="p-5 pb-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-lg font-bold tracking-tight">{pkg.name} pack</p>
                <div className="flex gap-1.5">
                  {pkg.bonusPercent > 0 && <span className="rounded-full bg-[#d4ff64]/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#d4ff64]">+{pkg.bonusPercent}% bonus</span>}
                  {pkg.popular && <span className="rounded-full bg-[#d4ff64] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-black">Best value</span>}
                </div>
              </div>
              <p className="mt-1.5 min-h-[34px] text-xs leading-relaxed text-white/45">{pkg.description}</p>

              <div className="mt-4 flex items-baseline gap-1.5"><span className="text-[34px] font-bold leading-none tracking-tight">{formatNumber(pkg.credits)}</span><span className="text-sm text-white/45">credits</span></div>
              <p className="mt-1.5 text-xs text-white/45">{pkg.bonusPercent > 0 ? <>{formatNumber(base)} + <b className="text-[#d4ff64]">{formatNumber(pkg.credits - base)} bonus</b> · one-time payment</> : 'one-time payment'}</p>

              <button
                type="button"
                disabled={buying !== null}
                onClick={() => buy(pkg.code)}
                className={`mt-4 flex w-full items-center justify-between rounded-full px-5 py-3 text-sm font-bold transition disabled:opacity-50 ${pkg.popular ? 'bg-[#d4ff64] text-black hover:bg-[#e2ff91]' : 'border border-white/15 bg-white/[.06] text-white hover:border-[#d4ff64]/60 hover:text-[#d4ff64]'}`}
              >
                <span>{buying === pkg.code ? 'Opening checkout…' : `Buy ${pkg.name}`}</span>
                <span>{formatRupiah(pkg.priceIdr)} →</span>
              </button>

              <div className="mt-4 grid grid-cols-3 overflow-hidden rounded-xl border border-white/[.08] bg-black/20 text-center">
                <div className="px-2 py-2.5"><p className="text-[15px] font-bold">{formatRupiah(perCredit)}</p><p className="text-[10px] text-white/40">per credit</p></div>
                <div className="border-x border-white/[.08] px-2 py-2.5"><p className={`text-[15px] font-bold ${saving > 0 ? 'text-[#d4ff64]' : 'text-white/50'}`}>{saving > 0 ? `-${saving}%` : 'Base'}</p><p className="text-[10px] text-white/40">vs Starter pack</p></div>
                <div className="px-2 py-2.5"><p className="text-[15px] font-bold">∞</p><p className="text-[10px] text-white/40">never expire</p></div>
              </div>
            </div>

            {highlights.length > 0 && <div className="border-t border-white/[.08] bg-black/15 px-5 pb-5 pt-3">
              <p className="mb-1 text-[10px] uppercase tracking-[.14em] text-white/30">Any one of</p>
              <ul className="divide-y divide-white/[.06]">{highlights.map((row) => <li key={row.id} className="flex items-center justify-between gap-3 py-[7px]">
                <span className="min-w-0"><span className="block truncate text-[13px] text-white/85">{row.name}</span><span className="block truncate text-[11px] text-white/35">{row.config} · {formatNumber(Math.round(row.credits))} cr</span></span>
                <b className={`text-[15px] tabular-nums ${pkg.popular ? 'text-[#d4ff64]' : 'text-white'}`}>{formatNumber(Math.floor(pkg.credits / row.credits))}</b>
              </li>)}</ul>
            </div>}
          </article>;
        })}
      </div>

      <p className="mt-4 text-xs text-white/40">Pay with QRIS (any e-wallet or mobile banking) or a bank virtual account. Payments are processed by Pakasir; credits arrive within a minute of payment.</p>

      {!embedded && <section className="mt-8 overflow-hidden rounded-xl border border-white/10 bg-white/[.03]">
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
                  <td className="pr-3 text-right">{topup.paymentUrl && <a className="font-semibold text-lime-300 hover:underline" href={topup.paymentUrl}>Pay now</a>}</td>
                </tr>;
              }) : <tr><td colSpan="6" className="p-5 text-center text-white/45">No payments yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>}
    </div>
  </main>;
}
