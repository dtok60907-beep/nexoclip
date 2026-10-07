'use client';

import { useEffect, useRef, useState } from 'react';
import AdminShell from './AdminShell';
import Link from 'next/link';
import { adminStyles } from '../src/lib/adminStyles.js';
import { saasFetch } from '../src/lib/saas/api.js';
import { getStoredWorkspaceId, setStoredWorkspaceId } from '../src/lib/saas/storage.js';
import { coverageReasons, economicsPath, idr, margin, credits } from '../src/lib/economicsDisplay.js';

const fieldClass = adminStyles.field;
const buttonClass = adminStyles.button;

function Stat({ label, value, detail }) {
  return <div className={adminStyles.card}><p className={adminStyles.cardLabel}>{label}</p><p className={adminStyles.cardValue}>{value}</p>{detail && <p className="mt-2 text-xs text-white/45">{detail}</p>}</div>;
}

export function EconomicsReport({ data, onPage }) {
  const { totals, breakdown, items, pagination } = data;
  const simulation = totals.simulation;
  const revenue = row => row.simulation?.revenueIdr ?? row.recognizedRevenueIdr;
  const contribution = row => row.simulation?.contributionIdr ?? row.contributionIdr;
  const incomplete = !totals.coverage.complete;
  const reasons = coverageReasons(totals.coverage);
  return <>
    <p className="mt-4 rounded-lg border border-white/10 p-3 text-xs leading-5 text-white/60">Lingkungan laporan: {{production:'Production',development:'Development',unclassified:'Belum diklasifikasi',all:'Semua lingkungan'}[data.environment || 'all']}. Filter Production hanya memasukkan job yang ditandai production saat dibuat. Data lama tanpa klasifikasi tidak otomatis dianggap production.</p>
    {simulation && <div className="mt-6 rounded-xl border border-cyan-300/25 bg-cyan-300/5 p-4 text-sm text-cyan-100"><p className="font-semibold">Simulasi: kredit trial 750 diasumsikan bernilai Rp149.000</p><p className="mt-1 text-xs">Pendapatan simulasi mengikuti kredit yang dikonsumsi dari grant tersebut. Pendapatan aktual tetap {idr(totals.recognizedRevenueIdr)}; ini bukan pembayaran nyata. Saldo dan sumber kredit trial tidak berubah.</p></div>}
    <div className={`mt-6 rounded-xl border p-4 text-sm ${incomplete ? 'border-amber-300/25 bg-amber-300/5 text-amber-100' : 'border-emerald-300/20 bg-emerald-300/5 text-emerald-100'}`}>
      <p className="font-semibold">{incomplete ? 'Data biaya atau pendapatan belum lengkap' : 'Data provider dan kredit sudah lengkap'}</p>
      <p className="mt-1 text-xs opacity-75">{incomplete ? reasons.join(' · ') || 'Komponen laporan masih perlu diperiksa.' : 'Kontribusi di bawah belum memasukkan hosting, storage, egress, pajak, dan biaya operasional lain.'}</p>
    </div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label={simulation ? "Pendapatan simulasi kredit terpakai" : "Pendapatan kredit terpakai"} value={idr(revenue(totals))} detail={totals.coverage.revenueComplete ? 'Nilai kredit yang telah dikonsumsi' : 'Jumlah diketahui; masih ada nilai yang belum tercatat'} />
      <Stat label="Biaya provider tercatat" value={idr(totals.providerCostIdr)} detail={`${totals.costSources.reported} dilaporkan · ${totals.costSources.calculated} dihitung dari usage`} />
      <Stat label="Biaya pembayaran dialokasikan" value={idr(totals.paymentFeeIdr)} detail={totals.coverage.paymentFeesComplete ? 'Proporsional terhadap kredit terpakai' : `${idr(totals.knownPaymentFeeIdr)} sudah diketahui`} />
      <Stat label={simulation ? "Kontribusi simulasi sementara" : "Kontribusi setelah provider dan pembayaran"} value={idr(simulation ? simulation.knownContributionIdr : totals.contributionIdr)} detail={simulation ? (incomplete ? 'Berdasarkan biaya yang diketahui; 1 atau lebih komponen belum lengkap. Margin belum lengkap.' : `Margin simulasi: ${margin(simulation.revenueIdr > 0 ? simulation.contributionIdr / simulation.revenueIdr * 100 : null)}`) : `Margin kontribusi: ${margin(totals.marginPercent)}`} />
    </div>
    <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-white/50">
      <span>{totals.jobCount} job selesai/gagal</span><span>{totals.failedJobCount} gagal</span><span>{totals.providerRequestCount} request provider</span>
      <span>{credits(totals.creditsConsumed)} kredit dikonsumsi</span><span>{totals.excludedSandboxJobs} job sandbox dikecualikan</span>
    </div>
    <section className={`${adminStyles.panel} mt-8`}>
      <h2 className="border-b border-white/10 px-4 py-3 text-sm font-semibold">{data.groupBy === 'provider' ? 'Ringkasan per provider akhir' : 'Ringkasan per model'}</h2>
      <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-white/[.02] text-xs text-white/45"><tr><th className="p-4">{data.groupBy === 'provider' ? 'Provider akhir' : 'Model'}</th><th className="p-4">Job</th><th className="p-4">{simulation ? 'Pendapatan (simulasi bila berlaku)' : 'Pendapatan diketahui'}</th><th className="p-4">Provider diketahui</th><th className="p-4">Kontribusi</th><th className="p-4">Margin</th></tr></thead>
        <tbody>{breakdown.length ? breakdown.map(row => <tr key={row.key} className="border-t border-white/10"><td className="max-w-[300px] break-words p-4">{row.key}</td><td className="p-4">{row.jobCount}</td><td className="p-4 tabular-nums">{idr(revenue(row))}</td><td className="p-4 tabular-nums">{idr(row.providerCostIdr)}</td><td className="p-4 tabular-nums">{idr(contribution(row))}</td><td className="p-4">{margin(row.simulation ? (row.simulation.contributionIdr !== null && row.simulation.revenueIdr > 0 ? row.simulation.contributionIdr / row.simulation.revenueIdr * 100 : null) : row.marginPercent)}</td></tr>) : <tr><td colSpan="6" className="p-6 text-center text-white/45">Belum ada job pada periode ini.</td></tr>}</tbody>
      </table></div>
    </section>
    <section className={`${adminStyles.panel} mt-6`}>
      <h2 className="border-b border-white/10 px-4 py-3 text-sm font-semibold">Detail job</h2>
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-white/[.02] text-xs text-white/45"><tr><th className="p-4">Model / status</th><th className="p-4">Tanggal cohort (UTC)</th><th className="p-4">{simulation ? 'Pendapatan (simulasi bila berlaku)' : 'Pendapatan diketahui'}</th><th className="p-4">Provider diketahui</th><th className="p-4">Kontribusi</th><th className="p-4">Kelengkapan</th></tr></thead>
        <tbody>{items.length ? items.map(row => <tr key={row.id} className="border-t border-white/10"><td className="max-w-[280px] break-words p-4">{row.model}<span className="mt-1 block text-xs text-white/45">{row.status} · {row.provider || 'Provider belum diketahui'}</span></td><td className="p-4 text-xs text-white/60">{new Date(row.cohortAt).toLocaleString('id-ID', { timeZone: 'UTC' })}</td><td className="p-4 tabular-nums">{idr(revenue(row))}</td><td className="p-4 tabular-nums">{idr(row.providerCostIdr)}</td><td className="p-4 tabular-nums">{idr(contribution(row))}</td><td className="max-w-[300px] p-4 text-xs text-white/55">{row.coverage.complete ? 'Lengkap' : coverageReasons(row.coverage).join(' · ')}</td></tr>) : <tr><td colSpan="6" className="p-6 text-center text-white/45">Belum ada job.</td></tr>}</tbody>
      </table></div>
      <div className="flex flex-wrap items-center justify-end gap-4 border-t border-white/10 px-4 py-3 text-xs text-white/60"><button type="button" disabled={pagination.page <= 1} className="disabled:opacity-25" onClick={() => onPage?.(pagination.page - 1)}>Sebelumnya</button><span className="text-white/45">{pagination.page} / {pagination.totalPages || 1}</span><button type="button" disabled={pagination.page >= pagination.totalPages} className="disabled:opacity-25" onClick={() => onPage?.(pagination.page + 1)}>Berikutnya</button></div>
    </section>
    <p className="mt-4 text-xs text-white/40">Biaya retry, fallback, dan request gagal termasuk dalam biaya job. Periode mengikuti tanggal selesai job; job lama tanpa tanggal selesai memakai tanggal dibuat. Pendapatan mengikuti kredit terpakai, bukan arus kas top-up. Tarif hasil perhitungan usage belum direkonsiliasi dengan invoice provider.</p>
  </>;
}

