'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Plus, Receipt, Sparkles } from 'lucide-react';
import { saasFetch } from '../src/lib/saas/api.js';
import UsageBillingHeader from './UsageBillingHeader';
import { NxBillingHistoryRowsSkeleton, NxBillingSummarySkeleton } from './ui/nx-loading';
import { SlidingNumber } from './animate-ui/primitives/texts/sliding-number';

const POLL_INTERVAL_MS = 5000;
const POLL_LIMIT = 36;
const DAY_MS = 86_400_000;

const STATUS_BADGES = {
  pending: ['Waiting for payment', 'is-pending'],
  completed: ['Paid', 'is-complete'],
  canceled: ['Canceled', 'is-canceled'],
  failed: ['Failed', 'is-failed'],
};

export { ENTERPRISE_WHATSAPP_URL } from './publicPricing';

export function formatRupiah(value) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(Number(value) || 0);
}

function formatDay(value) {
  return value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}

export default function BillingContent({
  workspaceId,
  balance,
  onCompleted,
  onRequireAuth,
  onNavigateUsage,
  onOpenPlans,
  onOpenTopUp,
}) {
  const prefersReducedMotion = useReducedMotion();
  const [packages, setPackages] = useState(null);
  const [topups, setTopups] = useState([]);
  const [subData, setSubData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    const headers = workspaceId ? { 'x-workspace-id': workspaceId } : {};
    const [topupRes, subRes] = await Promise.all([
      saasFetch('/api/billing/topups', { headers }),
      workspaceId
        ? saasFetch('/api/billing/subscription', { headers }).catch(() => null)
        : saasFetch('/api/public/plans')
            .then((p) => ({ enabled: p.subscriptionsEnabled, plans: p.plans || [], subscription: null, orders: [] }))
            .catch(() => null),
    ]);
    setPackages(topupRes.packages || []);
    setTopups(topupRes.topups || []);
    setSubData(subRes);
  }, [workspaceId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    load()
      .catch((reason) => {
        if (active) setError(reason.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);

  // After Pakasir checkout redirects back with ?topup=<id>; poll until settled.
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
        const { topup } = await saasFetch(`/api/billing/topups/${encodeURIComponent(topupId)}`, {
          headers: { 'x-workspace-id': workspaceId },
        });
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
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [workspaceId, load, onCompleted]);

  // After Pakasir checkout redirects back with ?subscription=<order>; poll until settled.
  useEffect(() => {
    if (!workspaceId) return undefined;
    const orderId = new URLSearchParams(window.location.search).get('subscription');
    if (!orderId) return undefined;
    let attempts = 0;
    let timer;
    let cancelled = false;
    setNotice({ tone: 'info', text: 'Confirming your subscription payment…' });

    const done = (text, tone) => {
      setNotice({ tone, text });
      const url = new URL(window.location.href);
      url.searchParams.delete('subscription');
      window.history.replaceState(null, '', url.pathname + url.search);
      load().catch(() => {});
      onCompleted?.();
    };

    const poll = async () => {
      attempts += 1;
      try {
        const { order } = await saasFetch(`/api/billing/subscription/${encodeURIComponent(orderId)}`, {
          headers: { 'x-workspace-id': workspaceId },
        });
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
      else setNotice({ tone: 'info', text: 'Payment not confirmed yet. Your plan starts automatically once it clears.' });
    };
    poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [workspaceId, load, onCompleted]);

  const handleSwitchTab = useCallback(
    (nextTab) => {
      if (nextTab === 'usage') onNavigateUsage?.();
    },
    [onNavigateUsage],
  );

  const handleTriggerPlans = useCallback(() => {
    if (!workspaceId && onRequireAuth) {
      onRequireAuth('plans');
      return;
    }
    onOpenPlans?.();
  }, [workspaceId, onRequireAuth, onOpenPlans]);

  const handleTriggerTopUp = useCallback(() => {
    if (!workspaceId && onRequireAuth) {
      onRequireAuth('topup');
      return;
    }
    onOpenTopUp?.();
  }, [workspaceId, onRequireAuth, onOpenTopUp]);

  const sub = subData?.subscription || null;
  const subEnabled = subData === null ? true : Boolean(subData.enabled);
  const subActive = Boolean(sub && sub.status === 'active' && new Date(sub.currentPeriodEnd) > new Date());
  const daysLeft = subActive ? Math.max(0, Math.ceil((new Date(sub.currentPeriodEnd) - new Date()) / DAY_MS)) : null;

  // Merge top-up and subscription orders into one unified payment history table
  const historyRows = useMemo(() => {
    const planMap = new Map((subData?.plans || []).map((p) => [p.code, p]));
    const pkgMap = new Map((packages || []).map((p) => [p.code, p]));

    const topupRows = (topups || []).map((item) => {
      const pkg = pkgMap.get(item.packageCode);
      return {
        id: `topup-${item.id}`,
        createdAt: item.createdAt,
        title: pkg?.name ? `${pkg.name} top-up` : item.packageCode,
        kindLabel: 'Top-up',
        amountIdr: item.amountIdr,
        detail: `${formatNumber(item.credits)} cr`,
        status: item.status,
        isSandbox: item.isSandbox,
        paymentUrl: item.paymentUrl,
      };
    });

    const subRows = (subData?.orders || []).map((item) => {
      const plan = planMap.get(item.planCode);
      const interval = plan?.interval ? ` · ${plan.interval}` : '';
      return {
        id: `sub-${item.id}`,
        createdAt: item.createdAt,
        title: plan?.name ? `${plan.name} plan${interval}` : item.planCode,
        kindLabel: item.kind === 'upgrade' ? 'Upgrade' : item.kind === 'renew' ? 'Renewal' : 'Plan',
        amountIdr: item.amountIdr,
        detail: plan?.monthlyCredits ? `${formatNumber(plan.monthlyCredits)} cr/mo` : '—',
        status: item.status,
        isSandbox: false,
        paymentUrl: item.paymentUrl,
      };
    });

    return [...topupRows, ...subRows].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [topups, packages, subData]);

  return (
    <main className="nx-ub-page">
      <div className="nx-ub-container">
        <UsageBillingHeader
          activeTab="billing"
          balance={balance}
          onSwitchTab={onNavigateUsage ? handleSwitchTab : undefined}
          onTopUpClick={handleTriggerTopUp}
        />

        {notice && <p className={`nx-bill-notice tone-${notice.tone}`}>{notice.text}</p>}
        {error && <p className="nx-bill-notice tone-error">{error}</p>}

        {/* Streamlined Active Plan & Credit Balance Summary */}
        {loading && packages === null ? (
          <NxBillingSummarySkeleton />
        ) : (
          <motion.section
            data-tour="billing-summary"
            className={`nx-ub-card nx-bill-summary-card${subActive && daysLeft <= 7 ? ' is-soon' : ''}`}
            aria-label="Active plan and credit balance"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="nx-bill-summary-cell">
              <p className="nx-bill-summary-kicker">Active plan</p>
              <div className="nx-bill-summary-val">
                {subActive ? (
                  <>
                    <span>{sub.name}</span>
                    {sub.interval && (
                      <span className="nx-bill-badge is-soft" style={{ textTransform: 'capitalize' }}>
                        {sub.interval}
                      </span>
                    )}
                  </>
                ) : sub ? (
                  <>
                    <span>{sub.name}</span>
                    <span className="nx-bill-badge is-neutral">Ended</span>
                  </>
                ) : (
                  <span>Pay-as-you-go</span>
                )}
              </div>
              <p className={`nx-bill-summary-meta${subActive && daysLeft <= 7 ? ' is-warn' : ''}`}>
                {subActive
                  ? `Renews manually by ${formatDay(sub.currentPeriodEnd)} · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`
                  : sub
                    ? `Ended on ${formatDay(sub.currentPeriodEnd)} · choose a plan to resume monthly credits`
                    : subEnabled
                      ? 'Choose a monthly plan or buy one-time credit packs anytime'
                      : 'Top up credits anytime · never expire'}
              </p>
            </div>

            <div className="nx-bill-summary-cell">
              <p className="nx-bill-summary-kicker">Available balance</p>
              <div className="nx-bill-summary-val">
                {balance !== null && balance !== undefined ? (
                  <SlidingNumber value={Number(balance)} formatter={formatNumber} />
                ) : (
                  '—'
                )}
                <span className="nx-bill-summary-unit">credits</span>
              </div>
              <p className="nx-bill-summary-meta">
                {subActive && subData?.expiringCredits?.credits > 0
                  ? `${formatNumber(subData.expiringCredits.credits)} monthly credits expire ${formatDay(sub.monthEndsAt)}`
                  : 'Top-up credits never expire'}
              </p>
            </div>

            <div data-tour="billing-actions" className="nx-bill-summary-actions">
              {subEnabled && (
                <motion.button
                  type="button"
                  onClick={handleTriggerPlans}
                  className="nx-bill-summary-btn-ghost"
                  whileHover={prefersReducedMotion ? undefined : { y: -1 }}
                  whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 460, damping: 28 }}
                >
                  <Sparkles size={14} aria-hidden="true" />
                  <span>{subActive ? 'Manage plan' : 'View plans'}</span>
                </motion.button>
              )}
              <motion.button
                type="button"
                onClick={handleTriggerTopUp}
                className="nx-ub-cta-btn"
                whileHover={prefersReducedMotion ? undefined : { y: -1 }}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 460, damping: 28 }}
              >
                <span className="nx-ub-cta-icon" aria-hidden="true">
                  <Plus size={13} strokeWidth={2.5} />
                </span>
                <span>Top up credits</span>
              </motion.button>
            </div>

            {sub?.pendingPlan && (
              <div className="nx-bill-summary-pending">
                From {formatDay(sub.pendingPlan.startsAt)} your plan becomes{' '}
                <strong style={{ color: 'var(--nx-ub-ink)' }}>
                  {sub.pendingPlan.name} ({sub.pendingPlan.interval})
                </strong>
                .
              </div>
            )}
          </motion.section>
        )}

        {/* Payment History */}
        <motion.section
          data-tour="billing-history"
          className="nx-ub-card nx-ub-log-card"
          aria-label="Payment history"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.04, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="nx-ub-log-toolbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span className="nx-ub-kpi-icon tone-violet" style={{ width: 30, height: 30, borderRadius: 8 }}>
                <Receipt size={15} aria-hidden="true" />
              </span>
              <div>
                <h2 className="nx-ub-card-title">Payment history</h2>
                <p className="nx-ub-card-sub">Your subscription and credit top-up receipts</p>
              </div>
            </div>
            {historyRows.length > 0 && (
              <span className="nx-bill-badge is-neutral">
                {historyRows.length} {historyRows.length === 1 ? 'order' : 'orders'}
              </span>
            )}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="nx-ub-table" style={{ minWidth: 620 }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Item</th>
                  <th>Amount</th>
                  <th>Credits</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading && packages === null && !error ? (
                  <NxBillingHistoryRowsSkeleton rows={3} />
                ) : historyRows.length > 0 ? (
                  historyRows.map((row) => {
                    const [label, statusCls] = STATUS_BADGES[row.status] || [row.status, 'is-canceled'];
                    return (
                      <tr key={row.id}>
                        <td style={{ color: 'var(--nx-ub-muted)', fontSize: 12.5, whiteSpace: 'nowrap' }}>
                          {new Date(row.createdAt).toLocaleString('id-ID')}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 600, color: 'var(--nx-ub-ink)' }}>{row.title}</span>
                            <span className="nx-bill-badge is-neutral" style={{ padding: '2px 7px', fontSize: 10 }}>
                              {row.kindLabel}
                            </span>
                          </div>
                        </td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 550, whiteSpace: 'nowrap' }}>
                          {formatRupiah(row.amountIdr)}
                        </td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 650, color: 'var(--nx-ub-ink)', whiteSpace: 'nowrap' }}>
                          {row.detail}
                        </td>
                        <td>
                          <span className={`nx-ub-status ${statusCls}`}>
                            {label}
                            {row.isSandbox ? ' · sandbox' : ''}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {row.paymentUrl ? (
                            <a
                              href={row.paymentUrl}
                              className="nx-ub-link-btn"
                              style={{ textDecoration: 'none', display: 'inline-flex' }}
                            >
                              <span>Pay now</span>
                              <ArrowRight size={13} aria-hidden="true" />
                            </a>
                          ) : (
                            <span style={{ color: 'var(--nx-ub-muted)', fontSize: 12 }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--nx-ub-muted)' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <Sparkles size={15} aria-hidden="true" />
                        <span>No payments yet. Your plan and credit top-up receipts will appear here.</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.section>
      </div>
    </main>
  );
}
