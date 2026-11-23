'use client';
import { useCallback,useEffect,useState } from 'react';

export default function TikTokPublishDrafts({refreshKey,onResume}) {
  const [drafts,setDrafts]=useState([]),[busy,setBusy]=useState(''),[error,setError]=useState('');
  const headers=()=>({'x-workspace-id':window.sessionStorage.getItem('nexoclip_workspace_id')||'','content-type':'application/json'});
  const load=useCallback(async()=>{
    const response=await fetch('/api/tiktok/drafts',{headers:headers(),credentials:'include',cache:'no-store'});
    const data=await response.json();if(!response.ok)throw new Error(data.error);setDrafts(data.drafts||[]);
  },[]);
  useEffect(()=>{load().catch(e=>setError(e.message));},[load,refreshKey]);
  const act=async(draft,remove=false)=>{
    if(remove&&!window.confirm('Delete this saved draft? Your original media will be kept.'))return;
    setBusy(draft.id);setError('');
    try{
      const response=await fetch(remove?'/api/tiktok/drafts':`/api/tiktok/drafts?id=${draft.id}`,{method:remove?'DELETE':'GET',headers:headers(),credentials:'include',cache:'no-store',...(remove?{body:JSON.stringify({id:draft.id,version:draft.version})}:{})});
      const data=await response.json();if(!response.ok)throw new Error(data.error);
      if(remove)await load();else onResume(data.draft);
    }catch(e){setError(e.message);}finally{setBusy('');}
  };
  if(!drafts.length&&!error)return null;
  return <section className="mt-8" aria-labelledby="publish-drafts-title"><h2 id="publish-drafts-title" className="text-xl font-semibold">Saved drafts</h2><p className="mt-1 text-sm text-slate-500">Saved in your account. Drafts are never sent until you review and confirm.</p>
    {error&&<p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    <div className="mt-4 grid gap-3 sm:grid-cols-2">{drafts.map(draft=><article key={draft.id} className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="text-sm font-medium">{draft.content.mediaType==='photo'?`${draft.content.assetIds.length} photos`:'Video'} · Draft</h3><p className="mt-2 line-clamp-2 text-sm text-slate-600">{draft.content.photoTitle||draft.content.caption||'Untitled post'}</p><p className="mt-2 text-xs text-slate-400">Saved {new Date(draft.updated_at).toLocaleString()}</p><div className="mt-3 flex gap-3"><button type="button" disabled={!!busy} onClick={()=>act(draft)} className="text-sm font-medium text-violet-600">{busy===draft.id?'Loading…':'Continue editing'}</button><button type="button" disabled={!!busy} onClick={()=>act(draft,true)} className="text-sm text-slate-500">Delete draft</button></div></article>)}</div>
  </section>;
}
