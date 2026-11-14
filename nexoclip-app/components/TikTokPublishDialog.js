'use client';
import { useEffect,useRef,useState } from 'react';
import { createPortal } from 'react-dom';
import { tiktokPublishMessage } from '../src/lib/tiktokPublishDisplay.mjs';

const PRIVACY={SELF_ONLY:'Only me',PUBLIC_TO_EVERYONE:'Everyone',MUTUAL_FOLLOW_FRIENDS:'Friends',FOLLOWER_OF_CREATOR:'Followers'};
export default function TikTokPublishDialog({video,photos=[],onClose}) {
  const isPhoto=photos.length>0;
  const [accounts,setAccounts]=useState([]),[accountId,setAccountId]=useState(''),[mode,setMode]=useState('direct');
  const [info,setInfo]=useState(null),[loadingInfo,setLoadingInfo]=useState(false),[privacy,setPrivacy]=useState('');
  const [caption,setCaption]=useState(''),[title,setTitle]=useState(''),[cover,setCover]=useState(0),[music,setMusic]=useState(false);
  const [aiDisclosure,setAiDisclosure]=useState(true);
  const [comment,setComment]=useState(false),[duet,setDuet]=useState(false),[stitch,setStitch]=useState(false),[branded,setBranded]=useState(false),[ownBrand,setOwnBrand]=useState(false);
  const [confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[job,setJob]=useState(null),[duration,setDuration]=useState(null);
  const dialog=useRef(null),attempt=useRef(null);
  const workspaceId=typeof window==='undefined'?'':window.sessionStorage.getItem('nexoclip_workspace_id')||'';
  const account=accounts.find(a=>a.id===accountId);
  const canUpload=account?.granted_scopes?.includes('video.upload'),canDirect=account?.granted_scopes?.includes('video.publish');
  const headers={'x-workspace-id':workspaceId};
  useEffect(()=>{
    const previous=document.activeElement;dialog.current?.focus();
    return()=>previous?.focus?.();
  },[]);
  useEffect(()=>{
    const controller=new AbortController();
    fetch('/api/tiktok/accounts',{headers,credentials:'include',cache:'no-store',signal:controller.signal}).then(async response=>{
      const data=await response.json();if(!response.ok)throw new Error(data.error);
      const connected=(data.accounts||[]).filter(a=>a.status==='connected');setAccounts(connected);
      const first=connected.find(a=>a.granted_scopes.includes('video.publish')||a.granted_scopes.includes('video.upload'));
      setAccountId(first?.id||'');if(first&&!first.granted_scopes.includes('video.publish'))setMode('upload');
    }).catch(e=>{if(e.name!=='AbortError')setError(e.message);});
    return()=>controller.abort();
  },[workspaceId]);
  useEffect(()=>{
    setInfo(null);setPrivacy('');setConfirmed(false);setComment(false);setDuet(false);setStitch(false);setLoadingInfo(false);
    if(!accountId||mode!=='direct'||!canDirect)return;
    const controller=new AbortController();setLoadingInfo(true);setError('');
    fetch(`/api/tiktok/creator-info?account_id=${encodeURIComponent(accountId)}`,{headers,credentials:'include',cache:'no-store',signal:controller.signal}).then(async response=>{
      const data=await response.json();if(!response.ok)throw new Error(data.error);if(!controller.signal.aborted)setInfo(data);
    }).catch(e=>{if(e.name!=='AbortError')setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoadingInfo(false);});
    return()=>controller.abort();
  },[accountId,mode,canDirect,workspaceId]);
  useEffect(()=>{
    if(!job||['published','failed','needs_review'].includes(job.status))return;
    const controller=new AbortController();
    const timer=setInterval(async()=>{
      try{const response=await fetch(`/api/tiktok/publish/${job.id}`,{headers,credentials:'include',cache:'no-store',signal:controller.signal});const data=await response.json();if(!response.ok)throw new Error(data.error);setJob(data.job);}
      catch(e){if(e.name!=='AbortError')setError(e.message);}
    },5000);
    return()=>{clearInterval(timer);controller.abort();};
  },[job?.id,job?.status,workspaceId]);
  const tooLong=mode==='direct'&&!isPhoto&&duration!==null&&info&&duration>info.max_video_post_duration_sec;
  const brandedPrivate=mode==='direct'&&branded&&privacy==='SELF_ONLY';
  const ready=accountId&&confirmed&&!busy&&!job&&(mode==='upload'?canUpload:canDirect&&info&&!loadingInfo&&privacy&&info.privacy_level_options?.includes(privacy)&&!tooLong&&!brandedPrivate);
  const submit=async()=>{
    if(!ready)return;setBusy(true);setError('');
    const body={accountId,mediaType:isPhoto?'photo':'video',...(isPhoto?{assetIds:photos.map(p=>p.id),photoTitle:title,photoCoverIndex:cover,autoAddMusic:music,isAigc:photos.some(p=>p.generated)||aiDisclosure}:{generationId:video.id}),mode,caption:!isPhoto&&mode==='upload'?'':caption,privacyLevel:mode==='direct'?privacy:null,disableComment:!comment||!!info?.comment_disabled,disableDuet:!duet||!!info?.duet_disabled,disableStitch:!stitch||!!info?.stitch_disabled,brandContentToggle:mode==='direct'&&branded,brandOrganicToggle:mode==='direct'&&ownBrand,confirm:confirmed};
    const fingerprint=JSON.stringify(body);
    if(attempt.current?.fingerprint!==fingerprint)attempt.current={fingerprint,key:crypto.randomUUID()};
    try{
      const response=await fetch('/api/tiktok/publish',{method:'POST',credentials:'include',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({...body,idempotencyKey:attempt.current.key})});
      const data=await response.json();if(!response.ok)throw new Error(data.error);setJob(data.job);
    }catch(e){setError(e.message);}finally{setBusy(false);}
  };
  const keyDown=event=>{
    if(event.key==='Escape'){onClose();return;}
    if(event.key!=='Tab')return;
    const nodes=[...dialog.current.querySelectorAll('button:not(:disabled),select:not(:disabled),textarea:not(:disabled),input:not(:disabled),a[href]')];
    const first=nodes[0],last=nodes.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  };
  if(typeof document==='undefined')return null;
  return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-3" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section ref={dialog} tabIndex={-1} onKeyDown={keyDown} role="dialog" aria-modal="true" aria-labelledby="tiktok-publish-title" className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#12141b] p-5 text-white shadow-2xl outline-none sm:p-6">
      <div className="flex justify-between gap-4"><div><p className="text-xs uppercase tracking-widest text-lime-300">TikTok</p><h2 id="tiktok-publish-title" className="mt-1 text-xl font-semibold">{isPhoto?'Publish photos':'Publish video'}</h2></div><button type="button" aria-label="Close publisher" onClick={onClose} className="h-9 w-9 rounded-full bg-white/5">×</button></div>
      <fieldset disabled={busy||!!job} className="mt-5 min-w-0 space-y-4 disabled:opacity-70">
        {isPhoto?<div><div className="flex gap-2 overflow-x-auto">{photos.map((photo,index)=><button type="button" key={photo.id} onClick={()=>{setCover(index);setConfirmed(false);}} aria-label={`Use photo ${index+1} as cover`} aria-pressed={cover===index} className={`shrink-0 rounded-xl border-2 p-1 ${cover===index?'border-lime-300':'border-transparent'}`}><img src={photo.url} alt={`Photo ${index+1}`} className="h-32 w-24 rounded-lg object-cover"/><span className="mt-1 block text-xs">{cover===index?'Cover':index+1}</span></button>)}</div><p className="mt-2 text-xs text-white/50">{photos.length} photos · tap a photo to choose its cover</p></div>:<video src={video?.url} controls playsInline onLoadedMetadata={e=>setDuration(e.currentTarget.duration)} className="max-h-64 w-full rounded-xl bg-black"/>}
        <label className="block text-sm">TikTok account<select value={accountId} onChange={e=>setAccountId(e.target.value)} className="mt-1 w-full rounded-lg border border-white/15 bg-[#1b1e28] p-3"><option value="">Choose an account</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.display_name||'TikTok creator'}</option>)}</select></label>
        {!accounts.length&&<a className="block text-sm text-lime-200" href="/studio/accounts">Connect a TikTok account →</a>}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Publishing method"><button type="button" disabled={!canDirect} aria-pressed={mode==='direct'} onClick={()=>setMode('direct')} className={`rounded-lg px-4 py-2 text-sm disabled:opacity-40 ${mode==='direct'?'bg-lime-300 text-black':'bg-white/5'}`}>Publish now</button><button type="button" disabled={!canUpload} aria-pressed={mode==='upload'} onClick={()=>setMode('upload')} className={`rounded-lg px-4 py-2 text-sm disabled:opacity-40 ${mode==='upload'?'bg-lime-300 text-black':'bg-white/5'}`}>Send to inbox</button></div>
        {accountId&&(!canDirect||!canUpload)&&<p className="text-xs text-white/55">Reconnect from Connected accounts to authorize additional publishing methods.</p>}
        {isPhoto&&<label className="block text-sm">Title<input value={title} maxLength={90} onChange={e=>{setTitle(e.target.value);setConfirmed(false);}} className="mt-1 w-full rounded-lg border border-white/15 bg-[#1b1e28] p-3"/><span className="text-xs text-white/40">{title.length}/90</span></label>}
        {(isPhoto||mode==='direct')&&<label className="block text-sm">Caption<textarea value={caption} maxLength={isPhoto?4000:2200} onChange={e=>{setCaption(e.target.value);setConfirmed(false);}} className="mt-1 min-h-24 w-full rounded-lg border border-white/15 bg-[#1b1e28] p-3"/><span className="text-xs text-white/40">{caption.length}/{isPhoto?4000:2200}</span></label>}
        {mode==='upload'?<p className="rounded-xl bg-white/5 p-3 text-sm text-white/65">TikTok sends an inbox notification. Open it in the TikTok mobile app to edit and finish posting.{!isPhoto&&' Add your caption inside TikTok.'}</p>:<>
          {loadingInfo&&<p role="status" className="text-sm text-white/55">Checking TikTok publishing settings…</p>}
          {info&&<><p className="text-sm text-white/70">Posting as {info.creator_nickname||info.creator_username||account?.display_name}</p><label className="block text-sm">Who can view<select value={privacy} onChange={e=>{setPrivacy(e.target.value);setConfirmed(false);}} className="mt-1 w-full rounded-lg border border-white/15 bg-[#1b1e28] p-3"><option value="">Choose visibility</option>{(info.privacy_level_options||[]).map(value=><option key={value} value={value}>{PRIVACY[value]||value}</option>)}</select></label>{info.privateOnly&&<p className="text-xs text-amber-200">Sandbox posting is private. Your TikTok account may also need to be private during unaudited testing.</p>}</>}
          <div className="flex flex-wrap gap-4">{[['Comments',comment,setComment,info?.comment_disabled],...(!isPhoto?[['Duet',duet,setDuet,info?.duet_disabled],['Stitch',stitch,setStitch,info?.stitch_disabled]]:[])].map(([label,value,setter,disabled])=><label key={label} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value&&!disabled} disabled={!info||disabled} onChange={e=>{setter(e.target.checked);setConfirmed(false);}}/>Allow {label.toLowerCase()}</label>)}</div>
          {isPhoto&&<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={music} onChange={e=>{setMusic(e.target.checked);setConfirmed(false);}}/>Let TikTok add recommended music</label>}
          <div className="space-y-2"><p className="text-sm font-medium">Content disclosure</p><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ownBrand} onChange={e=>{setOwnBrand(e.target.checked);setConfirmed(false);}}/>Promotional content for my own brand</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={branded} onChange={e=>{setBranded(e.target.checked);setConfirmed(false);}}/>Paid partnership / third-party branded content</label></div>
          {brandedPrivate&&<p role="alert" className="text-sm text-amber-200">Branded content cannot use private visibility. This combination is unavailable in sandbox testing.</p>}
          {tooLong&&<p role="alert" className="text-sm text-red-300">This account allows videos up to {info.max_video_post_duration_sec} seconds.</p>}
        </>}
        {isPhoto?<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={photos.some(p=>p.generated)||aiDisclosure} disabled={photos.some(p=>p.generated)} onChange={e=>{setAiDisclosure(e.target.checked);setConfirmed(false);}}/>AI-generated content</label>:<p className="text-xs text-white/45">This generated video will be labeled AI-generated on TikTok.</p>}
        <label className="flex items-start gap-2 rounded-xl border border-white/10 p-3 text-sm"><input type="checkbox" className="mt-1" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>I confirm this content and the selected account and settings. I agree to TikTok’s Music Usage Confirmation and, for branded content, its Branded Content Policy.</span></label>
      </fieldset>
      {job&&<div role="status" className="mt-4 rounded-xl border border-lime-300/20 bg-lime-300/5 p-4 text-sm"><strong className="capitalize">{job.status.replaceAll('_',' ')}</strong><p className="mt-1 text-white/70">{tiktokPublishMessage(job)}</p>{job.provider_error&&<p className="mt-2 text-amber-200">{job.provider_error}</p>}<a href="/studio/publish" className="mt-3 inline-block text-lime-200">View publishing history →</a></div>}
      {error&&<p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
      <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-white/70">Close</button>{!job&&<button type="button" disabled={!ready} onClick={submit} className="rounded-lg bg-lime-300 px-4 py-2 text-sm font-semibold text-black disabled:opacity-40">{busy?'Queueing…':mode==='upload'?'Confirm send to inbox':'Confirm publish'}</button>}</div>
    </section>
  </div>,document.body);
}
