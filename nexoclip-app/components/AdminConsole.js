'use client';
import { useEffect, useState } from 'react';
import AdminShell from './AdminShell';
import { adminStyles } from '../src/lib/adminStyles.js';
import { saasFetch } from '../src/lib/saas/api.js';
import { getStoredWorkspaceId, setStoredWorkspaceId } from '../src/lib/saas/storage.js';
import { idr, credits } from '../src/lib/economicsDisplay.js';

const field = adminStyles.field;
export const USAGE_SOURCE_LABELS = { director: 'AI Director', canvas: 'Canvas', studio: 'Studio', storyboard: 'AI Storyboard' };
export const USAGE_KIND_LABELS = { image: 'Image', video: 'Video', llm: 'LLM (text)', voiceover: 'Voiceover', music: 'Music', audio: 'Audio', video_analysis: 'Video analysis' };
const titles = { overview: 'Overview', customers: 'Customers & Workspaces', transactions: 'Transactions', credits: 'Credits Ledger', jobs: 'Jobs' };
const columns = {
  customers: [['email', 'Email'], ['display_name', 'Name'], ['role', 'Workspace role'], ['joined_at', 'Joined (UTC)']],
  transactions: [['order_id', 'Order'], ['package_code', 'Package'], ['amount_idr', 'Amount'], ['credits', 'Credits'], ['status', 'Status'], ['is_sandbox', 'Sandbox'], ['created_at', 'Created (UTC)']],
  credits: [['reason', 'Reason'], ['amount', 'Credit change'], ['balance_after', 'Balance after'], ['created_at', 'Date (UTC)']],
  jobs: [['source', 'Source'], ['kind', 'Type'], ['model', 'Model'], ['status', 'Status'], ['credits_charged', 'Credits charged'], ['provider_cost_usd', 'Provider cost (USD)'], ['settlement_status', 'Settlement'], ['created_at', 'Created (UTC)']],
};
const labels = { estimated_cost: 'Estimated credits', id: 'ID', registered_at: 'Registered (UTC)', completed_at: 'Payment completed (UTC)', credit_ledger_id: 'Ledger ID', provider_key: 'Gateway', attempt_count: 'Attempts', max_attempts: 'Max attempts', started_at: 'Started (UTC)', finished_at: 'Finished (UTC)' };
function value(key, item) {
  const v = item[key];
  if ((v === null || v === undefined) && key === 'provider_cost_usd') return 'unknown';
  if (v === null || v === undefined || v === '') return '—';
  if (key.endsWith('_at')) return new Date(v).toLocaleString('en-US', { timeZone: 'UTC' });
  if (key === 'amount_idr') return idr(v);
  if (['amount', 'balance_after', 'credits', 'estimated_cost', 'credits_charged', 'balance', 'budget_credits'].includes(key)) return credits(v);
  if (key === 'provider_cost_usd') return `$${Number(v).toFixed(4)}`;
  if (key === 'source') return USAGE_SOURCE_LABELS[v] || v;
  if (key === 'kind' && item.source !== undefined) return USAGE_KIND_LABELS[v] || v;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}
