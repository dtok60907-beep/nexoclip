'use client';
import { useEffect,useRef,useState } from 'react';
import AdminShell from './AdminShell';
import AccountAccessPanel from './AccountAccessPanel';
import ImpersonatePanel from './ImpersonatePanel';
import CompanyProfilePanel from './CompanyProfilePanel';
import { adminStyles as s } from '../src/lib/adminStyles.js';
import { downloadCsv } from '../src/lib/saas/downloadCsv.js';
import { saasFetch } from '../src/lib/saas/api.js';
import { ACCOUNT_STATUS_OPTIONS,ACCOUNT_PAGE_SIZES } from '../src/lib/accountDirectoryFilters.js';
import { accountHistoryFilters,ACCOUNT_HISTORY_OPTIONS } from '../src/lib/accountHistoryFilters.js';
import { credits,idr } from '../src/lib/economicsDisplay.js';
const time=v=>v?new Date(v).toLocaleString('en-US',{timeZone:'UTC'}):'—';
function display(k,v){if(v===null||v===undefined)return '—';if(k.endsWith('_at'))return time(v);if(k.includes('idr'))return idr(v);if(['amount','balance_after','credits','estimated_cost','available_credits','granted_credits','bonus_credits'].includes(k))return credits(v);if(typeof v==='boolean')return v?'Yes':'No';return String(v);}
export function HistoryTable({title,rows,columns}) {return <section className={`${s.panel} mt-5`}><h2 className="border-b border-white/10 p-4 font-semibold">{title}</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{columns.map(([key,label])=><th key={key}>{label}</th>)}</tr></thead><tbody>{rows.length?rows.map((r,i)=><tr key={r.id||i} className="border-t border-white/10">{columns.map(([key])=><td key={key}>{display(key,r[key])}</td>)}</tr>):<tr><td colSpan={columns.length} className="text-white/45">No data yet.</td></tr>}</tbody></table></div></section>;}
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
  <div className="mt-5 flex flex-wrap items-end justify-between gap-3"><p className="text-xs text-white/50">{history==='sessions'?'Activity for this account across all workspaces.':'Shared workspace history, including other members.'}</p><label className={s.label}>Entries per page<select aria-label={`Entries per page: ${title}`} className={s.field} value={pageSize} onChange={event=>{interacted.current=true;setPageSize(Number(event.target.value));setPage(1);}}>{ACCOUNT_PAGE_SIZES.map(value=><option key={value} value={value}>{value}</option>)}</select></label></div>
  <form aria-label={`Date filter ${title}`} className={s.filters} onSubmit={applyDates}>
   <label className={s.label}>From (UTC)<input type="date" aria-label={`From (UTC): ${title}`} className={s.field} value={dates.from} min="0001-01-01" max="9999-12-31" onChange={event=>setDates(value=>({...value,from:event.target.value}))}/></label>
   <label className={s.label}>To (UTC)<input type="date" aria-label={`To (UTC): ${title}`} className={s.field} value={dates.to} min="0001-01-01" max="9999-12-30" onChange={event=>setDates(value=>({...value,to:event.target.value}))}/></label>
   <label className={s.label}>{history==='ledger'?'Search reason':history==='payments'?'Payment status':'Session activity'}{history==='ledger'?<input aria-label={`Search reason: ${title}`} className={s.field} maxLength={120} value={dates.category} onChange={event=>setDates(value=>({...value,category:event.target.value}))}/>:<select aria-label={`History type: ${title}`} className={s.field} value={dates.category} onChange={event=>setDates(value=>({...value,category:event.target.value}))}>{ACCOUNT_HISTORY_OPTIONS[history].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>}</label>
   <button className={s.button}>Apply filters</button><button type="button" className="h-10 rounded-lg border border-white/15 px-4 text-sm" onClick={resetDates}>Reset filters</button>
  </form>
  <div className="my-3 flex flex-wrap items-center gap-3"><button type="button" disabled={exporting||loading} className="rounded-lg border border-white/15 px-4 py-2 text-sm disabled:opacity-50" onClick={exportCsv}>{exporting?'Exporting…':'Export CSV'}</button><span className="text-xs text-white/50">All results matching applied filters · max 5,000 entries.</span></div>
  {exportError&&<p role="alert" className={s.error}>{exportError}</p>}
  <p className="text-xs text-white/50">Recorded date (UTC); end date is inclusive.{history==='payments'?' Follows order creation date.':''}</p>
  {filterError&&<p role="alert" className={s.error}>{filterError}</p>}
  {loading&&<p role="status" className={s.loading}>Loading {title.toLowerCase()}…</p>}
  {error&&<p role="alert" className={s.error}>{error}<button type="button" className="ml-3 text-cyan-200 hover:underline" onClick={()=>{interacted.current=true;setRetry(value=>value+1);}}>Try again</button></p>}
  {result&&<><p className="mt-3 text-xs text-cyan-100">Applied period (UTC): {applied.from||"Since start"} — {applied.to||"No end date"} · {history==='ledger'?(applied.category?`Reason: ${applied.category}`:'All reasons'):ACCOUNT_HISTORY_OPTIONS[history].find(([value])=>value===applied.category)?.[1]}</p><HistoryTable title={title} rows={result.rows} columns={columns}/><AccountsPagination pagination={result.pagination} count={result.rows.length} busy={loading} onPage={changePage} noun="entries" label={`${title} pagination`}/></>}
 </section>;
}
export function CustomerProfile({data}) {const w=data.workspace,e=data.economics;
 const historyTable=(history,title,rows,columns)=>data.historyPagination?.[history]?<AccountHistoryTable key={`${w.id}:${data.account.id}:${history}`} workspaceId={w.id} customerId={data.account.id} history={history} title={title} rows={rows} pagination={data.historyPagination[history]} columns={columns}/>:<HistoryTable title={title} rows={rows} columns={columns}/>;
 return <>
 <div className="mt-6 grid gap-4 sm:grid-cols-3">{[['Account',data.account.email],['Workspace balance',`${credits(w.balance)} credits`],['Reserved workspace credits',`${credits(w.reserved)} credits`]].map(([label,v])=><article className={s.card} key={label}><p className={s.cardLabel}>{label}</p><p className="mt-2 break-all text-lg font-semibold">{v}</p></article>)}</div>
 <p className="mt-4 text-sm text-white/60">{data.account.display_name||'Unnamed'} · {data.account.role} · {w.name} · Registered {time(data.account.created_at)} UTC</p>
 <p className="mt-2 text-xs text-white/45">Generations and sessions belong to this account. Payments, balances, credit sources, and audits belong to the shared workspace. Session, payment, and credit ledger histories are paginated separately. Generations, credit sources, and audits display up to 50 latest entries; invoices up to 100. Session logs are available from when this feature was enabled and record session creation/revocation, including system sessions.</p>
 {e&&<section className={`${s.panel} mt-5 p-5`}><h2 className="font-semibold">Workspace Economics · Last 30 Days (UTC)</h2><p className="mt-2 text-xs text-white/45">Period {e.since.slice(0,10)} to before {e.until.slice(0,10)}. Provider costs come from usage/rates or provider reports and are not yet reconciled with BytePlus invoices. Contribution is not net profit.{e.totals.simulation&&` Trial simulation: 750 credits = Rp149.000; actual revenue ${idr(e.totals.recognizedRevenueIdr)}.`}</p><div className="mt-4 grid gap-4 sm:grid-cols-3">{[[e.totals.simulation?'Simulated recognized credit revenue':'Recognized credit revenue',idr(e.totals.simulation?.revenueIdr??e.totals.recognizedRevenueIdr)],['Recorded provider cost',idr(e.totals.providerCostIdr)],[e.totals.simulation?'Simulated contribution':'Contribution',idr(e.totals.simulation?e.totals.simulation.contributionIdr:e.totals.contributionIdr)]].map(([label,v])=><div key={label}><p className={s.cardLabel}>{label}</p><p className="mt-2 text-lg font-semibold">{v}</p></div>)}</div>{!e.totals.coverage.complete&&<p className="mt-3 text-sm text-amber-200">Cost, fee, or revenue data is incomplete.</p>}</section>}
 {historyTable("sessions","Account session activity (UTC)",data.sessions,[["action","Activity"],["created_at","Time"]])}
 <HistoryTable title="Account generations (UTC)" rows={data.jobs} columns={[["model","Model"],["status","Status"],["estimated_cost","Reserved credits"],["settlement_status","Settlement"],["created_at","Created"]]}/>
 {historyTable("payments","Workspace payments (UTC)",data.payments,[["order_id","Order"],["amount_idr","Price"],["credits","Credits"],["provider_key","Method"],["status","Status"],["created_at","Created"],["completed_at","Paid"]])}
 {historyTable("ledger","Workspace credit ledger (UTC)",data.ledger,[["reason","Reason"],["amount","Change"],["balance_after","Balance after"],["created_at","Time"]])}
 <HistoryTable title="Workspace credit value sources" rows={data.lots} columns={[["source_type","Source"],["granted_credits","Granted"],["available_credits","Available"],["amount_idr","Purchase value"],["payment_fee_idr","Payment fee"]]}/>
 <HistoryTable title="Workspace backoffice audit (UTC)" rows={data.audit} columns={[["actor_email","Operator"],["target_email","Customer"],["action","Action"],["reason","Reason / evidence"],["created_at","Time"]]}/>
 </>;}
