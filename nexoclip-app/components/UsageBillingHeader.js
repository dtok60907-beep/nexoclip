'use client';

import { motion, useReducedMotion } from 'motion/react';
import { BarChart3, CreditCard, Plus, Search } from 'lucide-react';
import { Highlight, HighlightItem } from './animate-ui/primitives/effects/highlight';

function formatCompact(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(num);
}

export default function UsageBillingHeader({
  activeTab = 'usage',
  balance = null,
  generationCount = null,
  creditsUsed = null,
  onSwitchTab,
  onSearchClick,
  onTopUpClick,
}) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.header
      data-tour="ub-header"
      className="nx-ub-header"
      initial={prefersReducedMotion ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="nx-ub-title-group">
        <h1 className="nx-ub-title">Usage &amp; Billing</h1>
        <p className="nx-ub-subtitle">
          {activeTab === 'usage' ? (
            <>
              <span>
                <strong>{generationCount !== null ? formatCompact(generationCount) : '0'}</strong> runs this month
              </span>
              <span className="nx-ub-dot" aria-hidden="true" />
              <span>
                <strong>{creditsUsed !== null ? formatCompact(creditsUsed) : '0'}</strong> credits used
              </span>
              {balance !== null && balance !== undefined && (
                <>
                  <span className="nx-ub-dot" aria-hidden="true" />
                  <span>
                    <strong>{formatCompact(balance)}</strong> credits left
                  </span>
                </>
              )}
            </>
          ) : (
            <>
              <span>Manage your active plan, credit balance, and payment history</span>
              {balance !== null && balance !== undefined && (
                <>
                  <span className="nx-ub-dot" aria-hidden="true" />
                  <span>
                    <strong>{formatCompact(balance)}</strong> credits available
                  </span>
                </>
              )}
            </>
          )}
        </p>
      </div>

      <div className="nx-ub-header-actions">
        {onSwitchTab && (
          <Highlight
            value={activeTab}
            className="nx-ub-segmented"
            highlightClassName="nx-ub-segmented-pill"
          >
            <HighlightItem value="usage">
              <button
                type="button"
                className={`nx-ub-segmented-btn${activeTab === 'usage' ? ' is-active' : ''}`}
                aria-current={activeTab === 'usage' ? 'page' : undefined}
                onClick={() => onSwitchTab('usage')}
              >
                <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Overview &amp; Usage</span>
              </button>
            </HighlightItem>
            <HighlightItem value="billing">
              <button
                type="button"
                className={`nx-ub-segmented-btn${activeTab === 'billing' ? ' is-active' : ''}`}
                aria-current={activeTab === 'billing' ? 'page' : undefined}
                onClick={() => onSwitchTab('billing')}
              >
                <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Billing &amp; History</span>
              </button>
            </HighlightItem>
          </Highlight>
        )}

        {onSearchClick && (
          <motion.button
            type="button"
            className="nx-ub-icon-btn"
            aria-label="Search generation history"
            title="Search generation history"
            whileHover={prefersReducedMotion ? undefined : { scale: 1.04 }}
            whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            onClick={onSearchClick}
          >
            <Search className="h-4 w-4" aria-hidden="true" />
          </motion.button>
        )}

        {onTopUpClick && (
          <motion.button
            type="button"
            onClick={onTopUpClick}
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
        )}
      </div>
    </motion.header>
  );
}
