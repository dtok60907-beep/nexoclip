'use client';
import {useEffect,useRef,useState} from 'react';
import {saasFetch} from '../src/lib/saas/api.js';
import {adminStyles as s} from '../src/lib/adminStyles.js';
const labels={suspend:'Suspend account',activate:'Activate account',revoke_sessions:'Revoke all login sessions'};
export function AccountAccessControls({data,busy,action,reason,onAction,onReason,onSubmit}) {
 const account=data.account;
 return <section className={`${s.panel} mt-5 p-5`}><h2 className="font-semibold">Manage Account Access</h2><p className="mt-2 break-all text-sm">{account.email}</p><p className="mt-2 text-sm text-cyan-100">Status: {account.suspended_at?'Suspended':'Active'} · {account.active_sessions} active sessions</p><p className="mt-2 text-xs leading-5 text-white/50">Applies to this account across all workspaces. Suspending blocks new logins and revokes existing sessions. Activating allows new logins; the user will need to sign in again. Revoking sessions signs the user out of all devices, and they can sign back in if the account is active. Open realtime connections are checked every 5 seconds; new messages require an active session. This action does not cancel jobs already accepted.</p>
 {data.canManage ? <form className="mt-4 grid gap-3" onSubmit={onSubmit}><label className={s.label}>Action<select value={action} disabled={busy} onChange={event=>onAction(event.target.value)} className={s.field}><option value={account.suspended_at?'activate':'suspend'}>{account.suspended_at?'Activate account':'Suspend account'}</option><option value="revoke_sessions">Revoke all login sessions</option></select></label><label className={s.label}>Reason<textarea required minLength={10} maxLength={500} rows={3} value={reason} disabled={busy} onChange={event=>onReason(event.target.value)} className={`${s.field} h-auto py-2`} placeholder="Explain the reason; recorded in the account audit log."/></label><button disabled={busy || reason.trim().length<10} className={`${s.button} justify-self-start`}>{busy?'Saving…':labels[action]}</button></form> : <p className="mt-4 text-sm text-amber-100">Your own account and operator accounts are protected. Access actions are unavailable for this account.</p>}
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
  try{const result=await saasFetch('/api/admin/account-access',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...payload,requestKey:retry.current.key})});if(!mounted.current)return;retry.current=null;setReason('');setNotice(`${labels[action]} saved and audited. ${result.event.revoked_sessions} session records revoked.`);setRevision(value=>value+1);onSaved?.();}
  catch(error){if(mounted.current)setError(error.message);}
  finally{if(mounted.current)setBusy(false);}
 }
 return <>{error&&<p role="alert" className={s.error}>{error}<button type="button" disabled={busy} className="ml-3 text-cyan-200 hover:underline" onClick={()=>setRevision(value=>value+1)}>Reload status</button></p>}{notice&&<p role="status" className="mt-4 text-sm text-cyan-100">{notice}</p>}{!data&&!error&&<p role="status" className={s.loading}>Loading account access status…</p>}{data&&<><AccountAccessControls data={data} busy={busy} action={action} reason={reason} onAction={setAction} onReason={setReason} onSubmit={submit}/><section className={`${s.panel} mt-5 p-4`}><h3 className="font-semibold">Account access audit · latest 50 actions</h3><ul className="mt-3 divide-y divide-white/10">{data.audit.length?data.audit.map(row=><li key={row.id} className="py-3 text-xs leading-5"><p>{labels[row.action]} · {row.actor_email} · {new Date(row.created_at).toLocaleString('en-US',{timeZone:'UTC'})} UTC</p><p className="mt-1 whitespace-pre-wrap break-words text-white/60">{row.reason}</p><p className="mt-1 text-white/45">{row.revoked_sessions} session records revoked · version {row.new_version}</p></li>):<li className="text-xs text-white/45">No account access actions yet.</li>}</ul></section></>}</>;
}
