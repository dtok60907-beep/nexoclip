'use client';

import { useCallback, useEffect, useState } from 'react';
import { saasFetch } from '../src/lib/saas/api.js';

const rupiah = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(v) || 0);
const number = (v) => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const day = (v) => (v ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const DAY_MS = 86_400_000;

// What the button does for this account now (see quotePlan on the server).
function quoteLabel(plan, current) {
  const q = plan.quote || { kind: 'new' };
  if (q.kind === 'upgrade') return `Upgrade · pay ${rupiah(q.amountIdr)}`;
  if (q.kind === 'switch') return `Switch to yearly · ${rupiah(q.amountIdr)}`;
  if (q.kind === 'downgrade') return `Switch from ${day(q.startsAt)}`;
  if (q.kind === 'scheduled') return `Starts ${day(q.startsAt)}`;
  if (q.kind === 'renew' || current) return `Renew ${plan.name}`;
  return `Choose ${plan.name}`;
}

// A signed-out visitor sees what a new workspace pays (quotePlan on the server).
function guestQuote(plan, promo) {
  if (!promo || plan.interval !== promo.interval) return { kind: 'new', amountIdr: plan.priceIdr };
  return { kind: 'new', amountIdr: Math.round(plan.priceIdr * (100 - promo.percent) / 100), listPriceIdr: plan.priceIdr, promoPercent: promo.percent, promoEndsAt: promo.endsAt };
}

function quoteNote(q) {
  if (!q) return null;
  if (q.promoPercent) return `${q.promoPercent}% off your first month, full credits. Then ${rupiah(q.listPriceIdr)} a month.`;
  if (q.kind === 'upgrade') return `Prorated for the rest of your period: +${number(q.creditsNow)} credits now (until ${day(q.creditsExpireAt)}), then the bigger plan every month. Your renewal date stays.`;
  if (q.kind === 'switch') return 'A new yearly period starts today; credits you already have keep their dates.';
  if (q.kind === 'downgrade') return `Your current plan runs to its end; this one starts ${day(q.startsAt)}. Paid now.`;
  if (q.kind === 'renew') return `Adds another period after ${day(q.startsAt)}.`;
  return null;
}

// Monthly and yearly plans above the top-ups. Renders nothing while subscriptions are
// off (SUBSCRIPTIONS_ENABLED). Payment is one period at a time; renewing is manual.
// Signed out, the plans come from the public price list and choosing one asks to log in.
export default function SubscriptionSection({ workspaceId, onCompleted, onRequireAuth }) {
  const [data, setData] = useState(null), [period, setPeriod] = useState('monthly'), [buying, setBuying] = useState(null), [message, setMessage] = useState(null);
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
  const load = useCallback(() => (workspaceId
    ? saasFetch('/api/billing/subscription', { headers })
    : saasFetch('/api/public/plans').then((p) => ({ enabled: p.subscriptionsEnabled, plans: p.plans.map((plan) => ({ ...plan, quote: guestQuote(plan, p.promo) })), subscription: null }))
  ).then(setData), [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load().catch(() => {}); }, [load]);

  // Back from Pakasir with ?subscription=<order>: poll until it settles.
  useEffect(() => {
    if (!workspaceId) return undefined;
    const orderId = new URLSearchParams(window.location.search).get('subscription');
    if (!orderId) return undefined;
    let attempts = 0, timer, cancelled = false;
    setMessage({ tone: 'info', text: 'Confirming your payment…' });
    const done = (text, tone) => {
      setMessage({ tone, text });
      const url = new URL(window.location.href); url.searchParams.delete('subscription'); window.history.replaceState(null, '', url.pathname + url.search);
      load().catch(() => {}); onCompleted?.();
    };
    const poll = async () => {
      attempts += 1;
      try {
        const { order } = await saasFetch(`/api/billing/subscription/${encodeURIComponent(orderId)}`, { headers });
        if (cancelled) return;
        if (order.status === 'completed') return done('Payment received. Your plan is active and this month\'s credits are in your balance.', 'success');
        if (order.status !== 'pending') return done(`This payment was ${order.status}. You were not charged.`, 'error');
      } catch { /* retry */ }
      if (attempts < 20) timer = window.setTimeout(poll, 3000);
      else setMessage({ tone: 'info', text: 'Payment not confirmed yet. Your plan starts automatically once it clears.' });
    };
    poll();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [workspaceId, load]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data?.enabled) return null;
  const sub = data.subscription;
  const active = sub && sub.status === 'active' && new Date(sub.currentPeriodEnd) > new Date();
  const daysLeft = active ? Math.ceil((new Date(sub.currentPeriodEnd) - new Date()) / DAY_MS) : null;
  const plans = data.plans.filter((p) => p.interval === period);
  const promo = data.plans.find((p) => p.quote?.promoPercent)?.quote;

  async function buy(planCode) {
    if (!workspaceId) { onRequireAuth?.(); return; }
    setBuying(planCode); setMessage(null);
    try {
      const { order } = await saasFetch('/api/billing/subscription', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ planCode }) });
      window.location.assign(order.paymentUrl);
    } catch (e) { setMessage({ tone: 'error', text: e.message }); setBuying(null); }
  }

  const tones = { info: 'border-lime-300/20 bg-lime-300/10 text-lime-100', success: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100', error: 'border-red-400/20 bg-red-400/10 text-red-200' };
  return <section className="mb-10">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="text-2xl font-bold">Plans</h2>
        <p className="mt-1 text-sm text-white/45">Credits every month. Unused monthly credits expire at the end of their month; top-up credits never expire.</p>
      </div>
      <div className="flex rounded-xl border border-white/10 p-1 text-sm">
        {['monthly', 'yearly'].map((i) => <button key={i} type="button" onClick={() => setPeriod(i)} className={`rounded-lg px-3 py-1.5 ${period === i ? 'bg-white/10 text-white' : 'text-white/50'}`}>{i === 'monthly' ? 'Monthly' : 'Yearly · 2 months free'}</button>)}
      </div>
    </div>
    {promo && <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300/30 bg-gradient-to-r from-amber-300/15 to-pink-400/10 px-4 py-3 text-sm">
      <p className="text-amber-50"><b>Launch promo: {promo.promoPercent}% off your first month</b> on any monthly plan. You still get every credit.</p>
      <p className="text-xs text-amber-100/70">Until {day(new Date(new Date(promo.promoEndsAt) - 1))}</p>
    </div>}
    {active && <div className={`mt-4 grid gap-3 rounded-xl border p-4 text-sm sm:grid-cols-3 ${daysLeft <= 7 ? tones.info : 'border-white/10 bg-white/[.03] text-white/75'}`}>
      <div><p className="text-xs text-white/45">Your plan</p><p className="mt-1 font-semibold text-white">{sub.name} · {sub.interval}</p><p className="text-xs text-white/45">{number(sub.monthlyCredits)} credits every month</p></div>
      <div><p className="text-xs text-white/45">This month</p><p className="mt-1 font-semibold text-white">{number(data.expiringCredits?.credits)} credits left</p><p className="text-xs text-white/45">expire {day(sub.monthEndsAt)}{sub.monthEndsAt ? ` · ${Math.max(0, Math.ceil((new Date(sub.monthEndsAt) - new Date()) / DAY_MS))} days` : ''}</p></div>
      <div><p className="text-xs text-white/45">Renews manually</p><p className="mt-1 font-semibold text-white">by {day(sub.currentPeriodEnd)}</p><p className="text-xs text-white/45">{daysLeft} day{daysLeft === 1 ? '' : 's'} left{daysLeft <= 7 ? ' — renew below to keep your monthly credits' : ''}</p></div>
      {sub.pendingPlan && <p className="text-xs sm:col-span-3">From {day(sub.pendingPlan.startsAt)} your plan becomes <b>{sub.pendingPlan.name} ({sub.pendingPlan.interval})</b>.</p>}
    </div>}
    {sub && !active && <p className={`mt-4 rounded-lg border px-4 py-3 text-sm ${tones.info}`}>Your {sub.name} plan ended on {day(sub.currentPeriodEnd)}. Choose a plan to get monthly credits again.</p>}
    {message && <p className={`mt-4 rounded-lg border px-4 py-3 text-sm ${tones[message.tone]}`}>{message.text}</p>}
    <div className="mt-5 grid gap-4 sm:grid-cols-3">
      {plans.map((plan) => {
        const current = active && sub.planCode === plan.code;
        return <div key={plan.code} className={`relative flex flex-col rounded-2xl border p-5 ${plan.popular ? 'border-lime-300/50 bg-lime-300/[.05]' : 'border-white/10 bg-white/[.03]'}`}>
          {plan.popular && <span className="absolute -top-2.5 left-5 rounded-full bg-[#d4ff64] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black">Most popular</span>}
          <p className="text-sm font-semibold text-white/80">{plan.name}</p>
          <p className="mt-3 text-3xl font-bold">{number(plan.monthlyCredits)}<span className="ml-1 text-sm font-medium text-white/45">credits / month</span></p>
          {plan.quote?.promoPercent
            ? <p className="mt-1 text-lg font-semibold text-white/90"><s className="mr-1.5 text-sm font-medium text-white/35">{rupiah(plan.quote.listPriceIdr)}</s>{rupiah(plan.quote.amountIdr)}<span className="text-sm font-medium text-white/45"> first month</span> <span className="ml-1 rounded-full bg-amber-300/20 px-2 py-0.5 align-middle text-[10px] font-bold text-amber-100">-{plan.quote.promoPercent}%</span></p>
            : <p className="mt-1 text-lg font-semibold text-white/90">{rupiah(plan.priceIdr)}<span className="text-sm font-medium text-white/45"> / {plan.interval === 'yearly' ? 'year' : 'month'}</span></p>}
          {plan.interval === 'yearly' && <p className="mt-1 text-xs text-white/45">{rupiah(plan.priceIdr / 12)} a month, credits delivered monthly</p>}
          {quoteNote(plan.quote) && <p className="mt-3 text-xs text-lime-100/80">{quoteNote(plan.quote)}</p>}
          <div className="flex-1" />
          <button type="button" disabled={buying !== null || plan.quote?.kind === 'scheduled'} onClick={() => buy(plan.code)} className={`mt-5 w-full rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:opacity-50 ${plan.popular ? 'bg-[#d4ff64] text-black hover:bg-[#e0ff8c]' : 'bg-white/[.08] text-white hover:bg-white/[.12]'}`}>
            {buying === plan.code ? 'Opening checkout…' : quoteLabel(plan, current)}
          </button>
        </div>;
      })}
    </div>
    <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-white/45">
      <span>🔒 Secure checkout via Pakasir (QRIS, virtual account)</span>
      <span>No auto-debit: you renew when you choose</span>
      <span>Top-up credits never expire</span>
      <span>Help on WhatsApp</span>
    </p>
  </section>;
}
