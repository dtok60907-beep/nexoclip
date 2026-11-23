'use client';

import { economicsCostFilters, economicsCostFilterLabel } from '../src/lib/economicsCostFilters.js';
import { useEffect, useRef, useState } from 'react';
import AdminShell from './AdminShell';
import Link from 'next/link';
import { economicsJobIssues, economicsIssueFilters, economicsIssueFilterLabel } from '../src/lib/economicsJobIssues.js';
import { providerBillingJobPath } from '../src/lib/providerBillingNavigation.js';
import { adminStyles } from '../src/lib/adminStyles.js';
import { saasFetch } from '../src/lib/saas/api.js';
import { getStoredWorkspaceId, setStoredWorkspaceId } from '../src/lib/saas/storage.js';
import { coverageReasons, economicsPath, idr, margin, credits, costEvidenceLabel } from '../src/lib/economicsDisplay.js';

const fieldClass = adminStyles.field;
const buttonClass = adminStyles.button;

function Stat({ label, value, detail }) {
  return <div className={adminStyles.card}><p className={adminStyles.cardLabel}>{label}</p><p className={adminStyles.cardValue}>{value}</p>{detail && <p className="mt-2 text-xs text-white/45">{detail}</p>}</div>;
}

function CostEvidenceBadge({row}) {
  const evidence=row.costEvidence;
  return <p className="mt-2 text-xs leading-5 text-cyan-100/80">{costEvidenceLabel(evidence)}{evidence?.available && <span className="block text-white/45">{evidence.matched.requests + evidence.packageMatched.requests} / {row.providerRequestCount} request</span>}</p>;
}
function CostEvidenceSummary({totals}) {
  const evidence=totals.costEvidence;
  const categories=[['estimated','Estimated from usage','API usage × stored rates; not yet matched to cost evidence.'],['providerReported','Provider reported','Amount from provider response; not yet matched to billing evidence.'],['matched','Matched per request','Request cost matched to payment evidence and exchange rate.'],['packageMatched','Evidenced package allocation','Purchase cost allocated based on package usage per request.']];
  return <section className={`${adminStyles.panel} mt-6 p-4`}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-semibold">Provider Cost Evidence Status</h2><Link href="/admin/provider-billing" className="text-xs text-cyan-200">Open Provider Billing →</Link></div><p className="mt-3 text-sm text-cyan-100">{costEvidenceLabel(evidence)}</p>
    <p className="mt-2 text-xs leading-5 text-white/50">Data completeness and evidence matching are two separate statuses. Matching all requests does not mean the monthly invoice is final. Contribution excludes hosting, storage, egress, taxes, and other operating costs.</p>
    {evidence?.available ? <><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{categories.map(([key,label,help])=><div key={key} className="rounded-lg border border-white/10 p-3"><p className="text-xs text-white/60">{label}</p><p className="mt-2 font-semibold">{idr(evidence[key].knownCostIdr)}</p><p className="mt-1 text-xs text-cyan-100">{evidence[key].requests} requests</p><p className="mt-2 text-xs leading-5 text-white/45">{help}</p></div>)}</div><p className="mt-3 text-xs text-white/50">{evidence.unknownRequests} requests have unknown cost. Per-category amounts sum only known IDR costs; costs missing an exchange rate are not treated as zero.</p></> : <p className="mt-3 text-xs text-amber-100">Reload the report to get evidence status details. Calculated/reported sources alone do not prove invoice reconciliation.</p>}
  </section>;
}

