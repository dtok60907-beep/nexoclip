'use client';

import { useCallback, useEffect, useState } from 'react';
import { saasFetch } from '../src/lib/saas/api.js';
import { ENTERPRISE_POINTS, ENTERPRISE_WHATSAPP_URL, usualRows, useModelPrices } from './publicPricing';

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

const PLAN_AUDIENCE = {
  Starter: 'For creators starting out with AI: try every model and post a few pieces a week.',
  Creator: 'For creators and small brands posting every day, video and product photos.',
  Pro: 'For content teams and agencies running several brands at once.',
};

function planFeatures(modelCount) {
  return [
    [modelCount ? `All ${modelCount} AI models` : 'All AI models', 'Video and image, no model locked'],
    ['Image Studio and Video Studio', 'Text, image and reference to video'],
    ['Canvas', 'Chain prompts, references and results'],
    ['AI Director', 'A finished video from a brief'],
    ['Failed generations refunded', 'Credits come back automatically'],
    ['Top up anytime', 'Top-up credits never expire'],
    ['Upgrade anytime', 'Prorated for the rest of your period'],
    ['QRIS or virtual account', 'No card, no auto-debit'],
  ];
}

// What a month of credits buys with each model, or the features, in one card.
function PlanDetail({ tab, rows, credits, popular, features }) {
  if (tab === 'features') {
    return <ul className="divide-y divide-white/[.06]">{features.map(([name, detail]) => <li key={name} className="flex gap-2.5 py-2">
      <span className={`mt-0.5 grid h-4 w-4 flex-none place-items-center rounded-full text-[10px] font-black ${popular ? 'bg-[#d4ff64] text-black' : 'bg-white/10 text-[#d4ff64]'}`}>✓</span>
      <span className="min-w-0"><span className="block text-[13px] text-white/85">{name}</span><span className="block text-[11px] text-white/35">{detail}</span></span>
    </li>)}</ul>;
  }
  return <ul className="divide-y divide-white/[.06]">{rows.map((row) => {
    const n = Math.floor(credits / row.credits);
    return <li key={row.id} className="flex items-center justify-between gap-3 py-[7px]">
      <span className="min-w-0"><span className="block truncate text-[13px] text-white/85">{row.name}</span><span className="block truncate text-[11px] text-white/35">{row.config} · {number(Math.round(row.credits))} cr</span></span>
      <span className="flex-none text-right"><b className={`text-[15px] tabular-nums ${popular ? 'text-[#d4ff64]' : 'text-white'}`}>{n ? number(n) : '–'}</b><span className="block text-[10px] text-white/30">/ month</span></span>
    </li>;
  })}</ul>;
}

