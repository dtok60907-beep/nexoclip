'use client';

import { requestReconciliationGuide } from '../src/lib/providerReconciliationGuide.js';

import { useEffect, useRef, useState } from 'react';
import AdminShell from './AdminShell';
import { adminStyles } from '../src/lib/adminStyles.js';
import { saasFetch } from '../src/lib/saas/api.js';

const endpoint = '/api/admin/provider-billing';
const environmentLabel = {development:'Development',production:'Production',unclassified:'Unclassified'};
const maxFileBytes = 2 * 1024 * 1024;
const number = value => value === null || value === undefined ? 'Unknown' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(Number(value));
const usd = value => value === null || value === undefined ? 'Unknown' : `US$ ${number(value)}`;
const date = value => value ? new Date(value).toLocaleString('en-US', { timeZone: 'Asia/Singapore', dateStyle: 'medium', timeStyle: 'short' }) : '—';
const secondaryButton = 'inline-flex min-h-10 items-center justify-center rounded-lg border border-white/15 px-3 text-sm text-white/70 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-35';
const notice = 'rounded-xl border border-amber-300/25 bg-amber-300/5 p-4 text-sm leading-6 text-amber-100';

function Stat({ label, value, detail }) {
  return <div className={adminStyles.card}><p className={adminStyles.cardLabel}>{label}</p><p className={adminStyles.cardValue}>{value}</p>{detail && <p className="mt-2 text-xs leading-5 text-white/45">{detail}</p>}</div>;
}

function Warnings({ warnings = [] }) {
  return warnings.length > 0 && <div className={notice}><p className="font-semibold">Attention required</p><ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">{warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>;
}

function SkuTable({ groups = [] }) {
  const rate = value => value == null ? 'Unknown' : `US$ ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 12 }).format(Number(value))}`;
  return <section className={adminStyles.panel}>
    <h3 className="border-b border-white/10 px-4 py-3 text-sm font-semibold">Billing Breakdown by SKU</h3>
    <p className="px-4 py-3 text-xs leading-5 text-white/50">Effective rate = pre-tax bill ÷ total usage for the same SKU and unit. This is an export-period average including discounts and package quotas. Package purchase costs are excluded; this is not a catalog rate or final COGS.</p>
    <div className="overflow-x-auto"><table className="w-full min-w-[1150px] text-left text-sm"><thead className="bg-white/[.02] text-xs text-white/45"><tr><th>Configuration / SKU</th><th>Billing unit</th><th>Total usage</th><th>Package usage</th><th>Non-package usage</th><th>Pre-tax (USD)</th><th>Effective rate / usage unit</th><th>Rate basis</th><th>Billed (USD)</th></tr></thead><tbody>{groups.length ? groups.map((row, index) => <tr key={index} className="border-t border-white/10"><td className="max-w-[320px] break-words">{row.configuration}</td><td>{row.billing_unit || '—'}</td><td className="tabular-nums">{number(row.usage)} <span className="text-xs text-white/45">{row.usage_unit}</span></td><td className="tabular-nums">{number(row.package_usage)}</td><td className="tabular-nums">{number(row.non_package_usage)}</td><td className="tabular-nums">{usd(row.pre_tax_usd)}</td><td className="tabular-nums">{rate(row.effective_rate_usd)} <span className="text-xs text-white/45">/ {row.usage_unit}</span></td><td className="text-xs text-white/60">{row.rate_status === 'payg_observed' ? 'Observed PAYG' : row.rate_status === 'package_or_plan' ? 'Mixed package / plan' : row.rate_status === 'no_usage' ? 'No usage' : 'Unknown'}</td><td className="tabular-nums">{usd(row.total_usd)}</td></tr>) : <tr><td colSpan="9" className="text-center text-white/45">No billing details yet.</td></tr>}</tbody></table></div>
  </section>;
}

function Period({ start, end }) {
  return <p className="text-xs leading-5 text-white/50">Usage period: {date(start)} — {date(end)} (end exclusive). All times in Asia/Singapore, UTC+8.</p>;
}