export function EconomicsAttentionSummary({data,onIssue}) {
  const summary=data.attention;
  const rows=(data.items || []).map(row=>({row,issues:economicsJobIssues(row)})).filter(item=>item.issues.length);
  return <section className={`${adminStyles.panel} mt-6 p-4`} aria-label="Jobs needing review"><h2 className="text-sm font-semibold">Jobs Needing Review</h2>
    {summary?.available ? <><p className="mt-3 text-lg font-semibold text-amber-100">{summary.attentionJobs} of {summary.totalJobs} jobs need review</p><p className="mt-2 text-xs leading-5 text-white/50">Summary covers all matching results and the full period, including other pages. Each job is counted once in the total; one job may have multiple causes below. Failed status alone does not indicate incomplete cost data.</p><div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{summary.categories.filter(category=>category.jobs>0).map(category=><p key={category.code} className="rounded-lg border border-white/10 p-3 text-xs text-white/65">{category.label}: <strong className="text-amber-100">{category.jobs} jobs</strong>{onIssue && <button type="button" className="mt-2 block text-cyan-200 hover:underline" onClick={()=>onIssue(category.code)}>View jobs with this issue →</button>}</p>)}</div>{summary.attentionJobs===0 && <p className="mt-3 text-xs text-cyan-100">No gaps detected in this report data. This does not mean monthly invoices or profits are final.</p>}</> : <p className="mt-3 text-xs text-amber-100">Full job summary is unavailable. Reload the report; details below cover this page only.</p>}
    <h3 className="mt-5 text-sm font-semibold">Issues per job on page {data.pagination?.page || 1}</h3><p className="mt-2 text-xs text-white/50">{rows.length} jobs on this page need review. Use Job Details pagination to view other pages.</p>
    {rows.length ? <ul className="mt-3 divide-y divide-white/10">{rows.map(({row,issues})=><li key={row.id} className="py-3"><p className="text-sm font-semibold">{row.model} · {row.status}</p><p className="mt-1 break-all text-xs text-white/40">Job: {row.id}</p><ul className="mt-2 space-y-2 text-xs leading-5">{issues.map(issue=><li key={issue.code}><span className="text-amber-100">{issue.label}.</span> <span className="text-white/60">{issue.action}</span>{issue.href && <a href={issue.href} onClick={()=>{const panel=document.getElementById('economics-payment-fees');if(panel)panel.open=true;}} className="ml-2 text-cyan-200 hover:underline">Open payment reconciliation →</a>}</li>)}</ul>{issues.some(issue=>issue.provider) && providerBillingJobPath(data.workspaceId,row.id) && <Link href={providerBillingJobPath(data.workspaceId,row.id)} className="mt-3 inline-block text-xs text-cyan-200 hover:underline">Inspect provider requests & evidence →</Link>}</li>)}</ul> : <p className="mt-3 text-xs text-white/50">No gaps detected for jobs on this page.</p>}
  </section>;
}

export function EconomicsIssuesExportControl({onExport,exporting,enabled,feedback}) {
  return <div className="my-4 rounded-xl border border-white/10 p-4"><button type="button" className={buttonClass} disabled={!enabled || exporting} onClick={onExport}>{exporting ? 'Preparing CSV…' : 'Export flagged jobs CSV'}</button><p className="mt-2 text-xs leading-5 text-white/50">Follows active workspace, period, environment, cost status, and issue filters. "All issues" exports only jobs needing review. Covers all pages, max 5,000 jobs.</p>{feedback && <p role={feedback.error?'alert':'status'} className={`mt-3 text-xs ${feedback.error?'text-red-200':'text-cyan-100'}`}>{feedback.text}</p>}</div>;
}

