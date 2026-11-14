'use client';
import { useCallback, useEffect, useState } from 'react';

function httpsUrl(value) {
  try { const url=new URL(value); return url.protocol==='https:'?url.href:undefined; } catch { return undefined; }
}

export default function TikTokPostsPanel({accounts,onReconnect}) {
  const [posts,setPosts]=useState([]),[next,setNext]=useState(null),[expanded,setExpanded]=useState(false);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const headers=()=>({'x-workspace-id':window.sessionStorage.getItem('nexoclip_workspace_id')||''});
  const read=useCallback(async(offset=0)=>{
    const response=await fetch(`/api/tiktok/posts?offset=${offset}`,{headers:headers(),credentials:'include',cache:'no-store'});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'Could not load TikTok posts');
    setPosts(previous=>offset?[...previous,...data.posts.filter(p=>!previous.some(old=>old.id===p.id))]:data.posts);
    setNext(data.nextOffset);setExpanded(offset>0);setError('');
  },[]);
  useEffect(()=>{read().catch(e=>setError(e.message));},[read]);
  useEffect(()=>{if(expanded)return;const timer=setInterval(()=>read().catch(e=>setError(e.message)),30000);return()=>clearInterval(timer);},[read,expanded]);
  const sync=async(accountId)=>{
    setBusy(true);setError('');setMessage('');
    try {
      const response=await fetch(`/api/tiktok/accounts/${accountId}/sync`,{method:'POST',headers:headers(),credentials:'include'});
      const data=await response.json();if(!response.ok)throw new Error(data.error);
      setMessage('Sync requested. Public posts will appear here as they are imported.');
    }catch(e){setError(e.message);}finally{setBusy(false);}
  };
  const refreshDetails=async(post)=>{
    setBusy(true);setError('');setMessage('');
    try{
      const response=await fetch('/api/tiktok/videos/query',{method:'POST',credentials:'include',headers:{...headers(),'content-type':'application/json'},body:JSON.stringify({accountId:post.social_account_id,videoIds:[post.provider_post_id]})});
      const data=await response.json();if(!response.ok)throw new Error(data.error);
      await read();setMessage(data.refreshedIds.length?'Video details and thumbnail refreshed.':'TikTok did not return this video. It may no longer be publicly available.');
    }catch(e){setError(e.message);}finally{setBusy(false);}
  };
  return <section className="mt-10" aria-labelledby="tiktok-posts-title">
    <div className="flex items-center justify-between gap-3"><h2 id="tiktok-posts-title" className="text-lg font-semibold">TikTok posts</h2><button type="button" disabled={busy} onClick={()=>read().catch(e=>setError(e.message))} className="rounded-lg border border-white/15 px-3 py-2 text-sm">Refresh list</button></div>
    <p className="mt-2 text-sm text-white/55">Public videos posted on TikTok, including from your phone. Drafts and private videos are not available through TikTok’s Display API.</p>
    {accounts.map(account=>{
      const permitted=account.granted_scopes?.includes('video.list');
      return <div key={account.id} className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-3">
        <div><strong className="text-sm">{account.display_name||'TikTok'}</strong><p className="mt-1 text-xs text-white/55">{!permitted?'Reconnect and grant access to your public videos.':account.posts_sync_error?`Sync error: ${account.posts_sync_error}. Retrying automatically.`:account.posts_syncing?'Syncing posts…':account.posts_synced_at?`Last synced ${new Date(account.posts_synced_at).toLocaleString()}`:'Waiting for the first sync.'}</p></div>
        <button type="button" disabled={busy||account.status!=='connected'} onClick={()=>permitted?sync(account.id):onReconnect()} className="rounded-lg border border-white/15 px-3 py-2 text-sm disabled:opacity-40">{permitted?'Sync posts':'Reconnect for posts'}</button>
      </div>;
    })}
    {message&&<p role="status" className="mt-3 text-sm text-lime-200">{message}</p>}
    {error&&<p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
    {posts.length?<div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{posts.map(post=><article key={post.id} className="overflow-hidden rounded-xl border border-white/10 bg-white/[.03]">
      <a href={httpsUrl(post.share_url)} target="_blank" rel="noopener noreferrer" className="block"><div className="aspect-[3/4] bg-black/20">{httpsUrl(post.cover_url)&&<img src={httpsUrl(post.cover_url)} alt="" loading="lazy" className="h-full w-full object-cover" onError={event=>{event.currentTarget.style.visibility='hidden';}}/>}</div><div className="p-3"><h3 className="line-clamp-2 text-sm font-medium">{post.title||post.caption||'TikTok video'}</h3><p className="mt-1 text-xs text-white/50">{post.account_name} · {new Date(post.published_at).toLocaleDateString()}</p><span className="mt-2 block text-xs text-lime-200">View on TikTok ↗</span></div></a>
      <div className="px-3 pb-3"><p className="mb-2 text-xs text-white/55">{[['view_count','views'],['like_count','likes'],['comment_count','comments'],['share_count','shares']].filter(([key])=>Number.isSafeInteger(post.metrics?.[key])).map(([key,label])=>`${post.metrics[key].toLocaleString()} ${label}`).join(' · ')}</p><button type="button" disabled={busy} onClick={()=>refreshDetails(post)} className="rounded-lg border border-white/15 px-3 py-2 text-xs disabled:opacity-40">Refresh video details</button></div>
    </article>)}</div>:<p className="mt-4 text-sm text-white/45">No public videos synced yet.</p>}
    {next!==null&&<button type="button" disabled={busy} onClick={async()=>{setBusy(true);try{await read(next);}catch(e){setError(e.message);}finally{setBusy(false);}}} className="mt-4 rounded-lg border border-white/15 px-4 py-2 text-sm">Load more</button>}
  </section>;
}
