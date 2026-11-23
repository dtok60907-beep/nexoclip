'use client';

import { useEffect, useState } from 'react';
import AdminShell from './AdminShell';
import { USAGE_KIND_LABELS, USAGE_SOURCE_LABELS } from './AdminConsole';
import { adminStyles } from '../src/lib/adminStyles.js';
import { saasFetch } from '../src/lib/saas/api.js';
import { getStoredWorkspaceId } from '../src/lib/saas/storage.js';

const idr = (value) => (value === null || value === undefined ? '—' : `Rp${Math.round(value).toLocaleString('id-ID')}`);
const num = (value, digits = 2) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: digits });

function Card({ label, value, detail, tone }) {
  return (
    <div className={adminStyles.card}>
      <p className={adminStyles.cardLabel}>{label}</p>
      <p className={`${adminStyles.cardValue} ${tone === 'bad' ? 'text-red-300' : tone === 'good' ? 'text-emerald-300' : ''}`}>{value}</p>
      {detail && <p className="mt-2 text-xs text-white/45">{detail}</p>}
    </div>
  );
}

/** Usage across every workspace: what each kind of work (and where it came from) costs us and earns. */
export default function UsageAnalytics({ initialRange }) {
  const [range, setRange] = useState(initialRange);
  const [workspaceId, setWorkspaceId] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    saasFetch('/api/workspaces').then((result) => {
      const list = result.workspaces || [];
      setWorkspaceId(list.find((row) => row.id === getStoredWorkspaceId())?.id || list[0]?.id || '');
    }).catch((reason) => setError(reason.message));
  }, []);
  useEffect(() => {
    if (!workspaceId) return undefined;
    let cancelled = false;
    setError('');
    saasFetch(`/api/admin/analytics?from=${range.from}&to=${range.to}`, { headers: { 'x-workspace-id': workspaceId } })
      .then((result) => { if (!cancelled) setData(result); })
      .catch((reason) => { if (!cancelled) setError(reason.message); });
    return () => { cancelled = true; };
  }, [workspaceId, range.from, range.to, revision]);

  const t = data?.totals;
  return (
    <AdminShell active="/admin/analytics" title="Usage Analytics"
      description="All paid usage across workspaces: images, videos, LLMs, voiceovers, music, and video analysis, grouped by source (AI Director, Canvas, Studio).">
      <div className={adminStyles.filters}>
        <label className={adminStyles.label}>From (UTC)<input type="date" className={adminStyles.field} value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} /></label>
        <label className={adminStyles.label}>To (UTC)<input type="date" className={adminStyles.field} value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} /></label>
        <button className={`${adminStyles.button} self-end`} type="button" onClick={() => setRevision((v) => v + 1)}>Refresh</button>
      </div>
      {error && <div role="alert" className={adminStyles.error}>{error}</div>}
      {!data && !error && <p role="status" className={adminStyles.loading}>Loading analytics…</p>}
      {data?.providerAlerts?.length > 0 && (
        <div role="alert" className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-100">
          <p className="font-semibold">Providers rejected jobs due to our account (billing / quota) in the last 24 hours</p>
          <ul className="mt-2 space-y-1 text-xs">
            {data.providerAlerts.map((alert) => (
              <li key={alert.provider || 'unknown'}>{alert.provider || 'provider'}: {alert.failed} failed jobs, last at {new Date(alert.last_at).toLocaleString('en-US')}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-red-100/80">Pay invoices or increase quota in the provider console. Users see a "service temporarily unavailable" message and are not charged credits. ElevenLabs audio failures are recorded in logs (event provider_billing_blocked).</p>
        </div>
      )}
      {data && (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card label="Credits used" value={num(t.credits)} detail={`${num(t.count, 0)} jobs/calls`} />
            <Card label="Provider cost" value={idr(t.costIdr)} detail={`$${num(t.costUsd, 4)} · rate Rp${num(data.usdIdr, 0)}/USD`} />
            <Card label="Revenue (cheapest pack)" value={idr(t.revenueIdrWorst)} detail={`Rp${num(data.idrPerCredit.lowest)}/credit`} />
            <Card label="Margin (worst case)" value={idr(t.marginIdrWorst)} tone={t.marginIdrWorst < 0 ? 'bad' : 'good'}
              detail={data.idrPerCredit.average ? `Actual average selling price Rp${num(data.idrPerCredit.average)}/credit → revenue ${idr(t.revenueIdrAverage)}` : 'No paid top-ups yet to calculate average price'} />
          </div>
          {data.freeCredits > 0 && <p className="mt-3 text-xs text-amber-100">{num(data.freeCredits)} free credits (signup bonus) were granted in this period: consumed like paid credits with zero revenue.</p>}
          {t.unknownCost > 0 && <p className="mt-2 text-xs text-amber-100">{t.unknownCost} succeeded jobs do not have a recorded provider cost (legacy jobs); their cost is not treated as zero, but is excluded from totals.</p>}
          <section className={`${adminStyles.panel} mt-6 overflow-x-auto p-4`}>
            <table className="w-full min-w-[860px] text-left text-xs">
              <thead className="text-white/50">
                <tr>{['Type', 'Source', 'Count', 'Failed', 'Credits', 'Provider cost', 'Worst-case revenue', 'Worst-case margin', 'Multiple'].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {data.items.map((row) => (
                  <tr key={`${row.kind}-${row.source}`} className={row.losing ? 'bg-red-500/[0.06]' : ''}>
                    <td className="px-2 py-2">{USAGE_KIND_LABELS[row.kind] || row.kind}</td>
                    <td className="px-2 py-2">{USAGE_SOURCE_LABELS[row.source] || row.source}</td>
                    <td className="px-2 py-2">{num(row.count, 0)}</td>
                    <td className="px-2 py-2">{row.failed || ''}</td>
                    <td className="px-2 py-2">{num(row.credits)}</td>
                    <td className="px-2 py-2">{idr(row.costIdr)}{row.unknownCost > 0 && <span className="ml-1 text-amber-200" title="Some jobs do not have a recorded provider cost">*</span>}</td>
                    <td className="px-2 py-2">{idr(row.revenueIdrWorst)}</td>
                    <td className={`px-2 py-2 ${row.marginIdrWorst < 0 ? 'text-red-300' : 'text-emerald-300'}`}>{idr(row.marginIdrWorst)}</td>
                    <td className="px-2 py-2">{row.marginRatioWorst ? `${num(row.marginRatioWorst)}×` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs leading-5 text-white/45">
              Worst-case revenue = credits × price per credit of the cheapest package. Red rows lose money under that scenario. Excludes payment
              fees, taxes, hosting, and fixed subscriptions (e.g. ElevenLabs Starter $6/month). Video/image costs are provider estimates
              at job creation, adjusted for final credits charged; see Economics for per-request details.
            </p>
          </section>
        </>
      )}
    </AdminShell>
  );
}
