'use client';
import { useEffect,useState } from 'react';
import { NxHistoryListSkeleton } from './ui/nx-loading';
export default function InstagramPublishingHistory({refreshKey}) {
  const [jobs,setJobs]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    const load=async()=>{try{const r=await fetch('/api/meta/publish',{headers:{'x-workspace-id':window.sessionStorage.getItem('nexoclip_workspace_id')||''},credentials:'include',cache:'no-store',signal:controller.signal}),d=await r.json();if(!r.ok)throw new Error(d.error);setJobs(d.jobs||[]);setError('');}catch(e){if(e.name!=='AbortError')setError(e.message);}finally{if(!controller.signal.aborted)setLoading(false);}};
    load();const timer=setInterval(load,15000);return()=>{controller.abort();clearInterval(timer);};
  },[refreshKey]);
  return <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-semibold">Instagram publishing history</h2>{error&&<p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}{loading?<NxHistoryListSkeleton count={2}/>:!jobs.length&&<p className="mt-3 text-sm text-slate-500">No Instagram publishing requests yet.</p>}{!loading&&jobs.map(j=><article key={j.id} className="mt-4 rounded-xl bg-slate-50 p-4"><div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-medium">@{j.account_name} · {j.media_type==='video'?'Reel':'Photo / carousel'}</p><span className={`rounded-full px-3 py-1 text-xs ${j.status==='failed'||j.status==='needs_review'?'bg-amber-100 text-amber-800':'bg-violet-100 text-violet-700'}`}>{j.status.replaceAll('_',' ')}</span></div><p className="mt-2 line-clamp-2 break-words text-sm">{j.caption||'No caption'}</p>{j.provider_error&&<p className="mt-2 text-xs text-amber-800">{j.provider_error.replaceAll('_',' ')}{j.status==='needs_review'?'. Check Instagram before creating another post.':''}</p>}<p className="mt-2 text-xs text-slate-400">{new Date(j.created_at).toLocaleString()}</p></article>)}</section>;
}