export function EconomicsReport({ data, onPage, onIssue }) {
  const { totals, breakdown, items, pagination } = data;
  const simulation = totals.simulation;
  const revenue = row => row.simulation?.revenueIdr ?? row.recognizedRevenueIdr;
  const contribution = row => row.simulation?.contributionIdr ?? row.contributionIdr;
  const incomplete = !totals.coverage.complete;
  const reasons = coverageReasons(totals.coverage);
  return <>
    <p className="mt-4 text-xs text-cyan-100">Report scope: {economicsCostFilterLabel(data.costStatus)}. Totals, model summaries, and job details follow this filter. One job may contain multiple cost types; all costs of matched jobs remain included.</p>
    <p className="mt-2 text-xs text-white/60">Issue filter: {economicsIssueFilterLabel(data.issue)}. Issue and cost status filters apply together; all costs of matched jobs remain included.{data.issue && data.issue!=='all' && onIssue && <button type="button" className="ml-3 text-cyan-200 hover:underline" onClick={()=>onIssue('all')}>Reset issue filter</button>}</p>
    <p className="mt-4 rounded-lg border border-white/10 p-3 text-xs leading-5 text-white/60">Report environment: {{production:'Production',development:'Development',unclassified:'Unclassified',all:'All environments'}[data.environment || 'all']}. The Production filter includes only jobs marked as production at creation. Legacy unclassified data is not automatically treated as production.</p>
    {simulation && <div className="mt-6 rounded-xl border border-cyan-300/25 bg-cyan-300/5 p-4 text-sm text-cyan-100"><p className="font-semibold">Simulation: 750 trial credits assumed worth Rp149.000</p><p className="mt-1 text-xs">Simulated revenue follows credits consumed from that grant. Actual revenue remains {idr(totals.recognizedRevenueIdr)}; this is not real payment. Trial balances and credit sources are unchanged.</p></div>}
    <div className={`mt-6 rounded-xl border p-4 text-sm ${incomplete ? 'border-amber-300/25 bg-amber-300/5 text-amber-100' : 'border-emerald-300/20 bg-emerald-300/5 text-emerald-100'}`}>
      <p className="font-semibold">{incomplete ? 'Cost or revenue data is incomplete' : 'Calculation data available'}</p>
      <p className="mt-1 text-xs opacity-75">{incomplete ? reasons.join(' · ') || 'Report components still require review.' : 'Check cost evidence status below. Available numbers do not automatically mean invoices are reconciled.'}</p>
    </div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label={simulation ? "Simulated recognized credit revenue" : "Recognized credit revenue"} value={idr(revenue(totals))} detail={totals.coverage.revenueComplete ? 'Value of consumed credits' : 'Known amount; some values not yet recorded'} />
      <Stat label="Recorded provider cost" value={idr(totals.providerCostIdr)} detail={totals.costEvidence?.available ? `${totals.costEvidence.estimated.requests} estimated · ${totals.costEvidence.providerReported.requests} reported · ${totals.costEvidence.matched.requests} matched · ${totals.costEvidence.packageMatched.requests} package` : `${totals.costSources.reported} reported · ${totals.costSources.calculated} calculated from usage / package allocation`} />
      <Stat label="Allocated payment fees" value={idr(totals.paymentFeeIdr)} detail={totals.coverage.paymentFeesComplete ? 'Proportional to credits consumed' : `${idr(totals.knownPaymentFeeIdr)} known`} />
      <Stat label={simulation ? "Provisional simulated contribution" : totals.costEvidence?.status==='reconciled' ? "Contribution after provider & payment fees" : "Provisional contribution after provider & payment fees"} value={idr(simulation ? simulation.knownContributionIdr : totals.contributionIdr)} detail={simulation ? (incomplete ? 'Based on known costs; 1 or more components are incomplete. Margin is incomplete.' : `Simulated margin: ${margin(simulation.revenueIdr > 0 ? simulation.contributionIdr / simulation.revenueIdr * 100 : null)}`) : `Contribution margin: ${margin(totals.marginPercent)}`} />
    </div>
    <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-white/50">
      <span>{totals.jobCount} succeeded/failed jobs</span><span>{totals.failedJobCount} failed</span><span>{totals.providerRequestCount} provider requests</span>
      <span>{credits(totals.creditsConsumed)} credits consumed</span><span>{totals.excludedSandboxJobs} sandbox jobs in period excluded</span>
    </div>
    <CostEvidenceSummary totals={totals}/>
    <EconomicsAttentionSummary data={data} onIssue={onIssue}/>
    <section className={`${adminStyles.panel} mt-8`}>
      <h2 className="border-b border-white/10 px-4 py-3 text-sm font-semibold">{data.groupBy === 'provider' ? 'Summary by final provider' : 'Summary by model'}</h2>
      <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-white/[.02] text-xs text-white/45"><tr><th className="p-4">{data.groupBy === 'provider' ? 'Final provider' : 'Model'}</th><th className="p-4">Jobs</th><th className="p-4">{simulation ? 'Revenue (simulated if applicable)' : 'Known revenue'}</th><th className="p-4">Known provider cost</th><th className="p-4">Contribution</th><th className="p-4">Margin</th></tr></thead>
        <tbody>{breakdown.length ? breakdown.map(row => <tr key={row.key} className="border-t border-white/10"><td className="max-w-[300px] break-words p-4">{row.key}</td><td className="p-4">{row.jobCount}</td><td className="p-4 tabular-nums">{idr(revenue(row))}</td><td className="p-4 tabular-nums">{idr(row.providerCostIdr)}<CostEvidenceBadge row={row}/></td><td className="p-4 tabular-nums">{idr(contribution(row))}</td><td className="p-4">{margin(row.simulation ? (row.simulation.contributionIdr !== null && row.simulation.revenueIdr > 0 ? row.simulation.contributionIdr / row.simulation.revenueIdr * 100 : null) : row.marginPercent)}</td></tr>) : <tr><td colSpan="6" className="p-6 text-center text-white/45">No jobs in this period.</td></tr>}</tbody>
      </table></div>
    </section>
    <section className={`${adminStyles.panel} mt-6`}>
      <h2 className="border-b border-white/10 px-4 py-3 text-sm font-semibold">Job Details</h2>
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-white/[.02] text-xs text-white/45"><tr><th className="p-4">Model / status</th><th className="p-4">Cohort date (UTC)</th><th className="p-4">{simulation ? 'Revenue (simulated if applicable)' : 'Known revenue'}</th><th className="p-4">Known provider cost</th><th className="p-4">Contribution</th><th className="p-4">Completeness</th></tr></thead>
        <tbody>{items.length ? items.map(row => <tr key={row.id} className="border-t border-white/10"><td className="max-w-[280px] break-words p-4">{row.model}<span className="mt-1 block text-xs text-white/45">{row.status} · {row.provider || 'Unknown provider'}</span>{providerBillingJobPath(data.workspaceId,row.id) && <Link className="mt-2 block text-xs text-cyan-200 hover:underline" href={providerBillingJobPath(data.workspaceId,row.id)}>View requests in Provider Billing →</Link>}</td><td className="p-4 text-xs text-white/60">{new Date(row.cohortAt).toLocaleString('en-US', { timeZone: 'UTC' })}</td><td className="p-4 tabular-nums">{idr(revenue(row))}</td><td className="p-4 tabular-nums">{idr(row.providerCostIdr)}<CostEvidenceBadge row={row}/></td><td className="p-4 tabular-nums">{idr(contribution(row))}</td><td className="max-w-[300px] p-4 text-xs text-white/55">{row.coverage.complete ? 'Calculation data available' : coverageReasons(row.coverage).join(' · ')}</td></tr>) : <tr><td colSpan="6" className="p-6 text-center text-white/45">No jobs yet.</td></tr>}</tbody>
      </table></div>
      <div className="flex flex-wrap items-center justify-end gap-4 border-t border-white/10 px-4 py-3 text-xs text-white/60"><button type="button" disabled={pagination.page <= 1} className="disabled:opacity-25" onClick={() => onPage?.(pagination.page - 1)}>Previous</button><span className="text-white/45">{pagination.page} / {pagination.totalPages || 1}</span><button type="button" disabled={pagination.page >= pagination.totalPages} className="disabled:opacity-25" onClick={() => onPage?.(pagination.page + 1)}>Next</button></div>
    </section>
    <p className="mt-4 text-xs text-white/40">Retry, fallback, and failed request costs are included in job cost. Period follows job completion date; legacy jobs without a completion date use creation date. Revenue follows credits consumed, not top-up cash flow. Usage-calculated rates have not been reconciled with provider invoices.</p>
  </>;
}

