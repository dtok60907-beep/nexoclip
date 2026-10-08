const fail=message=>Object.assign(new Error(message),{status:400});
function scaled(value,places) {
  if(typeof value!=='string' || !new RegExp(`^[0-9]{1,24}(?:\\.[0-9]{1,${places}})?$`).test(value))throw fail('Kuota atau biaya tidak valid');
  const [whole,fraction='']=value.split('.');
  return BigInt(whole)*10n**BigInt(places)+BigInt(fraction.padEnd(places,'0'));
}
function format(value,places) {const text=value.toString().padStart(places+1,'0');return `${text.slice(0,-places)}.${text.slice(-places)}`;}
export function calculatePackageAllocation({payment,group,allocations,input}) {
  if(payment.kind!=='package_purchase')throw fail('Pilih bukti pembelian paket');
  const quota=scaled(input.totalQuota,12),used=scaled(input.consumedQuota,12);
  if(quota<=0n || used<=0n || used>quota)throw fail('Usage harus positif dan tidak melebihi kuota paket');
  const note=typeof input.note==='string'?input.note.trim():'';
  if(note.length<10 || note.length>2000)throw fail('Catatan alokasi harus 10–2.000 karakter');
  const source=allocations.filter(row=>row.payment_evidence_id===payment.id);
  if(source.some(row=>scaled(row.total_quota,12)!==quota || row.usage_unit!==group.usage_unit))throw fail('Kuota dan satuan paket harus sama dengan alokasi sebelumnya');
  const prior=source.reduce((sum,row)=>sum+scaled(row.consumed_quota,12),0n);
  if(prior+used>quota)throw fail('Total alokasi melebihi kuota paket');
  const groupUsed=allocations.filter(row=>row.group_key===input.groupKey).reduce((sum,row)=>sum+scaled(row.consumed_quota,12),0n);
  if(groupUsed+used>scaled(group.package_usage,12))throw fail('Total alokasi melebihi usage paket pada SKU');
  const portion=(amount,places)=>{
    const cost=scaled(amount,places);
    return format((cost*(prior+used)+quota/2n)/quota-(cost*prior+quota/2n)/quota,places);
  };
  return {totalQuota:format(quota,12),consumedQuota:format(used,12),usageUnit:group.usage_unit,
    allocatedUsd:portion(payment.amount_usd,8),allocatedIdr:portion(payment.amount_idr,6),note};
}
