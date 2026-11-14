'use client';
import { useState } from 'react';

const STATS=[['follower_count','Followers'],['following_count','Following'],['likes_count','Likes'],['video_count','Public videos']];
function profileLink(value) {
  try {const url=new URL(value);return url.protocol==='https:'?url.href:null;}catch{return null;}
}

export default function TikTokAccountInsights({accounts,onReconnect}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const refresh=async(id)=>{
    setBusy(true);setError('');setMessage('');
    try {
      const response=await fetch(`/api/tiktok/accounts/${id}/profile`,{method:'POST',credentials:'include',headers:{'x-workspace-id':window.sessionStorage.getItem('nexoclip_workspace_id')||''}});
      const data=await response.json();if(!response.ok)throw new Error(data.error);
      setMessage('Profile refresh requested. Updated information will appear automatically.');
    }catch(e){setError(e.message);}finally{setBusy(false);}
  };
  if(!accounts.length)return null;
  return <section className="mt-10" aria-labelledby="tiktok-insights-title">
    <h2 id="tiktok-insights-title" className="text-lg font-semibold">Account insights</h2>
    {accounts.map(account=>{
      const profile=account.profile_data||{},scopes=account.granted_scopes||[];
      const canProfile=scopes.includes('user.info.profile'),canStats=scopes.includes('user.info.stats');
      const link=canProfile?profileLink(profile.profile_deep_link):null;
      return <article key={account.id} className="mt-3 rounded-2xl border border-white/10 bg-white/[.03] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-medium">{account.display_name||'TikTok'} {canProfile&&profile.is_verified&&<span className="text-xs text-sky-300">Verified ✓</span>}</h3>{canProfile&&profile.username&&<p className="mt-1 text-xs text-white/55">@{profile.username}</p>}</div><button type="button" disabled={busy||account.status!=='connected'} onClick={()=>refresh(account.id)} className="rounded-lg border border-white/15 px-3 py-2 text-sm disabled:opacity-40">Refresh profile</button></div>
        {canProfile&&profile.bio_description&&<p className="mt-3 whitespace-pre-wrap break-words text-sm text-white/70">{profile.bio_description}</p>}
        {link&&<a href={link} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-lime-200">View TikTok profile ↗</a>}
        {canStats?<dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{STATS.map(([key,label])=><div key={key} className="rounded-xl bg-white/5 p-3"><dt className="text-xs text-white/50">{label}</dt><dd className="mt-1 text-xl font-semibold">{Number.isSafeInteger(profile[key])?profile[key].toLocaleString():'—'}</dd></div>)}</dl>:<p className="mt-3 text-sm text-white/55">Grant account statistics access to display followers, following, likes, and public video counts.</p>}
        {(!canStats||!canProfile)&&<button type="button" onClick={onReconnect} className="mt-3 rounded-lg border border-white/15 px-3 py-2 text-sm">Reconnect for profile and stats</button>}
        {account.profile_synced_at&&<p className="mt-3 text-xs text-white/40">Updated {new Date(account.profile_synced_at).toLocaleString()}</p>}
        {account.profile_sync_error&&<p className="mt-2 text-xs text-amber-200">Refresh error: {account.profile_sync_error}. Retrying automatically.</p>}
      </article>;
    })}
    {message&&<p role="status" className="mt-3 text-sm text-lime-200">{message}</p>}
    {error&&<p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
  </section>;
}
