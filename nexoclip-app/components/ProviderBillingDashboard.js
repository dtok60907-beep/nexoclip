'use client';

import { useEffect, useRef, useState } from 'react';
import AdminShell from './AdminShell';
import { adminStyles } from '../src/lib/adminStyles.js';
import { saasFetch } from '../src/lib/saas/api.js';

const endpoint = '/api/admin/provider-billing';
const environmentLabel = {development:'Development',production:'Production',unclassified:'Belum diklasifikasi'};
const maxFileBytes = 2 * 1024 * 1024;
const number = value => value === null || value === undefined ? 'Belum diketahui' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 6 }).format(Number(value));
const usd = value => value === null || value === undefined ? 'Belum diketahui' : `US$ ${number(value)}`;
const date = value => value ? new Date(value).toLocaleString('id-ID', { timeZone: 'Asia/Singapore', dateStyle: 'medium', timeStyle: 'short' }) : '—';
const secondaryButton = 'inline-flex min-h-10 items-center justify-center rounded-lg border border-white/15 px-3 text-sm text-white/70 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-35';
const notice = 'rounded-xl border border-amber-300/25 bg-amber-300/5 p-4 text-sm leading-6 text-amber-100';

function Stat({ label, value, detail }) {
  return <div className={adminStyles.card}><p className={adminStyles.cardLabel}>{label}</p><p className={adminStyles.cardValue}>{value}</p>{detail && <p className="mt-2 text-xs leading-5 text-white/45">{detail}</p>}</div>;
}

function Warnings({ warnings = [] }) {
  return warnings.length > 0 && <div className={notice}><p className="font-semibold">Perlu diperhatikan</p><ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">{warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>;
}

function SkuTable({ groups = [] }) {
  const rate = value => value == null ? 'Belum diketahui' : `US$ ${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 12 }).format(Number(value))}`;
  return <section className={adminStyles.panel}>
    <h3 className="border-b border-white/10 px-4 py-3 text-sm font-semibold">Rincian tagihan per SKU</h3>
    <p className="px-4 py-3 text-xs leading-5 text-white/50">Tarif efektif = tagihan sebelum pajak ÷ seluruh usage pada SKU dan satuan yang sama. Ini rata-rata periode ekspor, termasuk pengaruh diskon dan kuota paket. Biaya pembelian paket belum termasuk; angka ini belum menjadi tarif katalog atau COGS final.</p>
    <div className="overflow-x-auto"><table className="w-full min-w-[1150px] text-left text-sm"><thead className="bg-white/[.02] text-xs text-white/45"><tr><th>Konfigurasi / SKU</th><th>Satuan tagihan</th><th>Usage total</th><th>Usage paket</th><th>Usage nonpaket</th><th>Sebelum pajak (USD)</th><th>Tarif efektif / satuan usage</th><th>Dasar tarif</th><th>Tagihan (USD)</th></tr></thead><tbody>{groups.length ? groups.map((row, index) => <tr key={index} className="border-t border-white/10"><td className="max-w-[320px] break-words">{row.configuration}</td><td>{row.billing_unit || '—'}</td><td className="tabular-nums">{number(row.usage)} <span className="text-xs text-white/45">{row.usage_unit}</span></td><td className="tabular-nums">{number(row.package_usage)}</td><td className="tabular-nums">{number(row.non_package_usage)}</td><td className="tabular-nums">{usd(row.pre_tax_usd)}</td><td className="tabular-nums">{rate(row.effective_rate_usd)} <span className="text-xs text-white/45">/ {row.usage_unit}</span></td><td className="text-xs text-white/60">{row.rate_status === 'payg_observed' ? 'PAYG teramati' : row.rate_status === 'package_or_plan' ? 'Campuran paket / plan' : row.rate_status === 'no_usage' ? 'Tidak ada usage' : 'Belum diketahui'}</td><td className="tabular-nums">{usd(row.total_usd)}</td></tr>) : <tr><td colSpan="9" className="text-center text-white/45">Belum ada rincian tagihan.</td></tr>}</tbody></table></div>
  </section>;
}

