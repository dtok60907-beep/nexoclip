'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  Check,
  Infinity as InfinityIcon,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { saasFetch } from '../src/lib/saas/api.js';
import { ENTERPRISE_POINTS, ENTERPRISE_WHATSAPP_URL, usualRows, useModelPrices } from './publicPricing';
import { NxBillingPlansSkeleton } from './ui/nx-loading';
import { Highlight, HighlightItem } from './animate-ui/primitives/effects/highlight';
import { SlidingNumber } from './animate-ui/primitives/texts/sliding-number';

const rupiah = (v) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(v) || 0);
const number = (v) => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const day = (v) => (v ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const DAY_MS = 86_400_000;

function quoteLabel(plan, current) {
  const q = plan.quote || { kind: 'new' };
  if (q.kind === 'upgrade') return `Upgrade · pay ${rupiah(q.amountIdr)}`;
  if (q.kind === 'switch') return `Switch to yearly · ${rupiah(q.amountIdr)}`;
  if (q.kind === 'downgrade') return `Switch from ${day(q.startsAt)}`;
  if (q.kind === 'scheduled') return `Starts ${day(q.startsAt)}`;
  if (q.kind === 'renew' || current) return `Renew ${plan.name}`;
  return `Choose ${plan.name}`;
}

function guestQuote(plan, promo) {
  if (!promo || plan.interval !== promo.interval || plan.tier !== promo.tier) return { kind: 'new', amountIdr: plan.priceIdr };
  return {
    kind: 'new',
    amountIdr: Math.round((plan.priceIdr * (100 - promo.percent)) / 100),
    listPriceIdr: plan.priceIdr,
    promoPercent: promo.percent,
    promoEndsAt: promo.endsAt,
  };
}

function quoteNote(q) {
  if (!q) return null;
  if (q.promoPercent) return `${q.promoPercent}% off your first month, full credits. Then ${rupiah(q.listPriceIdr)} a month.`;
  if (q.kind === 'upgrade')
    return `Prorated for the rest of your period: +${number(q.creditsNow)} credits now (until ${day(q.creditsExpireAt)}), then the bigger plan every month. Your renewal date stays.`;
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
    ['Image Studio', 'Text-to-image, image editing and references'],
    ['Video Studio', 'Text, image and reference-to-video workflows'],
    ['Canvas', 'Chain prompts, references and results'],
    ['AI Director', 'Create a finished video from a brief'],
    ['Failed generations refunded', 'Credits come back automatically'],
    ['Watermark-free exports', 'Clean output for your content'],
    ['Commercial use', 'Use your generated content commercially'],
    ['Top up anytime', 'Top-up credits never expire'],
    ['Upgrade anytime', 'Prorated for the rest of your period'],
    ['QRIS or virtual account', 'No card, no auto-debit'],
  ];
}