export function ConsoleReport({ section, data, onDetail }) {
  if (section === 'overview') {
    const s = data.summary;
    const cards = [['Workspace members', s.members], ['Current credit balance', credits(s.balance)], ['Non-sandbox top-up sales', idr(s.sales_idr)], ['Paid top-ups', s.paid_topups], ['Pending top-ups', s.pending_topups], ['Jobs created', s.jobs], ['Active jobs in cohort', s.active], ['Failed jobs in cohort', s.failed], ['Running > 30 min in cohort', s.long_running]];
    return <><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{cards.map(([label, count]) => <article key={label} className={adminStyles.card}><p className={adminStyles.cardLabel}>{label}</p><p className={adminStyles.cardValue}>{count}</p></article>)}</div><p className="mt-5 text-sm text-white/45">Transactions and jobs follow their creation date within the UTC period. Members and balance reflect current state. Top-up sales differ from recognized credit revenue; open Economics for contribution and cost completeness. Jobs running over 30 minutes should be checked and are not necessarily stuck.</p></>;
  }
  return <>{section === 'customers' && data.workspace && <section className="mb-5 rounded-xl border border-white/10 p-5"><h2 className="font-semibold">{data.workspace.name}</h2><p className="mt-1 text-xs text-white/45">Slug: {data.workspace.slug} · ID: {data.workspace.id}</p><p className="mt-3 text-sm text-white/60">Balance: {credits(data.workspace.balance)} credits{data.workspace.max_concurrent !== null && <> · Concurrent job limit: {data.workspace.max_concurrent} · Budget: {credits(data.workspace.budget_credits)} credits/month (0 means no budget)</>}</p></section>}<div className={`${adminStyles.panel} overflow-x-auto`}><table className="w-full text-left text-sm"><thead className="bg-white/[.03] text-white/50"><tr>{columns[section].map(([key, label]) => <th className="whitespace-nowrap p-4" key={key}>{label}</th>)}<th className="p-4">Details</th></tr></thead><tbody>{data.items.length ? data.items.map(item => <tr key={item.id} className="border-t border-white/10">{columns[section].map(([key]) => <td className="p-4" key={key}>{value(key, item)}</td>)}<td className="p-4"><button type="button" onClick={() => onDetail(item)} className="text-cyan-200">View details</button></td></tr>) : <tr><td className="p-8 text-center text-white/45" colSpan={columns[section].length + 1}>No data matches the current filters.</td></tr>}</tbody></table></div></>;
}
export default function AdminConsole({ section, initialRange }) {
  const [workspaces, setWorkspaces] = useState([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [draft, setDraft] = useState({ ...initialRange, q: '', status: '' });
  const [filters, setFilters] = useState(draft);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState(null);
  useEffect(() => {
    let canceled = false;
    saasFetch('/api/workspaces').then(result => {
      if (canceled) return;
      const items = result.workspaces || []; setWorkspaces(items);
      const saved = getStoredWorkspaceId(); setWorkspaceId(items.find(w => w.id === saved)?.id || items[0]?.id || '');
      if (!items.length) setError('This account does not have any workspaces yet.');
    }).catch(e => { if (!canceled) setError(e.message); });
    return () => { canceled = true; };
  }, []);
  useEffect(() => {
    if (!workspaceId) return;
    let canceled = false; setData(null); setError(''); setDetail(null);
    const query = new URLSearchParams({ section, ...filters, page: String(page) });
    saasFetch(`/api/admin/console?${query}`, { headers: { 'x-workspace-id': workspaceId } }).then(result => { if (!canceled) setData(result); }).catch(e => { if (!canceled) setError(e.message); });
    return () => { canceled = true; };
  }, [workspaceId, section, filters, page, revision]);
  const statuses = section === 'transactions' ? ['pending', 'completed', 'failed', 'canceled'] : ['queued', 'running', 'processing', 'succeeded', 'failed', 'canceled'];
  return <AdminShell active={section === 'overview' ? '/admin' : `/admin/${section}`} title={titles[section]} description="Inspect customers, payments, credits, and generations for the selected workspace.">
    <form className={adminStyles.filters} onSubmit={e => { e.preventDefault(); setPage(1); setFilters({ ...draft }); setRevision(v => v + 1); }}>
      <label className={adminStyles.label}>Workspace<select className={field} value={workspaceId} onChange={e => { setData(null); setDetail(null); setPage(1); setWorkspaceId(e.target.value); setStoredWorkspaceId(e.target.value); }}>{workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
      {['from', 'to'].map(key => <label key={key} className={adminStyles.label}>{key === 'from' ? 'From (UTC)' : 'To (UTC)'}<input required type="date" className={field} value={draft[key]} onChange={e => setDraft(v => ({ ...v, [key]: e.target.value }))} /></label>)}
      {section !== 'overview' && <label className={adminStyles.label}>{section === 'customers' ? 'Search email / name' : section === 'credits' ? 'Search reason' : section === 'jobs' ? 'Search model / ID' : 'Search order / package'}<input className={field} maxLength="120" value={draft.q} onChange={e => setDraft(v => ({ ...v, q: e.target.value }))} /></label>}
      {['transactions', 'jobs'].includes(section) && <label className={adminStyles.label}>Status<select className={field} value={draft.status} onChange={e => setDraft(v => ({ ...v, status: e.target.value }))}><option value="">All</option>{statuses.map(s => <option key={s}>{s}</option>)}</select></label>}
      <button className={`${adminStyles.button} self-end`}>Apply filters</button>
    </form>
    {error && <p role="alert" className={adminStyles.error}>{error}</p>}
    {!data && !error && <p role="status" className={adminStyles.loading}>Loading data…</p>}
    {data && <><p className="mb-4 text-xs text-white/45">Applied period: {data.filters.from} — {data.filters.to} UTC{section === 'customers' ? ' · based on workspace join date' : ''}</p><ConsoleReport section={section} data={data} onDetail={setDetail} />{data.pagination && <div className="mt-4 flex flex-wrap items-center justify-end gap-4 rounded-xl border border-white/10 bg-white/[.02] px-4 py-3 text-xs text-white/60"><button disabled={page <= 1} className="disabled:opacity-30" onClick={() => setPage(p => p - 1)}>Previous</button><span>{page} / {data.pagination.totalPages || 1} · {data.pagination.total} results</span><button disabled={page >= data.pagination.totalPages} className="disabled:opacity-30" onClick={() => setPage(p => p + 1)}>Next</button></div>}</>}
    {detail && <section aria-label="Selected details" className={`${adminStyles.panel} mt-6 p-5`}><div className="flex justify-between"><h2 className="font-semibold">{titles[section]} Details</h2><button className="text-cyan-200" onClick={() => setDetail(null)}>Close details</button></div><dl className="mt-4 grid gap-3 sm:grid-cols-2">{Object.keys(detail).map(key => <div key={key}><dt className="text-xs text-white/45">{columns[section].find(c => c[0] === key)?.[1] || labels[key] || key}</dt><dd className="mt-1 break-all text-sm">{value(key, detail)}</dd></div>)}</dl></section>}
  </AdminShell>;
}