function Period({ start, end }) {
  return <p className="text-xs leading-5 text-white/50">Periode penggunaan: {date(start)} — {date(end)} (akhir tidak termasuk). Semua waktu menggunakan Asia/Singapore, UTC+8.</p>;
}

function SkuMappingForm({ group, models, disabled, onSave }) {
  const [model,setModel]=useState(group.mapping?.model || '');
  const [note,setNote]=useState('');
  return <form className="space-y-3 border-t border-white/10 p-4" onSubmit={event=>{event.preventDefault();onSave(group,model || null,note.trim());}}>
    <p className="break-words text-sm font-medium">{group.configuration}</p>
    <p className="text-xs text-white/45">{group.billing_unit} · {group.usage_unit} · {group.mapping?.model ? `Terhubung: ${group.mapping.model}` : 'Belum dipetakan'}</p>
    <label className={adminStyles.label}>Model NexoClip<select disabled={disabled} value={model} onChange={event=>setModel(event.target.value)} className={adminStyles.field}><option value="">Belum dipetakan / hapus hubungan</option>{models.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
    <label className={adminStyles.label}>Alasan pemetaan<input required minLength={10} maxLength={2000} disabled={disabled} value={note} onChange={event=>setNote(event.target.value)} className={adminStyles.field} placeholder="Dasar pencocokan SKU dengan model"/></label>
    <button disabled={disabled || note.trim().length<10 || model===(group.mapping?.model || '')} className={secondaryButton}>Simpan pemetaan</button>
  </form>;
}

export function ProviderBillingMappings({ data, disabled, onSave }) {
  return <section className={adminStyles.panel}><h3 className="border-b border-white/10 px-4 py-3 text-sm font-semibold">Pemetaan SKU ke model</h3>
    <p className="p-4 text-xs leading-5 text-white/50">Pilih model berdasarkan bukti konfigurasi BytePlus. Pemetaan hanya berlaku untuk tagihan ini; akun provider dan request per job masih perlu dicocokkan. Pemetaan tidak mengalokasikan biaya, mengubah tarif jual, atau memotong kredit.</p>
    {(data.groups || []).map(group=><SkuMappingForm key={`${group.groupKey}:${group.mapping?.id || ''}`} group={group} models={data.modelOptions || []} disabled={disabled} onSave={onSave}/>)}
    {!!data.mappings?.length && <div className="border-t border-white/10 p-4"><h4 className="text-sm font-semibold">Riwayat pemetaan</h4><ul className="mt-3 space-y-3">{data.mappings.map(row=><li key={row.id} className="text-xs text-white/60"><p className="break-words">{row.configuration} · {row.model || 'Hubungan dihapus'} · {date(row.created_at)} (UTC+8)</p><p className="mt-1 whitespace-pre-wrap break-words">{row.note}</p></li>)}</ul></div>}
  </section>;
}

export function ProviderBillingModelSummary({ summary }) {
  if (!summary) return null;
  const status={no_mapped_sku:'Belum ada SKU dipetakan',no_app_requests:'Tidak ada request aplikasi',unknown_request_costs:'Biaya request belum lengkap',comparison_only:'Pembanding; belum dicocokkan'};
  return <section className={adminStyles.panel}>
    <h3 className="border-b border-white/10 px-4 py-3 text-sm font-semibold">Ringkasan billing per model</h3>
    <div className="grid gap-4 p-4 sm:grid-cols-3"><Stat label="SKU dipetakan" value={`${number(summary.mappedSkuCount)} / ${number(summary.totalSkuCount)}`}/><Stat label="Biaya dipetakan sebelum pajak" value={usd(summary.mappedPreTaxUsd)} detail="Dikelompokkan menurut pilihan model admin"/><Stat label="Biaya belum dipetakan sebelum pajak" value={usd(summary.unmappedPreTaxUsd)} detail={`${number(summary.unmappedSkuCount)} SKU perlu diperiksa`}/></div>
    <p className="px-4 pb-4 text-xs leading-5 text-white/50">Pengelompokan berdasarkan pemetaan SKU pada tagihan ini. Pembanding usage mencakup seluruh akun BytePlus platform; akun dan request belum dicocokkan. Selisih belum menjadi alokasi biaya job atau laba customer. Model tanpa request atau SKU ditampilkan sebagai belum diketahui, bukan biaya nol.</p>
    <div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-white/[.02] text-xs text-white/45"><tr><th>Model</th><th>SKU</th><th>Billing sebelum pajak</th><th>Request aplikasi</th><th>Biaya request diketahui</th><th>Selisih pembanding</th><th>Kelengkapan</th></tr></thead><tbody>{summary.rows.length ? summary.rows.map(row=><tr key={row.model} className="border-t border-white/10"><td className="max-w-[280px] break-words">{row.model}</td><td>{number(row.skuCount)}</td><td>{usd(row.billedPreTaxUsd)}</td><td>{number(row.requestCount)}</td><td>{usd(row.knownRequestCostUsd)}</td><td>{usd(row.differenceUsd)}</td><td className="text-xs leading-5 text-white/60">{status[row.status]}{row.unknownRequests>0 && <p>{number(row.unknownRequests)} request belum diketahui biayanya</p>}{row.hasPackageOrPlan && <p>Biaya pembelian paket / plan belum termasuk</p>}</td></tr>) : <tr><td colSpan="7" className="text-center text-white/45">Belum ada SKU dipetakan atau request aplikasi pada periode ini.</td></tr>}</tbody></table></div>
  </section>;
}

export function ProviderBillingRequests({ inventory }) {
  if (!inventory) return null;
  const match={matching:'Akun cocok',unknown:'Akun belum diketahui',other:'Akun lain'};
  const source={reported:'Dilaporkan provider',calculated:'Dihitung dari usage',unknown:'Belum diketahui'};
  return <section className={adminStyles.panel}><h3 className="border-b border-white/10 px-4 py-3 text-sm font-semibold">Request BytePlus per job</h3>
    <p className="p-4 text-xs leading-5 text-white/50">Request pada rentang penggunaan tagihan, berdasarkan waktu dispatch. Setiap baris adalah observasi terbaru suatu request; satu job dapat memiliki beberapa request. Biaya tercatat belum berarti cocok dengan baris invoice.</p>
    {inventory.truncated && <p role="status" className="px-4 pb-4 text-xs text-amber-100">Menampilkan {inventory.limit} request terbaru. Daftar ini belum mencakup seluruh request; ringkasan biaya di atas tetap memakai seluruh data periode.</p>}
    <div className="overflow-x-auto"><table className="w-full min-w-[1200px] text-left text-sm"><thead className="bg-white/[.02] text-xs text-white/45"><tr><th>Job / workspace</th><th>Model</th><th>Request ID</th><th>Akun provider</th><th>Waktu (UTC+8)</th><th>Peristiwa</th><th>Biaya (USD)</th><th>Sumber biaya</th></tr></thead><tbody>{inventory.rows.length ? inventory.rows.map(row=><tr key={row.observation_id} className="border-t border-white/10"><td className="max-w-[280px] break-all text-xs"><p>{row.generation_job_id}</p><p className="mt-1 text-white/45">Workspace: {row.workspace_id}</p></td><td className="max-w-[240px] break-words text-xs">{row.model}</td><td className="max-w-[240px] break-all text-xs">{row.provider_request_id || 'Belum tersedia'}{!row.provider_request_id && <p className="mt-1 text-white/40">Dispatch: {row.dispatch_id}</p>}</td><td className="text-xs"><p>{row.provider_account_id || 'Belum diketahui'}</p><p className="mt-1 text-white/45">{match[row.account_match]}</p></td><td className="text-xs">{date(row.request_time)}{row.time_is_fallback && <p className="mt-1 text-amber-100">Tanggal pencatatan; dispatch belum tersedia</p>}</td><td className="text-xs">{row.event_type}</td><td>{usd(row.cost_usd)}</td><td className="text-xs">{source[row.cost_source] || 'Belum diketahui'}</td></tr>) : <tr><td colSpan="8" className="text-center text-white/45">Tidak ada request BytePlus aplikasi pada periode tagihan ini.</td></tr>}</tbody></table></div>
  </section>;
}

export function ProviderBillingPreview({ preview }) {
  const { totals } = preview;
  return <div className="space-y-4"><div><h3 className="font-semibold">Pratinjau tagihan</h3><p className="mt-1 text-sm text-white/60">BytePlus · akun {preview.providerAccountId} · siklus {preview.billingCycle} · {number(preview.rowCount)} baris</p></div><Period start={preview.periodStart} end={preview.periodEnd}/><div className="grid gap-4 sm:grid-cols-3"><Stat label="Tagihan sebelum pajak" value={usd(totals.preTaxUsd)}/><Stat label="Pajak" value={usd(totals.taxUsd)}/><Stat label="Total tagihan" value={usd(totals.totalUsd)} detail="Sesuai nilai dalam file CSV"/></div><Warnings warnings={preview.warnings}/><SkuTable groups={preview.groups}/></div>;
}

export function ProviderBillingDetail({ data }) {
  const { bill, groups = [], comparison, reviews = [], warnings = [] } = data;
  const currentReview = reviews.some(review => review.comparison_hash === comparison.hash);
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">{bill.reference}</h2><p className="mt-1 text-xs text-white/50">BytePlus · akun {bill.provider_account_id} · siklus {bill.billing_cycle} · {number(bill.row_count)} baris</p></div><span className={`rounded-lg border px-3 py-2 text-xs ${currentReview ? 'border-cyan-300/20 bg-cyan-300/5 text-cyan-100' : 'border-amber-300/20 bg-amber-300/5 text-amber-100'}`}>{currentReview ? 'Ditinjau; alokasi job belum tersedia' : reviews.length ? 'Pembanding berubah; perlu tinjauan ulang' : 'Belum ditinjau; alokasi job belum tersedia'}</span></div>
    <p className="rounded-lg border border-cyan-300/20 bg-cyan-300/5 p-3 text-sm text-cyan-100">Lingkungan billing: {environmentLabel[bill.environment || 'unclassified']}. {bill.environment==='development' ? 'Tagihan pengembangan; bukan bukti biaya production.' : 'Lingkungan billing tidak berarti biaya telah dialokasikan ke job.'}</p>
    <Period start={bill.period_start} end={bill.period_end}/>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Tagihan sebelum pajak" value={usd(bill.pre_tax_usd)}/><Stat label="Pajak" value={usd(bill.tax_usd)}/><Stat label="Total tagihan aktual" value={usd(bill.total_usd)} detail="Nilai tagihan dari CSV BytePlus"/><Stat label="Penggunaan paket" value={`${number(bill.package_row_count)} baris`} detail="Tagihan nol pada usage paket belum mencakup biaya pembelian paket."/></div>
    <dl className="flex flex-wrap gap-x-8 gap-y-3 rounded-xl border border-white/10 px-4 py-3 text-xs"><div><dt className="text-white/45">Biaya kotor</dt><dd className="mt-1 tabular-nums">{usd(bill.gross_usd)}</dd></div><div><dt className="text-white/45">Diskon</dt><dd className="mt-1 tabular-nums">{usd(bill.discount_usd)}</dd></div><div><dt className="text-white/45">Kupon</dt><dd className="mt-1 tabular-nums">{usd(bill.coupon_usd)}</dd></div><div><dt className="text-white/45">Penyesuaian pembulatan</dt><dd className="mt-1 tabular-nums">{usd(bill.truncated_usd)}</dd></div></dl>
    <Warnings warnings={warnings}/>
    <SkuTable groups={groups}/>
    <ProviderBillingModelSummary summary={data.modelSummary}/>
    <ProviderBillingRequests inventory={data.requestInventory}/>
    {data.accountCoverage && <section className={`${adminStyles.panel} p-4`}><h3 className="font-semibold">Pencocokan akun billing</h3><p className="mt-2 text-xs leading-5 text-white/50">Identitas akun berasal dari konfigurasi worker saat request dicatat. Data lama tanpa identitas akun tidak dimasukkan ke pembanding akun ini.</p><div className="mt-4 grid gap-4 sm:grid-cols-3"><Stat label="Request akun cocok" value={number(data.accountCoverage.matching_account_requests)}/><Stat label="Akun belum diketahui" value={number(data.accountCoverage.unidentified_account_requests)}/><Stat label="Request akun lain" value={number(data.accountCoverage.other_account_requests)}/></div><p className="mt-3 text-xs text-white/60">{number(data.accountCoverage.missing_request_ids)} request akun cocok belum memiliki request ID.</p>{data.accountComparison && <div className="mt-4 grid gap-4 sm:grid-cols-2"><Stat label="Biaya request akun cocok" value={usd(data.accountComparison.knownCostUsd)} detail={`${number(data.accountComparison.unknownRequests)} request belum diketahui biayanya`}/><Stat label="Selisih tagihan dengan akun cocok" value={data.accountCoverage.matching_account_requests>0 ? usd(data.accountComparison.differenceUsd) : 'Belum diketahui'} detail="Pembanding akun, belum menjadi biaya aktual per job"/></div>}<p className="mt-4 text-xs leading-5 text-amber-100">Alokasi biaya ke job memerlukan detail billing dengan request ID. CSV agregat belum menyediakan bukti tersebut.</p></section>}
    <section className={`${adminStyles.panel} p-4 sm:p-5`}><h3 className="font-semibold">Pembanding usage BytePlus di aplikasi</h3><p className="mt-2 text-xs leading-5 text-white/50">Mencakup request BytePlus yang tercatat pada periode yang sama. Nilai ini bisa berbeda karena cakupan akun, paket prabayar, atau request yang belum memiliki biaya.</p><div className="mt-4 grid gap-4 sm:grid-cols-3"><Stat label="Biaya usage diketahui" value={usd(comparison.knownCostUsd)} detail={`${number(comparison.requests)} request aplikasi`}/><Stat label="Biaya belum diketahui" value={`${number(comparison.unknownRequests)} request`}/><Stat label="Selisih sebelum pajak" value={usd(comparison.differenceUsd)} detail="Tagihan sebelum pajak dikurangi biaya usage yang diketahui"/></div><div className={`${notice} mt-4`}><p className="font-semibold">Selisih belum dialokasikan ke job atau customer</p><p className="mt-1 text-xs leading-5">CSV ini belum dipetakan ke akun provider aplikasi dan ID request per job. Perbandingan ini belum menentukan COGS final atau laba customer. Usage paket dengan nilai nol juga memerlukan biaya pembelian paket.</p></div>{comparison.observedAt && <p className="mt-3 text-xs text-white/40">Usage diperiksa pada {date(comparison.observedAt)} (UTC+8).</p>}</section>
    <section className={adminStyles.panel}><h3 className="border-b border-white/10 px-4 py-3 text-sm font-semibold">Request aplikasi per model</h3><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-white/[.02] text-xs text-white/45"><tr><th>Model</th><th>Request</th><th>Biaya diketahui (USD)</th><th>Biaya belum diketahui</th></tr></thead><tbody>{comparison.rows?.length ? comparison.rows.map((row, index) => <tr key={index} className="border-t border-white/10"><td className="max-w-[330px] break-words">{row.model || 'Model belum diketahui'}</td><td className="tabular-nums">{number(row.requests)}</td><td className="tabular-nums">{usd(row.known_cost_usd)}</td><td>{number(row.unknown_requests)} request</td></tr>) : <tr><td colSpan="4" className="text-center text-white/45">Tidak ada request BytePlus aplikasi pada periode ini.</td></tr>}</tbody></table></div></section>
    {reviews.length > 0 && <section className={adminStyles.panel}><h3 className="border-b border-white/10 px-4 py-3 text-sm font-semibold">Riwayat tinjauan</h3><ul className="divide-y divide-white/10">{reviews.map((review, index) => <li key={index} className="p-4"><p className="whitespace-pre-wrap break-words text-sm text-white/80">{review.note}</p><p className="mt-2 text-xs text-white/40">{date(review.created_at)} (UTC+8) · {review.comparison_hash === comparison.hash ? 'Sesuai pembanding saat ini' : 'Pembanding versi sebelumnya'}</p></li>)}</ul></section>}
  </div>;
}

export default function ProviderBillingDashboard() {
  const [list, setList] = useState(null);
  const [listError, setListError] = useState('');
  const [page, setPage] = useState(1);
  const [environment,setEnvironment]=useState('all');
  const [importEnvironment,setImportEnvironment]=useState('development');
  const [revision, setRevision] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState('');
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [feedback, setFeedback] = useState(null);
  const generation = useRef(0);
  const fileInput = useRef(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current += 1; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setList(null); setListError('');
    saasFetch(`${endpoint}?page=${page}&environment=${environment}`, { cache: 'no-store' })
      .then(result => { if (!cancelled) setList(result); })
      .catch(error => { if (!cancelled) setListError(error.message); });
    return () => { cancelled = true; };
  }, [page, revision, environment]);

  useEffect(() => {
    let cancelled = false;
    setDetail(null); setDetailError(''); setNote('');
    if (selectedId) {
      saasFetch(`${endpoint}?id=${encodeURIComponent(selectedId)}`, { cache: 'no-store' })
        .then(result => { if (!cancelled) setDetail(result); })
        .catch(error => { if (!cancelled) setDetailError(error.message); });
    }
    return () => { cancelled = true; };
  }, [selectedId, revision]);

  async function chooseFile(event) {
    const file = event.target.files?.[0];
    const ticket = ++generation.current;
    setCsv(''); setFileName(''); setPreviewData(null); setFeedback(null); setReference('');
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv') || file.size > maxFileBytes || !file.size) {
      setFeedback({ error: true, text: 'Pilih file CSV BytePlus yang tidak kosong, maksimal 2 MB.' });
      event.target.value = '';
      return;
    }
    setBusy('file');
    try {
      const text = await file.text();
      if (mounted.current && ticket === generation.current) { setCsv(text); setFileName(file.name); }
    } catch { if (mounted.current && ticket === generation.current) setFeedback({ error: true, text: 'File tidak dapat dibaca. Pilih kembali file CSV.' }); }
    finally { if (mounted.current && ticket === generation.current) setBusy(''); }
  }

  async function post(action, body) {
    return saasFetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
  }

  async function preview(event) {
    event.preventDefault();
    const ticket = ++generation.current;
    setBusy('preview'); setFeedback(null); setPreviewData(null);
    try {
      const result = await post('preview', { csv });
      if (mounted.current && ticket === generation.current) setPreviewData(result);
    } catch (error) { if (mounted.current && ticket === generation.current) setFeedback({ error: true, text: error.message }); }
    finally { if (mounted.current && ticket === generation.current) setBusy(''); }
  }

  async function save(event) {
    event.preventDefault();
    if (!previewData?.preview || busy) return;
    setBusy('import'); setFeedback(null);
    try {
      const result = await post('import', { csv, expectedHash: previewData.preview.fileHash, reference: reference.trim(),environment:importEnvironment });
      if (!mounted.current) return;
      if (fileInput.current) fileInput.current.value = '';
      setPreviewData(null); setCsv(''); setFileName(''); setReference(''); setPage(1); setEnvironment(importEnvironment); setSelectedId(result.id); setRevision(value => value + 1);
      setFeedback({ error: false, text: result.replayed ? 'Tagihan ini sudah tersimpan. Detail yang ada dibuka.' : 'Tagihan tersimpan. Periksa perbandingan usage di bawah.' });
    } catch (error) { if (mounted.current) setFeedback({ error: true, text: error.message }); }
    finally { if (mounted.current) setBusy(''); }
  }

  async function review(event) {
    event.preventDefault();
    if (!detail || busy) return;
    setBusy('review'); setFeedback(null);
    try {
      await post('review', { id: detail.bill.id, note: note.trim(), expectedComparisonHash: detail.comparison.hash });
      if (!mounted.current) return;
      setNote(''); setRevision(value => value + 1);
      setFeedback({ error: false, text: 'Tinjauan tersimpan. Selisih tetap belum dialokasikan ke job atau customer.' });
    } catch (error) { if (mounted.current) setFeedback({ error: true, text: error.message }); }
    finally { if (mounted.current) setBusy(''); }
  }

  async function mapSku(group,model,note) {
    if (!detail || busy) return;
    setBusy('mapping');setFeedback(null);
    try {
      await post('map-sku',{id:detail.bill.id,groupKey:group.groupKey,expectedMappingId:group.mapping?.id || '',model,note});
      if (!mounted.current) return;
      setRevision(value=>value+1);
      setFeedback({error:false,text:'Pemetaan tersimpan. Periksa ulang pembanding sebelum mencatat tinjauan.'});
    } catch(error) {if(mounted.current)setFeedback({error:true,text:error.message});}
    finally {if(mounted.current)setBusy('');}
  }

  return <AdminShell platform active="/admin/provider-billing" title="Billing provider" description="Impor tagihan BytePlus dan bandingkan dengan biaya usage yang tercatat di aplikasi.">
    {feedback && <p role={feedback.error ? 'alert' : 'status'} className={feedback.error ? adminStyles.error : 'my-6 rounded-xl border border-cyan-300/25 bg-cyan-300/5 p-4 text-sm text-cyan-100'}>{feedback.text}</p>}
    <section className={`${adminStyles.panel} my-6 p-4 sm:p-5`}><h2 className="font-semibold">Impor tagihan BytePlus</h2><p className="mt-2 text-xs leading-5 text-white/50">Gunakan ekspor billing detail dalam format CSV. Periksa pratinjau sebelum menyimpan bukti tagihan.</p><form onSubmit={preview} className="mt-4 flex flex-wrap items-end gap-3"><label className={`${adminStyles.label} min-w-0 flex-1`}>File billing detail (maks. 2 MB)<input ref={fileInput} type="file" accept=".csv,text/csv" disabled={!!busy} onChange={chooseFile} className="block w-full min-w-0 rounded-lg border border-white/15 bg-[#101114] p-2 text-xs text-white/60 file:mr-3 file:rounded file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-xs file:text-white"/>{fileName && <span className="break-all text-white/40">{fileName}</span>}</label><button className={adminStyles.button} disabled={!csv || !!busy}>{busy === 'file' ? 'Membaca file…' : busy === 'preview' ? 'Memeriksa…' : 'Periksa CSV'}</button></form>
      {previewData && <div className="mt-6 space-y-5 border-t border-white/10 pt-5"><ProviderBillingPreview preview={previewData.preview}/>{previewData.duplicateId ? <div className="flex flex-wrap items-center gap-4 rounded-lg border border-cyan-300/20 bg-cyan-300/5 p-4"><p className="text-sm text-cyan-100">File ini sudah pernah diimpor.</p><button type="button" disabled={!!busy} className={secondaryButton} onClick={() => { setSelectedId(previewData.duplicateId); setPreviewData(null); setFeedback(null); }}>Buka tagihan tersimpan</button></div> : <form onSubmit={save} className="flex flex-wrap items-end gap-3"><label className={adminStyles.label}>Lingkungan<select disabled={!!busy} value={importEnvironment} onChange={event=>setImportEnvironment(event.target.value)} className={adminStyles.field}><option value="development">Development</option><option value="production">Production (akun harus cocok)</option></select></label><label className={`${adminStyles.label} flex-1`}>Referensi tagihan<input required minLength={3} maxLength={160} disabled={!!busy} value={reference} onChange={event => setReference(event.target.value)} placeholder="Contoh: BytePlus Oktober 2026" className={adminStyles.field}/></label><button className={adminStyles.button} disabled={!!busy || reference.trim().length < 3}>{busy === 'import' ? 'Menyimpan…' : 'Simpan tagihan'}</button></form>}</div>}
    </section>
    <section className={`${adminStyles.panel} mb-6`}><div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3"><h2 className="text-sm font-semibold">Tagihan tersimpan</h2><label className="text-xs text-white/60">Lingkungan billing<select aria-label="Filter lingkungan billing" disabled={!!busy} value={environment} onChange={event=>{setEnvironment(event.target.value);setPage(1);setSelectedId('');}} className="ml-3 rounded-lg border border-white/15 bg-[#101114] p-2"><option value="all">Semua lingkungan</option><option value="development">Development</option><option value="production">Production</option><option value="unclassified">Belum diklasifikasi</option></select></label><button type="button" className={secondaryButton} disabled={!!busy} onClick={() => setRevision(value => value + 1)}>Muat ulang</button></div>{listError ? <p role="alert" className="p-4 text-sm text-red-200">{listError}</p> : !list ? <p role="status" className="p-6 text-sm text-white/50">Memuat tagihan…</p> : <><div className="overflow-x-auto"><table className="w-full min-w-[750px] text-left text-sm"><thead className="bg-white/[.02] text-xs text-white/45"><tr><th>Referensi / lingkungan</th><th>Akun BytePlus</th><th>Siklus</th><th>Baris</th><th>Total (USD)</th><th>Detail</th></tr></thead><tbody>{list.imports.length ? list.imports.map(row => <tr key={row.id} className={`border-t border-white/10 ${selectedId === row.id ? 'bg-cyan-300/5' : ''}`}><td className="max-w-[260px] break-words">{row.reference}<p className="mt-1 text-xs text-white/45">{environmentLabel[row.environment || 'unclassified']}</p></td><td>{row.provider_account_id}</td><td>{row.billing_cycle}</td><td className="tabular-nums">{number(row.row_count)}</td><td className="tabular-nums">{usd(row.total_usd)}</td><td><button type="button" className="text-cyan-200 hover:underline disabled:opacity-40" disabled={!!busy} aria-pressed={selectedId === row.id} onClick={() => { setSelectedId(row.id); setFeedback(null); }}>Lihat detail</button></td></tr>) : <tr><td colSpan="6" className="text-center text-white/45">Belum ada tagihan. Mulai dengan mengimpor CSV BytePlus.</td></tr>}</tbody></table></div><div className="flex items-center justify-end gap-4 border-t border-white/10 px-4 py-3 text-xs text-white/60"><button type="button" disabled={!!busy || page <= 1} className="disabled:opacity-30" onClick={() => setPage(value => value - 1)}>Sebelumnya</button><span>{page} / {list.pagination.totalPages || 1} · {number(list.pagination.total)} tagihan</span><button type="button" disabled={!!busy || page >= list.pagination.totalPages} className="disabled:opacity-30" onClick={() => setPage(value => value + 1)}>Berikutnya</button></div></>}</section>
    {selectedId && <section aria-label="Detail tagihan provider" className="space-y-5 border-t border-white/10 pt-6">{detailError ? <p role="alert" className={adminStyles.error}>{detailError}</p> : !detail ? <p role="status" className={adminStyles.loading}>Memuat detail tagihan…</p> : <><ProviderBillingDetail data={detail}/><ProviderBillingMappings data={detail} disabled={!!busy} onSave={mapSku}/><form onSubmit={review} className={`${adminStyles.panel} p-4 sm:p-5`}><h3 className="font-semibold">Catat hasil tinjauan</h3><p className="mt-2 text-xs leading-5 text-white/50">Catatan disimpan bersama versi pembanding usage yang sedang ditampilkan. Tinjauan ini belum mengalokasikan tagihan ke job atau customer.</p><label className={`${adminStyles.label} mt-4`}>Catatan pemeriksaan<textarea required minLength={10} maxLength={2000} rows={3} disabled={!!busy} value={note} onChange={event => setNote(event.target.value)} className={`${adminStyles.field} h-auto py-3`} placeholder="Jelaskan selisih, cakupan akun, atau biaya paket yang perlu ditindaklanjuti."/></label><button disabled={!!busy || note.trim().length < 10} className={`${adminStyles.button} mt-4`}>{busy === 'review' ? 'Menyimpan…' : 'Simpan tinjauan'}</button></form></>}</section>}
  </AdminShell>;
}
