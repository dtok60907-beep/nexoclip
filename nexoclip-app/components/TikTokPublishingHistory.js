'use client';
import { useCallback,useEffect,useState } from 'react';
import { tiktokPublishMessage } from '../src/lib/tiktokPublishDisplay.mjs';
export default function TikTokPublishingHistory(){
  const [jobs,setJobs]=useState([]),[error,setError]=useState('');
  const load=useCallback(async()=>{
    const response=await fetch('/api/tiktok/publish',{credentials:'include',cache:'no-store',headers:{'x-workspace-id':window.sessionStorage.getItem('nexoclip_workspace_id')||''}});
    const data=await response.json();if(!response.ok)throw new Error(data.error);setJobs(data.jobs||[]);setError('');
  },[]);
  useEffect(()=>{load().catch(e=>setError(e.message));const timer=setInterval(()=>load().catch(e=>setError(e.message)),10000);return()=>clearInterval(timer);},[load]);
  return <section className="mt-10" aria-labelledby="publishing-history-title"><div className="flex items-center justify-between gap-3"><h2 id="publishing-history-title" className="text-xl font-semibold text-slate-900">Publishing history</h2><button type="button" onClick={()=>load().catch(e=>setError(e.message))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600">Refresh</button></div>
    {error&&<p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    {jobs.length?<div className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">{jobs.map(job=><article key={job.id} className="p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-medium text-slate-900">{job.media_type==='photo'?'Photos':'Video'} · {job.account_name} · {job.mode==='upload'?'TikTok inbox':'Direct post'}</h3><span className="rounded-full bg-slate-100 px-3 py-1 text-xs capitalize text-slate-600">{job.status.replaceAll('_',' ')}</span></div><p className="mt-2 text-sm text-slate-600">{tiktokPublishMessage(job)}</p>{job.caption&&<p className="mt-2 line-clamp-2 text-sm text-slate-700">{job.caption}</p>}{job.provider_error&&<p className="mt-2 text-sm text-amber-700">{job.provider_error}</p>}<p className="mt-2 text-xs text-slate-400">{new Date(job.created_at).toLocaleString()}{job.provider_status&&` · ${job.provider_status}`}</p></article>)}</div>:<p className="mt-3 text-sm text-slate-500">Confirmed posts and their TikTok delivery status will appear here.</p>}
  </section>;
}
