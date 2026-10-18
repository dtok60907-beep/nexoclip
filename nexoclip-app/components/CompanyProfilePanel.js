'use client';
import { useEffect, useState } from 'react';
import { saasFetch } from '../src/lib/saas/api.js';
import { adminStyles as s } from '../src/lib/adminStyles.js';

const FIELDS = [
  ['legal_name', 'Nama badan usaha (mis. PT ...)'], ['npwp', 'NPWP'], ['address', 'Alamat'], ['email', 'Email'], ['phone', 'Telepon / WhatsApp'],
  ['bank_name', 'Bank'], ['bank_account_number', 'Nomor rekening'], ['bank_account_name', 'Atas nama rekening'], ['signer_name', 'Nama penanda tangan'], ['signer_title', 'Jabatan penanda tangan'],
];

// The seller's details on quotations, invoices and receipts.
export default function CompanyProfilePanel() {
  const [profile, setProfile] = useState(null), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [open, setOpen] = useState(false);
  useEffect(() => { saasFetch('/api/admin/company-profile').then((d) => setProfile(d.profile || {})).catch((e) => setMessage(e.message)); }, []);
  if (!profile) return null;
  const incomplete = FIELDS.some(([key]) => !profile[key]);
  async function save(event) {
    event.preventDefault(); setBusy(true); setMessage('');
    try { const d = await saasFetch('/api/admin/company-profile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(profile) }); setProfile(d.profile); setMessage('Tersimpan.'); }
    catch (e) { setMessage(e.message); } finally { setBusy(false); }
  }
  return <section className={`${s.panel} mt-5 p-5`}>
    <button type="button" className="flex w-full items-center justify-between text-left font-semibold" onClick={() => setOpen((v) => !v)}>
      <span>Profil perusahaan untuk dokumen {incomplete && <span className="ml-2 text-xs font-normal text-amber-200">belum lengkap</span>}</span><span>{open ? '−' : '+'}</span>
    </button>
    {open && <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={save}>
      {FIELDS.map(([key, label]) => <label key={key} className={s.label}>{label}<input className={s.field} value={profile[key] || ''} onChange={(e) => setProfile((v) => ({ ...v, [key]: e.target.value }))} /></label>)}
      <p className="self-center text-sm text-white/60">{message}</p>
      <button disabled={busy} className={s.button}>Simpan profil</button>
    </form>}
  </section>;
}