function PaymentFeeForm({ workspaceId, onSaved }) {
  const [topups, setTopups] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [topupId, setTopupId] = useState('');
  const [fee, setFee] = useState('');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const requestKey = useRef(null);
  useEffect(() => {
    let cancelled = false;
    setTopups([]); setTopupId(''); setFeedback(null);
    setLoading(true);
    saasFetch(`/api/admin/economics/payment-fees?page=${page}&pageSize=20`, { headers: { 'x-workspace-id': workspaceId } })
      .then(data => { if (!cancelled) { setTopups(data.items || []); setPagination(data.pagination); } })
      .catch(() => { if (!cancelled) setFeedback({ error: true, text: 'Riwayat pembayaran tidak dapat dimuat.' }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId, page]);
  async function submit(event) {
    event.preventDefault();
    const signature = JSON.stringify([workspaceId, topupId, fee, reference]);
    if (requestKey.current?.signature !== signature) requestKey.current = { signature, key: crypto.randomUUID() };
    setSaving(true); setFeedback(null);
    try {
      await saasFetch('/api/admin/economics/payment-fees', {
        method: 'POST', headers: { 'x-workspace-id': workspaceId, 'content-type': 'application/json' },
        body: JSON.stringify({ topupId, feeIdr: fee, evidenceReference: reference, reconciliationKey: requestKey.current.key }),
      });
      setFeedback({ error: false, text: 'Biaya pembayaran tersimpan. Laporan diperbarui.' });
      onSaved();
    } catch (error) { setFeedback({ error: true, text: error.message }); }
    finally { setSaving(false); }
  }
  return <details className="mt-8 rounded-xl border border-white/10 bg-white/[.02] p-4"><summary className="cursor-pointer text-sm font-semibold">Rekonsiliasi biaya pembayaran</summary>
    <p className="mt-3 text-xs text-white/45">Masukkan biaya aktual dari invoice atau gateway. Isi 0 jika biaya memang nol. Koreksi disimpan sebagai catatan baru; harga paket tidak berubah.</p>
    <form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-3">
      <label className={adminStyles.label}>Top-up selesai<select required disabled={saving || loading} value={topupId} onChange={event => { setTopupId(event.target.value); setFee(''); setReference(''); setFeedback(null); }} className={fieldClass}><option value="">{loading ? 'Memuat pembayaran…' : 'Pilih pembayaran'}</option>{topups.map(row => <option key={row.id} value={row.id}>{row.packageCode} · {idr(row.amountIdr)} · {new Date(row.completedAt).toLocaleDateString('id-ID')} · {row.id.slice(0, 8)}</option>)}</select>
        <span className="mt-2 flex items-center justify-between gap-2"><button type="button" disabled={saving || loading || page <= 1} className="text-cyan-200 disabled:opacity-25" onClick={() => setPage(value => value - 1)}>Lebih baru</button><span>{page} / {pagination.totalPages || 1}</span><button type="button" disabled={saving || loading || page >= pagination.totalPages} className="text-cyan-200 disabled:opacity-25" onClick={() => setPage(value => value + 1)}>Lebih lama</button></span>
      </label>
      <label className={adminStyles.label}>Biaya gateway (IDR)<input required disabled={saving} type="number" min="0" step="0.01" value={fee} onChange={event => setFee(event.target.value)} className={fieldClass} /></label>
      <label className={adminStyles.label}>Referensi invoice / gateway<input required disabled={saving} maxLength="250" value={reference} onChange={event => setReference(event.target.value)} className={fieldClass} /></label>
      <div className="flex items-center gap-4 md:col-span-3"><button className={buttonClass} disabled={saving || loading || !topupId}>{saving ? 'Menyimpan…' : 'Simpan biaya aktual'}</button>{feedback && <p role="status" className={`text-xs ${feedback.error ? 'text-red-300' : 'text-emerald-300'}`}>{feedback.text}</p>}</div>
    </form>
  </details>;
}

export default function EconomicsDashboard({ initialRange }) {
  const [workspaces, setWorkspaces] = useState([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [range, setRange] = useState(initialRange);
  const [groupBy, setGroupBy] = useState('model');
  const [environment,setEnvironment]=useState('production');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    saasFetch('/api/workspaces').then(result => {
      if (cancelled) return;
      const list = result.workspaces || [];
      setWorkspaces(list);
      setWorkspaceId(list.find(row => row.id === getStoredWorkspaceId())?.id || list[0]?.id || '');
      if (!list.length) setError('Belum ada workspace yang dapat diakses.');
    }).catch(reason => { if (!cancelled) setError(reason.message); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    setData(null); setError(null);
    saasFetch(economicsPath({ ...range, groupBy, page,environment }), { headers: { 'x-workspace-id': workspaceId } })
      .then(result => { if (!cancelled) setData(result); })
      .catch(reason => { if (!cancelled) setError(reason.message); });
    return () => { cancelled = true; };
  }, [workspaceId, range, groupBy, page, revision,environment]);
  function chooseWorkspace(value) { setData(null); setPage(1); setWorkspaceId(value); setStoredWorkspaceId(value); }
  return <AdminShell active="/admin/economics" title="COGS & kontribusi" description="Pantau nilai kredit yang digunakan, biaya provider, dan biaya pembayaran per workspace.">
      <div className={adminStyles.filters}>
        <label className={adminStyles.label}>Lingkungan<select aria-label="Lingkungan Economics" className={fieldClass} value={environment} onChange={event=>{setPage(1);setEnvironment(event.target.value);}}><option value="production">Production</option><option value="development">Development</option><option value="unclassified">Belum diklasifikasi</option><option value="all">Semua lingkungan</option></select></label>
        <label className={adminStyles.label}>Workspace<select className={fieldClass} value={workspaceId} onChange={event => chooseWorkspace(event.target.value)}>{workspaces.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label className={adminStyles.label}>Dari (UTC)<input type="date" className={fieldClass} value={range.from} onChange={event => { setPage(1); setRange(current => ({ ...current, from: event.target.value })); }} /></label>
        <label className={adminStyles.label}>Sampai (UTC)<input type="date" className={fieldClass} value={range.to} onChange={event => { setPage(1); setRange(current => ({ ...current, to: event.target.value })); }} /></label>
        <label className={adminStyles.label}>Kelompok<select className={fieldClass} value={groupBy} onChange={event => { setPage(1); setGroupBy(event.target.value); }}><option value="model">Model</option><option value="provider">Provider akhir</option></select></label>
        <button className={`${buttonClass} self-end`} type="button" onClick={() => setRevision(value => value + 1)}>Muat ulang</button>
      </div>
      <p className="my-4 text-sm text-white/50">Ringkasan model di bawah hanya berasal dari job pada periode ini. <Link href="/admin/models" className="text-cyan-200 hover:underline">Lihat semua model dan tarif →</Link></p>
      <p className="my-4 text-sm text-white/50">Periksa biaya tertagih dan selisih usage di <Link href="/admin/provider-billing" className="text-cyan-200 hover:underline">Billing provider →</Link></p>
      {error && <div role="alert" className={adminStyles.error}>{error}</div>}
      {!data && !error && <p role="status" className={adminStyles.loading}>Memuat laporan…</p>}
      {data && <EconomicsReport data={data} onPage={setPage} />}
      {workspaceId && <PaymentFeeForm key={workspaceId} workspaceId={workspaceId} onSaved={() => setRevision(value => value + 1)} />}
  </AdminShell>;
}
