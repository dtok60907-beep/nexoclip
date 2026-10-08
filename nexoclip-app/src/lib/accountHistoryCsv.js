const fields={
 sessions:['id','action','created_at'],
 payments:['id','order_id','user_id','amount_idr','credits','status','provider_key','is_sandbox','created_at','completed_at'],
 ledger:['id','reason','amount','balance_after','created_at'],
};
const numeric=new Set(['total_entries','amount_idr','credits','amount','balance_after']);
function cell(value,key){
 let text=value==null?'':String(value);
 if(numeric.has(key)){if(text&&!/^-?\d+(?:\.\d+)?$/.test(text))text='';}
 else if(/^[\s\u0000-\u001f]*[=+\-@]/u.test(text))text="'"+text;
 return `"${text.replaceAll('"','""')}"`;
}
const timestamp=value=>value?new Date(value).toISOString():'';
export function accountHistoryCsv({workspaceId,customerId,filters,data,exportedAt=new Date()}){
 const columns=['record_type','exported_at_utc','workspace_id','customer_id','history','scope','period_start_utc','period_end_exclusive_utc','period_basis','category_filter','total_entries','scope_note',...fields[filters.history]];
 const common={exported_at_utc:timestamp(exportedAt),workspace_id:workspaceId,customer_id:customerId,history:filters.history,scope:filters.history==='sessions'?'account':'workspace',period_start_utc:filters.since,period_end_exclusive_utc:filters.until,period_basis:'created_at',category_filter:filters.category,total_entries:data.pagination.total,
 scope_note:filters.history==='sessions'?'Aktivitas akun di seluruh workspace; seluruh hasil filter, tanpa pagination.':'Riwayat workspace bersama, termasuk anggota lain; seluruh hasil filter, tanpa pagination.'+(filters.history==='payments'?' Pembayaran mengikuti tanggal order dibuat.':'')};
 const records=[{...common,record_type:'export_summary'},...data.rows.map(row=>({...common,record_type:'entry',...Object.fromEntries(fields[filters.history].map(key=>[key,key.endsWith('_at')?timestamp(row[key]):row[key]]))}))];
 return '\uFEFF'+[columns.map(key=>cell(key)).join(','),...records.map(row=>columns.map(key=>cell(row[key],key)).join(','))].join('\r\n')+'\r\n';
}
