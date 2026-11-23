'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Activity,
  ArrowRight,
  AudioLines,
  Clapperboard,
  Film,
  Image as ImageIcon,
  Search,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { saasFetch } from '../src/lib/saas/api.js';
import { NxUsageSkeleton } from './ui/nx-loading';
import UsageBillingHeader from './UsageBillingHeader';
import { Highlight, HighlightItem } from './animate-ui/primitives/effects/highlight';
import { SlidingNumber } from './animate-ui/primitives/texts/sliding-number';

export function formatCredits(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '0';
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(amount);
}

function formatCompactNum(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  if (Math.abs(num) >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (Math.abs(num) >= 10_000) return `${(num / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(num);
}

export function formatUnits(units) {
  const entries = Object.entries(units || {}).filter(([, value]) => value !== null && value !== undefined);
  if (!entries.length) return '—';
  return entries
    .map(([name, value]) => `${typeof value === 'number' ? new Intl.NumberFormat().format(value) : value} ${name}`)
    .join(', ');
}

export const KIND_LABELS = {
  image: 'Image',
  video: 'Video',
  llm: 'AI Director (text)',
  voiceover: 'Voiceover',
  music: 'Music',
  audio: 'Audio',
  video_analysis: 'Video analysis',
};

export const SOURCE_LABELS = {
  director: 'AI Director',
  canvas: 'Canvas',
  studio: 'Studio',
  storyboard: 'AI Storyboard',
};

export function usagePath({ scope, page }) {
  return `/api/usage?scope=${encodeURIComponent(scope)}&page=${page}&pageSize=25`;
}

function formatRelativeTime(iso) {
  if (!iso) return '—';
  const diffSec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return 'Just now';
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatShortDate(ymd) {
  const dt = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return ymd;
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function normalizeStatus(raw) {
  const s = String(raw || '').toLowerCase();
  if (s === 'succeeded' || s === 'completed' || s === 'complete') return { key: 'complete', label: 'Complete', cls: 'is-complete' };
  if (s === 'running' || s === 'processing' || s === 'queued' || s === 'pending') return { key: 'running', label: 'Running', cls: 'is-running' };
  if (s === 'failed' || s === 'error') return { key: 'failed', label: 'Failed', cls: 'is-failed' };
  if (s === 'canceled' || s === 'cancelled') return { key: 'canceled', label: 'Canceled', cls: 'is-canceled' };
  return { key: 'complete', label: raw || 'Complete', cls: 'is-complete' };
}

function pillarOf(kind) {
  if (kind === 'video' || kind === 'video_analysis') return 'video';
  if (kind === 'image') return 'image';
  return 'director';
}

function KindGlyph({ kind, size = 14 }) {
  if (kind === 'video' || kind === 'video_analysis') return <Film size={size} aria-hidden="true" />;
  if (kind === 'image') return <ImageIcon size={size} aria-hidden="true" />;
  if (kind === 'voiceover' || kind === 'music' || kind === 'audio') return <AudioLines size={size} aria-hidden="true" />;
  return <Clapperboard size={size} aria-hidden="true" />;
}

const PILLAR_COLORS = {
  video: '#7c6bf7',
  image: '#7fb5a5',
  director: '#73b8f5',
};

const BREAKDOWN_PALETTE = ['#6d58f5', '#82b6a7', '#74b8f5', '#ef9374', '#b48bf8'];

/** Segmented vertical tick meter matching the bento reference card style. */
function SegmentedTicks({ ratio, tone = 'violet', count = 20 }) {
  const prefersReducedMotion = useReducedMotion();
  const clamped = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  const filled = clamped > 0 ? Math.max(1, Math.round(clamped * count)) : 0;

  return (
    <div className="nx-ub-ticks" aria-hidden="true">
      {Array.from({ length: count }).map((_, idx) => {
        const active = idx < filled;
        return (
          <motion.span
            key={idx}
            className={`nx-ub-tick${active ? ` is-filled tone-${tone}` : ''}`}
            initial={prefersReducedMotion ? false : { scaleY: active ? 0.25 : 0.7, opacity: active ? 0.45 : 0.9 }}
            animate={{ scaleY: 1, opacity: 1 }}
            transition={{
              duration: 0.34,
              delay: prefersReducedMotion ? 0 : idx * 0.015,
              ease: [0.22, 1, 0.36, 1],
            }}
          />
        );
      })}
    </div>
  );
}

/** Interactive SVG area + line trend chart with hover crosshair & tooltip. */
function CreditTrendChart({ daily30, range }) {
  const prefersReducedMotion = useReducedMotion();
  const [hoverIdx, setHoverIdx] = useState(null);

  const series = useMemo(() => {
    const slice = range === '7d' ? daily30.slice(-7) : daily30;
    if (slice.length > 0) return slice;
    const count = range === '7d' ? 7 : 30;
    const now = new Date();
    return Array.from({ length: count }).map((_, i) => {
      const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (count - 1 - i)));
      return { date: dt.toISOString().slice(0, 10), credits: 0, count: 0 };
    });
  }, [daily30, range]);

  const width = 520;
  const height = 206;
  const pad = { top: 18, right: 16, bottom: 28, left: 42 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const rawMax = Math.max(...series.map((d) => d.credits), 0);
  const niceMax = rawMax <= 0 ? 10 : Math.ceil(rawMax * 1.18);
  const yTicks = [0, niceMax / 3, (niceMax * 2) / 3, niceMax];

  const points = series.map((item, idx) => {
    const x = series.length === 1 ? pad.left + plotW / 2 : pad.left + (idx / (series.length - 1)) * plotW;
    const y = pad.top + plotH - (item.credits / niceMax) * plotH;
    return { ...item, x, y, idx };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const areaPath = points.length
    ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(pad.top + plotH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(pad.top + plotH).toFixed(1)} Z`
    : '';

  const xLabelStep = range === '7d' ? 1 : 5;
  const activePoint = hoverIdx !== null ? points[hoverIdx] : null;
  const tooltipLeftPct = activePoint ? Math.min(86, Math.max(14, (activePoint.x / width) * 100)) : 50;

  return (
    <div
      className="nx-ub-chart-wrap"
      onMouseLeave={() => setHoverIdx(null)}
    >
      <AnimatePresence>
        {activePoint && (
          <motion.div
            key="tooltip"
            className="nx-ub-chart-tooltip"
            style={{ left: `${tooltipLeftPct}%` }}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, y: 4 }}
            transition={{ duration: 0.14 }}
          >
            <div style={{ fontWeight: 600, color: '#ffffff' }}>{formatShortDate(activePoint.date)}</div>
            <div style={{ color: '#c4baff', fontWeight: 600 }}>
              {formatCompactNum(activePoint.credits)} credits
              <span style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 400 }}>
                {' '}· {activePoint.count} {activePoint.count === 1 ? 'run' : 'runs'}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="nx-ub-chart-svg"
        role="img"
        aria-label={`Credit usage trend over the last ${range === '7d' ? '7 days' : '30 days'}`}
      >
        <defs>
          <linearGradient id="nxUbTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6c57f5" stopOpacity="0.22" />
            <stop offset="85%" stopColor="#6c57f5" stopOpacity="0.02" />
            <stop offset="100%" stopColor="#6c57f5" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Y-axis labels & subtle baseline */}
        {yTicks.map((val, i) => {
          const y = pad.top + plotH - (val / niceMax) * plotH;
          return (
            <g key={i}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y}
                y2={y}
                stroke={i === 0 ? '#e6e6f0' : '#f1f1f7'}
                strokeWidth="1"
              />
              <text
                x={pad.left - 10}
                y={y + 4}
                textAnchor="end"
                fontSize="10.5"
                fill="#8b8ca2"
              >
                {formatCompactNum(Math.round(val * 10) / 10)}
              </text>
            </g>
          );
        })}

        {/* Vertical dashed gridlines + X-axis labels */}
        {points.map((p, i) => {
          const showLabel = i % xLabelStep === 0 || i === points.length - 1;
          if (!showLabel) return null;
          return (
            <g key={p.date}>
              <line
                x1={p.x}
                x2={p.x}
                y1={pad.top}
                y2={pad.top + plotH}
                stroke="#ededf5"
                strokeDasharray="3 4"
                strokeWidth="1"
              />
              <text
                x={p.x}
                y={height - 8}
                textAnchor="middle"
                fontSize="10.5"
                fill="#8b8ca2"
              >
                {formatShortDate(p.date)}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        {areaPath && (
          <motion.path
            key={`area-${range}`}
            d={areaPath}
            fill="url(#nxUbTrendFill)"
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          />
        )}

        {/* Line stroke */}
        {linePath && (
          <motion.path
            key={`line-${range}`}
            d={linePath}
            fill="none"
            stroke="#5b45f2"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={prefersReducedMotion ? false : { pathLength: 0, opacity: 0.4 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          />
        )}

        {/* Active hover hairline & dot */}
        {activePoint && (
          <g>
            <line
              x1={activePoint.x}
              x2={activePoint.x}
              y1={pad.top}
              y2={pad.top + plotH}
              stroke="#5b45f2"
              strokeOpacity="0.35"
              strokeDasharray="3 3"
              strokeWidth="1.2"
            />
            <circle cx={activePoint.x} cy={activePoint.y} r="7" fill="#5b45f2" fillOpacity="0.16" />
            <circle cx={activePoint.x} cy={activePoint.y} r="3.8" fill="#ffffff" stroke="#5b45f2" strokeWidth="2.2" />
          </g>
        )}

        {/* Interactive hit areas */}
        {points.map((p, i) => {
          const stepW = points.length > 1 ? plotW / (points.length - 1) : plotW;
          return (
            <rect
              key={`hit-${p.date}`}
              x={Math.max(pad.left, p.x - stepW / 2)}
              y={pad.top}
              width={stepW}
              height={plotH}
              fill="transparent"
              style={{ cursor: 'crosshair' }}
              onMouseEnter={() => setHoverIdx(i)}
            />
          );
        })}
      </svg>
    </div>
  );
}

export default function UsageContent({ workspaceId, onBalanceChange, onTopUp, onNavigateBilling }) {
  const prefersReducedMotion = useReducedMotion();
  const [scope, setScope] = useState('me');
  const [page, setPage] = useState(1);
  const [range, setRange] = useState('7d');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [retry, setRetry] = useState(0);
  const searchInputRef = useRef(null);

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
    return () => {
      cancelled = true;
    };
  }, [workspaceId, scope, page, retry, onBalanceChange]);

  const handleGoBilling = useCallback(() => {
    if (onNavigateBilling) onNavigateBilling();
    else onTopUp?.();
  }, [onNavigateBilling, onTopUp]);

  const handleSwitchTab = useCallback(
    (nextTab) => {
      if (nextTab === 'billing') handleGoBilling();
    },
    [handleGoBilling],
  );

  const handleFocusSearch = useCallback(() => {
    searchInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => searchInputRef.current?.focus(), 220);
  }, []);

  const derived = useMemo(() => {
    if (!data) return null;
    const balanceNum = Number(data.balance || 0);
    const creditsUsedNum = Number(data.summary?.creditsUsed || 0);
    const breakdown = data.summary?.breakdown || [];
    const byKindStatus = data.analytics?.byKindStatus || [];

    const pillars = {
      video: { label: 'Video & Cinema', sub: 'Video, Cinema & Motion', credits: 0, runs: 0, succeeded: 0, total: 0, tone: 'violet' },
      image: { label: 'Image & Canvas', sub: 'Image Studio & Canvas', credits: 0, runs: 0, succeeded: 0, total: 0, tone: 'sage' },
      director: { label: 'AI Director & Audio', sub: 'LLM, Voiceover & Music', credits: 0, runs: 0, succeeded: 0, total: 0, tone: 'sky' },
    };

    for (const row of breakdown) {
      const p = pillars[pillarOf(row.kind)];
      p.credits += Number(row.credits || 0);
      p.runs += Number(row.count || 0);
    }

    if (byKindStatus.length > 0) {
      for (const row of byKindStatus) {
        const p = pillars[pillarOf(row.kind)];
        p.total += Number(row.total || 0);
        p.succeeded += Number(row.succeeded || 0);
      }
    } else {
      for (const item of data.items || []) {
        const p = pillars[pillarOf(item.kind)];
        p.total += 1;
        if (normalizeStatus(item.status).key === 'complete') p.succeeded += 1;
      }
    }

    const totalBreakdownCredits = breakdown.reduce((sum, row) => sum + Number(row.credits || 0), 0);
    const totalRuns = breakdown.reduce((sum, row) => sum + Number(row.count || 0), 0) || Number(data.summary?.generationCount || 0);

    // Group breakdown by kind for clean top-3 Share comparison
    const shareMap = new Map();
    for (const row of breakdown) {
      const key = row.kind;
      const prev = shareMap.get(key) || { kind: row.kind, label: KIND_LABELS[row.kind] || row.kind, credits: 0, runs: 0 };
      prev.credits += Number(row.credits || 0);
      prev.runs += Number(row.count || 0);
      shareMap.set(key, prev);
    }
    const topShares = Array.from(shareMap.values())
      .filter((r) => r.credits > 0)
      .sort((a, b) => b.credits - a.credits)
      .slice(0, 3);

    const last7 = Number(data.analytics?.last7Credits ?? 0);
    const prev7 = Number(data.analytics?.prev7Credits ?? 0);
    const deltaPct = prev7 > 0 ? Math.round(((last7 - prev7) / prev7) * 1000) / 10 : null;

    return {
      balanceNum,
      creditsUsedNum,
      totalBreakdownCredits,
      totalRuns,
      pillars,
      topShares,
      deltaPct,
      daily30: data.analytics?.daily30 || [],
    };
  }, [data]);

  const filteredItems = useMemo(() => {
    const rows = data?.items || [];
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((item) => {
      if (statusFilter !== 'all' && normalizeStatus(item.status).key !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        item.prompt,
        item.model,
        KIND_LABELS[item.kind] || item.kind,
        SOURCE_LABELS[item.source] || item.source,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [data?.items, searchQuery, statusFilter]);

  if (error) {
    return (
      <main className="nx-ub-page">
        <div className="nx-ub-container">
          <div className="nx-ub-card nx-ub-panel" style={{ maxWidth: 520, margin: '40px auto', textAlign: 'center' }}>
            <p className="nx-ub-card-title" style={{ color: 'var(--nx-ub-rose-ink)' }}>Could not load usage data</p>
            <p className="nx-ub-card-sub" style={{ marginTop: 6 }}>{error}</p>
            <div style={{ marginTop: 16 }}>
              <button type="button" className="nx-ub-cta-btn" onClick={() => setRetry((v) => v + 1)}>
                Retry
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!data || !derived) return <NxUsageSkeleton />;

  const { summary, permissions, items, pagination } = data;
  const { balanceNum, creditsUsedNum, totalBreakdownCredits, totalRuns, pillars, topShares, deltaPct, daily30 } = derived;
  const maxPillarCredits = Math.max(pillars.video.credits, pillars.image.credits, pillars.director.credits, 1);
  const balanceRatio = balanceNum + creditsUsedNum > 0 ? balanceNum / (balanceNum + creditsUsedNum) : balanceNum > 0 ? 1 : 0;

  const kpiCards = [
    {
      id: 'balance',
      title: 'Credit Balance',
      role: 'Available workspace credits',
      value: balanceNum,
      unit: 'cr',
      meta: balanceNum > 0 ? 'Ready to generate' : 'Top up to continue',
      ratio: balanceRatio,
      tone: 'coral',
      icon: Wallet,
    },
    {
      id: 'video',
      title: pillars.video.label,
      role: pillars.video.sub,
      value: pillars.video.credits,
      unit: 'cr',
      meta: `${pillars.video.runs} runs this month`,
      ratio: pillars.video.credits / maxPillarCredits,
      tone: 'violet',
      icon: Film,
    },
    {
      id: 'image',
      title: pillars.image.label,
      role: pillars.image.sub,
      value: pillars.image.credits,
      unit: 'cr',
      meta: `${pillars.image.runs} runs this month`,
      ratio: pillars.image.credits / maxPillarCredits,
      tone: 'sage',
      icon: ImageIcon,
    },
    {
      id: 'director',
      title: pillars.director.label,
      role: pillars.director.sub,
      value: pillars.director.credits,
      unit: 'cr',
      meta: `${pillars.director.runs} runs this month`,
      ratio: pillars.director.credits / maxPillarCredits,
      tone: 'sky',
      icon: Clapperboard,
    },
  ];

  const insightRows = [pillars.video, pillars.image, pillars.director];
  const recentFive = items.slice(0, 5);
  const breakdownRows = (summary.breakdown || []).filter((r) => Number(r.credits) > 0).slice(0, 5);
  const totalShareCredits = topShares.reduce((sum, r) => sum + r.credits, 0);

  return (
    <main className="nx-ub-page">
      <div className="nx-ub-container">
        <UsageBillingHeader
          activeTab="usage"
          balance={balanceNum}
          generationCount={totalRuns}
          creditsUsed={creditsUsedNum}
          onSwitchTab={handleSwitchTab}
          onSearchClick={handleFocusSearch}
          onTopUpClick={onTopUp || handleGoBilling}
        />

        {/* Row 1: Unified 4-Column Metric Strip with Segmented Tick Bars */}
        <motion.section
          data-tour="usage-kpis"
          className="nx-ub-card nx-ub-kpi-strip"
          aria-label="Credit & studio usage overview"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          {kpiCards.map((card) => {
            const IconComp = card.icon;
            return (
              <div key={card.id} className="nx-ub-kpi-cell">
                <div className="nx-ub-kpi-head">
                  <span className={`nx-ub-kpi-icon tone-${card.tone}`}>
                    <IconComp size={16} aria-hidden="true" />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <p className="nx-ub-kpi-label">{card.title}</p>
                    <p className="nx-ub-kpi-role">{card.role}</p>
                  </div>
                </div>

                <div className="nx-ub-kpi-foot">
                  <div>
                    <div className="nx-ub-kpi-val">
                      <SlidingNumber value={card.value} formatter={formatCompactNum} />
                      <span className="nx-ub-kpi-unit">{card.unit}</span>
                    </div>
                    <p className={`nx-ub-kpi-meta tone-${card.tone}`}>{card.meta}</p>
                  </div>
                  <SegmentedTicks ratio={card.ratio} tone={card.tone} count={20} />
                </div>
              </div>
            );
          })}
        </motion.section>

        {/* Row 2: 3-Panel Analytics Bento (Performance Insight + Recent Executions + Credit Usage Trend) */}
        <div className="nx-ub-mid-grid">
          {/* Performance Insight */}
          <motion.section
            className="nx-ub-card nx-ub-panel"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="nx-ub-card-head">
              <div>
                <h2 className="nx-ub-card-title">Performance Insight</h2>
                <p className="nx-ub-card-sub">Completion rate this month</p>
              </div>
            </div>

            <div className="nx-ub-insight-list">
              {insightRows.map((row) => {
                const rate = row.total > 0 ? (row.succeeded / row.total) * 100 : null;
                return (
                  <div key={row.label} className="nx-ub-insight-item">
                    <div className="nx-ub-insight-top">
                      <span className="nx-ub-insight-name">{row.label}</span>
                      <span className="nx-ub-insight-runs">
                        {row.total > 0 ? `${row.succeeded}/${row.total} ok` : 'No runs'}
                      </span>
                    </div>
                    <div className="nx-ub-insight-rate">
                      {rate !== null ? (
                        <SlidingNumber value={rate} formatter={(v) => `${v.toFixed(1)}%`} />
                      ) : (
                        <span style={{ color: 'var(--nx-ub-muted)', fontWeight: 500 }}>—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.section>

          {/* Recent Executions */}
          <motion.section
            className="nx-ub-card nx-ub-panel"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.09, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="nx-ub-card-head">
              <div>
                <h2 className="nx-ub-card-title">Recent Executions</h2>
                <p className="nx-ub-card-sub">Latest studio generation activity</p>
              </div>
            </div>

            {recentFive.length > 0 ? (
              <div className="nx-ub-recent-list">
                {recentFive.map((item, idx) => {
                  const st = normalizeStatus(item.status);
                  const title = item.prompt || KIND_LABELS[item.kind] || item.kind;
                  return (
                    <motion.div
                      key={item.id}
                      className="nx-ub-recent-row"
                      initial={prefersReducedMotion ? false : { opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.22, delay: idx * 0.03 }}
                    >
                      <span className="nx-ub-recent-time">{formatRelativeTime(item.createdAt)}</span>
                      <span className="nx-ub-recent-icon">
                        <KindGlyph kind={item.kind} size={13} />
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <span className="nx-ub-recent-name" title={title}>
                          {title}
                        </span>
                        <span className="nx-ub-recent-sub">
                          {SOURCE_LABELS[item.source] || item.source || 'Studio'} · {formatCompactNum(item.credits)} cr
                        </span>
                      </div>
                      <span className={`nx-ub-status ${st.cls}`}>{st.label}</span>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="nx-ub-empty">
                <span className="nx-ub-empty-icon">
                  <Activity size={18} aria-hidden="true" />
                </span>
                <p className="nx-ub-empty-title">No executions yet</p>
                <p className="nx-ub-empty-desc">Your recent image, video, and AI Director runs will appear here.</p>
              </div>
            )}
          </motion.section>

          {/* Credit Usage Trend */}
          <motion.section
            data-tour="usage-trend"
            className="nx-ub-card nx-ub-panel"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.13, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="nx-ub-card-head">
              <div>
                <h2 className="nx-ub-card-title">Credit Usage Trend</h2>
                <p className="nx-ub-card-sub">
                  {range === '7d' ? 'Last 7 days' : 'Last 30 days'} · hover for daily details
                </p>
              </div>
              <Highlight
                value={range}
                className="nx-ub-range-pills"
                highlightClassName="nx-ub-range-pill-bg"
              >
                <HighlightItem value="7d">
                  <button
                    type="button"
                    className={`nx-ub-range-btn${range === '7d' ? ' is-active' : ''}`}
                    onClick={() => setRange('7d')}
                  >
                    7D
                  </button>
                </HighlightItem>
                <HighlightItem value="30d">
                  <button
                    type="button"
                    className={`nx-ub-range-btn${range === '30d' ? ' is-active' : ''}`}
                    onClick={() => setRange('30d')}
                  >
                    30D
                  </button>
                </HighlightItem>
              </Highlight>
            </div>

            <CreditTrendChart daily30={daily30} range={range} />
          </motion.section>
        </div>

        {/* Row 3: Bottom 2-Panel Distribution Bento (Credit Breakdown + Stepped Studio Share) */}
        <div className="nx-ub-bottom-grid">
          {/* Credit Breakdown */}
          <motion.section
            className="nx-ub-card nx-ub-panel"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="nx-ub-card-head">
              <div>
                <h2 className="nx-ub-card-title">Credit Breakdown</h2>
                <p className="nx-ub-card-sub">Monthly spend by studio &amp; output type</p>
              </div>
              <button type="button" className="nx-ub-link-btn" onClick={handleGoBilling}>
                <span>View billing</span>
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            </div>

            <div className="nx-ub-headline-stat">
              <span className="nx-ub-headline-num">
                <SlidingNumber value={creditsUsedNum} formatter={formatCompactNum} />
                <span style={{ fontSize: 15, fontWeight: 550, color: 'var(--nx-ub-muted)', marginLeft: 6 }}>
                  credits
                </span>
              </span>
              {deltaPct !== null ? (
                <span className={`nx-ub-delta${deltaPct >= 0 ? ' is-up' : ''}`}>
                  {deltaPct >= 0 ? `+${deltaPct}%` : `${deltaPct}%`} vs prev 7 days
                </span>
              ) : (
                <span className="nx-ub-delta is-muted">{totalRuns} runs this month</span>
              )}
            </div>

            {breakdownRows.length > 0 ? (
              <table className="nx-ub-mini-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Source</th>
                    <th>Runs</th>
                    <th>Credits</th>
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdownRows.map((row, idx) => {
                    const creditsVal = Number(row.credits || 0);
                    const pct = totalBreakdownCredits > 0 ? (creditsVal / totalBreakdownCredits) * 100 : 0;
                    const color = BREAKDOWN_PALETTE[idx % BREAKDOWN_PALETTE.length];
                    return (
                      <tr key={`${row.kind}-${row.source}`}>
                        <td>
                          <span className="nx-ub-cat-cell">
                            <span className="nx-ub-cat-dot" style={{ backgroundColor: color }} aria-hidden="true" />
                            <span>{KIND_LABELS[row.kind] || row.kind}</span>
                          </span>
                        </td>
                        <td>{SOURCE_LABELS[row.source] || row.source || 'Studio'}</td>
                        <td>{row.count}×</td>
                        <td style={{ fontWeight: 600, color: 'var(--nx-ub-ink)' }}>
                          {formatCompactNum(Math.round(creditsVal * 10) / 10)} cr
                        </td>
                        <td style={{ fontWeight: 650, color: 'var(--nx-ub-ink)' }}>{pct.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="nx-ub-empty">
                <span className="nx-ub-empty-icon">
                  <Sparkles size={18} aria-hidden="true" />
                </span>
                <p className="nx-ub-empty-title">No credit usage recorded this month</p>
                <p className="nx-ub-empty-desc">Generate your first video or image to see a category breakdown here.</p>
              </div>
            )}
          </motion.section>

          {/* Studio Share — Stepped Vertical Columns */}
          <motion.section
            className="nx-ub-card nx-ub-panel"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="nx-ub-card-head">
              <div>
                <h2 className="nx-ub-card-title">Studio Share</h2>
                <p className="nx-ub-card-sub">Top credit consumers this month</p>
              </div>
            </div>

            {topShares.length > 0 && totalShareCredits > 0 ? (
              <div className="nx-ub-share-grid">
                {topShares.map((item, idx) => {
                  const pct = Math.round((item.credits / totalShareCredits) * 100);
                  const barHeight = Math.max(22, Math.round((pct / 100) * 106));
                  const avgPerRun = item.runs > 0 ? item.credits / item.runs : 0;
                  return (
                    <div key={item.kind} className="nx-ub-share-col">
                      <div className="nx-ub-share-meta">
                        <span className="nx-ub-share-name">
                          <span style={{ color: PILLAR_COLORS[pillarOf(item.kind)] || '#5b45f2', display: 'inline-flex' }}>
                            <KindGlyph kind={item.kind} size={13} />
                          </span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
                        </span>
                        <span className="nx-ub-share-primary">{formatCompactNum(item.credits)} cr</span>
                        <span className="nx-ub-share-sub">
                          {item.runs} {item.runs === 1 ? 'run' : 'runs'} · ~{formatCompactNum(avgPerRun)}/run
                        </span>
                      </div>

                      <div className="nx-ub-share-bar-area">
                        <span className="nx-ub-share-pct">{pct}%</span>
                        <motion.div
                          className={`nx-ub-share-bar rank-${idx}`}
                          style={{ height: barHeight }}
                          initial={prefersReducedMotion ? false : { scaleY: 0.08, opacity: 0.6 }}
                          animate={{ scaleY: 1, opacity: 1 }}
                          transition={{
                            duration: 0.48,
                            delay: 0.14 + idx * 0.07,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="nx-ub-empty">
                <span className="nx-ub-empty-icon">
                  <Film size={18} aria-hidden="true" />
                </span>
                <p className="nx-ub-empty-title">No share comparison yet</p>
                <p className="nx-ub-empty-desc">Once you run generations across studios, top categories will compare here.</p>
              </div>
            )}
          </motion.section>
        </div>

        {/* Row 4: Full Searchable & Filterable Activity Log */}
        <motion.section
          data-tour="usage-log"
          className="nx-ub-card nx-ub-log-card"
          aria-label="Generation activity log"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="nx-ub-log-toolbar">
            <Highlight
              value={scope}
              className="nx-ub-range-pills"
              highlightClassName="nx-ub-range-pill-bg"
            >
              <HighlightItem value="me">
                <button
                  type="button"
                  className={`nx-ub-range-btn${scope === 'me' ? ' is-active' : ''}`}
                  onClick={() => {
                    setScope('me');
                    setPage(1);
                  }}
                >
                  My usage
                </button>
              </HighlightItem>
              {permissions.canViewWorkspace && (
                <HighlightItem value="workspace">
                  <button
                    type="button"
                    className={`nx-ub-range-btn${scope === 'workspace' ? ' is-active' : ''}`}
                    onClick={() => {
                      setScope('workspace');
                      setPage(1);
                    }}
                  >
                    Workspace usage
                  </button>
                </HighlightItem>
              )}
            </Highlight>

            <div className="nx-ub-log-controls">
              <Highlight
                value={statusFilter}
                className="nx-ub-range-pills"
                highlightClassName="nx-ub-range-pill-bg"
              >
                {[
                  ['all', 'All'],
                  ['complete', 'Complete'],
                  ['running', 'Running'],
                  ['failed', 'Failed'],
                ].map(([val, label]) => (
                  <HighlightItem key={val} value={val}>
                    <button
                      type="button"
                      className={`nx-ub-range-btn${statusFilter === val ? ' is-active' : ''}`}
                      onClick={() => setStatusFilter(val)}
                    >
                      {label}
                    </button>
                  </HighlightItem>
                ))}
              </Highlight>

              <div className="nx-ub-search-wrap">
                <Search size={14} className="nx-ub-search-icon" aria-hidden="true" />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search prompt or model…"
                  aria-label="Search prompt or model"
                  className="nx-ub-search-input"
                />
              </div>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="nx-ub-table">
              <thead>
                <tr>
                  <th>Generation</th>
                  <th>Source</th>
                  <th>Model</th>
                  <th>Status</th>
                  <th>Units</th>
                  <th style={{ textAlign: 'right' }}>Credits</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length > 0 ? (
                  filteredItems.map((item) => {
                    const st = normalizeStatus(item.status);
                    const label = item.prompt || KIND_LABELS[item.kind] || item.kind;
                    return (
                      <tr key={item.id}>
                        <td style={{ maxWidth: 300 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span className="nx-ub-recent-icon" style={{ flexShrink: 0 }}>
                              <KindGlyph kind={item.kind} size={13} />
                            </span>
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  fontWeight: 550,
                                  color: 'var(--nx-ub-ink)',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                                title={label}
                              >
                                {label}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--nx-ub-muted)' }}>
                                {formatRelativeTime(item.createdAt)}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>{SOURCE_LABELS[item.source] || item.source || 'Studio'}</td>
                        <td>
                          <span className="nx-ub-model-pill">{item.model || '—'}</span>
                        </td>
                        <td>
                          <span className={`nx-ub-status ${st.cls}`}>{st.label}</span>
                        </td>
                        <td style={{ fontSize: 12.5 }}>{formatUnits(item.units)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 650, color: 'var(--nx-ub-ink)', fontVariantNumeric: 'tabular-nums' }}>
                          {formatCredits(item.credits)}
                          {item.estimated ? (
                            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--nx-ub-muted)' }}> est.</span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--nx-ub-muted)' }}>
                      {items.length > 0 ? 'No generations match your current filter.' : 'No usage yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="nx-ub-log-footer">
            <span>
              {pagination.total > 0
                ? `Page ${pagination.page} of ${pagination.totalPages || 1} · ${pagination.total} total records`
                : '0 records'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                className="nx-ub-page-btn"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <button
                type="button"
                className="nx-ub-page-btn"
                disabled={page >= (pagination.totalPages || 1)}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </motion.section>
      </div>
    </main>
  );
}
