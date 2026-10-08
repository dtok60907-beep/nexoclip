'use client';
import {useEffect,useRef,useState} from 'react';
import {saasFetch} from '../src/lib/saas/api.js';
import {adminStyles as s} from '../src/lib/adminStyles.js';
const labels={suspend:'Suspend akun',activate:'Aktifkan akun',revoke_sessions:'Cabut seluruh sesi login'};
export function AccountAccessControls({data,busy,action,reason,onAction,onReason,onSubmit}) {
 const account=data.account;
 return <section className={`${s.panel} mt-5 p-5`}><h2 className="font-semibold">Kelola akses akun</h2><p className="mt-2 break-all text-sm">{account.email}</p><p className="mt-2 text-sm text-cyan-100">Status: {account.suspended_at?'Disuspend':'Aktif'} · {account.active_sessions} sesi aktif</p><p className="mt-2 text-xs leading-5 text-white/50">Berlaku untuk akun di seluruh workspace. Suspend menolak login baru dan mencabut sesi lama. Aktifkan akun mengizinkan login baru; pengguna harus login kembali. Cabut sesi mengeluarkan pengguna dari semua perangkat, lalu pengguna dapat login lagi jika akun aktif. Koneksi realtime yang terbuka diperiksa tiap 5 detik; pesan baru memerlukan sesi aktif. Tindakan ini tidak membatalkan job yang telah diterima.</p>
 {data.canManage ? <form className="mt-4 grid gap-3" onSubmit={onSubmit}><label className={s.label}>Tindakan<select value={action} disabled={busy} onChange={event=>onAction(event.target.value)} className={s.field}><option value={account.suspended_at?'activate':'suspend'}>{account.suspended_at?'Aktifkan akun':'Suspend akun'}</option><option value="revoke_sessions">Cabut seluruh sesi login</option></select></label><label className={s.label}>Alasan tindakan<textarea required minLength={10} maxLength={500} rows={3} value={reason} disabled={busy} onChange={event=>onReason(event.target.value)} className={`${s.field} h-auto py-2`} placeholder="Jelaskan alasan; tersimpan dalam audit akun."/></label><button disabled={busy || reason.trim().length<10} className={`${s.button} justify-self-start`}>{busy?'Menyimpan…':labels[action]}</button></form> : <p className="mt-4 text-sm text-amber-100">Akun sendiri dan akun operator dilindungi. Tindakan akses tidak tersedia untuk akun ini.</p>}
 </section>;
}
export default function AccountAccessPanel({targetUserId,onSaved}) {
 const [data,setData]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0),[action,setAction]=useState('suspend'),[reason,setReason]=useState('');
 const retry=useRef(null),mounted=useRef(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{let canceled=false;setData(null);setError('');saasFetch(`/api/admin/account-access?targetUserId=${encodeURIComponent(targetUserId)}`).then(result=>{if(!canceled){setData(result);setAction(result.account.suspended_at?'activate':'suspend');}}).catch(error=>{if(!canceled)setError(error.message);});return()=>{canceled=true;};},[targetUserId,revision]);
 async function submit(event) {
  event.preventDefault();if(!data?.canManage || busy)return;
  const payload={targetUserId,action,reason:reason.trim(),expectedVersion:data.account.access_version};
  const signature=JSON.stringify(payload);if(retry.current?.signature!==signature)retry.current={signature,key:crypto.randomUUID()};
  setBusy(true);setError('');setNotice('');
  try{const result=await saasFetch('/api/admin/account-access',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...payload,requestKey:retry.current.key})});if(!mounted.current)return;retry.current=null;setReason('');setNotice(`${labels[action]} tersimpan dan diaudit. ${result.event.revoked_sessions} catatan sesi dicabut.`);setRevision(value=>value+1);onSaved?.();}
  catch(error){if(mounted.current)setError(error.message);}
  finally{if(mounted.current)setBusy(false);}
 }
 return <>{error&&<p role="alert" className={s.error}>{error}<button type="button" disabled={busy} className="ml-3 text-cyan-200 hover:underline" onClick={()=>setRevision(value=>value+1)}>Muat ulang status</button></p>}{notice&&<p role="status" className="mt-4 text-sm text-cyan-100">{notice}</p>}{!data&&!error&&<p role="status" className={s.loading}>Memuat status akses akun…</p>}{data&&<><AccountAccessControls data={data} busy={busy} action={action} reason={reason} onAction={setAction} onReason={setReason} onSubmit={submit}/><section className={`${s.panel} mt-5 p-4`}><h3 className="font-semibold">Audit akses akun · 50 tindakan terbaru</h3><ul className="mt-3 divide-y divide-white/10">{data.audit.length?data.audit.map(row=><li key={row.id} className="py-3 text-xs leading-5"><p>{labels[row.action]} · {row.actor_email} · {new Date(row.created_at).toLocaleString('id-ID',{timeZone:'UTC'})} UTC</p><p className="mt-1 whitespace-pre-wrap break-words text-white/60">{row.reason}</p><p className="mt-1 text-white/45">{row.revoked_sessions} catatan sesi dicabut · versi {row.new_version}</p></li>):<li className="text-xs text-white/45">Belum ada tindakan akses akun.</li>}</ul></section></>}</>;
}
