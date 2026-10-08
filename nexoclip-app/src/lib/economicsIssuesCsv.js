import {economicsJobIssues} from './economicsJobIssues.js';
import {providerBillingJobPath} from './providerBillingNavigation.js';

const numeric = new Set(['matched_jobs','credits_consumed','known_revenue_idr','known_provider_cost_usd','known_provider_cost_idr','known_payment_fee_idr','simulation_additional_revenue_idr','provider_requests','estimated_requests','provider_reported_requests','matched_requests','package_matched_requests','unknown_provider_requests','unknown_fx_requests','missing_attempts']);
const columns=['record_type','exported_at_utc','workspace_id','period_start_utc','period_end_exclusive_utc','period_basis','environment_filter','cost_status_filter','issue_filter','matched_jobs','generation_job_id','model','provider','job_environment','job_status','settlement_status','cohort_at_utc','credits_consumed','known_revenue_idr','known_provider_cost_usd','known_provider_cost_idr','known_payment_fee_idr','simulation_additional_revenue_idr','cost_data_complete','revenue_data_complete','payment_fee_data_complete','provider_evidence_status','provider_requests','estimated_requests','provider_reported_requests','matched_requests','package_matched_requests','unknown_provider_requests','unknown_fx_requests','missing_attempts','issue_codes','issue_labels','next_steps','job_billing_path','scope_note'];
function cell(value,key) {
  let text=value==null?'':String(value);
  if(numeric.has(key)) {
    // Keep database decimal strings exact; spreadsheet quoting does not round them.
    if(text && !/^-?\d+(?:\.\d+)?$/.test(text))text='';
  } else if(/^[\s\u0000-\u001f]*[=+\-@]/u.test(text))text="'"+text;
  return `"${text.replaceAll('"','""')}"`;
}
const iso=value=>value ? new Date(value).toISOString() : '';
export function economicsIssuesCsv({workspaceId,filters,data,mapTotals,exportedAt=new Date()}) {
  const common={exported_at_utc:iso(exportedAt),workspace_id:workspaceId,period_start_utc:filters.since,period_end_exclusive_utc:filters.until,period_basis:'terminal_job',environment_filter:filters.environment || 'all',cost_status_filter:filters.costStatus || 'all',issue_filter:filters.issue,matched_jobs:data.total,
    scope_note:'Seluruh job bermasalah sesuai filter; tidak mengikuti pagination. Nominal adalah komponen diketahui, bukan COGS atau laba final. Simulasi bukan pendapatan aktual. Hosting, storage, egress, pajak dan biaya operasional belum termasuk.'};
  const amounts=row=>{const totals=mapTotals(row);return {
    credits_consumed:row.credits_consumed,known_revenue_idr:row.recognized_revenue_idr,known_provider_cost_usd:row.provider_cost_usd,known_provider_cost_idr:row.provider_cost_idr,known_payment_fee_idr:row.payment_fee_idr,simulation_additional_revenue_idr:row.simulated_revenue_addition_idr,
    cost_data_complete:totals.coverage.costComplete,revenue_data_complete:totals.coverage.revenueComplete,payment_fee_data_complete:totals.coverage.paymentFeesComplete,provider_evidence_status:totals.costEvidence.status,
    provider_requests:row.provider_request_count,estimated_requests:row.estimated_request_count,provider_reported_requests:row.provider_reported_request_count,matched_requests:row.matched_request_count,package_matched_requests:row.package_matched_request_count,unknown_provider_requests:row.unknown_provider_requests,unknown_fx_requests:row.unknown_fx_requests,missing_attempts:row.missing_attempt_count,
  };};
  const records=[{...common,record_type:'export_summary',...amounts(data.totals || {})}];
  for(const row of data.items || []) {
    const issues=economicsJobIssues(mapTotals(row));
    records.push({...common,record_type:'job',generation_job_id:row.id,model:row.model,provider:row.provider,job_environment:row.environment || 'unclassified',job_status:row.status,settlement_status:row.settlement_status,cohort_at_utc:iso(row.cohort_at),...amounts(row),issue_codes:issues.map(issue=>issue.code).join(' | '),issue_labels:issues.map(issue=>issue.label).join(' | '),next_steps:issues.map(issue=>issue.action).join(' | '),job_billing_path:issues.some(issue=>issue.provider) ? providerBillingJobPath(workspaceId,row.id) : ''});
  }
  return '\uFEFF'+[columns.map(key=>cell(key)).join(','),...records.map(row=>columns.map(key=>cell(row[key],key)).join(','))].join('\r\n')+'\r\n';
}