// Monthly and yearly plans above the top-ups. Renders nothing while subscriptions are
// off (SUBSCRIPTIONS_ENABLED). Payment is one period at a time; renewing is manual.
// Signed out, the plans come from the public price list and choosing one asks to log in.
export default function SubscriptionSection({ workspaceId, onCompleted, onRequireAuth }) {
  const [data, setData] = useState(null), [period, setPeriod] = useState('monthly'), [buying, setBuying] = useState(null), [message, setMessage] = useState(null);
  const [detailTab, setDetailTab] = useState('video');
  const rows = usualRows(useModelPrices());
  const modelCount = rows.video.length + rows.image.length;
  const smallest = data?.plans?.find((p) => p.interval === 'monthly');
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
    <div className="mt-5 grid items-start gap-4 md:grid-cols-3">
      {plans.map((plan) => {
        const current = active && sub.planCode === plan.code;
        const perMonth = plan.interval === 'yearly' ? plan.priceIdr / 12 : plan.priceIdr;
        const perCredit = perMonth / plan.monthlyCredits;
        const saving = smallest ? Math.round((1 - perCredit / (smallest.priceIdr / smallest.monthlyCredits)) * 100) : 0;
        const detailTabs = [['video', `Video · ${rows.video.length}`], ['image', `Image · ${rows.image.length}`], ['features', 'Features']];
        return <article key={plan.code} className={`relative flex flex-col overflow-hidden rounded-[22px] border ${plan.popular ? 'border-[#d4ff64]/60 bg-[linear-gradient(165deg,#26301b_0%,#141812_45%,#0f120e_100%)] shadow-[0_24px_70px_-30px_rgba(212,255,100,.45)]' : 'border-white/10 bg-[linear-gradient(165deg,#1a1d19_0%,#121411_50%,#0f110e_100%)]'}`}>
          <div className="p-5 pb-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-lg font-bold tracking-tight">{plan.name}</p>
              {plan.popular ? <span className="rounded-full bg-[#d4ff64] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-black">Most popular</span>
                : current ? <span className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-bold uppercase text-white/60">Your plan</span> : null}
            </div>
            <p className="mt-1.5 min-h-[34px] text-xs leading-relaxed text-white/45">{PLAN_AUDIENCE[plan.name]}</p>

            {plan.quote?.promoPercent
              ? <div className="mt-4">
                <div className="flex items-baseline gap-2"><span className="text-[34px] font-bold leading-none tracking-tight">{rupiah(plan.quote.amountIdr)}</span><span className="rounded-full bg-[#ff5a1f] px-2 py-0.5 text-[11px] font-bold text-white">-{plan.quote.promoPercent}%</span></div>
                <p className="mt-1.5 text-xs text-white/45">first month · <s>{rupiah(plan.quote.listPriceIdr)}</s> · then {rupiah(plan.quote.listPriceIdr)}/month</p>
              </div>
              : <div className="mt-4">
                <div className="flex items-baseline gap-1"><span className="text-[34px] font-bold leading-none tracking-tight">{rupiah(perMonth)}</span><span className="text-sm text-white/45">/month</span></div>
                <p className="mt-1.5 text-xs text-white/45">{plan.interval === 'yearly' ? `billed ${rupiah(plan.priceIdr)} a year · 2 months free` : 'billed monthly'}</p>
              </div>}
            {quoteNote(plan.quote) && !plan.quote?.promoPercent && <p className="mt-2 text-xs text-lime-100/80">{quoteNote(plan.quote)}</p>}

            <button type="button" disabled={buying !== null || plan.quote?.kind === 'scheduled'} onClick={() => buy(plan.code)} className={`mt-4 w-full rounded-full px-4 py-3 text-sm font-bold transition disabled:opacity-50 ${plan.popular ? 'bg-[#d4ff64] text-black hover:bg-[#e2ff91]' : 'border border-white/15 bg-white/[.06] text-white hover:border-[#d4ff64]/60 hover:text-[#d4ff64]'}`}>
              {buying === plan.code ? 'Opening checkout…' : `${quoteLabel(plan, current)} →`}
            </button>

            <div className="mt-4 grid grid-cols-3 overflow-hidden rounded-xl border border-white/[.08] bg-black/20 text-center">
              <div className="px-2 py-2.5"><p className="text-[15px] font-bold">{number(plan.monthlyCredits)}</p><p className="text-[10px] text-white/40">credits / month</p></div>
              <div className="border-x border-white/[.08] px-2 py-2.5"><p className="text-[15px] font-bold">{rupiah(perCredit)}</p><p className="text-[10px] text-white/40">per credit</p></div>
              <div className="px-2 py-2.5"><p className={`text-[15px] font-bold ${saving > 0 ? 'text-[#d4ff64]' : 'text-white/50'}`}>{saving > 0 ? `-${saving}%` : 'Base'}</p><p className="text-[10px] text-white/40">vs Starter</p></div>
            </div>
          </div>

          <div className="border-t border-white/[.08] bg-black/15 px-5 pb-5 pt-3">
            <div className="mb-1 flex gap-1 rounded-full bg-white/[.05] p-1" role="tablist" aria-label="Plan details">
              {detailTabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={detailTab === id} onClick={() => setDetailTab(id)} className={`flex-1 rounded-full py-1.5 text-[11px] font-bold transition ${detailTab === id ? 'bg-white text-black' : 'text-white/50 hover:text-white'}`}>{label}</button>)}
            </div>
            {detailTab !== 'features' && <p className="mb-1 mt-2 text-[10px] uppercase tracking-[.14em] text-white/30">Per month, any one of</p>}
            <PlanDetail tab={detailTab} rows={detailTab === 'image' ? rows.image : rows.video} credits={plan.monthlyCredits} popular={plan.popular} features={planFeatures(modelCount)} />
          </div>
        </article>;
      })}
    </div>

    <div className="mt-4 grid items-center gap-5 rounded-[22px] border border-white/10 bg-[linear-gradient(120deg,#1a1f17,#10120f_60%)] p-5 md:grid-cols-[1fr_1.3fr_auto]">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#d4ff64]">Enterprise</p>
        <p className="mt-1 text-xl font-bold tracking-tight">Need volume or a custom price?</p>
        <p className="mt-1 text-xs text-white/45">For companies, brands and agencies with high volume or special needs.</p>
      </div>
      <ul className="grid gap-x-5 gap-y-1.5 text-xs text-white/65 sm:grid-cols-2">{ENTERPRISE_POINTS.map((f) => <li key={f}><span className="mr-1.5 text-[#d4ff64]">✓</span>{f}</li>)}</ul>
      <a href={ENTERPRISE_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap rounded-full bg-[#d4ff64] px-5 py-3 text-center text-sm font-bold text-black transition hover:bg-[#e2ff91]">Chat via WhatsApp →</a>
    </div>
    <p className="mt-3 text-xs text-white/35">Counts assume all of a month's credits go to that one model, videos with audio. Other resolutions, durations and mixes: use the Calculator tab.</p>
    <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-white/45">
      <span>🔒 Secure checkout via Pakasir (QRIS, virtual account)</span>
      <span>No auto-debit: you renew when you choose</span>
      <span>Top-up credits never expire</span>
      <span>Help on WhatsApp</span>
    </p>
  </section>;
}
