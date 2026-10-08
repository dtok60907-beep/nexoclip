'use client';
import { useEffect, useState } from 'react';
import AdminShell from './AdminShell';
import { adminStyles as styles } from '../src/lib/adminStyles.js';
import { saasFetch } from '../src/lib/saas/api.js';
import { getStoredWorkspaceId } from '../src/lib/saas/storage.js';
import { idr, credits } from '../src/lib/economicsDisplay.js';
const usd = n => n === null ? 'Belum diketahui' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`;
const source = name => ({ 'byteplus-rate-table': 'Tarif BytePlus tersimpan', 'image-rate-table': 'Tarif gambar tersimpan', 'openrouter-catalog': 'Katalog OpenRouter', 'video-rate-table': 'Tarif video tersimpan', unknown: 'Tarif belum tersedia' })[name] || name;
export default function ModelRatesDashboard() {
  const [workspaceId, setWorkspaceId] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [operation, setOperation] = useState('');
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let canceled = false;
    saasFetch('/api/workspaces').then(result => { if (canceled) return; const rows = result.workspaces || []; const saved = getStoredWorkspaceId(); const id = rows.find(w => w.id === saved)?.id || rows[0]?.id; if (!id) throw new Error('Workspace tidak tersedia'); setWorkspaceId(id); return saasFetch('/api/admin/models', { headers: { 'x-workspace-id': id } }); }).then(result => { if (!canceled) setData(result); }).catch(e => { if (!canceled) setError(e.message); });
    return () => { canceled = true; };
  }, []);
  function select(row) { setSelected(row); setDraft({ resolution: row.configuration.resolution, duration: String(row.configuration.duration || row.defaultDuration), referenceImages: String(row.configuration.referenceImages), promptLength: String(row.configuration.promptLength), audio: row.configuration.generateAudio ? '1' : '0' }); setError(''); }
  async function recalculate(e) {
    e.preventDefault(); setBusy(true); setError('');
    try { const result = await saasFetch(`/api/admin/models?${new URLSearchParams({ key: selected.key, ...draft })}`, { headers: { 'x-workspace-id': workspaceId } }); setSelected(result.items[0]); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const items = (data?.items || []).filter(row => (!operation || row.operation === operation) && `${row.name} ${row.model}`.toLowerCase().includes(q.toLowerCase()));
  return <AdminShell active="/admin/models" title="Model & tarif" description="Lihat model yang dipetakan di Studio dan estimasi biaya per satu hasil, tanpa menunggu adanya job.">
    <div className={styles.filters}><label className={styles.label}>Cari nama / model<input className={styles.field} value={q} onChange={e => setQ(e.target.value)} /></label><label className={styles.label}>Operasi<select className={styles.field} value={operation} onChange={e => setOperation(e.target.value)}><option value="">Semua operasi</option>{['text-to-image','image-to-image','text-to-video','image-to-video'].map(v => <option key={v}>{v}</option>)}</select></label></div>
    <p className="mb-5 text-sm leading-6 text-white/50">Ini estimasi memakai mesin pricing aplikasi, bukan biaya aktual atau konfirmasi ketersediaan provider. Biaya satu gambar atau satu video; prompt contoh 300 karakter, gambar referensi 1 untuk image-to-image/image-to-video. Kurs dan markup ditampilkan pada detail. Tarif tersimpan belum diverifikasi ulang ke invoice provider. Kurs dapat memakai nilai referensi bila sumber kurs tidak tersedia.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}{!data && !error && <p role="status" className={styles.loading}>Memuat model dan tarif…</p>}
    {selected && <section className={`${styles.panel} mb-6 p-5`}><div className="flex justify-between gap-3"><h2 className="font-semibold">{selected.name}</h2><button onClick={() => setSelected(null)} disabled={busy} className="text-cyan-200">Tutup detail</button></div><p className="mt-2 break-all text-xs text-white/50">{selected.model} · {selected.operation}</p>
      <form onSubmit={recalculate} className={styles.filters}>
        <label className={styles.label}>Resolusi{selected.resolutions.length ? <select className={styles.field} value={draft.resolution} onChange={e => setDraft(v => ({ ...v, resolution: e.target.value }))}>{selected.resolutions.map(v => <option key={v}>{v}</option>)}</select> : <input className={styles.field} value={draft.resolution} readOnly />}</label>
        {selected.kind === 'video' && <label className={styles.label}>Durasi (detik){selected.durations.length ? <select className={styles.field} value={draft.duration} onChange={e => setDraft(v => ({ ...v, duration: e.target.value }))}>{selected.durations.map(v => <option key={v}>{v}</option>)}</select> : <input type="number" min={selected.minDuration} max={selected.maxDuration || selected.defaultDuration} readOnly={!selected.maxDuration} className={styles.field} value={draft.duration} onChange={e => setDraft(v => ({ ...v, duration: e.target.value }))} />}</label>}
        <label className={styles.label}>Gambar referensi<input type="number" min="0" max="30" className={styles.field} value={draft.referenceImages} onChange={e => setDraft(v => ({ ...v, referenceImages: e.target.value }))} /></label>
        <label className={styles.label}>Panjang prompt (karakter)<input type="number" min="0" max="20000" className={styles.field} value={draft.promptLength} onChange={e => setDraft(v => ({ ...v, promptLength: e.target.value }))} /></label>
        {selected.kind === 'video' && <label className={styles.label}>Audio<select className={styles.field} value={draft.audio} onChange={e => setDraft(v => ({ ...v, audio: e.target.value }))}><option value="1">Dengan audio</option><option value="0">Tanpa audio</option></select></label>}
        <button disabled={busy} className={styles.button}>{busy ? 'Menghitung…' : 'Hitung estimasi'}</button>
      </form>
      <p className="text-sm text-cyan-200">{usd(selected.usd)} · {idr(selected.idr)} · {selected.credits === null ? 'Belum diketahui' : credits(selected.credits)} kredit</p><p className="mt-2 text-xs text-white/50">Konfigurasi hasil: {selected.configuration.resolution}{selected.kind === 'video' ? ` · ${selected.configuration.duration} detik` : ''} · {selected.configuration.referenceImages} referensi · {selected.configuration.promptLength} karakter</p><p className="mt-2 text-xs text-white/50">{source(selected.source)} · Kurs: {selected.usdIdrRate ? idr(selected.usdIdrRate) : 'Belum diketahui'}/USD · Markup: {selected.markupMultiplier ?? '—'}×</p>
      {selected.basis && <div className="mt-3 text-xs text-white/50"><p>Satuan: {{ video_tokens: 'Token video', image_tokens: 'Token gambar / teks', images: 'Per gambar', video_seconds: 'Per detik video' }[selected.basis.type] || selected.basis.type}</p>{selected.basis.usdPerImage !== undefined && <p>{usd(selected.basis.usdPerImage)} per gambar</p>}{selected.basis.usdPerMillionTokens !== undefined && <p>{usd(selected.basis.usdPerMillionTokens)} per 1 juta token</p>}{selected.basis.usdPerSecond !== undefined && <p>{usd(selected.basis.usdPerSecond)} per detik · minimum request {usd(selected.basis.minimumUsd)}</p>}{selected.basis.rates && Object.entries(selected.basis.rates).map(([key, rate]) => <p key={key}>{key}: {usd(rate)} {key === 'request' ? 'per request' : key === 'image' && selected.basis.rates.image_token !== undefined ? 'per gambar referensi' : 'per token'}</p>)}</div>}
      {selected.usage && <p className="mt-3 text-xs text-white/50">Estimasi token: {Object.entries(selected.usage).map(([k,v]) => `${({promptTokens:'Prompt',referenceTokens:'Referensi gambar',outputTokens:'Output gambar',outputAndReferenceTokens:'Video'})[k] || k}: ${v.toLocaleString('id-ID')}`).join(' · ')}. Token gambar/video tidak sama dengan token teks. Estimasi tidak menggantikan usage aktual.</p>}
    </section>}
    {data && <section className={`${styles.panel} overflow-x-auto`}><table className="min-w-[950px]"><thead><tr>{['Model / operasi','Konfigurasi contoh','Estimasi USD','Estimasi IDR','Kredit','Sumber','Detail'].map(v => <th key={v}>{v}</th>)}</tr></thead><tbody>{items.map(row => <tr key={row.key}><td><p>{row.name}</p><p className="mt-1 text-xs text-white/45">{row.operation}</p></td><td className="text-xs">{row.configuration.resolution}{row.kind === 'video' ? ` · ${row.configuration.duration} detik` : ''}</td><td>{usd(row.usd)}</td><td>{idr(row.idr)}</td><td>{row.credits === null ? 'Belum diketahui' : credits(row.credits)}</td><td className="text-xs text-white/50">{source(row.source)}</td><td><button className="text-cyan-200" disabled={busy} onClick={() => select(row)}>Lihat tarif</button></td></tr>)}{!items.length && <tr><td colSpan="7">Tidak ada model yang sesuai filter.</td></tr>}</tbody></table></section>}
    <section className={`${styles.panel} mt-6 p-5`}><h2 className="font-semibold">Cakupan COGS proyek</h2><p className="mt-2 text-sm leading-6 text-white/50">Gambar dan video tercatat sebagai job di Economics. Assets tambahan dan regenerasi revisi belum dikelompokkan sebagai satu proyek. Brainstorm/storyline, editing dan transisi belum memiliki integrasi biaya; nilainya belum diketahui, bukan nol. Total COGS proyek belum tersedia sampai komponen tersebut terhubung.</p></section>
  </AdminShell>;
}
