'use client';
import { useState } from 'react';
import Link from 'next/link';
import AdminNavigation from './AdminNavigation';
import AdminMobileNavigation from './AdminMobileNavigation';
import AccountMenu from './AccountMenu';
function Brand() {return <Link href="/admin" className="flex items-center gap-3 text-base font-semibold tracking-tight"><span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/></svg></span><span>NexoClip <span className="block text-[10px] font-medium uppercase tracking-[.16em] text-cyan-200/65">Admin console</span></span></Link>;}
export default function AdminShell({active,title,description,children,platform=false}) {
 const [sidebarOpen,setSidebarOpen]=useState(true);
 return <div className="admin-console min-h-screen bg-[#080809] text-white">
  <a href="#admin-content" className="sr-only z-50 rounded-lg bg-cyan-300 p-3 text-black focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Langsung ke konten</a>
  <aside id="admin-desktop-sidebar" aria-label="Admin sidebar" className={`fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-white/10 bg-[#0c0d10] ${sidebarOpen ? 'lg:flex' : ''}`}>
   <div className="border-b border-white/10 px-5 py-6"><Brand/></div>
   <div className="flex-1 overflow-y-auto px-3 py-6"><AdminNavigation active={active}/></div>
   <div className="border-t border-white/10 p-4"><p className="px-2 text-xs text-white/35">Backoffice operator NexoClip</p></div>
  </aside>
  <div className={`min-w-0 ${sidebarOpen ? 'lg:pl-64' : ''}`}>
   <header className="sticky top-0 z-20 flex min-h-[76px] items-center justify-between gap-3 border-b border-white/10 bg-[#080809]/95 px-4 backdrop-blur sm:px-6 lg:px-8">
    <AdminMobileNavigation key={active} active={active}/>
    <button type="button" aria-label={sidebarOpen?'Sembunyikan sidebar admin':'Tampilkan sidebar admin'} aria-expanded={sidebarOpen} aria-controls="admin-desktop-sidebar" title={sidebarOpen?'Sembunyikan sidebar':'Tampilkan sidebar'} onClick={()=>setSidebarOpen(v=>!v)} className="hidden h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 text-cyan-200 transition-colors hover:bg-white/5 hover:text-cyan-200 lg:flex"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d={sidebarOpen?'m15 9-3 3 3 3':'m13 9 3 3-3 3'}/></svg><span className="text-sm font-medium">{sidebarOpen?'Tutup sidebar':'Buka sidebar'}</span></button><p className="hidden text-sm text-white/55 lg:block">{platform?'Operator platform · seluruh akun dan workspace':'Operator internal · akses sesuai workspace'}</p>
    <div className="flex items-center gap-4 lg:ml-auto"><Link href="/studio" className="text-xs text-white/50 transition-colors hover:text-cyan-200">Buka Studio ↗</Link><AccountMenu admin/></div>
   </header>
   <main id="admin-content" className="mx-auto max-w-[1600px] px-4 py-7 sm:px-6 lg:px-8 lg:py-8">
    <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-cyan-200/70">{platform?'Admin platform':'Admin workspace'}</p><h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">{description}</p>
    {children}
   </main>
  </div>
 </div>;
}
