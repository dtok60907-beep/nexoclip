'use client';

import { useEffect, useState } from 'react';

const DAY_MS = 86_400_000;
const DISMISS_KEY = 'nexoclip_promo_dismissed';
const day = (v) => new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

// The workspace's plan and whether the launch promo applies to it. Signed out, only the
// promo (from the public price list). Reloads when `refreshKey` changes, e.g. after the
// pricing dialog closes.
export function usePlanStatus(authStatus, refreshKey) {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    if (authStatus === 'loading') return undefined;
    let cancelled = false;
    const workspaceId = window.sessionStorage.getItem('nexoclip_workspace_id');
    const load = authStatus === 'authenticated' && workspaceId
      ? fetch('/api/billing/subscription', { credentials: 'include', headers: { 'x-workspace-id': workspaceId } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && { enabled: d.enabled, subscription: d.subscription, promo: d.plans?.find((p) => p.quote?.promoPercent)?.quote || null })
      : fetch('/api/public/plans')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && { enabled: d.subscriptionsEnabled, subscription: null, promo: d.promo ? { promoPercent: d.promo.percent, promoEndsAt: d.promo.endsAt } : null });
    load.then((next) => { if (!cancelled) setStatus(next); }).catch(() => {});
    return () => { cancelled = true; };
  }, [authStatus, refreshKey]);
  return status;
}

// Header pill: the plan and the days it has left, or a nudge to choose one.
export function PlanPill({ status, onClick }) {
  if (!status?.enabled) return null;
  const sub = status.subscription;
  const active = sub?.status === 'active';
  if (!active) {
    return <button type="button" onClick={onClick} className="suite-plan-pill suite-plan-pill--none" title="Choose a monthly plan">
      <span><strong>No plan</strong><small>{status.promo ? `${status.promo.promoPercent}% off 1st month` : 'Choose a plan'}</small></span>
    </button>;
  }
  const daysLeft = Math.max(0, Math.ceil((new Date(sub.currentPeriodEnd) - Date.now()) / DAY_MS));
  const soon = daysLeft <= 7;
  return <button type="button" onClick={onClick} className={`suite-plan-pill${soon ? ' suite-plan-pill--soon' : ''}`}
    title={`${sub.name} (${sub.interval}) until ${day(sub.currentPeriodEnd)}${soon ? '. Renew to keep your monthly credits.' : ''}`}>
    <span><strong>{sub.name}</strong><small>{daysLeft === 0 ? 'ends today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}</small></span>
  </button>;
}

// Strip above the Studio header while the promo applies to this visitor; closing it
// hides it until the next promo.
export function PromoBanner({ status, onOpen }) {
  const promo = status?.enabled ? status.promo : null;
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    if (!promo) return;
    try { setDismissed(window.localStorage.getItem(DISMISS_KEY) === promo.promoEndsAt); } catch { setDismissed(false); }
  }, [promo]);
  if (!promo || dismissed) return null;
  const close = () => {
    setDismissed(true);
    try { window.localStorage.setItem(DISMISS_KEY, promo.promoEndsAt); } catch { /* storage blocked */ }
  };
  return <div className="suite-promo-banner" role="region" aria-label="Promotion">
    <p>
      <b>Launch promo: {promo.promoPercent}% off your first month</b>
      <span> on any monthly plan, with every credit included. Until {day(new Date(promo.promoEndsAt) - 1)}.</span>
    </p>
    <button type="button" className="suite-promo-cta" onClick={onOpen}>See plans</button>
    <button type="button" className="suite-promo-close" onClick={close} aria-label="Close promotion">×</button>
  </div>;
}
