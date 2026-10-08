import {evidenceFx} from './providerPaymentEvidence.js';
const fail=message=>Object.assign(new Error(message),{status:400});
function decimal(value) {
 if(typeof value!=='string'||!/^\d{1,12}(?:\.\d{1,8})?$/.test(value))throw fail('Biaya USD tidak valid');
 const [whole,fraction='']=value.split('.');return BigInt(whole)*100000000n+BigInt(fraction.padEnd(8,'0'));
}
function fixed(value,places) {const text=value.toString().padStart(places+1,'0');return `${text.slice(0,-places)}.${text.slice(-places)}`;}
export function validateRequestReconciliation({bill,request,group,mapping,payment,allocatedUsd,input}) {
 validateRequestIdentity({bill,request,mapping});
 if(!payment || payment.kind!=='invoice_payment')throw fail('Pilih bukti pembayaran tagihan untuk dasar kurs');
 if(BigInt(group.package_usage.replace('.',''))>0n || Number(group.savings_plan_gross_usd || '0')>0)throw fail('SKU dengan usage paket belum mendukung pencocokan request langsung');
 const amount=decimal(input.costUsd),prior=decimal(allocatedUsd);
 if(amount+prior>decimal(group.pre_tax_usd))throw fail('Total biaya request melebihi tagihan sebelum pajak pada SKU');
 const evidenceReference=typeof input.evidenceReference==='string'?input.evidenceReference.trim():'';
 const note=typeof input.note==='string'?input.note.trim():'';
 if(evidenceReference.length<3 || evidenceReference.length>160 || note.length<10 || note.length>2000)throw fail('Referensi bukti dan catatan pencocokan diperlukan');
 const fx=evidenceFx(payment);const rate=BigInt(fx.replace('.',''));
 // USD(8) × IDR/USD(6) -> IDR(6), rounded half up.
 const idr=(amount*rate+50000000n)/100000000n;
 if(idr>=10n**20n || rate>=10n**20n)throw fail('Biaya IDR melebihi batas pencatatan');
 return {costUsd:fixed(amount,8),costIdr:fixed(idr,6),usdIdrRate:fx,evidenceReference,note};
}

export function validateRequestIdentity({bill,request,mapping}) {
 if(!request || !request.provider_request_id)throw fail('Request provider tidak ditemukan atau belum memiliki ID');
 if(request.provider_account_id!==bill.provider_account_id)throw fail('Akun request tidak cocok dengan tagihan');
 if(!['development','production'].includes(bill.environment)||request.environment!==bill.environment)throw fail('Lingkungan job dan tagihan harus cocok dan sudah diklasifikasi');
 if(request.time_is_fallback !== false || !Number.isFinite(new Date(request.request_time).getTime()) || !Number.isFinite(new Date(bill.period_start).getTime()) || !Number.isFinite(new Date(bill.period_end).getTime()) || new Date(bill.period_start)>=new Date(bill.period_end) || new Date(request.request_time)<new Date(bill.period_start) || new Date(request.request_time)>=new Date(bill.period_end))throw fail('Waktu dispatch request di luar periode atau belum diketahui');
 if(!mapping || mapping.model!==request.model)throw fail('Pemetaan SKU harus cocok dengan model job');
}
