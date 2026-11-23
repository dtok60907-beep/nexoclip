'use client';
import { useEffect,useRef,useState } from 'react';
import PublishVideoPreview from './PublishVideoPreview';
export default function InstagramPublishDialog({video,photos=[],onClose}) {
  const [accounts,setAccounts]=useState([]),[accountId,setAccountId]=useState(''),[caption,setCaption]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[job,setJob]=useState(null);
  const key=useRef(null),closeButton=useRef(null);
  const headers=()=>({'x-workspace-id':window.sessionStorage.getItem('nexoclip_workspace_id')||'','content-type':'application/json'});
  useEffect(()=>{key.current=crypto.randomUUID();closeButton.current?.focus();const controller=new AbortController();fetch('/api/meta/accounts',{headers:headers(),credentials:'include',signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);setAccounts(d.accounts||[]);}).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>controller.abort();},[]);
  const account=accounts.find(a=>a.id===accountId),allowed=account?.status==='connected'&&account.granted_scopes?.includes('instagram_content_publish');
  const submit=async()=>{
    setBusy(true);setError('');
    try{const r=await fetch('/api/meta/publish',{method:'POST',headers:headers(),credentials:'include',body:JSON.stringify({accountId,caption,confirm:confirmed,idempotencyKey:key.current,mediaType:video?'video':'photo',generationId:video?.id,assetIds:video?[video.asset_id]:photos.map(p=>p.id)})}),d=await r.json();if(!r.ok)throw new Error(d.error);setJob(d.job);}
    catch(e){setError(e.message);}finally{setBusy(false);}
  };
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3" onKeyDown={e=>{if(e.key==='Escape'&&!busy)onClose();if(e.key==='Tab'){const items=e.currentTarget.querySelectorAll('button:not(:disabled),select:not(:disabled),textarea:not(:disabled),input:not(:disabled),a[href]'),first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}>
    <section role="dialog" aria-modal="true" aria-labelledby="ig-publish-title" className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 text-slate-900 sm:p-6"><div className="flex items-center justify-between"><h2 id="ig-publish-title" className="text-xl font-semibold">Review Instagram {video?'Reel':photos.length>1?'carousel':'photo'}</h2><button ref={closeButton} type="button" onClick={onClose} disabled={busy} aria-label="Close Instagram review" className="rounded-lg p-2">✕</button></div>
    {job?<div role="status" className="mt-5"><p className="font-medium text-violet-700">Instagram post queued.</p><p className="mt-2 text-sm text-slate-500">The worker prepares your media and checks Meta’s publishing status. Follow progress in Instagram publishing history below.</p><button type="button" onClick={onClose} className="mt-5 rounded-xl bg-violet-600 px-4 py-2 text-white">View progress</button></div>:<>
      <div className="mt-4 overflow-hidden rounded-xl bg-slate-100">{video?<PublishVideoPreview url={video.url}/>:<div className="flex snap-x gap-2 overflow-x-auto">{photos.map(p=><img key={p.id} src={p.thumbnailUrl||p.url} alt="Selected photo" className="aspect-square w-64 shrink-0 snap-center object-contain"/>)}</div>}</div>
      {!video&&<p className="mt-2 text-xs text-slate-500">{photos.length} photos in selection order. Photos are fitted on a white square canvas without cropping.</p>}
      <label className="mt-4 block text-sm font-medium">Instagram account<select value={accountId} onChange={e=>{setAccountId(e.target.value);setConfirmed(false);}} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3"><option value="">Choose an account</option>{accounts.map(a=><option key={a.id} value={a.id}>@{a.display_name}{a.status!=='connected'?' · reconnect required':''}</option>)}</select></label>
      {!accounts.length&&<p className="mt-3 text-sm text-slate-500">Instagram account connection is temporarily unavailable.</p>}
      {account&&!allowed&&<p className="mt-3 text-sm text-amber-700">Reconnect Instagram with instagram_content_publish permission. Personal accounts cannot publish through the API.</p>}
      <label className="mt-4 block text-sm font-medium">Caption<textarea maxLength={2200} rows={4} value={caption} onChange={e=>{setCaption(e.target.value);setConfirmed(false);}} className="mt-2 w-full resize-y rounded-xl border border-slate-200 p-3"/></label><p className="mt-1 text-right text-xs text-slate-400">{[...caption].length} / 2,200</p>
      <p className="mt-3 text-xs text-slate-500">This publishes directly to Instagram. AI-generated disclosure is enabled. Your media is made publicly accessible to Meta during processing.</p>
      <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-1"/><span>I reviewed the media, caption and selected account and confirm publishing this post.</span></label>
      {error&&<p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      <button type="button" disabled={busy||!allowed||!confirmed||(!video&&(photos.length<1||photos.length>20))} onClick={submit} className="mt-5 w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold text-white disabled:opacity-40">{busy?'Queuing…':'Confirm & publish to Instagram'}</button>
    </>}
    </section>
  </div>;
}
