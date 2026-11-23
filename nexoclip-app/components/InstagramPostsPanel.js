'use client';
import { useCallback,useEffect,useState } from 'react';
const headers=()=>({'x-workspace-id':window.sessionStorage.getItem('nexoclip_workspace_id')||''});
export default function InstagramPostsPanel({accounts=[]}) {
  const [data,setData]=useState({posts:[],nextOffset:null}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[queued,setQueued]=useState(false);
  const load=useCallback(async(offset=0)=>{
    const r=await fetch(`/api/meta/posts?offset=${offset}`,{headers:headers(),credentials:'include',cache:'no-store'}),d=await r.json();
    if(!r.ok)throw new Error(d.error);setData(previous=>({posts:offset?[...previous.posts,...d.posts]:d.posts,nextOffset:d.nextOffset}));
  },[]);
  useEffect(()=>{if(accounts.length)load().catch(e=>setError(e.message));},[accounts,load]);
  useEffect(()=>{if(!queued)return;const timer=setInterval(()=>load().catch(e=>setError(e.message)),15000);return()=>clearInterval(timer);},[queued,load]);
  const sync=async()=>{
    setBusy(true);setError('');
    try{for(const a of accounts.filter(a=>a.status==='connected')){const r=await fetch(`/api/meta/accounts/${a.id}/sync`,{method:'POST',headers:headers(),credentials:'include'}),d=await r.json();if(!r.ok)throw new Error(d.error);}setQueued(true);await load();}
    catch(e){setError(e.message);}finally{setBusy(false);}
  };
  if(!accounts.length)return null;
  return <section className="mt-5 border-t border-slate-200 pt-5" aria-labelledby="instagram-posts-heading">
    <div className="flex items-center justify-between gap-3"><h3 id="instagram-posts-heading" className="font-semibold">Instagram posts</h3><button type="button" onClick={sync} disabled={busy||!accounts.some(a=>a.status==='connected')} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-violet-600 disabled:opacity-40">{busy?'Queuing…':'Sync now'}</button></div>
    <p className="mt-2 text-xs text-slate-500">Photos, Reels and carousels, including posts from your phone. Syncs every 30 minutes. Instagram may expire preview images; syncing refreshes them.</p>
    {queued&&<p role="status" className="mt-2 text-xs text-violet-600">Sync requested. The list refreshes while this page is open.</p>}
    {accounts.map(a=><p key={a.id} className="mt-2 text-xs text-slate-500">@{a.display_name} · {a.posts_sync_error?`Sync needs attention: ${a.posts_sync_error.replaceAll('_',' ')}`:a.posts_sync_run_id?'Syncing…':a.posts_synced_at?`Last sync ${new Date(a.posts_synced_at).toLocaleString()}`:'First sync pending'}</p>)}
    {error&&<p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{data.posts.map(p=><article key={p.id} className="overflow-hidden rounded-xl border border-slate-200">
      {p.cover_url?<img src={p.cover_url} alt="Instagram post preview" loading="lazy" referrerPolicy="no-referrer" className="aspect-square w-full object-cover"/>:<div className="flex aspect-square items-center justify-center bg-slate-100 text-xs text-slate-500">Preview unavailable</div>}
      <div className="p-3"><p className="text-xs text-violet-600">@{p.account_name} · {p.media_details?.productType==='REELS'?'Reel':p.media_details?.type==='CAROUSEL_ALBUM'?'Carousel':'Photo'}</p><p className="mt-1 line-clamp-2 break-words text-sm">{p.caption||'No caption'}</p><p className="mt-2 text-xs text-slate-500">{p.metrics?.like_count??'—'} likes · {p.metrics?.comments_count??'—'} comments</p>{p.share_url&&<a href={p.share_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-violet-600">Open on Instagram ↗</a>}</div>
    </article>)}</div>
    {!data.posts.length&&<p className="mt-4 text-sm text-slate-500">No synced Instagram posts yet. Connect a Creator or Business account, then sync.</p>}
    {data.nextOffset!==null&&<button type="button" onClick={()=>load(data.nextOffset).catch(e=>setError(e.message))} className="mt-4 text-sm text-violet-600">Load more posts</button>}
  </section>;
}