function SkuMappingForm({ group, models, disabled, onSave }) {
  const [model,setModel]=useState(group.mapping?.model || '');
  const [note,setNote]=useState('');
  return <form className="space-y-3 border-t border-white/10 p-4" onSubmit={event=>{event.preventDefault();onSave(group,model || null,note.trim());}}>
    <p className="break-words text-sm font-medium">{group.configuration}</p>
    <p className="text-xs text-white/45">{group.billing_unit} · {group.usage_unit} · {group.mapping?.model ? `Mapped: ${group.mapping.model}` : 'Unmapped'}</p>
    <label className={adminStyles.label}>NexoClip model<select disabled={disabled} value={model} onChange={event=>setModel(event.target.value)} className={adminStyles.field}><option value="">Unmapped / remove link</option>{models.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
    <label className={adminStyles.label}>Mapping reason<input required minLength={10} maxLength={2000} disabled={disabled} value={note} onChange={event=>setNote(event.target.value)} className={adminStyles.field} placeholder="Basis for matching this SKU to the model"/></label>
    <button disabled={disabled || note.trim().length<10 || model===(group.mapping?.model || '')} className={secondaryButton}>Save mapping</button>
  </form>;
}

export function ProviderBillingMappings({ data, disabled, onSave }) {
  return <section id="provider-sku-mapping" tabIndex={-1} style={{scrollMarginTop:96}} className={adminStyles.panel}><h3 className="border-b border-white/10 px-4 py-3 text-sm font-semibold">SKU to Model Mapping</h3>
    <p className="p-4 text-xs leading-5 text-white/50">Select a model based on BytePlus configuration evidence. Mapping applies only to this bill; provider accounts and per-job requests still need reconciliation. Mapping does not allocate costs, change selling rates, or deduct credits.</p>
    {(data.groups || []).map(group=><SkuMappingForm key={`${group.groupKey}:${group.mapping?.id || ''}`} group={group} models={data.modelOptions || []} disabled={disabled} onSave={onSave}/>)}
    {!!data.mappings?.length && <div className="border-t border-white/10 p-4"><h4 className="text-sm font-semibold">Mapping history</h4><ul className="mt-3 space-y-3">{data.mappings.map(row=><li key={row.id} className="text-xs text-white/60"><p className="break-words">{row.configuration} · {row.model || 'Link removed'} · {date(row.created_at)} (UTC+8)</p><p className="mt-1 whitespace-pre-wrap break-words">{row.note}</p></li>)}</ul></div>}
  </section>;
}

export function ProviderBillingModelSummary({ summary }) {
  if (!summary) return null;
  const status={no_mapped_sku:'No mapped SKU',no_app_requests:'No app requests',unknown_request_costs:'Incomplete request costs',comparison_only:'Comparison only; unreconciled'};
  return <section className={adminStyles.panel}>
    <h3 className="border-b border-white/10 px-4 py-3 text-sm font-semibold">Billing Summary by Model</h3>
    <div className="grid gap-4 p-4 sm:grid-cols-3"><Stat label="Mapped SKUs" value={`${number(summary.mappedSkuCount)} / ${number(summary.totalSkuCount)}`}/><Stat label="Mapped pre-tax cost" value={usd(summary.mappedPreTaxUsd)} detail="Grouped by admin model mapping"/><Stat label="Unmapped pre-tax cost" value={usd(summary.unmappedPreTaxUsd)} detail={`${number(summary.unmappedSkuCount)} SKUs need review`}/></div>
    <p className="px-4 pb-4 text-xs leading-5 text-white/50">Grouped by SKU mappings on this bill. Usage comparison covers all platform BytePlus accounts; accounts and requests are not yet matched. Variances are not job cost allocations or customer profit. Models without requests or SKUs are shown as unknown, not zero cost.</p>
    <div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-white/[.02] text-xs text-white/45"><tr><th>Model</th><th>SKUs</th><th>Pre-tax billed</th><th>App requests</th><th>Known request cost</th><th>Comparison variance</th><th>Completeness</th></tr></thead><tbody>{summary.rows.length ? summary.rows.map(row=><tr key={row.model} className="border-t border-white/10"><td className="max-w-[280px] break-words">{row.model}</td><td>{number(row.skuCount)}</td><td>{usd(row.billedPreTaxUsd)}</td><td>{number(row.requestCount)}</td><td>{usd(row.knownRequestCostUsd)}</td><td>{usd(row.differenceUsd)}</td><td className="text-xs leading-5 text-white/60">{status[row.status]}{row.unknownRequests>0 && <p>{number(row.unknownRequests)} requests with unknown cost</p>}{row.hasPackageOrPlan && <p>Package / plan purchase cost excluded</p>}</td></tr>) : <tr><td colSpan="7" className="text-center text-white/45">No mapped SKUs or app requests in this period.</td></tr>}</tbody></table></div>
  </section>;
}

export function ProviderRequestGuidance({request}) {
  const guide=requestReconciliationGuide(request);
  if(guide.status==='unavailable')return <p className="text-white/45">Prerequisites not checked. Reload bill details.</p>;
  if(guide.status==='recorded')return <div><p className="text-cyan-200">Already reconciled. Changes require new evidence and a correction reason.</p><p className="mt-2 text-white/50">Choose the form matching the original cost source.</p>{guide.corrections.map(action=><a key={action.href} href={action.href} className="mt-2 block text-cyan-200 hover:underline">{action.label} →</a>)}</div>;
  return <div className="space-y-3">{guide.paths.map(path=><div key={path.mode}><p className="font-semibold">{path.label}</p>{path.ready ? <><p className="mt-1 text-cyan-200">Prerequisites met; cost and evidence must still be verified on save.</p><p className="mt-1 text-white/60">{path.evidence}</p><a href={path.href} className="mt-2 block text-cyan-200 hover:underline">Open reconciliation form →</a></> : <><p className="mt-1 text-white/50">Complete these prerequisites for this path:</p><ul className="mt-2 list-disc space-y-2 pl-4 text-amber-100">{path.blockers.map(reason=><li key={reason.code}>{reason.message}{reason.href && <a href={reason.href} className="mt-1 block text-cyan-200 hover:underline">{reason.label} →</a>}</li>)}</ul>{!path.blockers.length && <p className="mt-1 text-white/45">Prerequisites for this path have not been checked.</p>}</>}</div>)}</div>;
}

export function ProviderReconciliationGuide() {
  return <section className={`${adminStyles.panel} p-4`} aria-label="Cost reconciliation guide"><h3 className="font-semibold">Steps to Complete Job Costing</h3><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-white/65"><li>Verify provider account, environment, request ID, and dispatch time. The bill must match the request.</li><li><a href="#provider-sku-mapping" className="text-cyan-200 hover:underline">Map SKUs to models</a> using BytePlus evidence.</li><li><a href="#provider-payment-evidence" className="text-cyan-200 hover:underline">Record payment or package purchase evidence</a> to establish cost and exchange rate.</li><li>For packages, <a href="#provider-package-allocation" className="text-cyan-200 hover:underline">check purchase allocation and remaining quota</a>. Reconcile cost or usage per request via the available paths in the table below.</li><li>After saving, return to Economics and review remaining requests, revenue, and incomplete customer payment fees.</li></ol><p className="mt-3 text-xs leading-5 text-amber-100">Do not divide invoice totals by guesswork. Failed jobs also require provider cost evidence; never assume zero cost. This guide does not mean COGS or margins are final.</p></section>;
}

export function ProviderBillingRequests({ inventory,onPage,onSearch,disabled }) {
  const [search,setSearch]=useState(inventory?.search || '');
  const [status,setStatus]=useState(inventory?.status || 'all');
  if (!inventory) return null;
  const statuses={unreconciled:'Unreconciled',reconciled:'Reconciled (no corrections)',corrected:'Corrected'};
  const match={matching:'Matching account',unknown:'Unknown account',other:'Other account'};
  const source={reported:'Provider reported',calculated:'Calculated from usage',unknown:'Unknown'};
  return <section className={adminStyles.panel}><h3 className="border-b border-white/10 px-4 py-3 text-sm font-semibold">BytePlus Requests by Job</h3>
    <p className="p-4 text-xs leading-5 text-white/50">Requests within the bill usage window, based on dispatch time. Each row is the latest observation for a request; a single job may have multiple requests. Recorded cost does not guarantee a match to an invoice line.</p>
    {inventory.pagination && <form className="flex flex-wrap items-end gap-3 px-4 pb-4" onSubmit={event=>{event.preventDefault();onSearch?.(search.trim(),status);}}><label className={`${adminStyles.label} min-w-0 flex-1`}>Search request, job, workspace, model, or account<input maxLength={128} disabled={disabled} className={adminStyles.field} value={search} onChange={event=>setSearch(event.target.value)} placeholder="Request ID or model"/></label><label className={adminStyles.label}>Reconciliation status<select disabled={disabled} className={adminStyles.field} value={status} onChange={event=>setStatus(event.target.value)}><option value="all">All statuses</option><option value="unreconciled">Unreconciled</option><option value="reconciled">Reconciled (no corrections)</option><option value="corrected">Corrected</option></select></label><button disabled={disabled} className={secondaryButton}>Apply filters</button><button type="button" disabled={disabled || (!inventory.search && (!inventory.status || inventory.status==='all'))} className={secondaryButton} onClick={()=>{setSearch('');setStatus('all');onSearch?.('','all');}}>Reset filters</button></form>}
    {inventory.statusCounts && <p className="px-4 pb-4 text-xs leading-5 text-white/50">Statuses in search results: unreconciled {number(inventory.statusCounts.unreconciled)} · reconciled {number(inventory.statusCounts.reconciled)} · corrected {number(inventory.statusCounts.corrected)}. Status reflects reconciliation history on this bill, including zero-cost entries.</p>}
    {inventory.truncated && <p role="status" className="px-4 pb-4 text-xs text-amber-100">Showing latest {inventory.limit} requests. This list does not include all requests; cost summaries above still cover the full period.</p>}
    <div className="overflow-x-auto"><table className="w-full min-w-[1200px] text-left text-sm"><thead className="bg-white/[.02] text-xs text-white/45"><tr><th>Job / workspace</th><th>Model</th><th>Request ID</th><th>Provider account</th><th>Time (UTC+8)</th><th>Event</th><th>Cost (USD)</th><th>Cost source</th><th>Reconciliation</th><th>Prerequisites</th></tr></thead><tbody>{inventory.rows.length ? inventory.rows.map(row=><tr key={row.observation_id} className="border-t border-white/10"><td className="max-w-[280px] break-all text-xs"><p>{row.generation_job_id}</p><p className="mt-1 text-white/45">Workspace: {row.workspace_id}</p></td><td className="max-w-[240px] break-words text-xs">{row.model}</td><td className="max-w-[240px] break-all text-xs">{row.provider_request_id || 'Not available'}{!row.provider_request_id && <p className="mt-1 text-white/40">Dispatch: {row.dispatch_id}</p>}</td><td className="text-xs"><p>{row.provider_account_id || 'Unknown'}</p><p className="mt-1 text-white/45">{match[row.account_match]}</p></td><td className="text-xs">{date(row.request_time)}{row.time_is_fallback && <p className="mt-1 text-amber-100">Recorded date; dispatch unavailable</p>}</td><td className="text-xs">{row.event_type}</td><td>{usd(row.cost_usd)}</td><td className="text-xs">{source[row.cost_source] || 'Unknown'}</td><td className="text-xs">{statuses[row.reconciliation_status] || 'Unreconciled'}</td><td className="min-w-[260px] max-w-[360px] text-xs leading-5"><ProviderRequestGuidance request={row}/></td></tr>) : <tr><td colSpan="10" className="text-center text-white/45">No requests match the filters for this billing period.</td></tr>}</tbody></table></div>
    {inventory.pagination && <nav aria-label="Provider requests pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 p-4 text-xs text-white/60"><p>Page {inventory.pagination.page} / {inventory.pagination.totalPages} · {number(inventory.pagination.total)} requests{inventory.search && ` matching “${inventory.search}”`}. Cost summaries still cover the full period.</p><div className="flex gap-2"><button type="button" className={secondaryButton} disabled={disabled || inventory.pagination.page<=1} onClick={()=>onPage?.(inventory.pagination.page-1)}>Previous requests</button><button type="button" className={secondaryButton} disabled={disabled || inventory.pagination.page>=inventory.pagination.totalPages} onClick={()=>onPage?.(inventory.pagination.page+1)}>Next requests</button></div></nav>}
  </section>;
}

export function ProviderPaymentEvidence({ data, disabled,onSave }) {
  const [kind,setKind]=useState('invoice_payment');
  const [amountUsd,setUsd]=useState('');const [amountIdr,setIdr]=useState('');
  const [paidDate,setDate]=useState('');const [reference,setReference]=useState('');const [note,setNote]=useState('');
  const rows=data.paymentEvidence || [];
  return <section id="provider-payment-evidence" tabIndex={-1} style={{scrollMarginTop:96}} className={`${adminStyles.panel} p-4`}><h3 className="font-semibold">Provider Payments & Package Purchases</h3><p className="mt-2 text-xs leading-5 text-white/50">Enter values matching payment proof. Effective FX = IDR paid ÷ USD amount. This record does not allocate costs to jobs or change COGS yet. For package purchases, include package name, validity period, and quota in the notes.</p>
    <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={event=>{event.preventDefault();onSave({kind,amountUsd,amountIdr,paidAt:`${paidDate}T00:00:00.000Z`,reference,note});}}>
      <label className={adminStyles.label}>Type<select disabled={disabled} className={adminStyles.field} value={kind} onChange={event=>setKind(event.target.value)}><option value="invoice_payment">Invoice payment</option><option value="package_purchase">Package / savings plan purchase</option></select></label>
      <label className={adminStyles.label}>Payment date (UTC)<input required type="date" disabled={disabled} className={adminStyles.field} value={paidDate} onChange={event=>setDate(event.target.value)}/></label>
      <label className={adminStyles.label}>USD amount<input required type="number" min="0.00000001" step="0.00000001" disabled={disabled} className={adminStyles.field} value={amountUsd} onChange={event=>setUsd(event.target.value)}/></label>
      <label className={adminStyles.label}>IDR paid<input required type="number" min="0.01" step="0.01" disabled={disabled} className={adminStyles.field} value={amountIdr} onChange={event=>setIdr(event.target.value)}/></label>
      <label className={adminStyles.label}>Receipt / transaction reference<input required minLength={3} maxLength={160} disabled={disabled} className={adminStyles.field} value={reference} onChange={event=>setReference(event.target.value)}/></label>
      <label className={adminStyles.label}>Evidence notes<input required minLength={10} maxLength={2000} disabled={disabled} className={adminStyles.field} value={note} onChange={event=>setNote(event.target.value)}/></label>
      <button className={secondaryButton} disabled={disabled || !['development','production'].includes(data.bill.environment)}>Save payment evidence</button>
    </form>
    {!['development','production'].includes(data.bill.environment) && <p className="mt-3 text-xs text-amber-100">Bill environment must be classified before recording payments.</p>}
    <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead><tr><th>Type / reference</th><th>USD</th><th>IDR paid</th><th>Effective FX</th><th>Date (UTC+8)</th><th>Notes</th></tr></thead><tbody>{rows.length ? rows.map(row=><tr key={row.id} className="border-t border-white/10"><td>{row.kind==='invoice_payment'?'Invoice payment':'Package / savings plan'}<p className="text-xs text-white/45">{row.reference}</p></td><td>{usd(row.amount_usd)}</td><td>Rp {number(row.amount_idr)}</td><td>Rp {number(row.effectiveFx)} / USD</td><td className="text-xs">{date(row.paid_at)}</td><td className="max-w-[280px] whitespace-pre-wrap break-words text-xs">{row.note}</td></tr>) : <tr><td colSpan="6" className="text-center text-white/45">No payment or package purchase evidence yet.</td></tr>}</tbody></table></div>
  </section>;
}

export function ProviderPackageAllocation({data,disabled,onSave}) {
  const sources=(data.paymentEvidence || []).filter(row=>row.kind==='package_purchase');
  const groups=(data.groups || []).filter(row=>Number(row.package_usage)>0);
  const [paymentId,setPayment]=useState('');const [groupKey,setGroup]=useState('');
  const [totalQuota,setTotal]=useState('');const [consumedQuota,setUsed]=useState('');const [note,setNote]=useState('');
  const group=groups.find(row=>row.groupKey===groupKey);
  return <section id="provider-package-allocation" tabIndex={-1} style={{scrollMarginTop:96}} className={`${adminStyles.panel} p-4`}><h3 className="font-semibold">Package Cost Allocation by SKU</h3><p className="mt-2 text-xs leading-5 text-white/50">Cost is allocated proportionally: purchase cost × allocated usage ÷ total quota. Enter quotas in the SKU usage unit per package proof. One allocation per purchase and SKU on this bill; history cannot be overwritten. Per-job costs do not change yet.</p>
    <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={event=>{event.preventDefault();onSave({paymentId,groupKey,totalQuota,consumedQuota,note});}}>
      <label className={adminStyles.label}>Package purchase evidence<select required disabled={disabled} className={adminStyles.field} value={paymentId} onChange={event=>setPayment(event.target.value)}><option value="">Select purchase</option>{sources.map(row=><option key={row.id} value={row.id}>{row.reference} · {usd(row.amount_usd)}</option>)}</select></label>
      <label className={adminStyles.label}>SKU with package usage<select required disabled={disabled} className={adminStyles.field} value={groupKey} onChange={event=>setGroup(event.target.value)}><option value="">Select SKU</option>{groups.map(row=><option key={row.groupKey} value={row.groupKey}>{row.configuration} · {row.usage_unit}</option>)}</select></label>
      <label className={adminStyles.label}>Total package quota ({group?.usage_unit || 'select SKU'})<input required type="number" min="0.000000000001" step="any" disabled={disabled} className={adminStyles.field} value={totalQuota} onChange={event=>setTotal(event.target.value)}/></label>
      <label className={adminStyles.label}>Allocated usage ({group?.usage_unit || 'select SKU'})<input required type="number" min="0.000000000001" step="any" disabled={disabled} className={adminStyles.field} value={consumedQuota} onChange={event=>setUsed(event.target.value)}/></label>
      <label className={adminStyles.label}>Quota & allocation basis<input required minLength={10} maxLength={2000} disabled={disabled} className={adminStyles.field} value={note} onChange={event=>setNote(event.target.value)}/></label>
      <button className={secondaryButton} disabled={disabled || !paymentId || !groupKey || !['development','production'].includes(data.bill.environment)}>Save package allocation</button>
    </form>
    {(!sources.length || !groups.length) && <p className="mt-3 text-xs text-amber-100">Requires package purchase evidence and an SKU with package usage on this bill.</p>}
    <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead><tr><th>Purchase / SKU</th><th>Usage / quota</th><th>Cost USD</th><th>Cost IDR</th><th>Notes</th></tr></thead><tbody>{(data.packageAllocations || []).map(row=><tr key={row.id} className="border-t border-white/10"><td>{sources.find(source=>source.id===row.payment_evidence_id)?.reference}<p className="text-xs text-white/45">{groups.find(sku=>sku.groupKey===row.group_key)?.configuration}</p></td><td>{row.consumed_quota} / {row.total_quota} {row.usage_unit}</td><td>{usd(row.allocated_usd)}</td><td>Rp {number(row.allocated_idr)}</td><td className="max-w-[280px] whitespace-pre-wrap break-words text-xs">{row.note}</td></tr>)}</tbody></table>{!data.packageAllocations?.length && <p className="py-3 text-sm text-white/45">No package allocations yet.</p>}</div>
  </section>;
}

export function ProviderPackageRequestAllocation({data,disabled,onSave}) {
  const requests=(data.requestInventory?.rows || []).filter(row=>row.packageReadiness?.canReconcile);
  const [observationId,setRequest]=useState('');const [allocationId,setAllocation]=useState('');
  const [consumedQuota,setQuota]=useState('');const [evidenceReference,setReference]=useState('');const [note,setNote]=useState('');
  const selected=requests.find(row=>row.observation_id===observationId);
  const allocations=(data.packageAllocations || []).filter(row=>selected?.packageReadiness.eligibleGroupKeys.includes(row.group_key) && Number(row.remainingQuota)>0);
  const source=allocations.find(row=>row.id===allocationId);
  return <section id="provider-package-request" tabIndex={-1} style={{scrollMarginTop:96}} className={`${adminStyles.panel} p-4`}><h3 className="font-semibold">Allocate Package Cost to Job</h3>
    <p className="mt-2 text-xs leading-5 text-white/50">Enter package usage for this request per BytePlus evidence, in the SKU allocation unit. USD and IDR costs are calculated proportionally from the SKU package allocation. Remaining usage stays unallocated. Saving updates job cost in Economics without affecting customer credits.</p>
    <p className="mt-2 text-xs text-amber-100">Initial allocation is once per request. Usage changes use the correction form with audit history. Savings plans are not yet supported.</p>
    <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={event=>{event.preventDefault();onSave({observationId,allocationId,consumedQuota,evidenceReference,note});}}>
      <label className={adminStyles.label}>Request using package<select required disabled={disabled} className={adminStyles.field} value={observationId} onChange={event=>{setRequest(event.target.value);setAllocation('');setQuota('');setReference('');setNote('');}}><option value="">Select request</option>{requests.map(row=><option key={row.observation_id} value={row.observation_id}>{row.provider_request_id} · {row.model} · {row.generation_job_id}</option>)}</select></label>
      <label className={adminStyles.label}>Package purchase / SKU allocation<select required disabled={disabled || !selected} className={adminStyles.field} value={allocationId} onChange={event=>{setAllocation(event.target.value);setQuota('');}}><option value="">Select allocation</option>{allocations.map(row=><option key={row.id} value={row.id}>{data.paymentEvidence?.find(payment=>payment.id===row.payment_evidence_id)?.reference} · {data.groups?.find(group=>group.groupKey===row.group_key)?.configuration} · remaining {row.remainingQuota} {row.usage_unit}</option>)}</select></label>
      <label className={adminStyles.label}>Package usage per request {source ? `(${source.usage_unit})` : ''}<input required type="number" min="0.000000000001" step="0.000000000001" max={source?.remainingQuota} disabled={disabled || !source} className={adminStyles.field} value={consumedQuota} onChange={event=>setQuota(event.target.value)}/></label>
      <label className={adminStyles.label}>Per-request usage evidence reference<input required minLength={3} maxLength={160} disabled={disabled} className={adminStyles.field} value={evidenceReference} onChange={event=>setReference(event.target.value)}/></label>
      <label className={`${adminStyles.label} sm:col-span-2`}>Evidence notes<input required minLength={10} maxLength={2000} disabled={disabled} className={adminStyles.field} value={note} onChange={event=>setNote(event.target.value)}/></label>
      <label className="flex items-start gap-2 text-xs leading-5 text-white/60 sm:col-span-2"><input key={`${observationId}:${allocationId}`} required type="checkbox" disabled={disabled}/>I verify that this request used the selected package and the usage matches provider evidence.</label>
      <button className={secondaryButton} disabled={disabled || !selected || !source}>Save package cost allocation to job</button>
    </form>
    {!requests.length && <p className="mt-3 text-xs text-white/50">No requests meet package allocation prerequisites on this page. Check model mapping, purchase evidence, SKU allocation, account, environment, and dispatch period.</p>}
    <div className="mt-4 space-y-2">{(data.requestReconciliations || []).filter(row=>row.package_allocation_id).map(row=><div key={row.id} className="border-t border-white/10 pt-2 text-xs"><p className="break-all">{row.provider_request_id} · {row.generation_job_id}</p><p>{row.package_consumed_quota} usage · {usd(row.cost_usd)} · Rp {number(row.cost_idr)}</p><p className="break-words text-white/50">{row.evidence_reference} · {row.note}</p></div>)}</div>
  </section>;
}

function PackageCorrectionForm({row,disabled,onSave}) {
  const [consumedQuota,setQuota]=useState(row.package_consumed_quota);const [evidenceReference,setReference]=useState('');const [note,setNote]=useState('');
  return <details className="border-t border-white/10 p-4"><summary className="cursor-pointer text-sm">{row.provider_request_id} · usage {row.package_consumed_quota} · {usd(row.cost_usd)} · Rp {number(row.cost_idr)}</summary>
    <p className="mt-2 text-xs text-white/50">Original usage {row.original_package_consumed_quota}; original cost {usd(row.original_cost_usd)} / Rp {number(row.original_cost_idr)}. Package purchase and SKU follow the initial allocation.</p>
    <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={event=>{event.preventDefault();onSave({reconciliationId:row.id,previousCostEventId:row.current_cost_event_id,consumedQuota,evidenceReference,note});}}>
      <label className={adminStyles.label}>New package usage<input required type="number" min="0" step="0.000000000001" disabled={disabled} className={adminStyles.field} value={consumedQuota} onChange={event=>setQuota(event.target.value)}/></label>
      <label className={adminStyles.label}>Correction evidence reference<input required minLength={3} maxLength={160} disabled={disabled} className={adminStyles.field} value={evidenceReference} onChange={event=>setReference(event.target.value)}/></label>
      <label className={`${adminStyles.label} sm:col-span-2`}>Correction reason<textarea required minLength={10} maxLength={2000} disabled={disabled} rows={2} className={`${adminStyles.field} h-auto py-3`} value={note} onChange={event=>setNote(event.target.value)}/></label>
      <label className="flex items-start gap-2 text-xs text-white/60 sm:col-span-2"><input required type="checkbox" disabled={disabled}/>I verified the new usage against provider evidence and approve recalculating this request’s cost.</label>
      <button className={secondaryButton} disabled={disabled}>Save package usage correction</button>
    </form>
  </details>;
}
export function ProviderPackageRequestCorrections({data,disabled,onSave}) {
  const rows=(data.requestReconciliations || []).filter(row=>row.package_allocation_id);
  const history=(data.requestCorrectionHistory || []).filter(row=>row.package_allocation_id);
  return <section id="provider-package-corrections" tabIndex={-1} style={{scrollMarginTop:96}} className={adminStyles.panel}><h3 className="p-4 font-semibold">Package Allocation Corrections & Audit History</h3><p className="px-4 pb-4 text-xs leading-5 text-white/50">New usage replaces prior usage for this request. The system checks remaining quota and recalculates USD/IDR cost from the purchase allocation. Other requests remain unchanged. Setting usage to 0 cancels the request cost allocation and returns available quota. Customer credit balances remain unchanged.</p>
    {rows.map(row=><PackageCorrectionForm key={`${row.id}:${row.current_cost_event_id}`} row={row} disabled={disabled} onSave={onSave}/>)}
    {!rows.length && <p className="px-4 pb-4 text-xs text-white/50">No per-request package allocations yet.</p>}
    {history.map(row=><div key={row.id} className="border-t border-white/10 p-4 text-xs"><p className="break-all">{row.provider_request_id} · {row.previous_package_consumed_quota} → {row.package_consumed_quota}</p><p>{usd(row.previous_cost_usd)} → {usd(row.cost_usd)} · Rp {number(row.previous_cost_idr)} → Rp {number(row.cost_idr)}</p><p className="break-words text-white/50">{row.evidence_reference} · {row.note}</p><p className="mt-1 break-all text-white/40">Operator: {row.created_by} · {date(row.created_at)}</p></div>)}
  </section>;
}

export function ProviderRequestReconciliation({data,disabled,onSave}) {
  const payments=(data.paymentEvidence || []).filter(row=>row.kind==='invoice_payment');
  const availableGroups=(data.groups || []).filter(row=>Number(row.package_usage)===0 && Number(row.savings_plan_gross_usd || 0)===0 && row.mapping?.model);
  const requests=(data.requestInventory?.rows || []).filter(row=>row.readiness?.canReconcile===true);
  const [observationId,setRequest]=useState('');const [groupKey,setGroup]=useState('');const [paymentId,setPayment]=useState('');
  const selectedRequest=requests.find(row=>row.observation_id===observationId);
  const groups=selectedRequest ? availableGroups.filter(group=>selectedRequest.readiness.eligibleGroupKeys.includes(group.groupKey)) : [];
  const [costUsd,setCost]=useState('');const [evidenceReference,setReference]=useState('');const [note,setNote]=useState('');
  return <section id="provider-request-reconciliation" tabIndex={-1} style={{scrollMarginTop:96}} className={`${adminStyles.panel} p-4`}><h3 className="font-semibold">Match Provider Cost to Job</h3><p className="mt-2 text-xs leading-5 text-white/50">Use BytePlus cost evidence referencing this request ID. USD amount is the pre-tax request cost; FX rate follows the selected invoice payment evidence. Saving updates job cost in Economics without affecting customer credits. Initial reconciliation is once per provider account + request ID. Later changes use the correction form with audit history.</p><p className="mt-2 text-xs text-amber-100">Currently only non-package SKUs with a model mapping support this reconciliation. Do not estimate by dividing invoice totals.</p>
    <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={event=>{event.preventDefault();onSave({observationId,groupKey,paymentId,costUsd,evidenceReference,note});}}>
      <label className={adminStyles.label}>App request<select required disabled={disabled} className={adminStyles.field} value={observationId} onChange={event=>{setRequest(event.target.value);setGroup('');setCost('');setReference('');setNote('');}}><option value="">Select request</option>{requests.map(row=><option key={row.observation_id} value={row.observation_id}>{row.provider_request_id} · {row.model} · {row.generation_job_id}</option>)}</select></label>
      <label className={adminStyles.label}>Non-package SKU<select required disabled={disabled || !observationId} className={adminStyles.field} value={groupKey} onChange={event=>setGroup(event.target.value)}><option value="">Select SKU</option>{groups.map(row=><option key={row.groupKey} value={row.groupKey}>{row.configuration} · {row.mapping.model}</option>)}</select></label>
      <label className={adminStyles.label}>Payment for FX rate<select required disabled={disabled} className={adminStyles.field} value={paymentId} onChange={event=>setPayment(event.target.value)}><option value="">Select payment</option>{payments.map(row=><option key={row.id} value={row.id}>{row.reference} · Rp {number(row.effectiveFx)} / USD</option>)}</select></label>
      <label className={adminStyles.label}>Pre-tax request cost (USD)<input required type="number" min="0" step="0.00000001" disabled={disabled} className={adminStyles.field} value={costUsd} onChange={event=>setCost(event.target.value)}/></label>
      <label className={adminStyles.label}>Per-request cost evidence reference<input required minLength={3} maxLength={160} disabled={disabled} className={adminStyles.field} value={evidenceReference} onChange={event=>setReference(event.target.value)}/></label>
      <label className={adminStyles.label}>Reconciliation notes<input required minLength={10} maxLength={2000} disabled={disabled} className={adminStyles.field} value={note} onChange={event=>setNote(event.target.value)}/></label>
      <label className="flex items-start gap-2 text-xs leading-5 text-white/60 sm:col-span-2"><input key={observationId} required type="checkbox" disabled={disabled}/>I have verified the request ID, model, and cost against BytePlus evidence.</label>
      <button className={secondaryButton} disabled={disabled || !observationId || !groupKey || !paymentId || !['development','production'].includes(data.bill.environment)}>Save job cost match</button>
    </form>
    {(!requests.length || !payments.length || !availableGroups.length) && <p className="mt-3 text-xs text-amber-100">Requires a request with matching account, period, and environment; a mapped non-package SKU; and invoice payment evidence.</p>}
    {data.requestInventory?.pagination && <p className="mt-3 text-xs text-white/50">Request options follow the search and page above and include only requests with met prerequisites. Check the Prerequisites column to see what data is still missing.</p>}
    {data.requestInventory?.truncated && <p className="mt-3 text-xs text-amber-100">Request options are limited to the latest 100 requests in this billing period.</p>}
    <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead><tr><th>Request / job</th><th>Cost USD</th><th>Cost IDR</th><th>Evidence reference</th><th>Notes</th></tr></thead><tbody>{(data.requestReconciliations || []).map(row=><tr key={row.id} className="border-t border-white/10"><td className="max-w-[280px] break-all text-xs">{row.provider_request_id}<p className="mt-1 text-white/45">{row.generation_job_id}</p></td><td>{usd(row.cost_usd)}</td><td>Rp {number(row.cost_idr)}</td><td className="break-words text-xs">{row.evidence_reference}</td><td className="max-w-[280px] whitespace-pre-wrap break-words text-xs">{row.note}</td></tr>)}</tbody></table>{!data.requestReconciliations?.length && <p className="py-3 text-sm text-white/45">No request costs reconciled yet.</p>}</div>
  </section>;
}

function RequestCostCorrectionForm({row,groups,payments,disabled,onSave}) {
  const [groupKey,setGroup]=useState(row.group_key);const [paymentId,setPayment]=useState(row.payment_evidence_id);
  const [costUsd,setCost]=useState(row.cost_usd);const [evidenceReference,setReference]=useState('');const [note,setNote]=useState('');
  return <details className="border-t border-white/10 p-4"><summary className="cursor-pointer text-sm">Correct {row.provider_request_id} · currently {usd(row.cost_usd)}</summary>
    <p className="mt-3 text-xs leading-5 text-white/50">Job: {row.generation_job_id}. Original value: {usd(row.original_cost_usd)} · evidence: {row.original_evidence_reference}. The new value replaces the effective cost; previous values remain recorded. For a zero-cost correction, include proof that the provider did not bill this request.</p>
    <p className="mt-2 whitespace-pre-wrap break-words text-xs text-white/45">Original notes: {row.original_note}</p>
    <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={event=>{event.preventDefault();onSave({reconciliationId:row.id,previousCostEventId:row.current_cost_event_id,groupKey,paymentId,costUsd,evidenceReference,note});}}>
      <label className={adminStyles.label}>Correct cost SKU<select required disabled={disabled} className={adminStyles.field} value={groupKey} onChange={event=>setGroup(event.target.value)}><option value="">Select SKU</option>{groups.map(group=><option key={group.groupKey} value={group.groupKey}>{group.configuration} · {group.mapping.model}</option>)}</select></label>
      <label className={adminStyles.label}>Payment for FX rate<select required disabled={disabled} className={adminStyles.field} value={paymentId} onChange={event=>setPayment(event.target.value)}><option value="">Select payment</option>{payments.map(payment=><option key={payment.id} value={payment.id}>{payment.reference} · Rp {number(payment.effectiveFx)} / USD</option>)}</select></label>
      <label className={adminStyles.label}>New pre-tax cost (USD)<input required type="number" min="0" step="0.00000001" disabled={disabled} className={adminStyles.field} value={costUsd} onChange={event=>setCost(event.target.value)}/></label>
      <label className={adminStyles.label}>Correction evidence reference<input required minLength={3} maxLength={160} disabled={disabled} className={adminStyles.field} value={evidenceReference} onChange={event=>setReference(event.target.value)}/></label>
      <label className={`${adminStyles.label} sm:col-span-2`}>Correction reason<textarea required minLength={10} maxLength={2000} rows={2} disabled={disabled} className={`${adminStyles.field} h-auto py-3`} value={note} onChange={event=>setNote(event.target.value)}/></label>
      <label className="flex items-start gap-2 text-xs leading-5 text-white/60 sm:col-span-2"><input required type="checkbox" disabled={disabled}/>I have verified the evidence and new value to be used in Economics.</label>
      <button className={secondaryButton} disabled={disabled || !groupKey || !paymentId || !groups.length || !payments.length}>Save cost correction</button>
    </form>
  </details>;
}

export function ProviderRequestCostCorrections({data,disabled,onSave}) {
  const groups=(data.groups || []).filter(row=>Number(row.package_usage)===0 && Number(row.savings_plan_gross_usd || 0)===0 && row.mapping?.model);
  const payments=(data.paymentEvidence || []).filter(row=>row.kind==='invoice_payment');
  const rows=(data.requestReconciliations || []).filter(row=>!row.package_allocation_id);const history=data.requestCorrectionHistory || [];
  return <section id="provider-cost-corrections" tabIndex={-1} style={{scrollMarginTop:96}} className={adminStyles.panel}><h3 className="p-4 font-semibold">Cost Corrections & Audit History</h3><p className="px-4 pb-4 text-xs leading-5 text-white/50">Select a reconciliation to correct. The system checks cost versions so stale pages do not overwrite newer changes. Corrections require evidence and a reason; customer credit balances remain unchanged.</p>
    {rows.map(row=><RequestCostCorrectionForm key={`${row.id}:${row.current_cost_event_id}`} row={row} groups={groups} payments={payments} disabled={disabled} onSave={onSave}/>)}
    {!rows.length && <p className="px-4 pb-4 text-sm text-white/45">No reconciled costs available to correct.</p>}
    <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-sm"><thead><tr><th>Request</th><th>Previous → new USD</th><th>Previous → new IDR</th><th>Evidence & reason</th><th>Operator / time (UTC+8)</th></tr></thead><tbody>{history.map(row=><tr key={row.id} className="border-t border-white/10"><td className="max-w-[220px] break-all text-xs">{row.provider_request_id}</td><td>{usd(row.previous_cost_usd)} → {usd(row.cost_usd)}</td><td>Rp {number(row.previous_cost_idr)} → Rp {number(row.cost_idr)}</td><td className="max-w-[300px] break-words text-xs"><p>{row.evidence_reference}</p><p className="mt-1 whitespace-pre-wrap text-white/50">{row.note}</p></td><td className="break-all text-xs text-white/50">{row.created_by}<p className="mt-1">{date(row.created_at)}</p></td></tr>)}</tbody></table>{!history.length && <p className="p-4 text-sm text-white/45">No cost correction history yet.</p>}</div>
  </section>;
}

export function ProviderBillingPreview({ preview }) {
  const { totals } = preview;
  return <div className="space-y-4"><div><h3 className="font-semibold">Bill Preview</h3><p className="mt-1 text-sm text-white/60">BytePlus · account {preview.providerAccountId} · cycle {preview.billingCycle} · {number(preview.rowCount)} rows</p></div><Period start={preview.periodStart} end={preview.periodEnd}/><div className="grid gap-4 sm:grid-cols-3"><Stat label="Pre-tax bill" value={usd(totals.preTaxUsd)}/><Stat label="Tax" value={usd(totals.taxUsd)}/><Stat label="Total billed" value={usd(totals.totalUsd)} detail="Per values in the CSV file"/></div><Warnings warnings={preview.warnings}/><SkuTable groups={preview.groups}/></div>;
}

export function ProviderBillingDetail({ data,onRequestPage,onRequestSearch,onExport,disabled }) {
  const { bill, groups = [], comparison, reviews = [], warnings = [] } = data;
  const currentReview = reviews.some(review => review.comparison_hash === comparison.hash);
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">{bill.reference}</h2><p className="mt-1 text-xs text-white/50">BytePlus · account {bill.provider_account_id} · cycle {bill.billing_cycle} · {number(bill.row_count)} rows</p></div><span className={`rounded-lg border px-3 py-2 text-xs ${currentReview ? 'border-cyan-300/20 bg-cyan-300/5 text-cyan-100' : 'border-amber-300/20 bg-amber-300/5 text-amber-100'}`}>{data.requestReconciliations?.length ? `${data.requestReconciliations.length} requests reconciled; coverage not final` : currentReview ? 'Reviewed; job allocation unavailable' : reviews.length ? 'Comparison changed; re-review needed' : 'Unreviewed; job allocation unavailable'}</span></div>
    <p className="rounded-lg border border-cyan-300/20 bg-cyan-300/5 p-3 text-sm text-cyan-100">Billing environment: {environmentLabel[bill.environment || 'unclassified']}. {bill.environment==='development' ? 'Development bill; not production cost evidence.' : 'Billing environment does not mean costs have been allocated to jobs.'}</p>
    <Period start={bill.period_start} end={bill.period_end}/>
    <div className="flex flex-wrap items-center gap-3"><button type="button" className={secondaryButton} disabled={disabled || !onExport} onClick={onExport}>Export audit CSV</button><p className="text-xs leading-5 text-white/50">All reconciliations and correction history for this bill, including initial and current values. Export ignores request filters.</p></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Pre-tax bill" value={usd(bill.pre_tax_usd)}/><Stat label="Tax" value={usd(bill.tax_usd)}/><Stat label="Actual total billed" value={usd(bill.total_usd)} detail="Billed total from BytePlus CSV"/><Stat label="Package usage" value={`${number(bill.package_row_count)} rows`} detail="Zero-billed package usage excludes package purchase cost."/></div>
    <dl className="flex flex-wrap gap-x-8 gap-y-3 rounded-xl border border-white/10 px-4 py-3 text-xs"><div><dt className="text-white/45">Gross cost</dt><dd className="mt-1 tabular-nums">{usd(bill.gross_usd)}</dd></div><div><dt className="text-white/45">Discount</dt><dd className="mt-1 tabular-nums">{usd(bill.discount_usd)}</dd></div><div><dt className="text-white/45">Coupon</dt><dd className="mt-1 tabular-nums">{usd(bill.coupon_usd)}</dd></div><div><dt className="text-white/45">Rounding adjustment</dt><dd className="mt-1 tabular-nums">{usd(bill.truncated_usd)}</dd></div></dl>
    <Warnings warnings={warnings}/>
    <SkuTable groups={groups}/>
    <ProviderBillingModelSummary summary={data.modelSummary}/>
    <ProviderReconciliationGuide/>
    <ProviderBillingRequests inventory={data.requestInventory} onPage={onRequestPage} onSearch={onRequestSearch} disabled={disabled}/>
    {data.accountCoverage && <section className={`${adminStyles.panel} p-4`}><h3 className="font-semibold">Billing Account Matching</h3><p className="mt-2 text-xs leading-5 text-white/50">Account identity comes from worker configuration when requests were recorded. Legacy data without account identity is excluded from this account comparison.</p><div className="mt-4 grid gap-4 sm:grid-cols-3"><Stat label="Matching account requests" value={number(data.accountCoverage.matching_account_requests)}/><Stat label="Unknown account" value={number(data.accountCoverage.unidentified_account_requests)}/><Stat label="Other account requests" value={number(data.accountCoverage.other_account_requests)}/></div><p className="mt-3 text-xs text-white/60">{number(data.accountCoverage.missing_request_ids)} matching-account requests are missing a request ID.</p>{data.accountComparison && <div className="mt-4 grid gap-4 sm:grid-cols-2"><Stat label="Matching account request cost" value={usd(data.accountComparison.knownCostUsd)} detail={`${number(data.accountComparison.unknownRequests)} requests with unknown cost`}/><Stat label="Variance vs matching account" value={data.accountCoverage.matching_account_requests>0 ? usd(data.accountComparison.differenceUsd) : 'Unknown'} detail="Account comparison, not actual per-job cost"/></div>}<p className="mt-4 text-xs leading-5 text-amber-100">Allocating costs to jobs requires billing details with request IDs. Aggregate CSVs do not provide that evidence.</p></section>}
    <section className={`${adminStyles.panel} p-4 sm:p-5`}><h3 className="font-semibold">App BytePlus Usage Comparison</h3><p className="mt-2 text-xs leading-5 text-white/50">Includes BytePlus requests recorded in the same period. Values may differ due to account scope, prepaid packages, or requests missing cost data.</p><div className="mt-4 grid gap-4 sm:grid-cols-3"><Stat label="Known usage cost" value={usd(comparison.knownCostUsd)} detail={`${number(comparison.requests)} app requests`}/><Stat label="Unknown cost" value={`${number(comparison.unknownRequests)} requests`}/><Stat label="Pre-tax variance" value={usd(comparison.differenceUsd)} detail="Pre-tax bill minus known usage cost"/></div><div className={`${notice} mt-4`}><p className="font-semibold">Variance is not allocated to jobs or customers</p><p className="mt-1 text-xs leading-5">This CSV is not mapped to app provider accounts or per-job request IDs. This comparison does not determine final COGS or customer profit. Zero-billed package usage also requires package purchase costs.</p></div>{comparison.observedAt && <p className="mt-3 text-xs text-white/40">Usage checked at {date(comparison.observedAt)} (UTC+8).</p>}</section>
    <section className={adminStyles.panel}><h3 className="border-b border-white/10 px-4 py-3 text-sm font-semibold">App Requests by Model</h3><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-white/[.02] text-xs text-white/45"><tr><th>Model</th><th>Requests</th><th>Known cost (USD)</th><th>Unknown cost</th></tr></thead><tbody>{comparison.rows?.length ? comparison.rows.map((row, index) => <tr key={index} className="border-t border-white/10"><td className="max-w-[330px] break-words">{row.model || 'Unknown model'}</td><td className="tabular-nums">{number(row.requests)}</td><td className="tabular-nums">{usd(row.known_cost_usd)}</td><td>{number(row.unknown_requests)} requests</td></tr>) : <tr><td colSpan="4" className="text-center text-white/45">No BytePlus app requests in this period.</td></tr>}</tbody></table></div></section>
    {reviews.length > 0 && <section className={adminStyles.panel}><h3 className="border-b border-white/10 px-4 py-3 text-sm font-semibold">Review History</h3><ul className="divide-y divide-white/10">{reviews.map((review, index) => <li key={index} className="p-4"><p className="whitespace-pre-wrap break-words text-sm text-white/80">{review.note}</p><p className="mt-2 text-xs text-white/40">{date(review.created_at)} (UTC+8) · {review.comparison_hash === comparison.hash ? 'Matches current comparison' : 'Previous comparison version'}</p></li>)}</ul></section>}
  </div>;
}

export function ProviderBillingJobContext({scope,context,error,disabled,onOpen,onClear}) {
  if(!scope)return null;
  return <section className={`${adminStyles.panel} my-6 p-4`}><h2 className="font-semibold">Requests for Job from Economics</h2><p className="mt-2 break-all text-xs text-white/60">Job: {String(scope.jobId)} · Workspace: {String(scope.workspaceId)}</p><p className="mt-2 text-xs text-white/60">Job filter applies to the request list. Cost summaries, correction history, and exports still cover the entire bill.</p>{error ? <p role="alert" className="mt-3 text-red-200">{error}</p> : !context ? <p role="status" className="mt-3">Searching for related bills…</p> : context.invoices.length ? <div className="mt-3 flex flex-wrap gap-2">{context.invoices.map(bill=><button type="button" key={bill.id} disabled={disabled} className={secondaryButton} onClick={()=>onOpen(bill.id)}>Open {bill.reference} · {bill.billing_cycle} · account {bill.provider_account_id}</button>)}</div> : <p className="mt-3 text-sm text-amber-100">No bills match this job’s provider account, dispatch time, and environment. Check dispatch evidence and billing imports; costs are not matched automatically.</p>}<button type="button" disabled={disabled} className={`${secondaryButton} mt-3`} onClick={onClear}>Show all jobs</button></section>;
}

export default function ProviderBillingDashboard({ initialJobScope=null }) {
  const [jobScope,setJobScope]=useState(initialJobScope);
  const [jobContext,setJobContext]=useState(null);
  const [jobError,setJobError]=useState('');
  const [list, setList] = useState(null);
  const [listError, setListError] = useState('');
  const [page, setPage] = useState(1);
  const [environment,setEnvironment]=useState('all');
  const [importEnvironment,setImportEnvironment]=useState('development');
  const [revision, setRevision] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  const [requestPage,setRequestPage]=useState(1);
  const [requestSearch,setRequestSearch]=useState('');
  const [requestStatus,setRequestStatus]=useState('all');
  function openBill(id) {setRequestPage(1);setRequestSearch('');setRequestStatus('all');setSelectedId(id);}
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState('');
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [feedback, setFeedback] = useState(null);
  const generation = useRef(0);
  const fileInput = useRef(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current += 1; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setList(null); setListError('');
    saasFetch(`${endpoint}?page=${page}&environment=${environment}`, { cache: 'no-store' })
      .then(result => { if (!cancelled) setList(result); })
      .catch(error => { if (!cancelled) setListError(error.message); });
    return () => { cancelled = true; };
  }, [page, revision, environment]);

  useEffect(() => {
    let cancelled = false;
    setDetail(null); setDetailError(''); setNote('');
    if (selectedId) {
      saasFetch(`${endpoint}?id=${encodeURIComponent(selectedId)}&requestPage=${requestPage}&requestSearch=${encodeURIComponent(requestSearch)}&requestStatus=${encodeURIComponent(requestStatus)}${jobScope ? '&'+new URLSearchParams(jobScope) : ''}`, { cache: 'no-store' })
        .then(result => { if (!cancelled) setDetail(result); })
        .catch(error => { if (!cancelled) setDetailError(error.message); });
    }
    return () => { cancelled = true; };
  }, [selectedId, revision,requestPage,requestSearch,requestStatus,jobScope]);

  useEffect(()=>{
    let cancelled=false;
    setJobContext(null);setJobError('');
    if(jobScope) {
      saasFetch(`${endpoint}?${new URLSearchParams(jobScope)}`,{cache:'no-store'})
        .then(result=>{if(!cancelled)setJobContext(result);})
        .catch(error=>{if(!cancelled)setJobError(error.message);});
    }
    return ()=>{cancelled=true;};
  },[jobScope,revision]);

  async function chooseFile(event) {
    const file = event.target.files?.[0];
    const ticket = ++generation.current;
    setCsv(''); setFileName(''); setPreviewData(null); setFeedback(null); setReference('');
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv') || file.size > maxFileBytes || !file.size) {
      setFeedback({ error: true, text: 'Select a non-empty BytePlus CSV file, max 2 MB.' });
      event.target.value = '';
      return;
    }
    setBusy('file');
    try {
      const text = await file.text();
      if (mounted.current && ticket === generation.current) { setCsv(text); setFileName(file.name); }
    } catch { if (mounted.current && ticket === generation.current) setFeedback({ error: true, text: 'Unable to read file. Please select the CSV file again.' }); }
    finally { if (mounted.current && ticket === generation.current) setBusy(''); }
  }

  async function post(action, body) {
    return saasFetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
  }

  async function preview(event) {
    event.preventDefault();
    const ticket = ++generation.current;
    setBusy('preview'); setFeedback(null); setPreviewData(null);
    try {
      const result = await post('preview', { csv });
      if (mounted.current && ticket === generation.current) setPreviewData(result);
    } catch (error) { if (mounted.current && ticket === generation.current) setFeedback({ error: true, text: error.message }); }
    finally { if (mounted.current && ticket === generation.current) setBusy(''); }
  }

  async function save(event) {
    event.preventDefault();
    if (!previewData?.preview || busy) return;
    setBusy('import'); setFeedback(null);
    try {
      const result = await post('import', { csv, expectedHash: previewData.preview.fileHash, reference: reference.trim(),environment:importEnvironment });
      if (!mounted.current) return;
      if (fileInput.current) fileInput.current.value = '';
      setPreviewData(null); setCsv(''); setFileName(''); setReference(''); setPage(1); setEnvironment(importEnvironment); openBill(result.id); setRevision(value => value + 1);
      setFeedback({ error: false, text: result.replayed ? 'This bill was already imported. Opening existing details.' : 'Bill saved. Review the usage comparison below.' });
    } catch (error) { if (mounted.current) setFeedback({ error: true, text: error.message }); }
    finally { if (mounted.current) setBusy(''); }
  }

  async function review(event) {
    event.preventDefault();
    if (!detail || busy) return;
    setBusy('review'); setFeedback(null);
    try {
      await post('review', { id: detail.bill.id, note: note.trim(), expectedComparisonHash: detail.comparison.hash });
      if (!mounted.current) return;
      setNote(''); setRevision(value => value + 1);
      setFeedback({ error: false, text: 'Review saved. Variances remain unallocated to jobs or customers.' });
    } catch (error) { if (mounted.current) setFeedback({ error: true, text: error.message }); }
    finally { if (mounted.current) setBusy(''); }
  }

  async function mapSku(group,model,note) {
    if (!detail || busy) return;
    setBusy('mapping');setFeedback(null);
    try {
      await post('map-sku',{id:detail.bill.id,groupKey:group.groupKey,expectedMappingId:group.mapping?.id || '',model,note});
      if (!mounted.current) return;
      setRevision(value=>value+1);
      setFeedback({error:false,text:'Mapping saved. Recheck the comparison before recording a review.'});
    } catch(error) {if(mounted.current)setFeedback({error:true,text:error.message});}
    finally {if(mounted.current)setBusy('');}
  }

  async function savePaymentEvidence(input) {
    if(!detail || busy)return;
    setBusy('payment');setFeedback(null);
    try {await post('payment-evidence',{id:detail.bill.id,...input});if(!mounted.current)return;setRevision(value=>value+1);setFeedback({error:false,text:'Payment evidence saved; job cost allocations are unchanged.'});}
    catch(error){if(mounted.current)setFeedback({error:true,text:error.message});}
    finally{if(mounted.current)setBusy('');}
  }

  async function allocatePackage(input) {
    if(!detail || busy)return;
    setBusy('allocation');setFeedback(null);
    try {await post('allocate-package',{id:detail.bill.id,...input});if(!mounted.current)return;setRevision(value=>value+1);setFeedback({error:false,text:'Package cost allocation by SKU saved. Per-job costs are unchanged.'});}
    catch(error){if(mounted.current)setFeedback({error:true,text:error.message});}
    finally{if(mounted.current)setBusy('');}
  }

  async function allocatePackageRequest(input) {
    if(!detail || busy)return;
    setBusy('package-request');setFeedback(null);
    try {await post('allocate-package-request',{id:detail.bill.id,...input});if(!mounted.current)return;setRevision(value=>value+1);setFeedback({error:false,text:'Package cost allocated to job. Remaining usage stays unallocated.'});}
    catch(error){if(mounted.current)setFeedback({error:true,text:error.message});}
    finally{if(mounted.current)setBusy('');}
  }

  async function correctPackageRequest(input) {
    if(!detail || busy)return;
    setBusy('package-correction');setFeedback(null);
    try {await post('correct-package-request',{id:detail.bill.id,...input});if(!mounted.current)return;setRevision(value=>value+1);setFeedback({error:false,text:'Package usage and cost correction saved with audit history.'});}
    catch(error){if(mounted.current)setFeedback({error:true,text:error.message});}
    finally{if(mounted.current)setBusy('');}
  }

  async function reconcileRequest(input) {
    if(!detail || busy)return;
    setBusy('reconciliation');setFeedback(null);
    try {await post('reconcile-request',{id:detail.bill.id,...input});if(!mounted.current)return;setRevision(value=>value+1);setFeedback({error:false,text:'Request cost matched and recorded on the job. Other bill coverage still requires review.'});}
    catch(error){if(mounted.current)setFeedback({error:true,text:error.message});}
    finally{if(mounted.current)setBusy('');}
  }

  async function correctRequestCost(input) {
    if(!detail || busy)return;
    setBusy('correction');setFeedback(null);
    try {await post('correct-request-cost',{id:detail.bill.id,...input});if(!mounted.current)return;setRevision(value=>value+1);setFeedback({error:false,text:'Cost correction saved. Economics now uses the new value; previous values remain in audit history.'});}
    catch(error){if(mounted.current)setFeedback({error:true,text:error.message});}
    finally{if(mounted.current)setBusy('');}
  }

  async function exportAudit() {
    if(!detail || busy)return;
    setBusy('export');setFeedback(null);
    let url;
    try {
      const response=await fetch(`${endpoint}?id=${encodeURIComponent(detail.bill.id)}&export=reconciliation-csv`,{credentials:'include',cache:'no-store',headers:{accept:'text/csv'}});
      if(!response.ok) {let message='Unable to export audit CSV';try{message=(await response.json()).error || message;}catch{}throw new Error(message);}
      if(!response.headers.get('content-type')?.startsWith('text/csv'))throw new Error('Unable to export audit CSV. Please check your login session.');
      const blob=await response.blob();if(!mounted.current)return;
      url=URL.createObjectURL(blob);
      const link=document.createElement('a');link.href=url;link.download=`byteplus-reconciliation-${detail.bill.id}.csv`;
      document.body.appendChild(link);link.click();link.remove();
      setFeedback({error:false,text:'Audit CSV downloaded: all reconciliations and correction history for this bill.'});
    }catch(error){if(mounted.current)setFeedback({error:true,text:error.message});}
    finally{if(url)setTimeout(()=>URL.revokeObjectURL(url),1000);if(mounted.current)setBusy('');}
  }

  return <AdminShell platform active="/admin/provider-billing" title="Provider Billing" description="Import BytePlus bills and compare them with usage costs recorded in the app.">
    <ProviderBillingJobContext scope={jobScope} context={jobContext} error={jobError} disabled={!!busy} onOpen={openBill} onClear={()=>{setJobScope(null);setRequestPage(1);}}/>
    {feedback && <p role={feedback.error ? 'alert' : 'status'} className={feedback.error ? adminStyles.error : 'my-6 rounded-xl border border-cyan-300/25 bg-cyan-300/5 p-4 text-sm text-cyan-100'}>{feedback.text}</p>}
    <section className={`${adminStyles.panel} my-6 p-4 sm:p-5`}><h2 className="font-semibold">Import BytePlus Bill</h2><p className="mt-2 text-xs leading-5 text-white/50">Use the billing details CSV export. Inspect the preview before saving billing evidence.</p><form onSubmit={preview} className="mt-4 flex flex-wrap items-end gap-3"><label className={`${adminStyles.label} min-w-0 flex-1`}>Billing details file (max 2 MB)<input ref={fileInput} type="file" accept=".csv,text/csv" disabled={!!busy} onChange={chooseFile} className="block w-full min-w-0 rounded-lg border border-white/15 bg-[#101114] p-2 text-xs text-white/60 file:mr-3 file:rounded file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-xs file:text-white"/>{fileName && <span className="break-all text-white/40">{fileName}</span>}</label><button className={adminStyles.button} disabled={!csv || !!busy}>{busy === 'file' ? 'Reading file…' : busy === 'preview' ? 'Inspecting…' : 'Inspect CSV'}</button></form>
      {previewData && <div className="mt-6 space-y-5 border-t border-white/10 pt-5"><ProviderBillingPreview preview={previewData.preview}/>{previewData.duplicateId ? <div className="flex flex-wrap items-center gap-4 rounded-lg border border-cyan-300/20 bg-cyan-300/5 p-4"><p className="text-sm text-cyan-100">This file has already been imported.</p><button type="button" disabled={!!busy} className={secondaryButton} onClick={() => { openBill(previewData.duplicateId); setPreviewData(null); setFeedback(null); }}>Open saved bill</button></div> : <form onSubmit={save} className="flex flex-wrap items-end gap-3"><label className={adminStyles.label}>Environment<select disabled={!!busy} value={importEnvironment} onChange={event=>setImportEnvironment(event.target.value)} className={adminStyles.field}><option value="development">Development</option><option value="production">Production (account must match)</option></select></label><label className={`${adminStyles.label} flex-1`}>Bill reference<input required minLength={3} maxLength={160} disabled={!!busy} value={reference} onChange={event => setReference(event.target.value)} placeholder="e.g. BytePlus October 2026" className={adminStyles.field}/></label><button className={adminStyles.button} disabled={!!busy || reference.trim().length < 3}>{busy === 'import' ? 'Saving…' : 'Save bill'}</button></form>}</div>}
    </section>
    <section id="provider-billing-imports" tabIndex={-1} style={{scrollMarginTop:96}} className={`${adminStyles.panel} mb-6`}><div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3"><h2 className="text-sm font-semibold">Saved Bills</h2><label className="text-xs text-white/60">Billing environment<select aria-label="Billing environment filter" disabled={!!busy} value={environment} onChange={event=>{setEnvironment(event.target.value);setPage(1);openBill('');}} className="ml-3 rounded-lg border border-white/15 bg-[#101114] p-2"><option value="all">All environments</option><option value="development">Development</option><option value="production">Production</option><option value="unclassified">Unclassified</option></select></label><button type="button" className={secondaryButton} disabled={!!busy} onClick={() => setRevision(value => value + 1)}>Reload</button></div>{listError ? <p role="alert" className="p-4 text-sm text-red-200">{listError}</p> : !list ? <p role="status" className="p-6 text-sm text-white/50">Loading bills…</p> : <><div className="overflow-x-auto"><table className="w-full min-w-[750px] text-left text-sm"><thead className="bg-white/[.02] text-xs text-white/45"><tr><th>Reference / environment</th><th>BytePlus account</th><th>Cycle</th><th>Rows</th><th>Total (USD)</th><th>Details</th></tr></thead><tbody>{list.imports.length ? list.imports.map(row => <tr key={row.id} className={`border-t border-white/10 ${selectedId === row.id ? 'bg-cyan-300/5' : ''}`}><td className="max-w-[260px] break-words">{row.reference}<p className="mt-1 text-xs text-white/45">{environmentLabel[row.environment || 'unclassified']}</p></td><td>{row.provider_account_id}</td><td>{row.billing_cycle}</td><td className="tabular-nums">{number(row.row_count)}</td><td className="tabular-nums">{usd(row.total_usd)}</td><td><button type="button" className="text-cyan-200 hover:underline disabled:opacity-40" disabled={!!busy} aria-pressed={selectedId === row.id} onClick={() => { openBill(row.id); setFeedback(null); }}>View details</button></td></tr>) : <tr><td colSpan="6" className="text-center text-white/45">No bills yet. Start by importing a BytePlus CSV.</td></tr>}</tbody></table></div><div className="flex items-center justify-end gap-4 border-t border-white/10 px-4 py-3 text-xs text-white/60"><button type="button" disabled={!!busy || page <= 1} className="disabled:opacity-30" onClick={() => setPage(value => value - 1)}>Previous</button><span>{page} / {list.pagination.totalPages || 1} · {number(list.pagination.total)} bills</span><button type="button" disabled={!!busy || page >= list.pagination.totalPages} className="disabled:opacity-30" onClick={() => setPage(value => value + 1)}>Next</button></div></>}</section>
    {selectedId && <section aria-label="Provider bill details" className="space-y-5 border-t border-white/10 pt-6">{detailError ? <p role="alert" className={adminStyles.error}>{detailError}</p> : !detail ? <p role="status" className={adminStyles.loading}>Loading bill details…</p> : <><ProviderBillingDetail data={detail} disabled={!!busy} onExport={exportAudit} onRequestPage={setRequestPage} onRequestSearch={(value,status)=>{setRequestSearch(value);setRequestStatus(status);setRequestPage(1);}}/><ProviderPaymentEvidence data={detail} disabled={!!busy} onSave={savePaymentEvidence}/><ProviderPackageAllocation data={detail} disabled={!!busy} onSave={allocatePackage}/><ProviderBillingMappings data={detail} disabled={!!busy} onSave={mapSku}/><ProviderPackageRequestAllocation data={detail} disabled={!!busy} onSave={allocatePackageRequest}/><ProviderPackageRequestCorrections data={detail} disabled={!!busy} onSave={correctPackageRequest}/><ProviderRequestReconciliation data={detail} disabled={!!busy} onSave={reconcileRequest}/><ProviderRequestCostCorrections data={detail} disabled={!!busy} onSave={correctRequestCost}/><form onSubmit={review} className={`${adminStyles.panel} p-4 sm:p-5`}><h3 className="font-semibold">Record Review Notes</h3><p className="mt-2 text-xs leading-5 text-white/50">Notes are saved alongside the currently displayed usage comparison version. This review does not allocate bills to jobs or customers.</p><label className={`${adminStyles.label} mt-4`}>Review notes<textarea required minLength={10} maxLength={2000} rows={3} disabled={!!busy} value={note} onChange={event => setNote(event.target.value)} className={`${adminStyles.field} h-auto py-3`} placeholder="Describe variances, account scope, or package costs needing follow-up."/></label><button disabled={!!busy || note.trim().length < 10} className={`${adminStyles.button} mt-4`}>{busy === 'review' ? 'Saving…' : 'Save review'}</button></form></>}</section>}
  </AdminShell>;
}
