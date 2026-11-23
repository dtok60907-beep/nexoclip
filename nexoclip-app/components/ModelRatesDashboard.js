'use client';
import { useEffect, useState } from 'react';
import AdminShell from './AdminShell';
import { adminStyles as styles } from '../src/lib/adminStyles.js';
import { saasFetch } from '../src/lib/saas/api.js';
import { getStoredWorkspaceId } from '../src/lib/saas/storage.js';
import { idr, credits } from '../src/lib/economicsDisplay.js';
const usd = n => n === null ? 'Unknown' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`;
const source = name => ({ 'byteplus-rate-table': 'Stored BytePlus rates', 'image-rate-table': 'Stored image rates', 'openrouter-catalog': 'OpenRouter catalog', 'video-rate-table': 'Stored video rates', unknown: 'Rate unavailable' })[name] || name;
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
    saasFetch('/api/workspaces').then(result => { if (canceled) return; const rows = result.workspaces || []; const saved = getStoredWorkspaceId(); const id = rows.find(w => w.id === saved)?.id || rows[0]?.id; if (!id) throw new Error('No workspace available'); setWorkspaceId(id); return saasFetch('/api/admin/models', { headers: { 'x-workspace-id': id } }); }).then(result => { if (!canceled) setData(result); }).catch(e => { if (!canceled) setError(e.message); });
    return () => { canceled = true; };
  }, []);
  function select(row) { setSelected(row); setDraft({ resolution: row.configuration.resolution, duration: String(row.configuration.duration || row.defaultDuration), referenceImages: String(row.configuration.referenceImages), promptLength: String(row.configuration.promptLength), audio: row.configuration.generateAudio ? '1' : '0' }); setError(''); }
  async function recalculate(e) {
    e.preventDefault(); setBusy(true); setError('');
    try { const result = await saasFetch(`/api/admin/models?${new URLSearchParams({ key: selected.key, ...draft })}`, { headers: { 'x-workspace-id': workspaceId } }); setSelected(result.items[0]); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const items = (data?.items || []).filter(row => (!operation || row.operation === operation) && `${row.name} ${row.model}`.toLowerCase().includes(q.toLowerCase()));
  return <AdminShell active="/admin/models" title="Models & Rates" description="View models mapped in Studio and estimated cost per output without waiting for jobs to run.">
    <div className={styles.filters}><label className={styles.label}>Search name / model<input className={styles.field} value={q} onChange={e => setQ(e.target.value)} /></label><label className={styles.label}>Operation<select className={styles.field} value={operation} onChange={e => setOperation(e.target.value)}><option value="">All operations</option>{['text-to-image','image-to-image','text-to-video','image-to-video'].map(v => <option key={v}>{v}</option>)}</select></label></div>
    <p className="mb-5 text-sm leading-6 text-white/50">These are estimates using the app pricing engine, not actual costs or provider availability confirmations. Cost is per image or per video; sample prompt is 300 characters with 1 reference image for image-to-image/image-to-video. Exchange rate and markup are shown in details. Stored rates have not been re-verified against provider invoices. A reference exchange rate may be used when live rates are unavailable.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}{!data && !error && <p role="status" className={styles.loading}>Loading models and rates…</p>}
    {selected && <section className={`${styles.panel} mb-6 p-5`}><div className="flex justify-between gap-3"><h2 className="font-semibold">{selected.name}</h2><button onClick={() => setSelected(null)} disabled={busy} className="text-cyan-200">Close details</button></div><p className="mt-2 break-all text-xs text-white/50">{selected.model} · {selected.operation}</p>
      <form onSubmit={recalculate} className={styles.filters}>
        <label className={styles.label}>Resolution{selected.resolutions.length ? <select className={styles.field} value={draft.resolution} onChange={e => setDraft(v => ({ ...v, resolution: e.target.value }))}>{selected.resolutions.map(v => <option key={v}>{v}</option>)}</select> : <input className={styles.field} value={draft.resolution} readOnly />}</label>
        {selected.kind === 'video' && <label className={styles.label}>Duration (seconds){selected.durations.length ? <select className={styles.field} value={draft.duration} onChange={e => setDraft(v => ({ ...v, duration: e.target.value }))}>{selected.durations.map(v => <option key={v}>{v}</option>)}</select> : <input type="number" min={selected.minDuration} max={selected.maxDuration || selected.defaultDuration} readOnly={!selected.maxDuration} className={styles.field} value={draft.duration} onChange={e => setDraft(v => ({ ...v, duration: e.target.value }))} />}</label>}
        <label className={styles.label}>Reference images<input type="number" min="0" max="30" className={styles.field} value={draft.referenceImages} onChange={e => setDraft(v => ({ ...v, referenceImages: e.target.value }))} /></label>
        <label className={styles.label}>Prompt length (characters)<input type="number" min="0" max="20000" className={styles.field} value={draft.promptLength} onChange={e => setDraft(v => ({ ...v, promptLength: e.target.value }))} /></label>
        {selected.kind === 'video' && <label className={styles.label}>Audio<select className={styles.field} value={draft.audio} onChange={e => setDraft(v => ({ ...v, audio: e.target.value }))}><option value="1">With audio</option><option value="0">Without audio</option></select></label>}
        <button disabled={busy} className={styles.button}>{busy ? 'Calculating…' : 'Calculate estimate'}</button>
      </form>
      <p className="text-sm text-cyan-200">{usd(selected.usd)} · {idr(selected.idr)} · {selected.credits === null ? 'Unknown' : credits(selected.credits)} credits</p><p className="mt-2 text-xs text-white/50">Output configuration: {selected.configuration.resolution}{selected.kind === 'video' ? ` · ${selected.configuration.duration}s` : ''} · {selected.configuration.referenceImages} references · {selected.configuration.promptLength} chars</p><p className="mt-2 text-xs text-white/50">{source(selected.source)} · Rate: {selected.usdIdrRate ? idr(selected.usdIdrRate) : 'Unknown'}/USD · Markup: {selected.markupMultiplier ?? '—'}×</p>
      {selected.basis && <div className="mt-3 text-xs text-white/50"><p>Unit: {{ video_tokens: 'Video tokens', image_tokens: 'Image / text tokens', images: 'Per image', video_seconds: 'Per video second' }[selected.basis.type] || selected.basis.type}</p>{selected.basis.usdPerImage !== undefined && <p>{usd(selected.basis.usdPerImage)} per image</p>}{selected.basis.usdPerMillionTokens !== undefined && <p>{usd(selected.basis.usdPerMillionTokens)} per 1M tokens</p>}{selected.basis.usdPerSecond !== undefined && <p>{usd(selected.basis.usdPerSecond)} per second · minimum request {usd(selected.basis.minimumUsd)}</p>}{selected.basis.rates && Object.entries(selected.basis.rates).map(([key, rate]) => <p key={key}>{key}: {usd(rate)} {key === 'request' ? 'per request' : key === 'image' && selected.basis.rates.image_token !== undefined ? 'per reference image' : 'per token'}</p>)}</div>}
      {selected.usage && <p className="mt-3 text-xs text-white/50">Estimated tokens: {Object.entries(selected.usage).map(([k,v]) => `${({promptTokens:'Prompt',referenceTokens:'Reference images',outputTokens:'Output image',outputAndReferenceTokens:'Video'})[k] || k}: ${v.toLocaleString('en-US')}`).join(' · ')}. Image/video tokens differ from text tokens. Estimates do not replace actual usage.</p>}
    </section>}
    {data && <section className={`${styles.panel} overflow-x-auto`}><table className="min-w-[950px]"><thead><tr>{['Model / Operation','Sample config','Est. USD','Est. IDR','Credits','Source','Details'].map(v => <th key={v}>{v}</th>)}</tr></thead><tbody>{items.map(row => <tr key={row.key}><td><p>{row.name}</p><p className="mt-1 text-xs text-white/45">{row.operation}</p></td><td className="text-xs">{row.configuration.resolution}{row.kind === 'video' ? ` · ${row.configuration.duration}s` : ''}</td><td>{usd(row.usd)}</td><td>{idr(row.idr)}</td><td>{row.credits === null ? 'Unknown' : credits(row.credits)}</td><td className="text-xs text-white/50">{source(row.source)}</td><td><button className="text-cyan-200" disabled={busy} onClick={() => select(row)}>View rates</button></td></tr>)}{!items.length && <tr><td colSpan="7">No models match the current filters.</td></tr>}</tbody></table></section>}
    <section className={`${styles.panel} mt-6 p-5`}><h2 className="font-semibold">Project COGS Coverage</h2><p className="mt-2 text-sm leading-6 text-white/50">Images and videos are recorded as jobs in Economics. Extra assets and revision regenerations are not yet grouped into a single project. Brainstorming/storyline, editing, and transitions do not yet have cost integration; their values are unknown, not zero. Total project COGS is unavailable until those components are connected.</p></section>
  </AdminShell>;
}
