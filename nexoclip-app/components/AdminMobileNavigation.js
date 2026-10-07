'use client';
import { useState } from 'react';
import AdminNavigation from './AdminNavigation';
export default function AdminMobileNavigation({active}) {
 const [open,setOpen]=useState(false);
 return <div className="lg:hidden" onKeyDown={e=>{if(e.key==='Escape')setOpen(false);}}>
  <button type="button" aria-label={open?'Tutup sidebar admin':'Buka sidebar admin'} aria-expanded={open} aria-controls="admin-mobile-navigation" onClick={()=>setOpen(v=>!v)} className="flex h-10 items-center gap-2 rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 text-sm font-medium text-cyan-200"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16 M4 12h16 M4 18h16"/></svg>{open?'Tutup sidebar':'Buka sidebar'}</button>
  {open&&<div id="admin-mobile-navigation" className="absolute left-4 right-4 top-[72px] z-40 max-h-[calc(100dvh-90px)] overflow-y-auto rounded-xl border border-white/15 bg-[#101114] p-4 shadow-2xl"><AdminNavigation active={active} mobile onNavigate={()=>setOpen(false)}/></div>}
 </div>;
}