export function AccountsFilters({q,status,pageSize,onQuery,onStatus,onPageSize,onSearch,onReset,busy}) {
 return <form className={s.filters} onSubmit={onSearch}>
  <label className={s.label}>Search accounts: name / email<input className={s.field} value={q} maxLength={120} onChange={event=>onQuery(event.target.value)}/></label>
  <label className={s.label}>Account status<select className={s.field} value={status} onChange={event=>onStatus(event.target.value)}>{ACCOUNT_STATUS_OPTIONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
  <label className={s.label}>Accounts per page<select className={s.field} value={pageSize} onChange={event=>onPageSize(Number(event.target.value))}>{ACCOUNT_PAGE_SIZES.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
  <button disabled={busy} className={s.button}>Search accounts</button>
  <button type="button" disabled={busy} className="h-10 rounded-lg border border-white/15 px-4 text-sm" onClick={onReset}>Reset filters</button>
 </form>;
}
export function AccountsPagination({pagination,count,busy,onPage,noun="accounts",label="Accounts pagination"}) {
 const {page,pageSize,total,pages}=pagination;
 const first=count?(page-1)*pageSize+1:0,last=count?first+count-1:0;
 return <nav aria-label={label} className={`${s.panel} mt-4 flex flex-wrap items-center justify-between gap-3 p-4 text-sm`}>
  <p role="status">{first}–{last} of {total} {noun} · Page {page} / {pages}</p>
  <div className="flex gap-3"><button type="button" disabled={busy||page<=1} className="text-cyan-200 disabled:text-white/30" onClick={()=>onPage(page-1)}>Previous</button><button type="button" disabled={busy||page>=pages} className="text-cyan-200 disabled:text-white/30" onClick={()=>onPage(page+1)}>Next</button></div>
 </nav>;
}
// Enterprise deals: the operator keeps a share of the price as profit and the rest buys credits at cost.
function ContractTerms({terms,setTerms,pricing}) {
 const [profit,setProfit]=useState('30');
 if(!pricing)return null;
 const amount=Number(terms.amount)||0,total=(Number(terms.credits)||0)+(Number(terms.bonus)||0);
 const cost=total*pricing.costIdrPerCredit,margin=amount-cost;
 const validProfit=terms.amount!==''&&Number(profit)>=0&&Number(profit)<100;
 const fill=()=>setTerms(v=>({...v,credits:String(Math.floor(amount*(1-Number(profit)/100)/pricing.costIdrPerCredit)),bonus:'0'}));
 return <div className="rounded-xl border border-white/10 p-4 text-sm sm:col-span-2">
  <p className="font-semibold">Enterprise Contract Calculator</p>
  <p className="mt-1 text-xs text-white/45">Enter the total price, choose target profit %, then calculate: the remaining price converts to credits at a base cost of {idr(pricing.costIdrPerCredit)} per credit. Credits can still be adjusted manually.</p>
  <div className="mt-3 flex flex-wrap items-end gap-3"><label className={s.label}>Profit margin (% of price)<input className={s.field} type="number" min={0} max={95} step={0.5} value={profit} onChange={e=>setProfit(e.target.value)}/></label><button type="button" disabled={!validProfit} className="h-10 rounded-lg border border-white/15 px-4 disabled:opacity-40" onClick={fill}>Calculate credits</button></div>
  {amount>0&&total>0&&<>
   <p className="mt-3">Provider cost ± {idr(cost)} · {margin>=0?'Profit':'Loss'} {idr(Math.abs(margin))} ({(margin/amount*100).toFixed(1)}% of price)</p>
   {margin/amount<0.15&&<p className="mt-1 text-amber-200">Profit below 15%: excludes payment fees, server costs, and retried generations.</p>}
   <ul className="mt-2 grid gap-1 text-white/70 sm:grid-cols-2">{pricing.videos.map(v=><li key={v.label}>± {(total/v.creditsPerSecond/60).toLocaleString('en-US',{maximumFractionDigits:1})} min of {v.label}</li>)}{pricing.images.map(v=><li key={v.label}>± {Math.floor(total/v.creditsPerImage).toLocaleString('en-US')} {v.label} images</li>)}</ul>
   <p className="mt-2 text-xs text-white/45">Estimated at Rp{pricing.referenceUsdIdr.toLocaleString('id-ID')}/USD before retried generations. If IDR weakens, included minutes decrease.</p>
  </>}
 </div>;
}
export default function BackofficeDashboard({mode}) {
 const [directory,setDirectory]=useState(null),[q,setQ]=useState(''),[search,setSearch]=useState(''),[workspaceId,setWorkspaceId]=useState(''),[customerId,setCustomerId]=useState(''),[profile,setProfile]=useState(null),[orders,setOrders]=useState([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0),[selected,setSelected]=useState(null);
 const [status,setStatus]=useState('all'),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(25),[directoryError,setDirectoryError]=useState(''),[directoryRevision,setDirectoryRevision]=useState(0);
 const [terms,setTerms]=useState({company:'',credits:'',bonus:'0',amount:'',notes:''});
 const [payment,setPayment]=useState({reference:'',paidAt:'',fee:''});
 const [grant,setGrant]=useState({credits:'',type:'trial',reason:''});
 const [adjust,setAdjust]=useState({targetBalance:'',reason:''});
 const [cancelReason,setCancelReason]=useState('');
 const keys=useRef({});
 const [pricing,setPricing]=useState(null);
 useEffect(()=>{if(mode!=='billing')return;let canceled=false;saasFetch('/api/admin/backoffice?pricing=contract').then(d=>{if(!canceled)setPricing(d);}).catch(()=>{});return()=>{canceled=true;};},[mode]);
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
 try{await saasFetch('/api/admin/backoffice',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...payload,requestKey:keys.current[action].key})});delete keys.current[action];setRevision(v=>v+1);setNotice(action==='settle'?'Payment recorded and credits added once.':action==='adjust'?'Balance adjusted and logged in ledger and audit.':action==='grant'?'Non-paid credits added and audited.':action==='cancel'?'Invoice canceled.':'Invoice created. Credits have not been added yet.');if(action==='create')setTerms({company:'',credits:'',bonus:'0',amount:'',notes:''});if(action==='grant')setGrant({credits:'',type:'trial',reason:''});if(action==='adjust')setAdjust({targetBalance:'',reason:''});}catch(e){setError(e.message);}finally{setBusy(false);}}
 const users=directory?.users||[];
 const members=users.filter(u=>u.workspaces.some(w=>w.id===workspaceId));
 const choose=(userId,w)=>{setWorkspaceId(w);setCustomerId(userId);setSelected(null);};
 const input=(label,key,state,setter,type='text',extra={})=><label className={s.label}>{label}<input className={s.field} type={type} value={state[key]} onChange={e=>setter(v=>({...v,[key]:e.target.value}))} {...extra}/></label>;
 return <AdminShell platform active={`/admin/${mode}`} title={mode==='accounts'?'Accounts & Activity':'Business Billing'} description="Platform operator backoffice for accounts across all workspaces, custom invoices, and credit audit trails.">
 {mode==='accounts'?<AccountsFilters q={q} status={status} pageSize={pageSize} busy={busy} onQuery={setQ} onStatus={value=>{setStatus(value);setPage(1);}} onPageSize={value=>{setPageSize(value);setPage(1);}} onSearch={event=>{event.preventDefault();setSearch(q.trim());setPage(1);setDirectoryRevision(value=>value+1);}} onReset={()=>{setQ('');setSearch('');setStatus('all');setPageSize(25);setPage(1);setDirectoryRevision(value=>value+1);}}/>:<form className={s.filters} onSubmit={e=>{e.preventDefault();setSearch(q.trim());setDirectoryRevision(value=>value+1);}}><label className={s.label}>Search accounts: name / email<input className={s.field} value={q} maxLength={120} onChange={e=>setQ(e.target.value)}/></label><button className={s.button}>Search accounts</button></form>}
 {mode==='billing'&&directory?.truncated&&<p className="text-sm text-amber-200">Showing the first 100 accounts. Narrow your search by email or name.</p>}
 {directoryError&&<p role="alert" className={s.error}>{directoryError}<button type="button" className="ml-3 text-cyan-200 hover:underline" onClick={()=>setDirectoryRevision(value=>value+1)}>Try again</button></p>}
 {!directory&&!directoryError&&<p role="status" className={s.loading}>Loading accounts…</p>}
 {mode==='accounts'&&directory&&<section className={`${s.panel} overflow-x-auto`}><table className="w-full text-left text-sm"><thead><tr><th>Account / status</th><th>Workspaces / profile</th><th>Registered (UTC)</th></tr></thead><tbody>{users.length?users.map(u=><tr key={u.id} className="border-t border-white/10"><td>{u.email}<p className="text-xs text-white/45">{u.display_name}</p><p className={`mt-1 text-xs ${u.suspended_at?'text-amber-100':'text-cyan-100'}`}>{u.suspended_at?'Suspended':'Active'}</p><button type="button" disabled={busy} className="mt-2 text-xs text-cyan-200" onClick={()=>choose(u.id,u.workspaces[0]?.id || '')}>Manage account access →</button></td><td>{u.workspaces.length?u.workspaces.map(w=><button disabled={busy} key={w.id} className="mr-3 text-cyan-200" onClick={()=>choose(u.id,w.id)}>{w.name} ↗</button>):'No workspace'}</td><td>{time(u.created_at)}</td></tr>):<tr><td colSpan={3}>No matching accounts found.</td></tr>}</tbody></table></section>}
 {mode==='accounts'&&directory&&<AccountsPagination pagination={directory.pagination} count={users.length} busy={busy} onPage={setPage}/>}
 {mode==='billing'&&directory&&<div className={s.filters}><label className={s.label}>Workspace<select disabled={busy} className={s.field} value={workspaceId} onChange={e=>{setWorkspaceId(e.target.value);setCustomerId('');}}><option value="">Select workspace</option>{directory.workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label><label className={s.label}>Customer / invoice contact<select disabled={busy} className={s.field} value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">Select member (search email if not listed)</option>{members.map(u=><option key={u.id} value={u.id}>{u.email}</option>)}</select></label></div>}
 {error&&<p role="alert" className={s.error}>{error}</p>}{notice&&<p role="status" className="my-4 rounded-xl border border-cyan-300/20 p-4 text-sm text-cyan-200">{notice}</p>}
 {workspaceId&&customerId&&!profile&&!error&&<p className={s.loading}>Loading profile…</p>}
 {mode==='accounts'&&customerId&&<AccountAccessPanel key={customerId} targetUserId={customerId} onSaved={()=>setRevision(value=>value+1)}/>}
 {mode==='accounts'&&customerId&&<ImpersonatePanel key={`imp-${customerId}`} targetUserId={customerId}/>}
 {mode==='accounts'&&profile&&<CustomerProfile data={profile}/>}
 {mode==='billing'&&<CompanyProfilePanel/>}
 {mode==='billing'&&workspaceId&&<>
 {customerId&&<section className={`${s.panel} mt-5 p-5`}><h2 className="font-semibold">Create Custom Credit Invoice</h2><p className="mt-2 text-xs text-white/45">Terms are stored immutably. Credits do not expire in this version. Bonus credits are included in total credits when calculating value per credit. Creating an invoice does not record payment.</p><form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();submit('create',terms);}}>
 {input('Company name','company',terms,setTerms,'text',{required:true,maxLength:160})}{input('Total price (IDR)','amount',terms,setTerms,'number',{required:true,min:1,max:2000000000,step:1})}
 {input('Purchased credits','credits',terms,setTerms,'number',{required:true,min:1,max:10000000,step:1})}{input('Bonus credits','bonus',terms,setTerms,'number',{required:true,min:0,max:10000000,step:1})}
 <ContractTerms terms={terms} setTerms={setTerms} pricing={pricing}/>{input('Deal notes','notes',terms,setTerms,'text',{maxLength:1000})}<p className="self-center text-sm text-white/60">Value per credit: {Number(terms.credits)+Number(terms.bonus)>0?idr(Number(terms.amount)/(Number(terms.credits)+Number(terms.bonus))):'—'} (rounded display)</p><button disabled={busy} className={s.button}>Create invoice</button></form></section>}
 <section className={`${s.panel} mt-5`}><h2 className="p-4 font-semibold">Workspace Invoices (latest 100)</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Invoice / company</th><th>Total credits</th><th>Price</th><th>Status</th><th>Details</th></tr></thead><tbody>{orders.length?orders.map(o=><tr key={o.id} className="border-t border-white/10"><td>{o.invoice_number}<p className="text-xs text-white/45">{o.company_name}</p></td><td>{credits(Number(o.credits)+Number(o.bonus_credits))}</td><td>{idr(o.amount_idr)}</td><td>{o.status}</td><td><button disabled={busy} className="text-cyan-200" onClick={()=>{setSelected(o);setPayment({reference:o.payment_reference||'',paidAt:'',fee:o.payment_fee_idr??''});setCancelReason('');}}>Open invoice</button></td></tr>):<tr><td colSpan={5}>No invoices yet.</td></tr>}</tbody></table></div></section>
 {selected&&<section className={`${s.panel} mt-5 p-5`}><h2 className="break-all font-semibold">{selected.invoice_number}</h2><p className="mt-2">{selected.company_name} · {selected.status}</p><p className="mt-2 text-sm text-white/60">Purchased {credits(selected.credits)} + bonus {credits(selected.bonus_credits)} credits · {idr(selected.amount_idr)}</p><p className="mt-3 flex flex-wrap gap-3 text-sm">{[['quotation','Quotation'],['invoice','Invoice'],...(selected.status==='completed'?[['receipt','Receipt'],['activation','Activation confirmation']]:[])].map(([doc,label])=><a key={doc} className="text-cyan-200 hover:underline" target="_blank" rel="noopener" href={`/admin/documents/${selected.id}?doc=${doc}`}>{label} ↗</a>)}</p>{selected.profit_percent!=null&&<p className="mt-2 text-sm text-white/60">Profit {Number(selected.profit_percent).toLocaleString('en-US')}% of price ({idr(Number(selected.amount_idr)*Number(selected.profit_percent)/100)}) · base cost {idr(selected.cost_idr_per_credit)} per credit when invoice was created</p>}<p className="mt-2 break-words text-sm text-white/60">{selected.notes||'No notes'}</p>{selected.status==='completed'&&<p className="mt-3 text-sm">Reference: {selected.payment_reference} · Paid {time(selected.paid_at)} UTC · Fee {selected.payment_fee_idr===null?'unknown':idr(selected.payment_fee_idr)}</p>}
 {selected.status==='pending'&&<><form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();submit('settle',{customerId:selected.customer_user_id,orderId:selected.id,...payment,paidAt:new Date(payment.paidAt).toISOString()});}}><p className="text-sm text-white/60 sm:col-span-2">Record only after verifying payment proof. This is manual operator verification, not automatic bank confirmation.</p>{input('Unique transfer / payment reference','reference',payment,setPayment,'text',{required:true,maxLength:160})}{input('Payment time (device timezone)','paidAt',payment,setPayment,'datetime-local',{required:true})}{input('Payment fee IDR (blank = unknown)','fee',payment,setPayment,'number',{min:0,max:selected.amount_idr,step:0.01})}<button disabled={busy} className={`${s.button} self-end`}>Record payment & add credits</button></form><form className="mt-6 flex flex-wrap items-end gap-3" onSubmit={e=>{e.preventDefault();submit('cancel',{customerId:selected.customer_user_id,orderId:selected.id,reason:cancelReason});}}><label className={s.label}>Cancellation reason<input required maxLength={500} className={s.field} value={cancelReason} onChange={e=>setCancelReason(e.target.value)}/></label><button disabled={busy} className="h-10 rounded-lg border border-white/15 px-4 text-sm">Cancel invoice</button></form></>}
 </section>}
 {customerId&&<section className={`${s.panel} mt-5 p-5`}><h2 className="font-semibold">Grant Non-Paid Credits</h2><p className="mt-2 text-xs text-white/45">Added to the shared workspace balance with Rp0 revenue. Use an invoice above for paid purchases.</p><form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();submit('grant',grant);}}>{input('Credit amount','credits',grant,setGrant,'number',{required:true,min:0.000001,max:10000000,step:0.000001})}<label className={s.label}>Type<select className={s.field} value={grant.type} onChange={e=>setGrant(v=>({...v,type:e.target.value}))}>{['trial','bonus','compensation'].map(t=><option key={t} value={t}>{t}</option>)}</select></label>{input('Grant reason','reason',grant,setGrant,'text',{required:true,maxLength:500})}<button disabled={busy} className={`${s.button} self-end`}>Grant credits & log audit</button></form></section>}
 {customerId&&<section className={`${s.panel} mt-5 p-5`}><h2 className="font-semibold">Set Credit Balance</h2><p className="mt-2 text-xs text-white/45">Set workspace balance to a specific value; 0 clears the balance. The delta is logged in the ledger as an admin adjustment and audited. Current balance: {profile?.workspace?credits(profile.workspace.balance):'—'}. Use an invoice above for paid sales.</p><form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();if(!window.confirm(`Set workspace balance to ${adjust.targetBalance} credits?`))return;submit('adjust',adjust);}}>{input('Target balance (credits)','targetBalance',adjust,setAdjust,'number',{required:true,min:0,max:10000000,step:0.000001})}{input('Reason','reason',adjust,setAdjust,'text',{required:true,maxLength:500})}<button disabled={busy} className={`${s.button} self-end sm:col-span-2`}>Set balance & log audit</button></form></section>}
 </>}
 </AdminShell>;
}
