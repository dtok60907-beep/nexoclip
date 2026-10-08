'use client';
import { useEffect,useRef,useState } from 'react';
import AdminShell from './AdminShell';
import AccountAccessPanel from './AccountAccessPanel';
import { adminStyles as s } from '../src/lib/adminStyles.js';
import { downloadCsv } from '../src/lib/saas/downloadCsv.js';
import { saasFetch } from '../src/lib/saas/api.js';
import { ACCOUNT_STATUS_OPTIONS,ACCOUNT_PAGE_SIZES } from '../src/lib/accountDirectoryFilters.js';
import { accountHistoryFilters,ACCOUNT_HISTORY_OPTIONS } from '../src/lib/accountHistoryFilters.js';
import { credits,idr } from '../src/lib/economicsDisplay.js';
const time=v=>v?new Date(v).toLocaleString('id-ID',{timeZone:'UTC'}):'—';
function display(k,v){if(v===null||v===undefined)return '—';if(k.endsWith('_at'))return time(v);if(k.includes('idr'))return idr(v);if(['amount','balance_after','credits','estimated_cost','available_credits','granted_credits','bonus_credits'].includes(k))return credits(v);if(typeof v==='boolean')return v?'Ya':'Tidak';return String(v);}
export function HistoryTable({title,rows,columns}) {return <section className={`${s.panel} mt-5`}><h2 className="border-b border-white/10 p-4 font-semibold">{title}</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{columns.map(([key,label])=><th key={key}>{label}</th>)}</tr></thead><tbody>{rows.length?rows.map((r,i)=><tr key={r.id||i} className="border-t border-white/10">{columns.map(([key])=><td key={key}>{display(key,r[key])}</td>)}</tr>):<tr><td colSpan={columns.length} className="text-white/45">Belum ada data.</td></tr>}</tbody></table></div></section>;}
export function AccountHistoryTable({title,history,rows,pagination,columns,workspaceId,customerId}) {
 const [page,setPage]=useState(pagination.page),[pageSize,setPageSize]=useState(pagination.pageSize),[result,setResult]=useState({rows,pagination}),[error,setError]=useState(''),[loading,setLoading]=useState(false),[retry,setRetry]=useState(0);
 const [dates,setDates]=useState({from:'',to:'',category:history==='ledger'?'':'all'}),[applied,setApplied]=useState({from:'',to:'',category:history==='ledger'?'':'all'}),[filterError,setFilterError]=useState('');
 const interacted=useRef(false),exportRequest=useRef(null);
 const [exporting,setExporting]=useState(false),[exportError,setExportError]=useState('');
 useEffect(()=>{setExportError('');setExporting(false);return()=>{exportRequest.current?.abort();exportRequest.current=null;};},[workspaceId,customerId,history,applied.from,applied.to,applied.category]);
 const exportCsv=async()=>{
  if(exportRequest.current)return;
  const controller=new AbortController();exportRequest.current=controller;setExporting(true);setExportError('');
  const params=new URLSearchParams({workspaceId,customerId,history,from:applied.from,to:applied.to,category:applied.category,export:'history-csv'});
  try{await downloadCsv(`/api/admin/backoffice?${params}`,{signal:controller.signal,filename:`account-${history}-${customerId}-${applied.from||'start'}-${applied.to||'end'}.csv`});}
  catch(e){if(!controller.signal.aborted)setExportError(e.message);}
  finally{if(exportRequest.current===controller){exportRequest.current=null;setExporting(false);}}
 };
 useEffect(()=>{
  if(!interacted.current){setResult({rows,pagination});return;}
  let canceled=false;const controller=new AbortController();setResult(null);setError('');setLoading(true);
  const params=new URLSearchParams({workspaceId,customerId,history,page:String(page),pageSize:String(pageSize),from:applied.from,to:applied.to,category:applied.category});
  saasFetch(`/api/admin/backoffice?${params}`,{signal:controller.signal}).then(data=>{
   if(canceled)return;
   if(page>data.pagination.pages){setPage(data.pagination.pages);return;}
   setResult(data);setLoading(false);
  }).catch(e=>{if(!canceled){setError(e.message);setLoading(false);}});
  return()=>{canceled=true;controller.abort();};
 },[workspaceId,customerId,history,rows,pagination,page,pageSize,retry,applied.from,applied.to,applied.category]);
 const changePage=value=>{interacted.current=true;setPage(value);};
 const applyDates=event=>{
  event.preventDefault();
  let normalized;try{normalized=accountHistoryFilters({history,...dates});}catch(e){setFilterError(e.message);return;}
  setFilterError('');interacted.current=true;setApplied({...dates,category:normalized.category});setPage(1);setRetry(value=>value+1);
 };
 const resetDates=()=>{setFilterError('');setDates({from:'',to:'',category:history==='ledger'?'':'all'});setApplied({from:'',to:'',category:history==='ledger'?'':'all'});interacted.current=true;setPage(1);setRetry(value=>value+1);};
 return <section aria-label={title}>
  <div className="mt-5 flex flex-wrap items-end justify-between gap-3"><p className="text-xs text-white/50">{history==='sessions'?'Aktivitas akun ini di semua workspace.':'Riwayat workspace bersama, termasuk anggota lain.'}</p><label className={s.label}>Entri per halaman<select aria-label={`Entri per halaman: ${title}`} className={s.field} value={pageSize} onChange={event=>{interacted.current=true;setPageSize(Number(event.target.value));setPage(1);}}>{ACCOUNT_PAGE_SIZES.map(value=><option key={value} value={value}>{value}</option>)}</select></label></div>
  <form aria-label={`Filter tanggal ${title}`} className={s.filters} onSubmit={applyDates}>
   <label className={s.label}>Dari (UTC)<input type="date" aria-label={`Dari (UTC): ${title}`} className={s.field} value={dates.from} min="0001-01-01" max="9999-12-31" onChange={event=>setDates(value=>({...value,from:event.target.value}))}/></label>
   <label className={s.label}>Sampai (UTC)<input type="date" aria-label={`Sampai (UTC): ${title}`} className={s.field} value={dates.to} min="0001-01-01" max="9999-12-30" onChange={event=>setDates(value=>({...value,to:event.target.value}))}/></label>
   <label className={s.label}>{history==='ledger'?'Cari alasan':history==='payments'?'Status pembayaran':'Aktivitas sesi'}{history==='ledger'?<input aria-label={`Cari alasan: ${title}`} className={s.field} maxLength={120} value={dates.category} onChange={event=>setDates(value=>({...value,category:event.target.value}))}/>:<select aria-label={`Jenis riwayat: ${title}`} className={s.field} value={dates.category} onChange={event=>setDates(value=>({...value,category:event.target.value}))}>{ACCOUNT_HISTORY_OPTIONS[history].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>}</label>
   <button className={s.button}>Terapkan filter</button><button type="button" className="h-10 rounded-lg border border-white/15 px-4 text-sm" onClick={resetDates}>Reset filter</button>
  </form>
  <div className="my-3 flex flex-wrap items-center gap-3"><button type="button" disabled={exporting||loading} className="rounded-lg border border-white/15 px-4 py-2 text-sm disabled:opacity-50" onClick={exportCsv}>{exporting?'Mengekspor…':'Ekspor CSV'}</button><span className="text-xs text-white/50">Seluruh hasil sesuai filter yang diterapkan · maksimal 5.000 entri.</span></div>
  {exportError&&<p role="alert" className={s.error}>{exportError}</p>}
  <p className="text-xs text-white/50">Tanggal pencatatan (UTC); seluruh tanggal akhir disertakan.{history==='payments'?' Mengikuti tanggal order dibuat.':''}</p>
  {filterError&&<p role="alert" className={s.error}>{filterError}</p>}
  {loading&&<p role="status" className={s.loading}>Memuat {title.toLowerCase()}…</p>}
  {error&&<p role="alert" className={s.error}>{error}<button type="button" className="ml-3 text-cyan-200 hover:underline" onClick={()=>{interacted.current=true;setRetry(value=>value+1);}}>Coba lagi</button></p>}
  {result&&<><p className="mt-3 text-xs text-cyan-100">Periode diterapkan (UTC): {applied.from||"Sejak awal"} — {applied.to||"Tanpa batas akhir"} · {history==='ledger'?(applied.category?`Alasan: ${applied.category}`:'Semua alasan'):ACCOUNT_HISTORY_OPTIONS[history].find(([value])=>value===applied.category)?.[1]}</p><HistoryTable title={title} rows={result.rows} columns={columns}/><AccountsPagination pagination={result.pagination} count={result.rows.length} busy={loading} onPage={changePage} noun="entri" label={`Pagination ${title}`}/></>}
 </section>;
}
export function CustomerProfile({data}) {const w=data.workspace,e=data.economics;
 const historyTable=(history,title,rows,columns)=>data.historyPagination?.[history]?<AccountHistoryTable key={`${w.id}:${data.account.id}:${history}`} workspaceId={w.id} customerId={data.account.id} history={history} title={title} rows={rows} pagination={data.historyPagination[history]} columns={columns}/>:<HistoryTable title={title} rows={rows} columns={columns}/>;
 return <>
 <div className="mt-6 grid gap-4 sm:grid-cols-3">{[['Akun',data.account.email],['Saldo workspace',`${credits(w.balance)} kredit`],['Kredit tertahan workspace',`${credits(w.reserved)} kredit`]].map(([label,v])=><article className={s.card} key={label}><p className={s.cardLabel}>{label}</p><p className="mt-2 break-all text-lg font-semibold">{v}</p></article>)}</div>
 <p className="mt-4 text-sm text-white/60">{data.account.display_name||'Tanpa nama'} · {data.account.role} · {w.name} · Daftar {time(data.account.created_at)} UTC</p>
 <p className="mt-2 text-xs text-white/45">Generate dan sesi milik akun ini. Pembayaran, saldo, sumber kredit, dan audit milik workspace bersama. Riwayat sesi, pembayaran, dan ledger kredit memiliki pagination terpisah. Generate, sumber kredit, dan audit menampilkan maksimal 50 entri terbaru; invoice maksimal 100. Log sesi tersedia mulai fitur ini diaktifkan dan mencatat pembuatan/pencabutan sesi, termasuk sesi sistem.</p>
 {e&&<section className={`${s.panel} mt-5 p-5`}><h2 className="font-semibold">Economics workspace · 30 hari terakhir (UTC)</h2><p className="mt-2 text-xs text-white/45">Periode {e.since.slice(0,10)} sampai sebelum {e.until.slice(0,10)}. Biaya provider dari usage/tarif atau laporan provider, belum rekonsiliasi invoice BytePlus. Kontribusi belum merupakan laba bersih.{e.totals.simulation&&` Simulasi trial: 750 kredit = Rp149.000; pendapatan aktual ${idr(e.totals.recognizedRevenueIdr)}.`}</p><div className="mt-4 grid gap-4 sm:grid-cols-3">{[[e.totals.simulation?'Pendapatan simulasi kredit terpakai':'Pendapatan kredit terpakai',idr(e.totals.simulation?.revenueIdr??e.totals.recognizedRevenueIdr)],['Biaya provider tercatat',idr(e.totals.providerCostIdr)],[e.totals.simulation?'Kontribusi simulasi':'Kontribusi',idr(e.totals.simulation?e.totals.simulation.contributionIdr:e.totals.contributionIdr)]].map(([label,v])=><div key={label}><p className={s.cardLabel}>{label}</p><p className="mt-2 text-lg font-semibold">{v}</p></div>)}</div>{!e.totals.coverage.complete&&<p className="mt-3 text-sm text-amber-200">Data biaya, fee, atau pendapatan belum lengkap.</p>}</section>}
 {historyTable("sessions","Aktivitas sesi akun (UTC)",data.sessions,[["action","Aktivitas"],["created_at","Waktu"]])}
 <HistoryTable title="Generate akun (UTC)" rows={data.jobs} columns={[["model","Model"],["status","Status"],["estimated_cost","Kredit reservasi"],["settlement_status","Settlement"],["created_at","Dibuat"]]}/>
 {historyTable("payments","Pembayaran workspace (UTC)",data.payments,[["order_id","Order"],["amount_idr","Harga"],["credits","Kredit"],["provider_key","Metode"],["status","Status"],["created_at","Dibuat"],["completed_at","Dibayar"]])}
 {historyTable("ledger","Ledger kredit workspace (UTC)",data.ledger,[["reason","Alasan"],["amount","Perubahan"],["balance_after","Saldo setelah"],["created_at","Waktu"]])}
 <HistoryTable title="Sumber nilai kredit workspace" rows={data.lots} columns={[["source_type","Sumber"],["granted_credits","Diberikan"],["available_credits","Tersedia"],["amount_idr","Nilai pembelian"],["payment_fee_idr","Biaya pembayaran"]]}/>
 <HistoryTable title="Audit backoffice workspace (UTC)" rows={data.audit} columns={[["actor_email","Operator"],["target_email","Pelanggan"],["action","Aksi"],["reason","Alasan / bukti"],["created_at","Waktu"]]}/>
 </>;}
export function AccountsFilters({q,status,pageSize,onQuery,onStatus,onPageSize,onSearch,onReset,busy}) {
 return <form className={s.filters} onSubmit={onSearch}>
  <label className={s.label}>Cari akun: nama / email<input className={s.field} value={q} maxLength={120} onChange={event=>onQuery(event.target.value)}/></label>
  <label className={s.label}>Status akun<select className={s.field} value={status} onChange={event=>onStatus(event.target.value)}>{ACCOUNT_STATUS_OPTIONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
  <label className={s.label}>Akun per halaman<select className={s.field} value={pageSize} onChange={event=>onPageSize(Number(event.target.value))}>{ACCOUNT_PAGE_SIZES.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
  <button disabled={busy} className={s.button}>Cari akun</button>
  <button type="button" disabled={busy} className="h-10 rounded-lg border border-white/15 px-4 text-sm" onClick={onReset}>Reset filter</button>
 </form>;
}
export function AccountsPagination({pagination,count,busy,onPage,noun="akun",label="Pagination akun"}) {
 const {page,pageSize,total,pages}=pagination;
 const first=count?(page-1)*pageSize+1:0,last=count?first+count-1:0;
 return <nav aria-label={label} className={`${s.panel} mt-4 flex flex-wrap items-center justify-between gap-3 p-4 text-sm`}>
  <p role="status">{first}–{last} dari {total} {noun} · Halaman {page} / {pages}</p>
  <div className="flex gap-3"><button type="button" disabled={busy||page<=1} className="text-cyan-200 disabled:text-white/30" onClick={()=>onPage(page-1)}>Sebelumnya</button><button type="button" disabled={busy||page>=pages} className="text-cyan-200 disabled:text-white/30" onClick={()=>onPage(page+1)}>Berikutnya</button></div>
 </nav>;
}
export default function BackofficeDashboard({mode}) {
 const [directory,setDirectory]=useState(null),[q,setQ]=useState(''),[search,setSearch]=useState(''),[workspaceId,setWorkspaceId]=useState(''),[customerId,setCustomerId]=useState(''),[profile,setProfile]=useState(null),[orders,setOrders]=useState([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0),[selected,setSelected]=useState(null);
 const [status,setStatus]=useState('all'),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(25),[directoryError,setDirectoryError]=useState(''),[directoryRevision,setDirectoryRevision]=useState(0);
 const [terms,setTerms]=useState({company:'',credits:'',bonus:'0',amount:'',notes:''});
 const [payment,setPayment]=useState({reference:'',paidAt:'',fee:''});
 const [grant,setGrant]=useState({credits:'',type:'trial',reason:''});
 const [cancelReason,setCancelReason]=useState('');
 const keys=useRef({});
 useEffect(()=>{
  let canceled=false;const controller=new AbortController();setDirectory(null);setDirectoryError('');
  const params=new URLSearchParams({q:search,status:mode==='accounts'?status:'all',page:String(mode==='accounts'?page:1),pageSize:String(mode==='accounts'?pageSize:100)});
  saasFetch(`/api/admin/backoffice?${params}`,{signal:controller.signal}).then(data=>{
   if(canceled)return;
   if(mode==='accounts'&&page>data.pagination.pages){setPage(data.pagination.pages);return;}
   setDirectory(data);
  }).catch(e=>{if(!canceled)setDirectoryError(e.message);});
  return()=>{canceled=true;controller.abort();};
 },[mode,search,status,page,pageSize,revision,directoryRevision]);
 useEffect(()=>{setProfile(null);setOrders([]);setSelected(null);setError('');if(!workspaceId)return;let canceled=false;
 const p=new URLSearchParams({workspaceId,...(customerId?{customerId}:{})});saasFetch(`/api/admin/backoffice?${p}`).then(d=>{if(canceled)return;if(customerId)setProfile(d);setOrders(d.orders||[]);}).catch(e=>{if(!canceled)setError(e.message);});return()=>{canceled=true;};},[workspaceId,customerId,revision]);
 async function submit(action,fields) {if(busy)return;setBusy(true);setError('');setNotice('');
 const payload={...fields,action,workspaceId,customerId:fields.customerId||customerId};
 const signature=JSON.stringify(payload);if(!keys.current[action]||keys.current[action].signature!==signature)keys.current[action]={signature,key:crypto.randomUUID()};
 try{await saasFetch('/api/admin/backoffice',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...payload,requestKey:keys.current[action].key})});delete keys.current[action];setRevision(v=>v+1);setNotice(action==='settle'?'Pembayaran tercatat dan kredit masuk satu kali.':action==='grant'?'Kredit non-berbayar ditambahkan dan diaudit.':action==='cancel'?'Invoice dibatalkan.':'Invoice dibuat. Kredit belum ditambahkan.');if(action==='create')setTerms({company:'',credits:'',bonus:'0',amount:'',notes:''});if(action==='grant')setGrant({credits:'',type:'trial',reason:''});}catch(e){setError(e.message);}finally{setBusy(false);}}
 const users=directory?.users||[];
 const members=users.filter(u=>u.workspaces.some(w=>w.id===workspaceId));
 const choose=(userId,w)=>{setWorkspaceId(w);setCustomerId(userId);setSelected(null);};
 const input=(label,key,state,setter,type='text',extra={})=><label className={s.label}>{label}<input className={s.field} type={type} value={state[key]} onChange={e=>setter(v=>({...v,[key]:e.target.value}))} {...extra}/></label>;
 return <AdminShell platform active={`/admin/${mode}`} title={mode==='accounts'?'Accounts & aktivitas':'Business billing'} description="Backoffice operator platform untuk akun seluruh workspace, invoice khusus, dan jejak perubahan kredit.">
 {mode==='accounts'?<AccountsFilters q={q} status={status} pageSize={pageSize} busy={busy} onQuery={setQ} onStatus={value=>{setStatus(value);setPage(1);}} onPageSize={value=>{setPageSize(value);setPage(1);}} onSearch={event=>{event.preventDefault();setSearch(q.trim());setPage(1);setDirectoryRevision(value=>value+1);}} onReset={()=>{setQ('');setSearch('');setStatus('all');setPageSize(25);setPage(1);setDirectoryRevision(value=>value+1);}}/>:<form className={s.filters} onSubmit={e=>{e.preventDefault();setSearch(q.trim());setDirectoryRevision(value=>value+1);}}><label className={s.label}>Cari akun: nama / email<input className={s.field} value={q} maxLength={120} onChange={e=>setQ(e.target.value)}/></label><button className={s.button}>Cari akun</button></form>}
 {mode==='billing'&&directory?.truncated&&<p className="text-sm text-amber-200">Menampilkan 100 akun pertama. Persempit pencarian dengan email atau nama.</p>}
 {directoryError&&<p role="alert" className={s.error}>{directoryError}<button type="button" className="ml-3 text-cyan-200 hover:underline" onClick={()=>setDirectoryRevision(value=>value+1)}>Coba lagi</button></p>}
 {!directory&&!directoryError&&<p role="status" className={s.loading}>Memuat akun…</p>}
 {mode==='accounts'&&directory&&<section className={`${s.panel} overflow-x-auto`}><table className="w-full text-left text-sm"><thead><tr><th>Akun / status</th><th>Workspace / profil</th><th>Daftar (UTC)</th></tr></thead><tbody>{users.length?users.map(u=><tr key={u.id} className="border-t border-white/10"><td>{u.email}<p className="text-xs text-white/45">{u.display_name}</p><p className={`mt-1 text-xs ${u.suspended_at?'text-amber-100':'text-cyan-100'}`}>{u.suspended_at?'Disuspend':'Aktif'}</p><button type="button" disabled={busy} className="mt-2 text-xs text-cyan-200" onClick={()=>choose(u.id,u.workspaces[0]?.id || '')}>Kelola akses akun →</button></td><td>{u.workspaces.length?u.workspaces.map(w=><button disabled={busy} key={w.id} className="mr-3 text-cyan-200" onClick={()=>choose(u.id,w.id)}>{w.name} ↗</button>):'Tanpa workspace'}</td><td>{time(u.created_at)}</td></tr>):<tr><td colSpan={3}>Tidak ada akun yang sesuai.</td></tr>}</tbody></table></section>}
 {mode==='accounts'&&directory&&<AccountsPagination pagination={directory.pagination} count={users.length} busy={busy} onPage={setPage}/>}
 {mode==='billing'&&directory&&<div className={s.filters}><label className={s.label}>Workspace<select disabled={busy} className={s.field} value={workspaceId} onChange={e=>{setWorkspaceId(e.target.value);setCustomerId('');}}><option value="">Pilih workspace</option>{directory.workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label><label className={s.label}>Pelanggan / kontak invoice<select disabled={busy} className={s.field} value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">Pilih anggota (cari email jika belum muncul)</option>{members.map(u=><option key={u.id} value={u.id}>{u.email}</option>)}</select></label></div>}
 {error&&<p role="alert" className={s.error}>{error}</p>}{notice&&<p role="status" className="my-4 rounded-xl border border-cyan-300/20 p-4 text-sm text-cyan-200">{notice}</p>}
 {workspaceId&&customerId&&!profile&&!error&&<p className={s.loading}>Memuat profil…</p>}
 {mode==='accounts'&&customerId&&<AccountAccessPanel key={customerId} targetUserId={customerId} onSaved={()=>setRevision(value=>value+1)}/>}
 {mode==='accounts'&&profile&&<CustomerProfile data={profile}/>}
 {mode==='billing'&&workspaceId&&<>
 {customerId&&<section className={`${s.panel} mt-5 p-5`}><h2 className="font-semibold">Buat invoice kredit khusus</h2><p className="mt-2 text-xs text-white/45">Ketentuan disimpan tetap. Kredit tidak kedaluwarsa pada versi ini. Bonus masuk dalam total kredit untuk menghitung nilai per kredit. Invoice belum berarti pembayaran diterima.</p><form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();submit('create',terms);}}>
 {input('Nama perusahaan','company',terms,setTerms,'text',{required:true,maxLength:160})}{input('Harga total (IDR)','amount',terms,setTerms,'number',{required:true,min:1,max:2000000000,step:1})}
 {input('Kredit dibeli','credits',terms,setTerms,'number',{required:true,min:1,max:10000000,step:1})}{input('Bonus kredit','bonus',terms,setTerms,'number',{required:true,min:0,max:10000000,step:1})}
 {input('Catatan kesepakatan','notes',terms,setTerms,'text',{maxLength:1000})}<p className="self-center text-sm text-white/60">Nilai per kredit: {Number(terms.credits)+Number(terms.bonus)>0?idr(Number(terms.amount)/(Number(terms.credits)+Number(terms.bonus))):'—'} (tampilan dibulatkan)</p><button disabled={busy} className={s.button}>Buat invoice</button></form></section>}
 <section className={`${s.panel} mt-5`}><h2 className="p-4 font-semibold">Invoice workspace (100 terbaru)</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Invoice / perusahaan</th><th>Total kredit</th><th>Harga</th><th>Status</th><th>Detail</th></tr></thead><tbody>{orders.length?orders.map(o=><tr key={o.id} className="border-t border-white/10"><td>{o.invoice_number}<p className="text-xs text-white/45">{o.company_name}</p></td><td>{credits(Number(o.credits)+Number(o.bonus_credits))}</td><td>{idr(o.amount_idr)}</td><td>{o.status}</td><td><button disabled={busy} className="text-cyan-200" onClick={()=>{setSelected(o);setPayment({reference:o.payment_reference||'',paidAt:'',fee:o.payment_fee_idr??''});setCancelReason('');}}>Buka invoice</button></td></tr>):<tr><td colSpan={5}>Belum ada invoice.</td></tr>}</tbody></table></div></section>
 {selected&&<section className={`${s.panel} mt-5 p-5`}><h2 className="break-all font-semibold">{selected.invoice_number}</h2><p className="mt-2">{selected.company_name} · {selected.status}</p><p className="mt-2 text-sm text-white/60">Dibeli {credits(selected.credits)} + bonus {credits(selected.bonus_credits)} kredit · {idr(selected.amount_idr)}</p><p className="mt-2 break-words text-sm text-white/60">{selected.notes||'Tanpa catatan'}</p>{selected.status==='completed'&&<p className="mt-3 text-sm">Referensi: {selected.payment_reference} · Dibayar {time(selected.paid_at)} UTC · Fee {selected.payment_fee_idr===null?'belum diketahui':idr(selected.payment_fee_idr)}</p>}
 {selected.status==='pending'&&<><form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();submit('settle',{customerId:selected.customer_user_id,orderId:selected.id,...payment,paidAt:new Date(payment.paidAt).toISOString()});}}><p className="text-sm text-white/60 sm:col-span-2">Catat setelah bukti pembayaran diperiksa. Ini verifikasi manual oleh operator, bukan konfirmasi otomatis bank.</p>{input('Referensi unik bukti transfer / pembayaran','reference',payment,setPayment,'text',{required:true,maxLength:160})}{input('Waktu pembayaran (zona waktu perangkat)','paidAt',payment,setPayment,'datetime-local',{required:true})}{input('Biaya pembayaran IDR (kosong = belum diketahui)','fee',payment,setPayment,'number',{min:0,max:selected.amount_idr,step:0.01})}<button disabled={busy} className={`${s.button} self-end`}>Catat pembayaran & tambah kredit</button></form><form className="mt-6 flex flex-wrap items-end gap-3" onSubmit={e=>{e.preventDefault();submit('cancel',{customerId:selected.customer_user_id,orderId:selected.id,reason:cancelReason});}}><label className={s.label}>Alasan pembatalan<input required maxLength={500} className={s.field} value={cancelReason} onChange={e=>setCancelReason(e.target.value)}/></label><button disabled={busy} className="h-10 rounded-lg border border-white/15 px-4 text-sm">Batalkan invoice</button></form></>}
 </section>}
 {customerId&&<section className={`${s.panel} mt-5 p-5`}><h2 className="font-semibold">Tambahkan kredit non-berbayar</h2><p className="mt-2 text-xs text-white/45">Masuk ke saldo workspace bersama. Nilai pendapatan Rp0. Pembelian berbayar menggunakan invoice di atas.</p><form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();submit('grant',grant);}}>{input('Jumlah kredit','credits',grant,setGrant,'number',{required:true,min:0.000001,max:10000000,step:0.000001})}<label className={s.label}>Jenis<select className={s.field} value={grant.type} onChange={e=>setGrant(v=>({...v,type:e.target.value}))}>{['trial','bonus','compensation'].map(t=><option key={t} value={t}>{t}</option>)}</select></label>{input('Alasan pemberian','reason',grant,setGrant,'text',{required:true,maxLength:500})}<button disabled={busy} className={`${s.button} self-end`}>Tambahkan kredit & catat audit</button></form></section>}
 </>}
 </AdminShell>;
}