function PlanDetail({ tab, rows, popular, features }) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={tab}
        initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={prefersReducedMotion ? undefined : { opacity: 0, y: -4 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
      >
        {tab === 'features' ? (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {features.map(([name, detail], idx) => (
              <li
                key={name}
                style={{
                  display: 'flex',
                  gap: 10,
                  padding: '8px 0',
                  borderTop: idx === 0 ? 0 : '1px solid #f0f0f7',
                }}
              >
                <span className={`nx-bill-check${popular ? ' is-popular' : ''}`} style={{ marginTop: 2 }}>
                  <Check size={11} strokeWidth={2.8} aria-hidden="true" />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 550, color: 'var(--nx-ub-ink)' }}>{name}</span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--nx-ub-muted)' }}>{detail}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {rows.map((row, idx) => (
              <li
                key={row.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '7px 0',
                  borderTop: idx === 0 ? 0 : '1px solid #f0f0f7',
                }}
              >
                <span className={`nx-bill-check${popular ? ' is-popular' : ''}`}>
                  <Check size={11} strokeWidth={2.8} aria-hidden="true" />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 12.5,
                      fontWeight: 550,
                      color: 'var(--nx-ub-ink)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {row.name}
                  </span>
                  {row.duration ? (
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--nx-ub-muted)' }}>
                      hingga {row.duration} detik
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

export default function SubscriptionSection({ workspaceId, onCompleted, onRequireAuth }) {
  const prefersReducedMotion = useReducedMotion();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('monthly');
  const [buying, setBuying] = useState(null);
  const [message, setMessage] = useState(null);
  const [detailTab, setDetailTab] = useState('video');
  const rows = usualRows(useModelPrices());
  const modelCount = rows.video.length + rows.image.length;
  const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};

  const load = useCallback(
    () =>
      (workspaceId
        ? saasFetch('/api/billing/subscription', { headers })
        : saasFetch('/api/public/plans').then((p) => ({
            enabled: p.subscriptionsEnabled,
            plans: p.plans.map((plan) => ({ ...plan, quote: guestQuote(plan, p.promo) })),
            subscription: null,
          }))
      ).then(setData),
    [workspaceId], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    load()
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);

  // Back from Pakasir with ?subscription=<order>: poll until it settles.
  useEffect(() => {
    if (!workspaceId) return undefined;
    const orderId = new URLSearchParams(window.location.search).get('subscription');
    if (!orderId) return undefined;
    let attempts = 0;
    let timer;
    let cancelled = false;
    setMessage({ tone: 'info', text: 'Confirming your payment…' });
    const done = (text, tone) => {
      setMessage({ tone, text });
      const url = new URL(window.location.href);
      url.searchParams.delete('subscription');
      window.history.replaceState(null, '', url.pathname + url.search);
      load().catch(() => {});
      onCompleted?.();
    };
    const poll = async () => {
      attempts += 1;
      try {
        const { order } = await saasFetch(`/api/billing/subscription/${encodeURIComponent(orderId)}`, { headers });
        if (cancelled) return;
        if (order.status === 'completed') {
          return done("Payment received. Your plan is active and this month's credits are in your balance.", 'success');
        }
        if (order.status !== 'pending') {
          return done(`This payment was ${order.status}. You were not charged.`, 'error');
        }
      } catch {
        /* retry */
      }
      if (attempts < 20) timer = window.setTimeout(poll, 3000);
      else setMessage({ tone: 'info', text: 'Payment not confirmed yet. Your plan starts automatically once it clears.' });
    };
    poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [workspaceId, load]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) return <NxBillingPlansSkeleton count={3} />;
  if (!data?.enabled) return null;

  const sub = data.subscription;
  const active = sub && sub.status === 'active' && new Date(sub.currentPeriodEnd) > new Date();
  const daysLeft = active ? Math.ceil((new Date(sub.currentPeriodEnd) - new Date()) / DAY_MS) : null;
  const plans = data.plans.filter((p) => p.interval === period);
  const promo = data.plans.find((p) => p.quote?.promoPercent)?.quote;

  async function buy(planCode) {
    if (!workspaceId) {
      onRequireAuth?.();
      return;
    }
    setBuying(planCode);
    setMessage(null);
    try {
      const { order } = await saasFetch('/api/billing/subscription', {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ planCode }),
      });
      window.location.assign(order.paymentUrl);
    } catch (e) {
      setMessage({ tone: 'error', text: e.message });
      setBuying(null);
    }
  }

  const remainingRatio =
    active && Number(sub.monthlyCredits) > 0
      ? Math.max(0, Math.min(1, Number(data.expiringCredits?.credits || 0) / Number(sub.monthlyCredits)))
      : 0;
  const filledTicks = remainingRatio > 0 ? Math.max(1, Math.round(remainingRatio * 18)) : 0;

  return (
    <section className="nx-bill-section">
      <div className="nx-bill-section-head">
        <div>
          <p className="nx-bill-eyebrow">
            <Sparkles size={12} aria-hidden="true" />
            <span>Subscription Plans</span>
          </p>
          <h2 className="nx-bill-heading">Monthly &amp; yearly plans</h2>
          <p className="nx-bill-desc">
            Fresh credits every month with full access to every studio. Unused monthly credits expire at month end; top-up credits never expire.
          </p>
        </div>

        <Highlight
          value={period}
          className="nx-ub-segmented"
          highlightClassName="nx-ub-segmented-pill"
        >
          <HighlightItem value="monthly">
            <button
              type="button"
              onClick={() => setPeriod('monthly')}
              className={`nx-ub-segmented-btn${period === 'monthly' ? ' is-active' : ''}`}
            >
              Monthly
            </button>
          </HighlightItem>
          <HighlightItem value="yearly">
            <button
              type="button"
              onClick={() => setPeriod('yearly')}
              className={`nx-ub-segmented-btn${period === 'yearly' ? ' is-active' : ''}`}
            >
              <span>Yearly</span>
              <span className="nx-bill-badge is-soft" style={{ padding: '2px 7px', fontSize: 10 }}>
                2 mo free
              </span>
            </button>
          </HighlightItem>
        </Highlight>
      </div>

      {promo && (
        <motion.div
          className="nx-bill-promo"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24 }}
        >
          <p style={{ margin: 0 }}>
            <strong style={{ color: 'var(--nx-ub-violet)' }}>
              Launch promo: {promo.promoPercent}% off Creator for the first month
            </strong>
            <span style={{ color: 'var(--nx-ub-ink-secondary)' }}> — full credit allocation included.</span>
          </p>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--nx-ub-muted)' }}>
            Until {day(new Date(new Date(promo.promoEndsAt) - 1))}
          </span>
        </motion.div>
      )}

      {active && (
        <div className={`nx-ub-card nx-bill-active-strip${daysLeft <= 7 ? ' is-soon' : ''}`}>
          <div className="nx-bill-active-cell">
            <p style={{ margin: 0, fontSize: 11.5, color: 'var(--nx-ub-muted)', fontWeight: 500 }}>Your active plan</p>
            <p style={{ margin: '5px 0 2px', fontSize: 17, fontWeight: 700, color: 'var(--nx-ub-ink)' }}>
              {sub.name}{' '}
              <span style={{ fontSize: 12.5, fontWeight: 550, color: 'var(--nx-ub-violet)', textTransform: 'capitalize' }}>
                · {sub.interval}
              </span>
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--nx-ub-muted)' }}>
              {number(sub.monthlyCredits)} credits every month
            </p>
          </div>

          <div className="nx-bill-active-cell" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <p style={{ margin: 0, fontSize: 11.5, color: 'var(--nx-ub-muted)', fontWeight: 500 }}>This month remaining</p>
              <p style={{ margin: '5px 0 2px', fontSize: 17, fontWeight: 700, color: 'var(--nx-ub-ink)', fontVariantNumeric: 'tabular-nums' }}>
                {number(data.expiringCredits?.credits)} credits left
              </p>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--nx-ub-muted)' }}>
                Expires {day(sub.monthEndsAt)}
                {sub.monthEndsAt ? ` · ${Math.max(0, Math.ceil((new Date(sub.monthEndsAt) - new Date()) / DAY_MS))}d` : ''}
              </p>
            </div>
            <div className="nx-ub-ticks" aria-hidden="true">
              {Array.from({ length: 18 }).map((_, i) => (
                <span key={i} className={`nx-ub-tick${i < filledTicks ? ' is-filled tone-violet' : ''}`} />
              ))}
            </div>
          </div>

          <div className="nx-bill-active-cell">
            <p style={{ margin: 0, fontSize: 11.5, color: 'var(--nx-ub-muted)', fontWeight: 500 }}>Renews manually</p>
            <p style={{ margin: '5px 0 2px', fontSize: 17, fontWeight: 700, color: 'var(--nx-ub-ink)' }}>
              by {day(sub.currentPeriodEnd)}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: daysLeft <= 7 ? 'var(--nx-ub-amber-ink)' : 'var(--nx-ub-muted)' }}>
              {daysLeft} day{daysLeft === 1 ? '' : 's'} left
              {daysLeft <= 7 ? ' — renew below to keep monthly credits' : ''}
            </p>
          </div>

          {sub.pendingPlan && (
            <div
              style={{
                gridColumn: '1 / -1',
                padding: '10px 20px',
                borderTop: '1px solid var(--nx-ub-border)',
                backgroundColor: 'var(--nx-ub-surface-soft)',
                fontSize: 12.5,
                color: 'var(--nx-ub-ink-secondary)',
              }}
            >
              From {day(sub.pendingPlan.startsAt)} your plan becomes{' '}
              <strong style={{ color: 'var(--nx-ub-ink)' }}>
                {sub.pendingPlan.name} ({sub.pendingPlan.interval})
              </strong>
              .
            </div>
          )}
        </div>
      )}

      {sub && !active && (
        <p className="nx-bill-notice tone-info">
          Your {sub.name} plan ended on {day(sub.currentPeriodEnd)}. Choose a plan below to get monthly credits again.
        </p>
      )}
      {message && <p className={`nx-bill-notice tone-${message.tone}`}>{message.text}</p>}

      <div className="nx-bill-grid">
        {plans.map((plan, idx) => {
          const current = active && sub.planCode === plan.code;
          const perMonth = plan.interval === 'yearly' ? plan.priceIdr / 12 : plan.priceIdr;
          const minImgCost = rows.image.length ? Math.min(...rows.image.map((row) => row.credits)) : 1;
          const minVidCost = rows.video.length ? Math.min(...rows.video.map((row) => row.credits)) : 1;
          const imageEstimate = rows.image.length ? Math.floor(plan.monthlyCredits / minImgCost) : 0;
          const videoEstimate = rows.video.length ? Math.floor(plan.monthlyCredits / minVidCost) : 0;
          const detailTabs = [
            ['video', `Video · ${rows.video.length}`],
            ['image', `Image · ${rows.image.length}`],
            ['features', 'Features'],
          ];

          return (
            <motion.article
              key={plan.code}
              className={`nx-bill-card${plan.popular ? ' is-popular' : ''}`}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: idx * 0.05, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="nx-bill-card-top">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--nx-ub-ink)' }}>
                    {plan.name}
                  </h3>
                  {plan.popular ? (
                    <span className="nx-bill-badge is-primary">Most popular</span>
                  ) : current ? (
                    <span className="nx-bill-badge is-soft">Your plan</span>
                  ) : null}
                </div>

                <p style={{ margin: '6px 0 0', minHeight: 36, fontSize: 12.5, lineHeight: 1.5, color: 'var(--nx-ub-muted)' }}>
                  {PLAN_AUDIENCE[plan.name]}
                </p>

                {plan.quote?.promoPercent ? (
                  <div style={{ marginTop: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="nx-bill-price">
                        <SlidingNumber value={plan.quote.amountIdr} formatter={rupiah} />
                      </span>
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: 999,
                          backgroundColor: '#ef5b3c',
                          color: '#ffffff',
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        -{plan.quote.promoPercent}%
                      </span>
                    </div>
                    <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--nx-ub-muted)' }}>
                      first month · <s>{rupiah(plan.quote.listPriceIdr)}</s> · then {rupiah(plan.quote.listPriceIdr)}/mo
                    </p>
                  </div>
                ) : (
                  <div style={{ marginTop: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                      <span className="nx-bill-price">
                        <SlidingNumber value={perMonth} formatter={rupiah} />
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--nx-ub-muted)' }}>/month</span>
                    </div>
                    <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--nx-ub-muted)' }}>
                      {plan.interval === 'yearly' ? `billed ${rupiah(plan.priceIdr)} / year · 2 months free` : 'billed monthly'}
                    </p>
                  </div>
                )}

                {quoteNote(plan.quote) && !plan.quote?.promoPercent && (
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--nx-ub-violet)', fontWeight: 500 }}>
                    {quoteNote(plan.quote)}
                  </p>
                )}

                <motion.button
                  type="button"
                  disabled={buying !== null || plan.quote?.kind === 'scheduled'}
                  onClick={() => buy(plan.code)}
                  whileHover={prefersReducedMotion || buying !== null ? undefined : { scale: 1.015 }}
                  whileTap={prefersReducedMotion || buying !== null ? undefined : { scale: 0.98 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                  className={plan.popular ? 'nx-bill-btn-primary' : 'nx-bill-btn-secondary'}
                  style={{ marginTop: 18, opacity: buying !== null || plan.quote?.kind === 'scheduled' ? 0.55 : 1 }}
                >
                  <span>{buying === plan.code ? 'Opening checkout…' : quoteLabel(plan, current)}</span>
                  <ArrowRight size={15} aria-hidden="true" />
                </motion.button>

                <div className="nx-bill-stats">
                  <div className="nx-bill-stat">
                    <p className="nx-bill-stat-val">{number(plan.monthlyCredits)}</p>
                    <p className="nx-bill-stat-lbl">credits / mo</p>
                  </div>
                  <div className="nx-bill-stat">
                    <p className="nx-bill-stat-val">{number(imageEstimate)}</p>
                    <p className="nx-bill-stat-lbl">up to images</p>
                  </div>
                  <div className="nx-bill-stat">
                    <p className="nx-bill-stat-val is-accent">{number(videoEstimate)}</p>
                    <p className="nx-bill-stat-lbl">up to videos</p>
                  </div>
                </div>
              </div>

              <div className="nx-bill-card-foot">
                <Highlight
                  value={detailTab}
                  className="nx-bill-detail-tabs"
                  highlightClassName="nx-bill-detail-pill"
                >
                  {detailTabs.map(([id, label]) => (
                    <HighlightItem key={id} value={id} className="flex-1">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={detailTab === id}
                        onClick={() => setDetailTab(id)}
                        className={`nx-bill-detail-tab${detailTab === id ? ' is-active' : ''}`}
                      >
                        {label}
                      </button>
                    </HighlightItem>
                  ))}
                </Highlight>

                {detailTab !== 'features' && (
                  <p
                    style={{
                      margin: '8px 0 4px',
                      fontSize: 10.5,
                      fontWeight: 650,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: 'var(--nx-ub-muted)',
                    }}
                  >
                    Included AI models
                  </p>
                )}

                <PlanDetail
                  tab={detailTab}
                  rows={detailTab === 'image' ? rows.image : rows.video}
                  popular={plan.popular}
                  features={planFeatures(modelCount)}
                />
              </div>
            </motion.article>
          );
        })}
      </div>

      {/* Enterprise Card */}
      <div className="nx-bill-enterprise">
        <div>
          <p className="nx-bill-eyebrow" style={{ marginBottom: 4 }}>Enterprise</p>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--nx-ub-ink)' }}>
            Need volume or a custom price?
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--nx-ub-muted)', lineHeight: 1.5 }}>
            For companies, brands, and creative agencies running high-volume campaigns.
          </p>
        </div>

        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: '7px 18px',
            fontSize: 12.5,
            color: 'var(--nx-ub-ink-secondary)',
          }}
        >
          {ENTERPRISE_POINTS.map((f) => (
            <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Check size={13} strokeWidth={2.6} style={{ color: 'var(--nx-ub-violet)', flexShrink: 0 }} aria-hidden="true" />
              <span>{f}</span>
            </li>
          ))}
        </ul>

        <motion.a
          href={ENTERPRISE_WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          whileHover={prefersReducedMotion ? undefined : { scale: 1.02 }}
          whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
          className="nx-bill-btn-primary"
          style={{ width: 'auto', whiteSpace: 'nowrap', textDecoration: 'none' }}
        >
          <MessageCircle size={15} aria-hidden="true" />
          <span>Chat via WhatsApp</span>
          <ArrowRight size={14} aria-hidden="true" />
        </motion.a>
      </div>

      <div className="nx-bill-trust-row">
        <span className="nx-bill-trust-item">
          <ShieldCheck size={14} style={{ color: 'var(--nx-ub-violet)' }} aria-hidden="true" />
          Secure checkout via Pakasir (QRIS, virtual account)
        </span>
        <span className="nx-bill-trust-item">
          <RefreshCw size={13} style={{ color: 'var(--nx-ub-violet)' }} aria-hidden="true" />
          No auto-debit: renew when you choose
        </span>
        <span className="nx-bill-trust-item">
          <InfinityIcon size={14} style={{ color: 'var(--nx-ub-violet)' }} aria-hidden="true" />
          Top-up credits never expire
        </span>
      </div>
    </section>
  );
}
