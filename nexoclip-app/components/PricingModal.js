'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, Check, Coins, Sparkles, X } from 'lucide-react';
import { saasFetch } from '../src/lib/saas/api.js';
import { ENTERPRISE_WHATSAPP_URL } from './publicPricing';
import { NxPricingModalSkeleton } from './ui/nx-loading';
import { Highlight, HighlightItem } from './animate-ui/primitives/effects/highlight';
import { SlidingNumber } from './animate-ui/primitives/texts/sliding-number';

const formatRupiah = (value) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0);

const formatNumber = (value) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value) || 0);

const formatDay = (value) =>
  value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const PLAN_DESCRIPTIONS = {
  Starter: 'For individuals and side projects.',
  Creator: 'For creators and small teams posting daily.',
  Pro: 'For agencies and brands running at scale.',
};

const TOPUP_DESCRIPTIONS = {
  Starter: 'Quick boost for extra generations.',
  Creator: 'Best value for regular content runs.',
  Pro: 'High-volume pack for campaigns.',
};

function guestQuote(plan, promo) {
  if (!promo || plan.interval !== promo.interval || plan.tier !== promo.tier) {
    return { kind: 'new', amountIdr: plan.priceIdr };
  }
  return {
    kind: 'new',
    amountIdr: Math.round((plan.priceIdr * (100 - promo.percent)) / 100),
    listPriceIdr: plan.priceIdr,
    promoPercent: promo.percent,
    promoEndsAt: promo.endsAt,
  };
}

function planActionLabel(plan, isCurrent) {
  const q = plan.quote || { kind: 'new' };
  if (q.kind === 'upgrade') return `Upgrade · ${formatRupiah(q.amountIdr)}`;
  if (q.kind === 'switch') return `Switch to yearly`;
  if (q.kind === 'downgrade') return `Switch from ${formatDay(q.startsAt)}`;
  if (q.kind === 'scheduled') return `Starts ${formatDay(q.startsAt)}`;
  if (q.kind === 'renew' || isCurrent) return `Renew ${plan.name}`;
  return 'Get Started';
}

function planSubline(plan) {
  const q = plan.quote;
  if (q?.promoPercent) {
    return `First month · then ${formatRupiah(q.listPriceIdr)}/mo`;
  }
  if (q?.kind === 'upgrade') {
    return `Prorated · +${formatNumber(q.creditsNow)} credits now`;
  }
  if (q?.kind === 'switch') {
    return `Billed ${formatRupiah(plan.priceIdr)} / year · starts today`;
  }
  if (q?.kind === 'downgrade') {
    return `Starts ${formatDay(q.startsAt)}`;
  }
  if (q?.kind === 'renew') {
    return `Extends after ${formatDay(q.startsAt)}`;
  }
  if (plan.interval === 'yearly') {
    return `Billed ${formatRupiah(plan.priceIdr)} / year`;
  }
  return 'Billed monthly · no auto-debit';
}

function planHighlights(plan) {
  const creditsLine = `${formatNumber(plan.monthlyCredits)} credits / month`;
  if (plan.tier === 'starter' || plan.name === 'Starter') {
    return [
      creditsLine,
      'All video, image & audio models',
      'AI Director & Canvas Editor',
      'Watermark-free commercial exports',
      'Failed runs auto-refunded',
    ];
  }
  if (plan.tier === 'creator' || plan.name === 'Creator') {
    return [
      creditsLine,
      'Everything in Starter',
      'Higher monthly creation capacity',
      'Prorated upgrade anytime',
      'Top-up credits never expire',
    ];
  }
  return [
    creditsLine,
    'Everything in Creator',
    'Built for agencies & brand teams',
    'High-volume studio output',
    'Top-up credits never expire',
  ];
}

function topupHighlights(pkg, saving) {
  return [
    `${formatNumber(pkg.credits)} credits added immediately`,
    'Works on all AI models & studios',
    'Credits never expire',
    saving > 0 ? `Save ${saving}% per credit vs Starter` : 'One-time payment · no auto-debit',
  ];
}

