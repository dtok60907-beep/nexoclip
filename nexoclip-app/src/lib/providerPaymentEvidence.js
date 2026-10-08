const invalid = message=>Object.assign(new Error(message),{status:400});
function money(value,places) {
  if(typeof value!=='string' || !new RegExp(`^[0-9]{1,24}(?:\\.[0-9]{1,${places}})?$`).test(value))throw invalid('Nilai pembayaran tidak valid; gunakan titik untuk desimal');
  const [whole,fraction='']=value.split('.');
  const amount=BigInt(whole)*10n**BigInt(places)+BigInt(fraction.padEnd(places,'0'));
  if(amount<=0n)throw invalid('Nilai pembayaran harus lebih besar dari nol');
  return amount;
}
function format(value,places) {
  const text=value.toString().padStart(places+1,'0');
  return `${text.slice(0,-places)}.${text.slice(-places)}`;
}
export function validatePaymentEvidence(input) {
  if(!['invoice_payment','package_purchase'].includes(input.kind))throw invalid('Jenis bukti tidak valid');
  const usd=money(input.amountUsd,8),idr=money(input.amountIdr,2);
  const reference=typeof input.reference==='string'?input.reference.trim():'';
  const note=typeof input.note==='string'?input.note.trim():'';
  if(reference.length<3 || reference.length>160)throw invalid('Referensi harus 3–160 karakter');
  if(note.length<10 || note.length>2000)throw invalid('Catatan harus 10–2.000 karakter');
  const time=typeof input.paidAt==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/.test(input.paidAt)?new Date(input.paidAt):null;
  if(!time || !Number.isFinite(time.getTime()) || time.toISOString()!==input.paidAt)throw invalid('Tanggal pembayaran UTC tidak valid');
  return {kind:input.kind,amountUsd:format(usd,8),amountIdr:format(idr,2),paidAt:time.toISOString(),reference,note};
}
export function evidenceFx(row) {
  const usd=money(row.amount_usd,8),idr=money(row.amount_idr,2);
  return format((idr*10n**12n+usd/2n)/usd,6);
}