function PaymentFeeForm({ workspaceId, onSaved }) {
  const [topups, setTopups] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [topupId, setTopupId] = useState('');
  const [fee, setFee] = useState('');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const requestKey = useRef(null);
  useEffect(() => {
    let cancelled = false;
    setTopups([]); setTopupId(''); setFeedback(null);
    setLoading(true);
    saasFetch(`/api/admin/economics/payment-fees?page=${page}&pageSize=20`, { headers: { 'x-workspace-id': workspaceId } })
      .then(data => { if (!cancelled) { setTopups(data.items || []); setPagination(data.pagination); } })
      .catch(() => { if (!cancelled) setFeedback({ error: true, text: 'Unable to load payment history.' }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId, page]);
  async function submit(event) {
    event.preventDefault();
    const signature = JSON.stringify([workspaceId, topupId, fee, reference]);
    if (requestKey.current?.signature !== signature) requestKey.current = { signature, key: crypto.randomUUID() };
    setSaving(true); setFeedback(null);
    try {
      await saasFetch('/api/admin/economics/payment-fees', {
        method: 'POST', headers: { 'x-workspace-id': workspaceId, 'content-type': 'application/json' },
        body: JSON.stringify({ topupId, feeIdr: fee, evidenceReference: reference, reconciliationKey: requestKey.current.key }),
      });
      setFeedback({ error: false, text: 'Payment fee saved. Report updated.' });
      onSaved();
    } catch (error) { setFeedback({ error: true, text: error.message }); }
    finally { setSaving(false); }
  }
  return <details id="economics-payment-fees" style={{scrollMarginTop:96}} className="mt-8 rounded-xl border border-white/10 bg-white/[.02] p-4"><summary className="cursor-pointer text-sm font-semibold">Payment Fee Reconciliation</summary>
    <p className="mt-3 text-xs text-white/45">Enter the actual fee from the invoice or gateway. Enter 0 if the fee is zero. Corrections are stored as new entries; package prices remain unchanged.</p>
    <form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-3">
      <label className={adminStyles.label}>Completed top-up<select required disabled={saving || loading} value={topupId} onChange={event => { setTopupId(event.target.value); setFee(''); setReference(''); setFeedback(null); }} className={fieldClass}><option value="">{loading ? 'Loading payments…' : 'Select payment'}</option>{topups.map(row => <option key={row.id} value={row.id}>{row.packageCode} · {idr(row.amountIdr)} · {new Date(row.completedAt).toLocaleDateString('en-US')} · {row.id.slice(0, 8)}</option>)}</select>
        <span className="mt-2 flex items-center justify-between gap-2"><button type="button" disabled={saving || loading || page <= 1} className="text-cyan-200 disabled:opacity-25" onClick={() => setPage(value => value - 1)}>Newer</button><span>{page} / {pagination.totalPages || 1}</span><button type="button" disabled={saving || loading || page >= pagination.totalPages} className="text-cyan-200 disabled:opacity-25" onClick={() => setPage(value => value + 1)}>Older</button></span>
      </label>
      <label className={adminStyles.label}>Gateway fee (IDR)<input required disabled={saving} type="number" min="0" step="0.01" value={fee} onChange={event => setFee(event.target.value)} className={fieldClass} /></label>
      <label className={adminStyles.label}>Invoice / gateway reference<input required disabled={saving} maxLength="250" value={reference} onChange={event => setReference(event.target.value)} className={fieldClass} /></label>
      <div className="flex items-center gap-4 md:col-span-3"><button className={buttonClass} disabled={saving || loading || !topupId}>{saving ? 'Saving…' : 'Save actual fee'}</button>{feedback && <p role="status" className={`text-xs ${feedback.error ? 'text-red-300' : 'text-emerald-300'}`}>{feedback.text}</p>}</div>
    </form>
  </details>;
}

export default function EconomicsDashboard({ initialRange }) {
  const [workspaces, setWorkspaces] = useState([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [range, setRange] = useState(initialRange);
  const [groupBy, setGroupBy] = useState('model');
  const [environment,setEnvironment]=useState('production');
  const [costStatus,setCostStatus]=useState('all');
  const [issue,setIssue]=useState('all');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [exporting,setExporting]=useState(false);
  const [exportFeedback,setExportFeedback]=useState(null);
  const exportController=useRef(null);
  useEffect(() => {
    let cancelled = false;
    saasFetch('/api/workspaces').then(result => {
      if (cancelled) return;
      const list = result.workspaces || [];
      setWorkspaces(list);
      setWorkspaceId(list.find(row => row.id === getStoredWorkspaceId())?.id || list[0]?.id || '');
      if (!list.length) setError('No accessible workspaces found.');
    }).catch(reason => { if (!cancelled) setError(reason.message); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    setData(null); setError(null);
    saasFetch(economicsPath({ ...range, groupBy, page,environment,costStatus,issue }), { headers: { 'x-workspace-id': workspaceId } })
      .then(result => { if (!cancelled) setData(result); })
      .catch(reason => { if (!cancelled) setError(reason.message); });
    return () => { cancelled = true; };
  }, [workspaceId, range, groupBy, page, revision,environment,costStatus,issue]);
  useEffect(()=>{
    setExporting(false);setExportFeedback(null);
    return ()=>{exportController.current?.abort();exportController.current=null;};
  },[workspaceId,range,groupBy,environment,costStatus,issue]);
  async function exportIssues() {
    if(!workspaceId || !data || exporting)return;
    const controller=new AbortController();exportController.current=controller;
    setExporting(true);setExportFeedback(null);let url;
    try {
      const path=economicsPath({...range,groupBy,environment,costStatus,issue});
      const response=await fetch(`${path}&export=job-issues-csv`,{credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{'x-workspace-id':workspaceId,accept:'text/csv'}});
      if(!response.ok){let message='Unable to export CSV';try{message=(await response.json()).error || message;}catch{}throw new Error(message);}
      if(!response.headers.get('content-type')?.startsWith('text/csv'))throw new Error('Invalid export response. Please check your login session.');
      const blob=await response.blob();if(exportController.current!==controller)return;
      url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`economics-job-issues-${range.from}.csv`;
      document.body.appendChild(link);link.click();link.remove();
      setExportFeedback({error:false,text:'CSV downloaded for all flagged jobs matching the filters, including other pages. Amounts do not represent final COGS or profit.'});
    }catch(error){if(exportController.current===controller && error.name!=='AbortError')setExportFeedback({error:true,text:error.message});}
    finally{if(url)setTimeout(()=>URL.revokeObjectURL(url),1000);if(exportController.current===controller){setExporting(false);exportController.current=null;}}
  }
  function chooseIssue(value) {setData(null);setPage(1);setIssue(value);}
  function chooseWorkspace(value) { setData(null); setPage(1); setWorkspaceId(value); setStoredWorkspaceId(value); }
  return <AdminShell active="/admin/economics" title="COGS & Contribution" description="Monitor recognized credit value, provider costs, and payment fees per workspace.">
      <div className={adminStyles.filters}>
        <label className={adminStyles.label}>Environment<select aria-label="Economics environment" className={fieldClass} value={environment} onChange={event=>{setPage(1);setEnvironment(event.target.value);}}><option value="production">Production</option><option value="development">Development</option><option value="unclassified">Unclassified</option><option value="all">All environments</option></select></label>
        <label className={adminStyles.label}>Workspace<select className={fieldClass} value={workspaceId} onChange={event => chooseWorkspace(event.target.value)}>{workspaces.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label className={adminStyles.label}>From (UTC)<input type="date" className={fieldClass} value={range.from} onChange={event => { setPage(1); setRange(current => ({ ...current, from: event.target.value })); }} /></label>
        <label className={adminStyles.label}>To (UTC)<input type="date" className={fieldClass} value={range.to} onChange={event => { setPage(1); setRange(current => ({ ...current, to: event.target.value })); }} /></label>
        <label className={adminStyles.label}>Group by<select className={fieldClass} value={groupBy} onChange={event => { setPage(1); setGroupBy(event.target.value); }}><option value="model">Model</option><option value="provider">Final provider</option></select></label>
        <label className={adminStyles.label}>Cost status<select aria-label="Cost evidence status filter" className={fieldClass} value={costStatus} onChange={event=>{setData(null);setPage(1);setCostStatus(event.target.value);}}>{economicsCostFilters.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className={adminStyles.label}>Issue<select aria-label="Job issue filter" className={fieldClass} value={issue} onChange={event=>chooseIssue(event.target.value)}>{economicsIssueFilters.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <button className={`${buttonClass} self-end`} type="button" onClick={() => setRevision(value => value + 1)}>Reload</button>
      </div>
      <p className="my-4 text-sm text-white/50">Model summaries below come only from jobs in this period. <Link href="/admin/models" className="text-cyan-200 hover:underline">View all models and rates →</Link></p>
      <p className="my-4 text-sm text-white/50">Inspect billed costs and usage variances in <Link href="/admin/provider-billing" className="text-cyan-200 hover:underline">Provider Billing →</Link></p>
      {error && <div role="alert" className={adminStyles.error}>{error}</div>}
      {!data && !error && <p role="status" className={adminStyles.loading}>Loading report…</p>}
      <EconomicsIssuesExportControl enabled={!!data && !error} exporting={exporting} feedback={exportFeedback} onExport={exportIssues}/>
      {data && <EconomicsReport data={data} onPage={setPage} onIssue={chooseIssue} />}
      {workspaceId && <PaymentFeeForm key={workspaceId} workspaceId={workspaceId} onSaved={() => setRevision(value => value + 1)} />}
  </AdminShell>;
}
