'use client';
import { useEffect, useState } from 'react';
import { saasFetch } from '../src/lib/saas/api.js';
import { adminStyles as s } from '../src/lib/adminStyles.js';

const time = (v) => (v ? new Date(v).toLocaleString('id-ID', { timeZone: 'UTC' }) : '—');

// Sign in as this customer for support or a quality check. Read-only unless the
// operator allows actions; every session is recorded with its reason.
export default function ImpersonatePanel({ targetUserId }) {
  const [reason, setReason] = useState(''), [allowActions, setAllowActions] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [history, setHistory] = useState([]);
  useEffect(() => {
    let canceled = false;
    saasFetch(`/api/admin/impersonate?history=${encodeURIComponent(targetUserId)}`).then((d) => { if (!canceled) setHistory(d.history || []); }).catch(() => {});
    return () => { canceled = true; };
  }, [targetUserId]);
  async function start(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await saasFetch('/api/admin/impersonate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ targetUserId, reason: reason.trim(), readOnly: !allowActions }) });
      window.location.href = result.redirectTo || '/studio';
    } catch (e) { setError(e.message); setBusy(false); }
  }
  return <section className={`${s.panel} mt-5 p-5`}>
    <h2 className="font-semibold">Masuk sebagai user</h2>
    <p className="mt-2 text-xs text-white/45">Untuk support, cek kualitas hasil, dan keamanan. Sesi 60 menit, tercatat beserta alasannya. User tidak diberi tahu. Defaultnya lihat saja: tidak bisa generate, top up, mengubah, atau menghapus.</p>
    {error && <p role="alert" className={s.error}>{error}</p>}
    <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={start}>
      <label className={s.label}>Alasan<input required minLength={3} maxLength={500} className={s.field} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. cek hasil video yang dikeluhkan" /></label>
      <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={allowActions} onChange={(e) => setAllowActions(e.target.checked)} />Izinkan aksi (generate, edit) atas nama user</label>
      <button disabled={busy} className={`${s.button} sm:col-span-2`}>{busy ? 'Masuk…' : 'Masuk sebagai user'}</button>
    </form>
    {history.length > 0 && <div className="mt-5 overflow-x-auto"><p className="mb-2 text-sm text-white/60">Riwayat impersonate (50 terakhir, UTC)</p><table className="w-full text-left text-sm"><thead><tr><th>Mulai</th><th>Selesai</th><th>Operator</th><th>Mode</th><th>Alasan</th></tr></thead><tbody>{history.map((h) => <tr key={h.started_at} className="border-t border-white/10"><td>{time(h.started_at)}</td><td>{time(h.ended_at)}</td><td>{h.operator_email}</td><td>{h.read_only ? 'lihat saja' : 'beraksi'}</td><td className="break-words">{h.reason}</td></tr>)}</tbody></table></div>}
  </section>;
}
