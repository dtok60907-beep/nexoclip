'use client';
import { useEffect, useState } from 'react';
import AdminShell from './AdminShell';
import { adminStyles as s } from '../src/lib/adminStyles.js';
import { saasFetch } from '../src/lib/saas/api.js';
import { idr } from '../src/lib/economicsDisplay.js';

const day = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '');
const STATUS = { active: 'Active', delivered: 'Delivered', closed: 'Closed', canceled: 'Canceled' };
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

  return <AdminShell platform active="/admin/projects" title="Projects & Revenue Share" description="Large agency-partnered projects: AI costs from the project workspace are recouped first, followed by other costs, and the remaining profit is shared.">
    {error && <p role="alert" className={s.error}>{error}</p>}
    {notice && <p role="status" className="my-4 rounded-xl border border-cyan-300/20 p-4 text-sm text-cyan-200">{notice}</p>}
    {!data && !error && <p className={s.loading}>Loading…</p>}
    {data && <>
      <section className={`${s.panel} p-5`}>
        <h2 className="font-semibold">Projects</h2>
        <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr><th>Project / client</th><th>Partner</th><th>Value</th><th>AI cost</th><th>Profit</th><th>Partner share</th><th>Our share</th><th>Status</th><th /></tr></thead>
          <tbody>{data.projects.length ? data.projects.map((x) => <tr key={x.id} className="border-t border-white/10">
            <td>{x.title}<p className="text-xs text-white/45">{x.client_name}</p></td><td>{x.partner_name} · {Number(x.partner_share_percent)}%</td>
            <td>{idr(x.summary.value)}</td><td>{x.workspace_id ? idr(x.summary.aiCost) : <span className="text-white/45">no workspace</span>}</td>
            <td className={x.summary.profit < 0 ? 'text-red-300' : ''}>{idr(x.summary.profit)}</td><td>{idr(x.summary.partnerShare)}</td><td>{idr(x.summary.ourShare)}</td>
            <td>{STATUS[x.status]}</td><td><button type="button" className="text-cyan-200" onClick={() => setSelectedId(x.id)}>Open</button></td>
          </tr>) : <tr><td colSpan={9}>No projects yet.</td></tr>}</tbody>
        </table></div>
      </section>

      {selected && edit && <section className={`${s.panel} mt-5 p-5`}>
        <h2 className="font-semibold">{selected.title} · {selected.client_name}</h2>
        <p className="mt-1 text-sm text-white/60">Partner {selected.partner_name} · workspace {selected.workspace_name || '—'} · started {day(selected.started_at)}</p>
        <table className="mt-3 w-full max-w-xl text-sm"><tbody>
          <tr><td>Project value</td><td className="text-right">{idr(selected.summary.value)}</td></tr>
          <tr><td>− AI cost (actual provider cost)</td><td className="text-right">{idr(selected.summary.aiCost)}</td></tr>
          <tr><td>− Other costs</td><td className="text-right">{idr(selected.summary.otherCosts)}</td></tr>
          <tr className="border-t border-white/20 font-semibold"><td>Net profit</td><td className="text-right">{idr(selected.summary.profit)}</td></tr>
          <tr><td>Partner share ({Number(selected.partner_share_percent)}%)</td><td className="text-right">{idr(selected.summary.partnerShare)}</td></tr>
          <tr><td>Our share</td><td className="text-right">{idr(selected.summary.ourShare)}</td></tr>
        </tbody></table>
        {selected.unknownCostRequests > 0 && <p className="mt-2 text-sm text-amber-200">{selected.unknownCostRequests} generations do not yet have recorded provider costs, so the final AI cost may be slightly higher.</p>}
        <p className="mt-3 flex flex-wrap gap-3 text-sm">{[['pks', 'Draft Agreement'], ['bast', 'Handover (BAST)'], ['statement', 'Revenue Share Statement']].map(([doc, label]) => <a key={doc} className="text-cyan-200 hover:underline" target="_blank" rel="noopener" href={`/admin/project-documents/${selected.id}?doc=${doc}`}>{label} ↗</a>)}</p>
        <form className="mt-4 grid gap-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); send({ action: 'update-project', projectId: selected.id, ...edit }, () => setNotice('Project updated.')); }}>
          <label className={s.label}>Status<select className={s.field} value={edit.status} onChange={(e) => u('status')(e.target.value)}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <Field label="Other costs (Rp)" type="number" min={0} value={edit.otherCostsIdr} onChange={u('otherCostsIdr')} />
          <Field label="Handover date" type="date" value={edit.deliveredAt} onChange={u('deliveredAt')} />
          <Field label="Client paid date" type="date" value={edit.clientPaidAt} onChange={u('clientPaidAt')} />
          <Field label="Partner paid date" type="date" value={edit.partnerPaidAt} onChange={u('partnerPaidAt')} />
          <Field label="Notes" value={edit.notes} onChange={u('notes')} maxLength={2000} />
          <button disabled={busy} className={`${s.button} sm:col-span-3`}>Save changes</button>
        </form>
      </section>}

      <section className={`${s.panel} mt-5 p-5`}>
        <h2 className="font-semibold">New Project</h2>
        {!data.partners.length ? <p className="mt-2 text-sm text-white/60">Add an agency partner below first.</p> :
          <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); send({ action: 'create-project', ...project }, () => { setProject(EMPTY_PROJECT); setNotice('Project created.'); }); }}>
            <label className={s.label}>Agency partner<select required className={s.field} value={project.partnerId} onChange={(e) => { const m = data.partners.find((x) => x.id === e.target.value); setProject((v) => ({ ...v, partnerId: e.target.value, partnerSharePercent: v.partnerSharePercent || String(Number(m?.default_share_percent ?? 50)) })); }}><option value="">Select partner</option>{data.partners.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
            <label className={s.label}>Production workspace (AI cost source)<select className={s.field} value={project.workspaceId} onChange={(e) => q('workspaceId')(e.target.value)}><option value="">None yet</option>{data.workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}{w.owner_email ? ` · ${w.owner_email}` : ''}</option>)}</select></label>
            <Field label="Project title" required maxLength={200} value={project.title} onChange={q('title')} />
            <Field label="End client" required maxLength={200} value={project.clientName} onChange={q('clientName')} />
            <Field label="Project value (Rp)" type="number" required min={1} value={project.projectValueIdr} onChange={q('projectValueIdr')} />
            <Field label="Partner share (% of profit)" type="number" required min={0} max={100} step={0.5} value={project.partnerSharePercent} onChange={q('partnerSharePercent')} />
            <Field label="Other non-AI costs (Rp)" type="number" min={0} value={project.otherCostsIdr} onChange={q('otherCostsIdr')} />
            <Field label="Start date (AI costs counted from this date)" type="date" value={project.startedAt} onChange={q('startedAt')} />
            <Field label="Scope of work (deliverables, video count, revisions, deadline)" maxLength={4000} value={project.scope} onChange={q('scope')} />
            <Field label="Notes" maxLength={2000} value={project.notes} onChange={q('notes')} />
            {projectPreview > 0 && <p className="self-center text-sm text-white/60 sm:col-span-2">Assuming Rp0 AI cost and no other costs: partner {idr(projectPreview * (Number(project.partnerSharePercent) || 0) / 100)}, us {idr(projectPreview * (100 - (Number(project.partnerSharePercent) || 0)) / 100)}. AI costs are deducted first as generations run.</p>}
            <button disabled={busy} className={`${s.button} sm:col-span-2`}>Create project</button>
          </form>}
      </section>

      <section className={`${s.panel} mt-5 p-5`}>
        <h2 className="font-semibold">Agency Partners</h2>
        <ul className="mt-2 text-sm text-white/70">{data.partners.map((m) => <li key={m.id}>{m.name} · default {Number(m.default_share_percent)}% · {m.contact || 'no contact'}{m.bank_account_number ? ` · ${m.bank_name} ${m.bank_account_number}` : ''}</li>)}</ul>
        <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); send({ action: 'create-partner', ...partner }, () => { setPartner(EMPTY_PARTNER); setNotice('Partner added.'); }); }}>
          <Field label="Agency name" required maxLength={160} value={partner.name} onChange={p('name')} />
          <Field label="Contact (name, email, WhatsApp)" maxLength={300} value={partner.contact} onChange={p('contact')} />
          <Field label="Bank" maxLength={80} value={partner.bankName} onChange={p('bankName')} />
          <Field label="Account number" maxLength={40} value={partner.bankAccountNumber} onChange={p('bankAccountNumber')} />
          <Field label="Account holder name" maxLength={160} value={partner.bankAccountName} onChange={p('bankAccountName')} />
          <Field label="Default revenue share (% of profit)" type="number" min={0} max={100} step={0.5} value={partner.defaultSharePercent} onChange={p('defaultSharePercent')} />
          <button disabled={busy} className={`${s.button} sm:col-span-2`}>Add partner</button>
        </form>
      </section>
    </>}
  </AdminShell>;
}
