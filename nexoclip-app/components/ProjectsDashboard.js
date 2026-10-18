'use client';
import { useEffect, useState } from 'react';
import AdminShell from './AdminShell';
import { adminStyles as s } from '../src/lib/adminStyles.js';
import { saasFetch } from '../src/lib/saas/api.js';
import { idr } from '../src/lib/economicsDisplay.js';

const day = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '');
const STATUS = { active: 'Berjalan', delivered: 'Diserahkan', closed: 'Selesai', canceled: 'Batal' };
const EMPTY_PARTNER = { name: '', contact: '', bankName: '', bankAccountNumber: '', bankAccountName: '', defaultSharePercent: '50', notes: '' };
const EMPTY_PROJECT = { partnerId: '', workspaceId: '', title: '', clientName: '', scope: '', projectValueIdr: '', partnerSharePercent: '', otherCostsIdr: '0', startedAt: '', notes: '' };

function Field({ label, value, onChange, type = 'text', ...extra }) {
  return <label className={s.label}>{label}<input className={s.field} type={type} value={value} onChange={(e) => onChange(e.target.value)} {...extra} /></label>;
}

// Big projects produced with an agency partner: the AI cost is paid back first, then
// other costs, and the profit left is shared.
export default function ProjectsDashboard() {
  const [data, setData] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0);
  const [partner, setPartner] = useState(EMPTY_PARTNER), [project, setProject] = useState(EMPTY_PROJECT), [selectedId, setSelectedId] = useState(null), [edit, setEdit] = useState(null);
  useEffect(() => { saasFetch('/api/admin/projects').then(setData).catch((e) => setError(e.message)); }, [revision]);
  const selected = data?.projects.find((p) => p.id === selectedId);
  useEffect(() => {
    if (selected) setEdit({ status: selected.status, otherCostsIdr: String(selected.other_costs_idr), notes: selected.notes, deliveredAt: day(selected.delivered_at), clientPaidAt: day(selected.client_paid_at), partnerPaidAt: day(selected.partner_paid_at) });
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(body, done) {
    setBusy(true); setError(''); setNotice('');
    try { await saasFetch('/api/admin/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); done?.(); setRevision((v) => v + 1); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const set = (setter) => (key) => (value) => setter((v) => ({ ...v, [key]: value }));
  const p = set(setPartner), q = set(setProject), u = set(setEdit);
  const projectPreview = Number(project.projectValueIdr) || 0;

  return <AdminShell platform active="/admin/projects" title="Project & bagi hasil" description="Project besar bersama agency: modal AI dari workspace project dikembalikan dulu, lalu biaya lain, dan sisanya laba yang dibagi.">
    {error && <p role="alert" className={s.error}>{error}</p>}
    {notice && <p role="status" className="my-4 rounded-xl border border-cyan-300/20 p-4 text-sm text-cyan-200">{notice}</p>}
    {!data && !error && <p className={s.loading}>Memuat…</p>}
    {data && <>
      <section className={`${s.panel} p-5`}>
        <h2 className="font-semibold">Project</h2>
        <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr><th>Project / client</th><th>Mitra</th><th>Nilai</th><th>Modal AI</th><th>Laba</th><th>Bagian mitra</th><th>Bagian kita</th><th>Status</th><th /></tr></thead>
          <tbody>{data.projects.length ? data.projects.map((x) => <tr key={x.id} className="border-t border-white/10">
            <td>{x.title}<p className="text-xs text-white/45">{x.client_name}</p></td><td>{x.partner_name} · {Number(x.partner_share_percent)}%</td>
            <td>{idr(x.summary.value)}</td><td>{x.workspace_id ? idr(x.summary.aiCost) : <span className="text-white/45">tanpa workspace</span>}</td>
            <td className={x.summary.profit < 0 ? 'text-red-300' : ''}>{idr(x.summary.profit)}</td><td>{idr(x.summary.partnerShare)}</td><td>{idr(x.summary.ourShare)}</td>
            <td>{STATUS[x.status]}</td><td><button type="button" className="text-cyan-200" onClick={() => setSelectedId(x.id)}>Buka</button></td>
          </tr>) : <tr><td colSpan={9}>Belum ada project.</td></tr>}</tbody>
        </table></div>
      </section>

      {selected && edit && <section className={`${s.panel} mt-5 p-5`}>
        <h2 className="font-semibold">{selected.title} · {selected.client_name}</h2>
        <p className="mt-1 text-sm text-white/60">Mitra {selected.partner_name} · workspace {selected.workspace_name || '—'} · mulai {day(selected.started_at)}</p>
        <table className="mt-3 w-full max-w-xl text-sm"><tbody>
          <tr><td>Nilai project</td><td className="text-right">{idr(selected.summary.value)}</td></tr>
          <tr><td>− Modal AI (biaya provider asli)</td><td className="text-right">{idr(selected.summary.aiCost)}</td></tr>
          <tr><td>− Biaya lain</td><td className="text-right">{idr(selected.summary.otherCosts)}</td></tr>
          <tr className="border-t border-white/20 font-semibold"><td>Laba</td><td className="text-right">{idr(selected.summary.profit)}</td></tr>
          <tr><td>Bagian mitra ({Number(selected.partner_share_percent)}%)</td><td className="text-right">{idr(selected.summary.partnerShare)}</td></tr>
          <tr><td>Bagian kita</td><td className="text-right">{idr(selected.summary.ourShare)}</td></tr>
        </tbody></table>
        {selected.unknownCostRequests > 0 && <p className="mt-2 text-sm text-amber-200">{selected.unknownCostRequests} generate belum punya biaya provider tercatat, jadi modal AI bisa sedikit lebih besar.</p>}
        <p className="mt-3 flex flex-wrap gap-3 text-sm">{[['pks', 'Draf PKS'], ['bast', 'BAST'], ['statement', 'Rekap bagi hasil']].map(([doc, label]) => <a key={doc} className="text-cyan-200 hover:underline" target="_blank" rel="noopener" href={`/admin/project-documents/${selected.id}?doc=${doc}`}>{label} ↗</a>)}</p>
        <form className="mt-4 grid gap-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); send({ action: 'update-project', projectId: selected.id, ...edit }, () => setNotice('Project diperbarui.')); }}>
          <label className={s.label}>Status<select className={s.field} value={edit.status} onChange={(e) => u('status')(e.target.value)}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <Field label="Biaya lain (Rp)" type="number" min={0} value={edit.otherCostsIdr} onChange={u('otherCostsIdr')} />
          <Field label="Tanggal serah terima" type="date" value={edit.deliveredAt} onChange={u('deliveredAt')} />
          <Field label="Client sudah bayar (tanggal)" type="date" value={edit.clientPaidAt} onChange={u('clientPaidAt')} />
          <Field label="Mitra sudah dibayar (tanggal)" type="date" value={edit.partnerPaidAt} onChange={u('partnerPaidAt')} />
          <Field label="Catatan" value={edit.notes} onChange={u('notes')} maxLength={2000} />
          <button disabled={busy} className={`${s.button} sm:col-span-3`}>Simpan perubahan</button>
        </form>
      </section>}

      <section className={`${s.panel} mt-5 p-5`}>
        <h2 className="font-semibold">Project baru</h2>
        {!data.partners.length ? <p className="mt-2 text-sm text-white/60">Tambahkan mitra agency dulu di bawah.</p> :
          <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); send({ action: 'create-project', ...project }, () => { setProject(EMPTY_PROJECT); setNotice('Project dibuat.'); }); }}>
            <label className={s.label}>Mitra agency<select required className={s.field} value={project.partnerId} onChange={(e) => { const m = data.partners.find((x) => x.id === e.target.value); setProject((v) => ({ ...v, partnerId: e.target.value, partnerSharePercent: v.partnerSharePercent || String(Number(m?.default_share_percent ?? 50)) })); }}><option value="">Pilih mitra</option>{data.partners.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
            <label className={s.label}>Workspace produksi (sumber modal AI)<select className={s.field} value={project.workspaceId} onChange={(e) => q('workspaceId')(e.target.value)}><option value="">Belum ada</option>{data.workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}{w.owner_email ? ` · ${w.owner_email}` : ''}</option>)}</select></label>
            <Field label="Judul project" required maxLength={200} value={project.title} onChange={q('title')} />
            <Field label="Client akhir" required maxLength={200} value={project.clientName} onChange={q('clientName')} />
            <Field label="Nilai project (Rp)" type="number" required min={1} value={project.projectValueIdr} onChange={q('projectValueIdr')} />
            <Field label="Bagi hasil mitra (% dari laba)" type="number" required min={0} max={100} step={0.5} value={project.partnerSharePercent} onChange={q('partnerSharePercent')} />
            <Field label="Biaya lain di luar AI (Rp)" type="number" min={0} value={project.otherCostsIdr} onChange={q('otherCostsIdr')} />
            <Field label="Mulai (modal AI dihitung sejak tanggal ini)" type="date" value={project.startedAt} onChange={q('startedAt')} />
            <Field label="Lingkup kerja (deliverable, jumlah video, revisi, deadline)" maxLength={4000} value={project.scope} onChange={q('scope')} />
            <Field label="Catatan" maxLength={2000} value={project.notes} onChange={q('notes')} />
            {projectPreview > 0 && <p className="self-center text-sm text-white/60 sm:col-span-2">Kalau modal AI nanti Rp0 dan tanpa biaya lain: mitra {idr(projectPreview * (Number(project.partnerSharePercent) || 0) / 100)}, kita {idr(projectPreview * (100 - (Number(project.partnerSharePercent) || 0)) / 100)}. Modal AI dikurangkan dulu begitu generate berjalan.</p>}
            <button disabled={busy} className={`${s.button} sm:col-span-2`}>Buat project</button>
          </form>}
      </section>

      <section className={`${s.panel} mt-5 p-5`}>
        <h2 className="font-semibold">Mitra agency</h2>
        <ul className="mt-2 text-sm text-white/70">{data.partners.map((m) => <li key={m.id}>{m.name} · default {Number(m.default_share_percent)}% · {m.contact || 'tanpa kontak'}{m.bank_account_number ? ` · ${m.bank_name} ${m.bank_account_number}` : ''}</li>)}</ul>
        <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); send({ action: 'create-partner', ...partner }, () => { setPartner(EMPTY_PARTNER); setNotice('Mitra ditambahkan.'); }); }}>
          <Field label="Nama agency" required maxLength={160} value={partner.name} onChange={p('name')} />
          <Field label="Kontak (nama, email, WA)" maxLength={300} value={partner.contact} onChange={p('contact')} />
          <Field label="Bank" maxLength={80} value={partner.bankName} onChange={p('bankName')} />
          <Field label="Nomor rekening" maxLength={40} value={partner.bankAccountNumber} onChange={p('bankAccountNumber')} />
          <Field label="Atas nama rekening" maxLength={160} value={partner.bankAccountName} onChange={p('bankAccountName')} />
          <Field label="Bagi hasil default (% dari laba)" type="number" min={0} max={100} step={0.5} value={partner.defaultSharePercent} onChange={p('defaultSharePercent')} />
          <button disabled={busy} className={`${s.button} sm:col-span-2`}>Tambah mitra</button>
        </form>
      </section>
    </>}
  </AdminShell>;
}
