import { evidenceFx } from './providerPaymentEvidence.js';
import { validateRequestIdentity } from './providerRequestReconciliation.js';
const fail=message=>Object.assign(new Error(message),{status:400});
function scaled(value,places) {
 if(typeof value!=='string'||!new RegExp(`^[0-9]{1,24}(?:\\.[0-9]{1,${places}})?$`).test(value))throw fail('Usage atau biaya paket tidak valid');
 const [whole,fraction='']=value.split('.');return BigInt(whole)*10n**BigInt(places)+BigInt(fraction.padEnd(places,'0'));
}
const fixed=(value,places)=>{const text=value.toString().padStart(places+1,'0');return `${text.slice(0,-places)}.${text.slice(-places)}`;};
export function allocatePackageRequest({bill,request,group,mapping,payment,allocation,rows=[],input,allowZero=false,recordedCost}) {
 validateRequestIdentity({bill,request,mapping});
 if(Number(request.matching_jobs)!==1)throw fail('Request harus terhubung ke tepat satu job');
 if(!payment||payment.kind!=='package_purchase'||!allocation||allocation.payment_evidence_id!==payment.id||allocation.group_key!==input.groupKey||allocation.usage_unit!==group.usage_unit)throw fail('Alokasi SKU dan pembelian paket tidak cocok');
 if(Number(group.savings_plan_gross_usd||0)>0)throw fail('Alokasi savings plan belum didukung');
 const capacity=scaled(allocation.consumed_quota,12),used=scaled(input.consumedQuota,12);
 const prior=rows.reduce((sum,row)=>sum+scaled(row.consumed_quota,12),0n);
 if((used===0n&&!allowZero)||prior+used>capacity)throw fail('Usage request melebihi sisa alokasi paket SKU');
 const evidenceReference=typeof input.evidenceReference==='string'?input.evidenceReference.trim():'';
 const note=typeof input.note==='string'?input.note.trim():'';
 if(evidenceReference.length<3||evidenceReference.length>160||note.length<10||note.length>2000)throw fail('Referensi bukti usage dan catatan diperlukan');
 const portion=(amount,places,field)=>{
   const cost=scaled(amount,places);
   const previous=rows.reduce((sum,row)=>sum+scaled(row[field],places),0n);
   if(previous>cost)throw fail('Biaya tersimpan melebihi alokasi SKU');
   if(used===0n)return 0n;
   const target=(cost*(prior+used)+capacity/2n)/capacity;
   return target>previous?target-previous:0n;
 };
 const usd=recordedCost?scaled(recordedCost.cost_usd,8):portion(allocation.allocated_usd,8,'cost_usd'),idr=recordedCost?scaled(recordedCost.cost_idr,6):portion(allocation.allocated_idr,6,'cost_idr');
 if(usd>=10n**20n||idr>=10n**20n||usd===0n&&idr>0n)throw fail('Nominal alokasi di luar presisi pencatatan biaya job');
 const usdIdrRate=evidenceFx(payment);
 if(scaled(usdIdrRate,6)<=0n||scaled(usdIdrRate,6)>=10n**20n)throw fail('Kurs melebihi batas pencatatan');
 return {costSource:'calculated',packageAllocationId:allocation.id,consumedQuota:fixed(used,12),costUsd:fixed(usd,8),costIdr:fixed(idr,6),usdIdrRate,evidenceReference,note};
}

export function packageRequestBalance(allocation,rows=[]) {
 const quota=scaled(allocation.consumed_quota,12);
 const assigned=rows.filter(row=>row.package_allocation_id===allocation.id);
 const used=assigned.reduce((sum,row)=>sum+scaled(row.package_consumed_quota,12),0n);
 return {remainingQuota:fixed(quota-used,12),assignedRequests:assigned.length};
}
