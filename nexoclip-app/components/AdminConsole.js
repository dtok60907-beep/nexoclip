'use client';
import { useEffect, useState } from 'react';
import AdminShell from './AdminShell';
import { adminStyles } from '../src/lib/adminStyles.js';
import { saasFetch } from '../src/lib/saas/api.js';
import { getStoredWorkspaceId, setStoredWorkspaceId } from '../src/lib/saas/storage.js';
import { idr, credits } from '../src/lib/economicsDisplay.js';

const field = adminStyles.field;
const titles = { overview: 'Overview', customers: 'Customers & Workspaces', transactions: 'Transactions', credits: 'Credits ledger', jobs: 'Jobs' };
const columns = {
  customers: [['email', 'Email'], ['display_name', 'Nama'], ['role', 'Role workspace'], ['joined_at', 'Bergabung (UTC)']],
  transactions: [['order_id', 'Order'], ['package_code', 'Paket'], ['amount_idr', 'Nilai'], ['credits', 'Kredit'], ['status', 'Status'], ['is_sandbox', 'Sandbox'], ['created_at', 'Dibuat (UTC)']],
  credits: [['reason', 'Alasan'], ['amount', 'Perubahan kredit'], ['balance_after', 'Saldo setelah'], ['created_at', 'Tanggal (UTC)']],
  jobs: [['model', 'Model'], ['kind', 'Jenis'], ['status', 'Status'], ['estimated_cost', 'Estimasi kredit'], ['settlement_status', 'Settlement'], ['created_at', 'Dibuat (UTC)']],
};
const labels = { id: 'ID', registered_at: 'Pendaftaran (UTC)', completed_at: 'Pembayaran selesai (UTC)', credit_ledger_id: 'ID ledger', provider_key: 'Gateway', attempt_count: 'Attempt', max_attempts: 'Batas attempt', started_at: 'Mulai (UTC)', finished_at: 'Selesai (UTC)' };
function value(key, item) {
  const v = item[key];
  if (v === null || v === undefined || v === '') return '—';
  if (key.endsWith('_at')) return new Date(v).toLocaleString('id-ID', { timeZone: 'UTC' });
  if (key === 'amount_idr') return idr(v);
  if (['amount', 'balance_after', 'credits', 'estimated_cost', 'balance', 'budget_credits'].includes(key)) return credits(v);
  if (typeof v === 'boolean') return v ? 'Ya' : 'Tidak';
  return String(v);
}
export function ConsoleReport({ section, data, onDetail }) {
  if (section === 'overview') {
    const s = data.summary;
    const cards = [['Anggota workspace', s.members], ['Saldo kredit saat ini', credits(s.balance)], ['Penjualan top-up non-sandbox', idr(s.sales_idr)], ['Top-up berhasil', s.paid_topups], ['Top-up pending', s.pending_topups], ['Job dibuat', s.jobs], ['Job aktif dalam cohort', s.active], ['Job gagal dalam cohort', s.failed], ['Running > 30 menit dalam cohort', s.long_running]];
    return <><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{cards.map(([label, count]) => <article key={label} className={adminStyles.card}><p className={adminStyles.cardLabel}>{label}</p><p className={adminStyles.cardValue}>{count}</p></article>)}</div><p className="mt-5 text-sm text-white/45">Transaksi dan job mengikuti tanggal dibuat dalam periode UTC. Anggota dan saldo adalah kondisi saat ini. Penjualan top-up berbeda dari pendapatan kredit terpakai; buka Economics untuk kontribusi dan kelengkapan biaya. Running lebih dari 30 menit perlu diperiksa dan belum tentu macet.</p></>;
  }
  return <>{section === 'customers' && data.workspace && <section className="mb-5 rounded-xl border border-white/10 p-5"><h2 className="font-semibold">{data.workspace.name}</h2><p className="mt-1 text-xs text-white/45">Slug: {data.workspace.slug} · ID: {data.workspace.id}</p><p className="mt-3 text-sm text-white/60">Saldo: {credits(data.workspace.balance)} kredit{data.workspace.max_concurrent !== null && <> · Batas job bersamaan: {data.workspace.max_concurrent} · Budget: {credits(data.workspace.budget_credits)} kredit per bulan (0 berarti tanpa budget)</>}</p></section>}<div className={`${adminStyles.panel} overflow-x-auto`}><table className="w-full text-left text-sm"><thead className="bg-white/[.03] text-white/50"><tr>{columns[section].map(([key, label]) => <th className="whitespace-nowrap p-4" key={key}>{label}</th>)}<th className="p-4">Detail</th></tr></thead><tbody>{data.items.length ? data.items.map(item => <tr key={item.id} className="border-t border-white/10">{columns[section].map(([key]) => <td className="p-4" key={key}>{value(key, item)}</td>)}<td className="p-4"><button type="button" onClick={() => onDetail(item)} className="text-cyan-200">Lihat detail</button></td></tr>) : <tr><td className="p-8 text-center text-white/45" colSpan={columns[section].length + 1}>Tidak ada data yang sesuai filter.</td></tr>}</tbody></table></div></>;
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
      if (!items.length) setError('Akun ini belum memiliki workspace.');
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
  return <AdminShell active={section === 'overview' ? '/admin' : `/admin/${section}`} title={titles[section]} description="Periksa pelanggan, pembayaran, kredit, dan generasi pada workspace yang dipilih.">
    <form className={adminStyles.filters} onSubmit={e => { e.preventDefault(); setPage(1); setFilters({ ...draft }); setRevision(v => v + 1); }}>
      <label className={adminStyles.label}>Workspace<select className={field} value={workspaceId} onChange={e => { setData(null); setDetail(null); setPage(1); setWorkspaceId(e.target.value); setStoredWorkspaceId(e.target.value); }}>{workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
      {['from', 'to'].map(key => <label key={key} className={adminStyles.label}>{key === 'from' ? 'Dari (UTC)' : 'Sampai (UTC)'}<input required type="date" className={field} value={draft[key]} onChange={e => setDraft(v => ({ ...v, [key]: e.target.value }))} /></label>)}
      {section !== 'overview' && <label className={adminStyles.label}>{section === 'customers' ? 'Cari email / nama' : section === 'credits' ? 'Cari alasan' : section === 'jobs' ? 'Cari model / ID' : 'Cari order / paket'}<input className={field} maxLength="120" value={draft.q} onChange={e => setDraft(v => ({ ...v, q: e.target.value }))} /></label>}
      {['transactions', 'jobs'].includes(section) && <label className={adminStyles.label}>Status<select className={field} value={draft.status} onChange={e => setDraft(v => ({ ...v, status: e.target.value }))}><option value="">Semua</option>{statuses.map(s => <option key={s}>{s}</option>)}</select></label>}
      <button className={`${adminStyles.button} self-end`}>Terapkan filter</button>
    </form>
    {error && <p role="alert" className={adminStyles.error}>{error}</p>}
    {!data && !error && <p role="status" className={adminStyles.loading}>Memuat data…</p>}
    {data && <><p className="mb-4 text-xs text-white/45">Periode diterapkan: {data.filters.from} — {data.filters.to} UTC{section === 'customers' ? ' · berdasarkan tanggal bergabung ke workspace' : ''}</p><ConsoleReport section={section} data={data} onDetail={setDetail} />{data.pagination && <div className="mt-4 flex flex-wrap items-center justify-end gap-4 rounded-xl border border-white/10 bg-white/[.02] px-4 py-3 text-xs text-white/60"><button disabled={page <= 1} className="disabled:opacity-30" onClick={() => setPage(p => p - 1)}>Sebelumnya</button><span>{page} / {data.pagination.totalPages || 1} · {data.pagination.total} hasil</span><button disabled={page >= data.pagination.totalPages} className="disabled:opacity-30" onClick={() => setPage(p => p + 1)}>Berikutnya</button></div>}</>}
    {detail && <section aria-label="Detail pilihan" className={`${adminStyles.panel} mt-6 p-5`}><div className="flex justify-between"><h2 className="font-semibold">Detail {titles[section]}</h2><button className="text-cyan-200" onClick={() => setDetail(null)}>Tutup detail</button></div><dl className="mt-4 grid gap-3 sm:grid-cols-2">{Object.keys(detail).map(key => <div key={key}><dt className="text-xs text-white/45">{columns[section].find(c => c[0] === key)?.[1] || labels[key] || key}</dt><dd className="mt-1 break-all text-sm">{value(key, detail)}</dd></div>)}</dl></section>}
  </AdminShell>;
}
