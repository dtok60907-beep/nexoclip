'use client';
import { useCallback,useEffect,useState } from 'react';
import InstagramPostsPanel from './InstagramPostsPanel';

export default function MetaAccountsPanel() {
  const [data,setData]=useState({integrations:[],accounts:[],adAccounts:[],configured:false}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const headers=()=>({'x-workspace-id':window.sessionStorage.getItem('nexoclip_workspace_id')||''});
  const load=useCallback(async()=>{
    const r=await fetch('/api/meta/accounts',{headers:headers(),credentials:'include',cache:'no-store'}),d=await r.json();
    if(!r.ok)throw new Error(d.error);setData(d);setLoading(false);
  },[]);
  useEffect(()=>{
    load().catch(e=>{setError(e.message);setLoading(false);});
    const url=new URL(location.href),status=url.searchParams.get('meta');
    if(status){setError(status==='connected'?'Instagram connection saved.':status==='cancelled'?'Instagram connection cancelled.':`Instagram connection failed (${status.replaceAll('_',' ')}).`);url.searchParams.delete('meta');history.replaceState({},'',url.pathname+url.search);}
  },[load]);
  const connect=async()=>{
    setBusy(true);setError('');
    try{const r=await fetch('/api/meta/oauth/start',{method:'POST',headers:headers(),credentials:'include'}),d=await r.json();if(!r.ok)throw new Error(d.error);window.location.assign(d.url);}
    catch(e){setError(e.message);setBusy(false);}
  };
  const disconnect=async integration=>{
    if(!window.confirm('Disconnect this Meta business from your Nexoclip workspace? This disconnects its Instagram and ad accounts here.'))return;
    setBusy(true);setError('');
    try{const r=await fetch(`/api/meta/connections/${integration.id}`,{method:'DELETE',headers:headers(),credentials:'include'}),d=await r.json();if(!r.ok)throw new Error(d.error);await load();}
    catch(e){setError(e.message);}finally{setBusy(false);}
  };
  return <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 text-slate-900" aria-labelledby="meta-accounts-title">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="meta-accounts-title" className="text-lg font-semibold">Instagram & Meta Marketing API</h2><p className="mt-1 text-sm text-slate-500">Connect Instagram publishing and Meta business or advertising accounts through Meta Login.</p></div><button type="button" onClick={connect} disabled={busy||loading||!data.configured} className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy?'Connecting…':data.integrations.length?'Connect / reconnect':'Connect Instagram / Meta'}</button></div>
    {!loading&&!data.configured&&<p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Local setup is pending: configure the Meta App Secret and the registered HTTPS callback before connecting.</p>}
    {error&&<p role="status" className="mt-3 text-sm text-violet-700">{error}</p>}
    {loading&&<p role="status" className="mt-4 text-sm text-slate-500">Loading Meta accounts…</p>}
    {data.accounts.map(account=><div key={account.id} className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3"><span className="font-medium">@{account.display_name}</span><span className="text-xs text-slate-500">{account.status==='connected'?'Connected':'Reconnect required'}</span></div>)}
    {data.integrations.map(integration=><div key={integration.id} className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3"><div className="text-sm"><p>Business {integration.client_business_id}</p><p className="mt-1 text-xs text-slate-500">{data.adAccounts.filter(a=>a.meta_integration_id===integration.id).length} ad accounts shared · {integration.status.replaceAll('_',' ')}</p></div><button type="button" disabled={busy} onClick={()=>disconnect(integration)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600">Disconnect here</button></div>)}
    {data.adAccounts.length>0&&<a href="/studio/ads" className="mt-4 inline-block text-sm font-medium text-violet-600">View ad performance →</a>}
    <a href="/studio/publish" className="mt-4 inline-block text-sm font-medium text-violet-600">Create an Instagram post →</a>
    <InstagramPostsPanel accounts={data.accounts}/>
    <p className="mt-4 text-xs text-slate-400">Instagram publishing supports Creator and Business accounts. Personal accounts must switch account type in Instagram, then reconnect.</p>
  </section>;
}