export default function PricingModal({
  open = true,
  initialTab = 'plans',
  workspaceId,
  balance,
  onCompleted,
  onRequireAuth,
  onClose,
}) {
  const prefersReducedMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab === 'topup' ? 'topup' : 'plans');
  const [period, setPeriod] = useState('monthly');
  const [subData, setSubData] = useState(null);
  const [topupPackages, setTopupPackages] = useState(null);
  const [loading, setLoading] = useState(false);
  const [buyingCode, setBuyingCode] = useState(null);
  const [error, setError] = useState(null);

  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setActiveTab(initialTab === 'topup' ? 'topup' : 'plans');
    setError(null);
    setBuyingCode(null);
  }, [open, initialTab]);

  const loadData = useCallback(async () => {
    const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
    setLoading(true);
    setError(null);
    try {
      const [nextSub, nextTopups] = await Promise.all([
        workspaceId
          ? saasFetch('/api/billing/subscription', { headers }).catch(() => ({ enabled: false, plans: [], subscription: null }))
          : saasFetch('/api/public/plans')
              .then((p) => ({
                enabled: p.subscriptionsEnabled,
                plans: (p.plans || []).map((plan) => ({ ...plan, quote: guestQuote(plan, p.promo) })),
                subscription: null,
              }))
              .catch(() => ({ enabled: false, plans: [], subscription: null })),
        saasFetch('/api/billing/topups', { headers }).catch(() => ({ packages: [] })),
      ]);
      setSubData(nextSub);
      setTopupPackages(nextTopups?.packages || []);
      if (nextSub && !nextSub.enabled) {
        setActiveTab('topup');
      }
    } catch (reason) {
      setError({ message: reason.message || 'Could not load pricing right now.' });
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!open) return undefined;
    loadData();
    return undefined;
  }, [open, loadData]);

  // Focus management, Escape handling, and scroll lock without disturbing sidebar layout
  useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const rafId = window.requestAnimationFrame(() => {
      dialogRef.current?.focus({ preventScroll: true });
    });

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      const prev = previousFocusRef.current;
      if (prev && typeof prev.focus === 'function' && prev.isConnected) {
        prev.focus();
      }
    };
  }, [open, onClose]);

  const subscriptionsOn = subData === null ? true : Boolean(subData.enabled);
  const sub = subData?.subscription || null;
  const subActive = Boolean(sub && sub.status === 'active' && new Date(sub.currentPeriodEnd) > new Date());

  const visiblePlans = useMemo(() => {
    if (!subData?.plans) return [];
    return subData.plans.filter((p) => p.interval === period);
  }, [subData, period]);

  const promo = useMemo(
    () => subData?.plans?.find((p) => p.quote?.promoPercent)?.quote || null,
    [subData],
  );

  const handleBuyPlan = async (planCode) => {
    if (!workspaceId) {
      onRequireAuth?.('plans');
      return;
    }
    setBuyingCode(planCode);
    setError(null);
    try {
      const { order } = await saasFetch('/api/billing/subscription', {
        method: 'POST',
        headers: { 'x-workspace-id': workspaceId, 'content-type': 'application/json' },
        body: JSON.stringify({ planCode }),
      });
      onCompleted?.();
      window.location.assign(order.paymentUrl);
    } catch (reason) {
      setError({ message: reason.message || 'Could not start checkout.' });
      setBuyingCode(null);
    }
  };

  const handleBuyTopup = async (packageCode) => {
    if (!workspaceId) {
      onRequireAuth?.('topup');
      return;
    }
    setBuyingCode(packageCode);
    setError(null);
    try {
      const { topup } = await saasFetch('/api/billing/topups', {
        method: 'POST',
        headers: { 'x-workspace-id': workspaceId, 'content-type': 'application/json' },
        body: JSON.stringify({ packageCode }),
      });
      onCompleted?.();
      window.location.assign(topup.paymentUrl);
    } catch (reason) {
      setError({
        message: reason.message || 'Could not start top-up checkout.',
        needsPlan: reason.code === 'SUBSCRIPTION_REQUIRED' || /subscriber|plan first/i.test(reason.message || ''),
      });
      setBuyingCode(null);
    }
  };

  if (!mounted) return null;

  const showPlansView = activeTab === 'plans' && subscriptionsOn;
  const isInitialLoading = loading && ((showPlansView && !subData) || (!showPlansView && topupPackages === null));

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="nx-pricing-modal-backdrop"
          className="nx-pm-backdrop"
          initial={prefersReducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={prefersReducedMotion ? undefined : { opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose?.();
          }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="nx-pm-title"
            tabIndex={-1}
            className="nx-pm-dialog"
            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.98, y: 8 }}
            transition={
              prefersReducedMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 420, damping: 32 }
            }
          >
            {/* Top Bar: Mode Switcher + Close */}
            <div className="nx-pm-topbar">
              <span aria-hidden="true" />
              <div className="nx-pm-topbar-center">
                {subscriptionsOn && (
                  <Highlight
                    value={activeTab}
                    className="nx-pm-mode-switch"
                    highlightClassName="nx-pm-mode-pill"
                  >
                    <HighlightItem value="plans">
                      <button
                        type="button"
                        className={`nx-pm-mode-btn${activeTab === 'plans' ? ' is-active' : ''}`}
                        onClick={() => {
                          setActiveTab('plans');
                          setError(null);
                        }}
                      >
                        <Sparkles size={13} aria-hidden="true" />
                        <span>Plans</span>
                      </button>
                    </HighlightItem>
                    <HighlightItem value="topup">
                      <button
                        type="button"
                        className={`nx-pm-mode-btn${activeTab === 'topup' ? ' is-active' : ''}`}
                        onClick={() => {
                          setActiveTab('topup');
                          setError(null);
                        }}
                      >
                        <Coins size={13} aria-hidden="true" />
                        <span>Top up credits</span>
                      </button>
                    </HighlightItem>
                  </Highlight>
                )}
              </div>
              <motion.button
                type="button"
                className="nx-pm-close"
                aria-label="Close pricing dialog"
                onClick={onClose}
                whileHover={prefersReducedMotion ? undefined : { scale: 1.05 }}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.94 }}
                transition={{ type: 'spring', stiffness: 460, damping: 28 }}
              >
                <X size={16} aria-hidden="true" />
              </motion.button>
            </div>

            {/* Centered Hero */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={showPlansView ? 'plans-view' : 'topup-view'}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
              >
                {showPlansView ? (
                  <>
                    <div className="nx-pm-hero">
                      <h2 id="nx-pm-title" className="nx-pm-title">
                        Simple, transparent pricing
                      </h2>

                      <div className="nx-pm-period-wrap">
                        <Highlight
                          value={period}
                          className="nx-pm-period-toggle"
                          highlightClassName="nx-pm-period-pill"
                        >
                          <HighlightItem value="monthly">
                            <button
                              type="button"
                              className={`nx-pm-period-btn${period === 'monthly' ? ' is-active' : ''}`}
                              onClick={() => setPeriod('monthly')}
                            >
                              Monthly
                            </button>
                          </HighlightItem>
                          <HighlightItem value="yearly">
                            <button
                              type="button"
                              className={`nx-pm-period-btn${period === 'yearly' ? ' is-active' : ''}`}
                              onClick={() => setPeriod('yearly')}
                            >
                              Yearly
                            </button>
                          </HighlightItem>
                        </Highlight>

                        {period === 'monthly' && promo?.promoPercent ? (
                          <span className="nx-pm-save-pill is-promo">
                            {promo.promoPercent}% off Creator first month · Save 2 months with yearly
                          </span>
                        ) : (
                          <span className="nx-pm-save-pill">Save 2 months with yearly</span>
                        )}
                      </div>
                    </div>

                    {error && (
                      <div className="nx-pm-notice tone-error" role="alert">
                        <span>{error.message}</span>
                      </div>
                    )}

                    {isInitialLoading ? (
                      <NxPricingModalSkeleton count={3} />
                    ) : (
                      <div className="nx-pm-grid">
                        {visiblePlans.map((plan, idx) => {
                          const isCurrent = subActive && sub?.planCode === plan.code;
                          const isPopular = Boolean(plan.popular);
                          const displayPrice = plan.quote?.promoPercent
                            ? plan.quote.amountIdr
                            : plan.interval === 'yearly'
                              ? Math.round(plan.priceIdr / 12)
                              : plan.priceIdr;
                          const disabled = buyingCode !== null || plan.quote?.kind === 'scheduled';
                          const highlights = planHighlights(plan);

                          return (
                            <motion.article
                              key={plan.code}
                              className={`nx-pm-card${isPopular ? ' is-popular' : ''}`}
                              initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.24, delay: idx * 0.04, ease: [0.22, 1, 0.36, 1] }}
                            >
                              <div className="nx-pm-card-head">
                                <h3 className="nx-pm-plan-name">{plan.name}</h3>
                                {isPopular ? (
                                  <span className="nx-pm-badge is-popular">Most popular</span>
                                ) : isCurrent ? (
                                  <span className="nx-pm-badge is-current">Current plan</span>
                                ) : null}
                              </div>

                              <p className="nx-pm-plan-desc">
                                {PLAN_DESCRIPTIONS[plan.name] || 'Full access to every NexoClip studio.'}
                              </p>

                              <div className="nx-pm-price-block">
                                <div className="nx-pm-price-row">
                                  <span className="nx-pm-price">
                                    <SlidingNumber value={displayPrice} formatter={formatRupiah} />
                                  </span>
                                  <span className="nx-pm-price-unit">/mo</span>
                                  {plan.quote?.promoPercent && (
                                    <span className="nx-pm-price-strike">
                                      {formatRupiah(plan.quote.listPriceIdr)}
                                    </span>
                                  )}
                                </div>
                                <p className="nx-pm-price-sub">{planSubline(plan)}</p>
                              </div>

                              <motion.button
                                type="button"
                                disabled={disabled}
                                onClick={() => handleBuyPlan(plan.code)}
                                whileHover={prefersReducedMotion || disabled ? undefined : { y: -1 }}
                                whileTap={prefersReducedMotion || disabled ? undefined : { scale: 0.98 }}
                                transition={{ type: 'spring', stiffness: 460, damping: 28 }}
                                className={`nx-pm-cta ${isPopular ? 'is-primary' : 'is-secondary'}`}
                              >
                                {buyingCode === plan.code ? 'Opening checkout…' : planActionLabel(plan, isCurrent)}
                              </motion.button>

                              <div className="nx-pm-divider" aria-hidden="true" />

                              <p className="nx-pm-list-label">What&apos;s included</p>
                              <ul className="nx-pm-list">
                                {highlights.map((item) => (
                                  <li key={item} className="nx-pm-list-item">
                                    <Check size={14} strokeWidth={2.5} className="nx-pm-check" aria-hidden="true" />
                                    <span>{item}</span>
                                  </li>
                                ))}
                              </ul>
                            </motion.article>
                          );
                        })}
                      </div>
                    )}

                    <footer className="nx-pm-footer">
                      <span>Need custom volume?</span>
                      <a
                        href={ENTERPRISE_WHATSAPP_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="nx-pm-footer-link"
                      >
                        <span>Contact Enterprise</span>
                        <ArrowUpRight size={13} aria-hidden="true" />
                      </a>
                      <span className="nx-pm-footer-sep" aria-hidden="true" />
                      <span>Pay via QRIS or Virtual Account · No auto-debit</span>
                    </footer>
                  </>
                ) : (
                  <>
                    <div className="nx-pm-hero">
                      <h2 id="nx-pm-title" className="nx-pm-title">
                        Top up credits
                      </h2>
                      <div className="nx-pm-period-wrap" style={{ marginTop: 12 }}>
                        <span className="nx-pm-save-pill">
                          <span>One-time packs · Never expire</span>
                          {balance !== null && balance !== undefined && (
                            <>
                              <span aria-hidden="true">·</span>
                              <strong style={{ color: '#18181b' }}>{formatNumber(balance)} cr available</strong>
                            </>
                          )}
                        </span>
                      </div>
                    </div>

                    {error && (
                      <div className="nx-pm-notice tone-error" role="alert">
                        <span>{error.message}</span>
                        {error.needsPlan && subscriptionsOn && (
                          <button
                            type="button"
                            className="nx-pm-notice-action"
                            onClick={() => {
                              setActiveTab('plans');
                              setError(null);
                            }}
                          >
                            View plans →
                          </button>
                        )}
                      </div>
                    )}

                    {isInitialLoading ? (
                      <NxPricingModalSkeleton count={3} />
                    ) : (
                      <div className="nx-pm-grid">
                        {(topupPackages || []).map((pkg, idx) => {
                          const isPopular = Boolean(pkg.popular);
                          const smallest = topupPackages?.[0];
                          const saving =
                            smallest && smallest.credits > 0
                              ? Math.round((1 - (pkg.priceIdr / pkg.credits) / (smallest.priceIdr / smallest.credits)) * 100)
                              : 0;
                          const disabled = buyingCode !== null;
                          const highlights = topupHighlights(pkg, saving);

                          return (
                            <motion.article
                              key={pkg.code}
                              className={`nx-pm-card${isPopular ? ' is-popular' : ''}`}
                              initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.24, delay: idx * 0.04, ease: [0.22, 1, 0.36, 1] }}
                            >
                              <div className="nx-pm-card-head">
                                <h3 className="nx-pm-plan-name">{pkg.name}</h3>
                                {isPopular ? (
                                  <span className="nx-pm-badge is-popular">Best value</span>
                                ) : pkg.bonusPercent > 0 ? (
                                  <span className="nx-pm-badge is-current">+{pkg.bonusPercent}% bonus</span>
                                ) : null}
                              </div>

                              <p className="nx-pm-plan-desc">
                                {TOPUP_DESCRIPTIONS[pkg.name] || pkg.description || 'One-time extra credits for all studios.'}
                              </p>

                              <div className="nx-pm-price-block">
                                <div className="nx-pm-price-row">
                                  <span className="nx-pm-price">
                                    <SlidingNumber value={pkg.priceIdr} formatter={formatRupiah} />
                                  </span>
                                  <span className="nx-pm-price-unit">one-time</span>
                                </div>
                                <p className="nx-pm-price-sub">
                                  <strong>+{formatNumber(pkg.credits)} credits</strong> · never expire
                                </p>
                              </div>

                              <motion.button
                                type="button"
                                disabled={disabled}
                                onClick={() => handleBuyTopup(pkg.code)}
                                whileHover={prefersReducedMotion || disabled ? undefined : { y: -1 }}
                                whileTap={prefersReducedMotion || disabled ? undefined : { scale: 0.98 }}
                                transition={{ type: 'spring', stiffness: 460, damping: 28 }}
                                className={`nx-pm-cta ${isPopular ? 'is-primary' : 'is-secondary'}`}
                              >
                                {buyingCode === pkg.code
                                  ? 'Opening checkout…'
                                  : `Top up ${formatNumber(pkg.credits)} credits`}
                              </motion.button>

                              <div className="nx-pm-divider" aria-hidden="true" />

                              <p className="nx-pm-list-label">What&apos;s included</p>
                              <ul className="nx-pm-list">
                                {highlights.map((item) => (
                                  <li key={item} className="nx-pm-list-item">
                                    <Check size={14} strokeWidth={2.5} className="nx-pm-check" aria-hidden="true" />
                                    <span>{item}</span>
                                  </li>
                                ))}
                              </ul>
                            </motion.article>
                          );
                        })}
                      </div>
                    )}

                    <footer className="nx-pm-footer">
                      <span>Pay via QRIS or Virtual Account · Credits arrive within a minute</span>
                    </footer>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
