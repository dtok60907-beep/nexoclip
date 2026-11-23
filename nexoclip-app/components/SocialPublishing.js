'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import PublishVideoPreview from './PublishVideoPreview';
import TikTokPublishDialog from './TikTokPublishDialog';
import TikTokPublishDrafts from './TikTokPublishDrafts';
import TikTokPublishingHistory from './TikTokPublishingHistory';
import InstagramPublishDialog from './InstagramPublishDialog';
import InstagramPublishingHistory from './InstagramPublishingHistory';
import { NxSocialMediaSkeleton } from './ui/nx-loading';

export default function SocialPublishing(){
  const [provider,setProvider]=useState('tiktok');
  const [media,setMedia]=useState({videos:[],photos:[],photoEnabled:false}),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [type,setType]=useState('video'),[selectedVideo,setSelectedVideo]=useState(''),[photoIds,setPhotoIds]=useState([]),[review,setReview]=useState(false);
  const [draft,setDraft]=useState(null),[refreshKey,setRefreshKey]=useState(0);
  const loaded=useRef(new Set()),request=useRef(null),selectionCache=useRef(new Map());
  const [nextOffsets,setNextOffsets]=useState({video:null,photo:null});
  const load=useCallback(async(mediaType,offset=0)=>{
    request.current?.abort();const controller=new AbortController();request.current=controller;
    setLoading(true);setError('');
    try{
      const response=await fetch(`/api/tiktok/media?type=${mediaType}&offset=${offset}`,{signal:controller.signal,credentials:'include',cache:'no-store',headers:{'x-workspace-id':window.sessionStorage.getItem('nexoclip_workspace_id')||''}});
      const data=await response.json();if(!response.ok)throw new Error(data.error);if(controller.signal.aborted)return;
      const key=mediaType==='video'?'videos':'photos';
      for(const item of data[key]||[])selectionCache.current.set(`${mediaType}:${item.id}`,item);
      setMedia(previous=>({...previous,[key]:offset?[...previous[key],...(data[key]||[])].filter((item,index,all)=>all.findIndex(other=>other.id===item.id)===index):data[key]||[],photoEnabled:data.photoEnabled}));
      loaded.current.add(mediaType);setNextOffsets(previous=>({...previous,[mediaType]:data.nextOffset??null}));
    }catch(e){if(e.name!=='AbortError')setError(e.message);}finally{if(!controller.signal.aborted)setLoading(false);}
  },[]);
  useEffect(()=>{if(!loaded.current.has(type))load(type);else{setLoading(false);setError('');}return()=>request.current?.abort();},[type,load]);
  const video=media.videos.find(v=>v.id===selectedVideo)||selectionCache.current.get(`video:${selectedVideo}`);
  const photos=photoIds.map(id=>media.photos.find(p=>p.id===id)||selectionCache.current.get(`photo:${id}`)).filter(Boolean);
  const move=(index,direction)=>setPhotoIds(previous=>{const next=[...previous],target=index+direction;if(target<0||target>=next.length)return previous;[next[index],next[target]]=[next[target],next[index]];return next;});
  const togglePhoto=id=>setPhotoIds(previous=>previous.includes(id)?previous.filter(v=>v!==id):previous.length<(provider==='instagram'?20:35)?[...previous,id]:previous);
  return <main className="nx-content-page mx-auto max-w-5xl p-5 text-slate-900 md:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-violet-600">Create · review · publish</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Social publishing</h1><p className="mt-2 max-w-xl text-sm text-slate-500">Send your finished Nexoclip videos and photos to TikTok or Instagram. Review every post before confirming.</p></div></div>
    <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Create a post</h2><button type="button" disabled={loading} onClick={()=>load(type)} className="text-sm text-violet-600">Refresh media</button></div>
      <div className="mt-4 flex gap-2" role="group" aria-label="Publishing platform">{[['tiktok','TikTok'],['instagram','Instagram']].map(([value,label])=><button type="button" key={value} aria-pressed={provider===value} onClick={()=>{setProvider(value);setPhotoIds([]);}} className={`rounded-lg px-4 py-2 text-sm ${provider===value?'bg-slate-900 text-white':'bg-slate-100 text-slate-600'}`}>{label}</button>)}</div>
      <div className="mt-4 flex gap-2" role="group" aria-label="Media type">{[['video','Video'],['photo','Photos / carousel']].map(([value,label])=><button type="button" key={value} aria-pressed={type===value} onClick={()=>setType(value)} className={`rounded-lg px-4 py-2 text-sm ${type===value?'bg-violet-600 text-white':'bg-slate-100 text-slate-600'}`}>{label}</button>)}</div>
      {provider==='tiktok'&&type==='photo'&&!media.photoEnabled&&<p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Photo publishing needs a public media domain verified in TikTok Developer Portal. Configure the verified URL prefix before sending photos. Video upload is ready independently.</p>}
      {loading&&!media[type==='video'?'videos':'photos'].length?<NxSocialMediaSkeleton type={type}/>:error?<p role="alert" className="mt-5 text-sm text-red-600">{error}</p>:type==='video'?<>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">{media.videos.map(item=><label key={item.id} className={`cursor-pointer overflow-hidden rounded-xl border ${selectedVideo===item.id?'border-violet-500 ring-1 ring-violet-500':'border-slate-200'}`}><PublishVideoPreview key={item.url} url={item.url}/><span className="flex items-start gap-2 p-3 text-sm"><input type="radio" name="publish-video" value={item.id} checked={selectedVideo===item.id} onChange={()=>setSelectedVideo(item.id)}/><span className="line-clamp-2 break-all">{item.filename||'Generated video'}</span></span></label>)}</div>
        {!media.videos.length&&<p className="mt-5 text-sm text-slate-500">No completed videos owned by your account yet. <a href="/studio/video" className="text-violet-600">Create a video →</a></p>}
      </>:<>
        <p className="mt-4 text-sm text-slate-500">Select up to {provider==='instagram'?20:35} photos. Selection order is the carousel order.</p>
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">{media.photos.map(item=><label key={item.id} className={`relative cursor-pointer overflow-hidden rounded-xl border ${photoIds.includes(item.id)?'border-violet-500 ring-1 ring-violet-500':'border-slate-200'}`}><img src={item.thumbnailUrl||item.url} alt={item.filename} loading="lazy" decoding="async" className="aspect-square w-full object-cover"/><span className="absolute left-2 top-2 flex items-center gap-1 rounded bg-white/95 p-1 text-xs"><input type="checkbox" checked={photoIds.includes(item.id)} disabled={!photoIds.includes(item.id)&&photoIds.length>=35} onChange={()=>togglePhoto(item.id)}/>{photoIds.includes(item.id)?photoIds.indexOf(item.id)+1:''}</span></label>)}</div>
        {!media.photos.length&&<p className="mt-5 text-sm text-slate-500">No photos available. Save images to your workspace first.</p>}
        {photos.length>0&&<ol className="mt-5 space-y-2">{photos.map((photo,index)=><li key={photo.id} className="flex items-center gap-3 rounded-lg bg-slate-50 p-2 text-sm"><img src={photo.thumbnailUrl||photo.url} alt="" className="h-10 w-10 rounded object-cover"/><span className="min-w-0 flex-1 truncate">{index+1}. {photo.filename}</span><button type="button" aria-label={`Move photo ${index+1} earlier`} disabled={index===0} onClick={()=>move(index,-1)} className="p-2 disabled:opacity-30">↑</button><button type="button" aria-label={`Move photo ${index+1} later`} disabled={index===photos.length-1} onClick={()=>move(index,1)} className="p-2 disabled:opacity-30">↓</button><button type="button" aria-label={`Remove photo ${index+1}`} onClick={()=>togglePhoto(photo.id)} className="p-2">×</button></li>)}</ol>}
      </>}
      {nextOffsets[type]!==null&&<button type="button" disabled={loading} onClick={()=>load(type,nextOffsets[type])} className="mt-5 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-violet-600 disabled:opacity-40">{loading?'Loading…':'Load more media'}</button>}
      <div className="mt-5 flex justify-end"><button type="button" disabled={loading||!!error||(type==='video'?!video:!photos.length||(provider==='tiktok'&&!media.photoEnabled))} onClick={()=>{setDraft(null);setReview(true);}} className="rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">Review {type==='video'?'video':`${photos.length} photos`} →</button></div>
    </section>
    {provider==='instagram'&&<InstagramPublishingHistory refreshKey={refreshKey}/>}
    {provider==='tiktok'&&<TikTokPublishDrafts refreshKey={refreshKey} onResume={saved=>{setDraft(saved);setReview(true);}}/>}
    {provider==='tiktok'&&<TikTokPublishingHistory refreshKey={refreshKey}/>}
    {review&&provider==='instagram'&&<InstagramPublishDialog video={type==='video'?video:undefined} photos={type==='photo'?photos:[]} onClose={()=>{setReview(false);setRefreshKey(v=>v+1);}}/>}
    {review&&provider==='tiktok'&&<TikTokPublishDialog video={draft?draft.video:type==='video'?video:undefined} photos={draft?draft.photos:type==='photo'?photos:[]} draft={draft} onSaved={()=>setRefreshKey(value=>value+1)} onClose={()=>{setReview(false);setDraft(null);setRefreshKey(value=>value+1);}}/>}
  </main>;
}
