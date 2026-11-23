'use client';
import { useState } from 'react';
import { formatSocialSchedule } from '../src/lib/socialSchedule.mjs';

export default function TikTokPublishJobActions({job,onUpdated}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[editing,setEditing]=useState(false),[date,setDate]=useState('');
  const timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone;
  const act=async action=>{
    if(action==='cancel'&&!window.confirm('Cancel this scheduled post before it is sent to TikTok?'))return;
    setBusy(true);setError('');
    try{
      const body={action,...(action==='reschedule'?{scheduledAt:new Date(date).toISOString(),timeZone}:{})};
      const response=await fetch(`/api/tiktok/publish/${job.id}`,{method:'PATCH',credentials:'include',headers:{'content-type':'application/json','x-workspace-id':window.sessionStorage.getItem('nexoclip_workspace_id')||''},body:JSON.stringify(body)});
      const data=await response.json();if(!response.ok)throw new Error(data.error);setEditing(false);await onUpdated();
    }catch(e){setError(e.message==='Invalid time value'?'Choose a new publish time':e.message);}finally{setBusy(false);}
  };
  if(!['scheduled','needs_review'].includes(job.status))return null;
  return <div className="mt-3">
    {job.status==='scheduled'&&<><p className="text-sm font-medium text-violet-700">{formatSocialSchedule(job)}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={()=>setEditing(!editing)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">Change time</button><button type="button" disabled={busy} onClick={()=>act('cancel')} className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700">Cancel schedule</button></div>
      {editing&&<form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={event=>{event.preventDefault();act('reschedule');}}><label className="text-sm text-slate-600">New publish time · {timeZone}<input type="datetime-local" required value={date} onChange={e=>setDate(e.target.value)} className="mt-1 block rounded-lg border border-slate-200 p-2"/></label><button type="submit" disabled={busy} className="rounded-lg bg-violet-600 px-3 py-2 text-sm text-white">Confirm new time</button></form>}
    </>}
    {job.status==='needs_review'&&job.can_check_status&&<div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={()=>act('check')} className="rounded-lg border border-violet-200 px-3 py-2 text-sm text-violet-700">{busy?'Checking…':'Check TikTok status'}</button>{job.can_resume_upload&&job.provider_status==='PROCESSING_UPLOAD'&&<button type="button" disabled={busy} onClick={()=>act('resume')} className="rounded-lg bg-violet-600 px-3 py-2 text-sm text-white">Resume existing upload</button>}</div>}
    {error&&<p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
  </div>;
}
