const columns=['record_type','export_scope','exported_at_utc','import_id','billing_reference','provider_account_id','environment','billing_cycle','period_start_utc','period_end_utc','invoice_pre_tax_usd','invoice_total_usd','reconciliation_id','revision_id','workspace_id','generation_job_id','provider_request_id','group_key','sku_configuration','model','payment_evidence_id','payment_reference','cost_event_id','previous_cost_event_id','previous_cost_usd','previous_cost_idr','cost_usd','cost_idr','usd_idr_rate','original_cost_usd','original_cost_idr','original_evidence_reference','original_note','original_operator_id','original_recorded_at_utc','evidence_reference','note','operator_id','recorded_at_utc','cost_basis','package_allocation_id','package_consumed_quota','original_package_consumed_quota','previous_package_consumed_quota'];
const iso=value=>value ? new Date(value).toISOString() : '';
function cell(value) {
 let text=value==null?'':String(value);
 // Preserve quoted multiline audit notes, neutralize spreadsheet formulas.
 if(/^\s*[=+\-@]/u.test(text))text="'"+text;
 // Excel cannot preserve long numeric IDs or leading zero IDs as numbers.
 if(/^(?:[0-9]{16,}|0[0-9]+)$/.test(text))text="'"+text;
 return `"${text.replaceAll('"','""')}"`;
}
export function providerBillingAuditCsv({bill,groups=[],mappings=[],payments=[],reconciliations=[],corrections=[]},exportedAt=new Date()) {
 const common={export_scope:'all_reconciled_requests_in_import_not_search_filtered',exported_at_utc:iso(exportedAt),import_id:bill.id,billing_reference:bill.reference,provider_account_id:bill.provider_account_id,environment:bill.environment || 'unclassified',billing_cycle:bill.billing_cycle,period_start_utc:iso(bill.period_start),period_end_utc:iso(bill.period_end),invoice_pre_tax_usd:bill.pre_tax_usd,invoice_total_usd:bill.total_usd};
 const parents=new Map(reconciliations.map(row=>[row.id,row]));
 const skus=new Map(groups.map(row=>[row.groupKey,row]));
 const paid=new Map(payments.map(row=>[row.id,row]));
 const models=new Map();for(const row of mappings)if(!models.has(row.group_key))models.set(row.group_key,row.model);
 const lookup=row=>({sku_configuration:skus.get(row.group_key)?.configuration || '',model:row.model || parents.get(row.reconciliation_id)?.model || models.get(row.group_key) || '',payment_reference:paid.get(row.payment_evidence_id)?.reference || ''});
 const records=[{...common,record_type:'billing_summary',note:'Request costs use provider pre-tax charges or allocated package purchase costs; inspect cost_basis. Unmatched requests, unassigned package usage, and provider tax are not final job COGS.'}];
 for(const row of reconciliations)records.push({...common,...lookup(row),record_type:'current_reconciliation',cost_basis:row.package_allocation_id?'allocated_package_purchase':'provider_request_charge',package_allocation_id:row.package_allocation_id,package_consumed_quota:row.package_consumed_quota,original_package_consumed_quota:row.original_package_consumed_quota,reconciliation_id:row.id,revision_id:row.latest_correction_id || '',workspace_id:row.workspace_id,generation_job_id:row.generation_job_id,provider_request_id:row.provider_request_id,group_key:row.group_key,payment_evidence_id:row.payment_evidence_id,cost_event_id:row.current_cost_event_id,cost_usd:row.cost_usd,cost_idr:row.cost_idr,usd_idr_rate:row.usd_idr_rate,original_cost_usd:row.original_cost_usd,original_cost_idr:row.original_cost_idr,original_evidence_reference:row.original_evidence_reference,original_note:row.original_note,original_operator_id:row.original_created_by,original_recorded_at_utc:iso(row.created_at),evidence_reference:row.evidence_reference,note:row.note,operator_id:row.current_created_by,recorded_at_utc:iso(row.current_created_at)});
 for(const row of corrections) {
  const parent=parents.get(row.reconciliation_id);
  records.push({...common,...lookup(row),record_type:'cost_correction',cost_basis:row.package_allocation_id?'allocated_package_purchase':'provider_request_charge',package_allocation_id:row.package_allocation_id,package_consumed_quota:row.package_consumed_quota,previous_package_consumed_quota:row.previous_package_consumed_quota,reconciliation_id:row.reconciliation_id,revision_id:row.id,workspace_id:parent?.workspace_id,generation_job_id:parent?.generation_job_id,provider_request_id:row.provider_request_id,group_key:row.group_key,payment_evidence_id:row.payment_evidence_id,cost_event_id:row.cost_event_id,previous_cost_event_id:row.previous_cost_event_id,previous_cost_usd:row.previous_cost_usd,previous_cost_idr:row.previous_cost_idr,cost_usd:row.cost_usd,cost_idr:row.cost_idr,usd_idr_rate:row.usd_idr_rate,evidence_reference:row.evidence_reference,note:row.note,operator_id:row.created_by,recorded_at_utc:iso(row.created_at)});
 }
 return '\uFEFF'+[columns.map(cell).join(','),...records.map(row=>columns.map(key=>cell(row[key])).join(','))].join('\r\n')+'\r\n';
}
