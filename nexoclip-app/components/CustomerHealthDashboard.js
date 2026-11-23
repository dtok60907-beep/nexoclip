'use client';

import { useEffect, useState } from 'react';
import AdminShell from './AdminShell';
import { adminStyles as s } from '../src/lib/adminStyles.js';
import { saasFetch } from '../src/lib/saas/api.js';

const idr = value => `Rp${Math.round(Number(value || 0)).toLocaleString('id-ID')}`;
const num = value => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const date = value => value ? new Date(value).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const state = { active: ['Active', 'text-emerald-300'], expired: ['Expired', 'text-amber-300'], none: ['No plan', 'text-white/50'] };

function Stat({ label, value, detail }) { return <article className={s.card}><p className={s.cardLabel}>{label}</p><p className={s.cardValue}>{value}</p>{detail && <p className="mt-2 text-xs text-white/45">{detail}</p>}</article>; }

export default function CustomerHealthDashboard() {
  const [days, setDays] = useState('30'), [q, setQ] = useState(''), [draftQ, setDraftQ] = useState(''), [data, setData] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const load = () => { setLoading(true); setError(''); saasFetch(`/api/admin/customer-overview?days=${days}&q=${encodeURIComponent(q)}`).then(setData).catch(e => setError(e.message)).finally(() => setLoading(false)); };
  useEffect(load, [days, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = data?.totals;
  return <AdminShell platform active="/admin/customer-health" title="Customer Health" description="Plans, subscriptions, balances, usage, revenue, and costs across all workspaces in one view.">
    <form className={s.filters} onSubmit={e => { e.preventDefault(); setQ(draftQ.trim()); }}><label className={s.label}>Search workspace<input className={s.field} value={draftQ} maxLength={120} onChange={e => setDraftQ(e.target.value)} placeholder="Name or slug" /></label><label className={s.label}>Period<select className={s.field} value={days} onChange={e => setDays(e.target.value)}><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">365 days</option></select></label><button className={s.button}>Apply</button></form>
    {error && <p role="alert" className={s.error}>{error}</p>}
    {loading && <p role="status" className={s.loading}>Loading customer health…</p>}
    {t && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Workspaces" value={num(t.workspaces)} /><Stat label="Members" value={num(t.members)} /><Stat label="Active plans" value={num(t.activePlans)} detail={`${num(t.workspaces - t.activePlans)} inactive`} /><Stat label="Usage" value={num(t.usage)} detail={`${num(t.creditsUsed)} credits used`} /><Stat label="Top-up revenue" value={idr(t.revenueIdr)} detail={`${data.period.days}-day period`} /><Stat label="Provider cost" value={`$${Number(t.providerCostUsd).toFixed(2)}`} /><Stat label="Margin data" value={idr(t.revenueIdr)} detail="Revenue shown; provider cost is in USD" /></div>}
    {data && <section className={`${s.panel} mt-6 overflow-x-auto`}><div className="flex items-center justify-between border-b border-white/10 p-4"><div><h2 className="font-semibold">Workspaces & Subscriptions</h2><p className="mt-1 text-xs text-white/45">Usage is calculated over the last {data.period.days} days; balances and plans reflect current state.</p></div></div><table className="w-full min-w-[1100px] text-left text-sm"><thead className="bg-white/[.03] text-xs text-white/50"><tr><th className="p-4">Workspace</th><th className="p-4">Plan</th><th className="p-4">Members</th><th className="p-4">Balance</th><th className="p-4">Usage</th><th className="p-4">Credits used</th><th className="p-4">Revenue</th><th className="p-4">Cost USD</th><th className="p-4">Last activity</th></tr></thead><tbody>{data.rows.length ? data.rows.map(row => { const [label, tone] = state[row.plan_state] || state.none; return <tr key={row.id} className="border-t border-white/10 align-top"><td className="p-4"><p className="font-medium">{row.name}</p><p className="mt-1 text-xs text-white/40">{row.slug}</p></td><td className="p-4"><span className={tone}>{label}</span><p className="mt-1 text-xs text-white/45">{row.plan_code || '—'}{row.monthly_credits ? ` · ${num(row.monthly_credits)} credits/mo` : ''}{row.current_period_end ? ` · until ${date(row.current_period_end)}` : ''}</p></td><td className="p-4">{num(row.member_count)}</td><td className="p-4">{num(row.balance)}</td><td className="p-4">{num(row.usage_count)}<p className="mt-1 text-xs text-white/40">{num(row.successful_usage)} succeeded</p></td><td className="p-4">{num(row.credits_used)}</td><td className="p-4">{idr(row.topup_revenue_idr)}<p className="mt-1 text-xs text-white/40">{row.paid_topups} top-ups</p></td><td className="p-4">${Number(row.provider_cost_usd || 0).toFixed(2)}</td><td className="p-4">{date(row.last_activity_at)}</td></tr>; }) : <tr><td colSpan="9" className="p-8 text-center text-white/45">No workspaces found.</td></tr>}</tbody></table></section>}
  </AdminShell>;
}
