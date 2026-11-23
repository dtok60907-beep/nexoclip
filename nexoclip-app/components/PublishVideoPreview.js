'use client';
import { useEffect,useRef,useState } from 'react';

export default function PublishVideoPreview({url}) {
  const element=useRef(null),[visible,setVisible]=useState(false),[failed,setFailed]=useState(false);
  useEffect(()=>{
    if(!globalThis.IntersectionObserver){setVisible(true);return;}
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'100px'});
    if(element.current)observer.observe(element.current);
    return()=>observer.disconnect();
  },[]);
  return <span ref={element} className="relative block aspect-video w-full bg-slate-100">
    {visible&&!failed&&<video src={`${url.split('#')[0]}#t=0.1`} preload="metadata" muted playsInline onError={()=>setFailed(true)} className="absolute inset-0 h-full w-full object-cover"/>}
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center text-2xl text-slate-400">▶</span>
    {failed&&<span className="absolute inset-x-0 bottom-2 text-center text-xs text-slate-500">Preview unavailable</span>}
  </span>;
}
