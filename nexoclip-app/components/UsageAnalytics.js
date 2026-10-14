'use client';

import { useEffect, useState } from 'react';
import AdminShell from './AdminShell';
import { USAGE_KIND_LABELS, USAGE_SOURCE_LABELS } from './AdminConsole';
import { adminStyles } from '../src/lib/adminStyles.js';
import { saasFetch } from '../src/lib/saas/api.js';
import { getStoredWorkspaceId } from '../src/lib/saas/storage.js';

const idr = (value) => (value === null || value === undefined ? '—' : `Rp${Math.round(value).toLocaleString('id-ID')}`);
const num = (value, digits = 2) => Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: digits });

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
    <AdminShell active="/admin/analytics" title="Analytics pemakaian"
      description="Semua pemakaian berbayar di seluruh workspace: gambar, video, LLM, voiceover, musik dan analisis video, per sumber (AI Director, Canvas, Studio).">
      <div className={adminStyles.filters}>
        <label className={adminStyles.label}>Dari (UTC)<input type="date" className={adminStyles.field} value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} /></label>
        <label className={adminStyles.label}>Sampai (UTC)<input type="date" className={adminStyles.field} value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} /></label>
        <button className={`${adminStyles.button} self-end`} type="button" onClick={() => setRevision((v) => v + 1)}>Muat ulang</button>
      </div>
      {error && <div role="alert" className={adminStyles.error}>{error}</div>}
      {!data && !error && <p role="status" className={adminStyles.loading}>Memuat analytics…</p>}
      {data?.providerAlerts?.length > 0 && (
        <div role="alert" className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-100">
          <p className="font-semibold">Provider menolak job karena akun kita (tagihan / kuota) dalam 24 jam terakhir</p>
          <ul className="mt-2 space-y-1 text-xs">
            {data.providerAlerts.map((alert) => (
              <li key={alert.provider || 'unknown'}>{alert.provider || 'provider'}: {alert.failed} job gagal, terakhir {new Date(alert.last_at).toLocaleString('id-ID')}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-red-100/80">Bayar tagihan / tambah kuota di konsol provider. User melihat pesan "layanan sedang tidak tersedia" dan kreditnya tidak terpotong. Kegagalan audio ElevenLabs tercatat di log (event provider_billing_blocked).</p>
        </div>
      )}
      {data && (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card label="Kredit terpakai" value={num(t.credits)} detail={`${num(t.count, 0)} job/panggilan`} />
            <Card label="Biaya provider" value={idr(t.costIdr)} detail={`$${num(t.costUsd, 4)} · kurs Rp${num(data.usdIdr, 0)}/USD`} />
            <Card label="Pendapatan (paket termurah)" value={idr(t.revenueIdrWorst)} detail={`Rp${num(data.idrPerCredit.lowest)}/kredit`} />
            <Card label="Selisih (kasus terburuk)" value={idr(t.marginIdrWorst)} tone={t.marginIdrWorst < 0 ? 'bad' : 'good'}
              detail={data.idrPerCredit.average ? `Rata-rata harga jual nyata Rp${num(data.idrPerCredit.average)}/kredit → pendapatan ${idr(t.revenueIdrAverage)}` : 'Belum ada top-up berbayar untuk menghitung harga rata-rata'} />
          </div>
          {data.freeCredits > 0 && <p className="mt-3 text-xs text-amber-100">{num(data.freeCredits)} kredit gratis (bonus daftar) dibagikan di periode ini: dipakai seperti kredit berbayar, tanpa pendapatan.</p>}
          {t.unknownCost > 0 && <p className="mt-2 text-xs text-amber-100">{t.unknownCost} job berhasil belum punya biaya provider (job lama); biayanya tidak dihitung nol, tetapi belum masuk total.</p>}
          <section className={`${adminStyles.panel} mt-6 overflow-x-auto p-4`}>
            <table className="w-full min-w-[860px] text-left text-xs">
              <thead className="text-white/50">
                <tr>{['Jenis', 'Sumber', 'Jumlah', 'Gagal', 'Kredit', 'Biaya provider', 'Pendapatan terburuk', 'Selisih terburuk', 'Kelipatan'].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {data.items.map((row) => (
                  <tr key={`${row.kind}-${row.source}`} className={row.losing ? 'bg-red-500/[0.06]' : ''}>
                    <td className="px-2 py-2">{USAGE_KIND_LABELS[row.kind] || row.kind}</td>
                    <td className="px-2 py-2">{USAGE_SOURCE_LABELS[row.source] || row.source}</td>
                    <td className="px-2 py-2">{num(row.count, 0)}</td>
                    <td className="px-2 py-2">{row.failed || ''}</td>
                    <td className="px-2 py-2">{num(row.credits)}</td>
                    <td className="px-2 py-2">{idr(row.costIdr)}{row.unknownCost > 0 && <span className="ml-1 text-amber-200" title="Sebagian job belum punya biaya provider">*</span>}</td>
                    <td className="px-2 py-2">{idr(row.revenueIdrWorst)}</td>
                    <td className={`px-2 py-2 ${row.marginIdrWorst < 0 ? 'text-red-300' : 'text-emerald-300'}`}>{idr(row.marginIdrWorst)}</td>
                    <td className="px-2 py-2">{row.marginRatioWorst ? `${num(row.marginRatioWorst)}×` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs leading-5 text-white/45">
              Pendapatan terburuk = kredit × harga per kredit paket termurah. Baris merah rugi di kasus itu. Belum termasuk biaya
              pembayaran, pajak, hosting dan langganan tetap (mis. ElevenLabs Starter $6/bulan). Biaya video/gambar adalah estimasi
              provider saat job dibuat, disesuaikan dengan kredit yang akhirnya terpotong; rincian per request ada di Economics.
            </p>
          </section>
        </>
      )}
    </AdminShell>
  );
}
