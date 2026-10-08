import { accountHistoryCsv } from '../lib/accountHistoryCsv.js';
import { accountHistoryFilters } from '../lib/accountHistoryFilters.js';
import { accountDirectoryFilters } from '../lib/accountDirectoryFilters.js';
import { randomUUID } from 'node:crypto';
import { getPool } from '../db/pool.js';
import { createBackofficeRepository } from '../repositories/backofficeRepository.js';
import { appendCreditEntryInTransaction } from './creditService.js';
import { isPlatformOperator, operatorError, mapEconomicsTotals } from './economicsService.js';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const uuid=v=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v || '');
const text=(v,max,label)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max)throw fail(`${label} tidak valid`);return v.trim();};
const count=(v,zero=false)=>{if(!['number','string'].includes(typeof v)||! /^\d{1,8}(\.\d{1,6})?$/.test(String(v))||!Number.isFinite(Number(v))||Number(v)>(10000000)||Number(v)<(zero?0:0.000001))throw fail('Jumlah kredit tidak valid');return Number(v);};
const money=v=>{if(!['number','string'].includes(typeof v)||! /^\d+$/.test(String(v))||!Number.isSafeInteger(Number(v))||Number(v)<1||Number(v)>2000000000)throw fail('Harga IDR tidak valid');return Number(v);};
export function createBackofficeService({ repository, env=process.env, grant=appendCreditEntryInTransaction }={}) {
 const repo=()=>repository||createBackofficeRepository(getPool());
 function authorize(userId) {if(!isPlatformOperator(userId,env))throw operatorError();}
 function ids(workspaceId,customerId) {if(!uuid(workspaceId)||(customerId&&!uuid(customerId)))throw fail('ID tidak valid');}
 return {
  async read({userId,workspaceId,customerId,q,status,page,pageSize,history,from,to,category}) {
   authorize(userId);
   if(history!=null){
    ids(workspaceId,customerId);if(!customerId)throw fail('ID akun diperlukan');
    const result=await repo().history(workspaceId,customerId,accountHistoryFilters({history,page,pageSize,from,to,category}));
    if(!result)throw fail('Pelanggan tidak ada pada workspace ini',404);return result;
   }
   if(!workspaceId)return repo().directory(accountDirectoryFilters({q,status,page,pageSize}));
   ids(workspaceId,customerId);
   if(customerId){const p=await repo().profile(workspaceId,customerId);if(!p)throw fail('Pelanggan tidak ada pada workspace ini',404);return {...p,economics:{...p.economics,totals:mapEconomicsTotals(p.economics.totals)}};}
   return {orders:await repo().orders(workspaceId)};
  },
  async exportHistory({userId,workspaceId,customerId,history,from,to,category}) {
   authorize(userId);ids(workspaceId,customerId);if(!customerId)throw fail('ID akun diperlukan');
   const filters=accountHistoryFilters({history,from,to,category});
   const data=await repo().history(workspaceId,customerId,filters,{exportAll:true});
   if(!data)throw fail('Pelanggan tidak ada pada workspace ini',404);
   if(data.pagination.total>5000)throw fail('Ekspor maksimal 5.000 entri. Persempit rentang tanggal.',413);
   if(data.rows.length!==data.pagination.total)throw fail('Data ekspor tidak lengkap',503);
   return {csv:accountHistoryCsv({workspaceId,customerId,filters,data}),filename:`account-${history}-${customerId}-${from||'start'}-${to||'end'}.csv`};
  },
  async mutate({userId,workspaceId,input}) {
   authorize(userId);ids(workspaceId,input.customerId);
   if(!uuid(input.requestKey))throw fail('Kunci permintaan tidak valid');
   const r=repo();
   return r.transaction(async db=>{
    if(!await r.lockWorkspace(db,workspaceId))throw fail('Workspace tidak ditemukan',404);
    if(!input.customerId||!await r.member(db,workspaceId,input.customerId))throw fail('Pelanggan tidak ada pada workspace ini',404);
    const audit=(action,reason,entityId)=>r.audit(db,{workspaceId,userId,customerId:input.customerId,action,reason,entityId});
    if(input.action==='create') {
     const v={workspaceId,userId,customerId:input.customerId,requestKey:input.requestKey,invoice:`NXB-${randomUUID().toUpperCase()}`,company:text(input.company,160,'Perusahaan'),credits:count(input.credits),bonus:count(input.bonus??0,true),amount:money(input.amount),notes:typeof input.notes==='string'?input.notes.trim():''};
     if(v.notes.length>1000||v.credits+v.bonus>10000000)throw fail('Ketentuan tidak valid');
     const order=await r.createOrder(db,v);
     if(order.customer_user_id!==v.customerId||order.company_name!==v.company||Number(order.credits)!==v.credits||Number(order.bonus_credits)!==v.bonus||Number(order.amount_idr)!==v.amount||order.notes!==v.notes)throw fail('Kunci permintaan telah dipakai untuk ketentuan berbeda',409);
     // Replays do not duplicate audit records.
     if(order.invoice_number===v.invoice)await audit('invoice_created','Penawaran kredit bisnis dibuat',order.id);
     return {order};
    }
    if(input.action==='grant') {
     const amount=count(input.credits);const reason=text(input.reason,500,'Alasan');
     if(!['bonus','trial','compensation'].includes(input.type))throw fail('Jenis kredit tidak valid');
     const key=`admin-grant:${input.requestKey}`;const existing=await r.existingGrant(db,workspaceId,key);
     if(existing){if(Number(existing.amount)!==amount||existing.metadata?.customerId!==input.customerId||existing.metadata?.type!==input.type||existing.metadata?.reason!==reason||existing.metadata?.operatorId!==userId)throw fail('Kunci permintaan sudah dipakai',409);return {entry:existing};}
     const entry=await grant(db,{workspaceId,amount,reason:`admin_${input.type}`,idempotencyKey:key,metadata:{operatorId:userId,customerId:input.customerId,type:input.type,reason},creditLot:{sourceType:'promo'}});
     await audit('credit_granted',`${input.type}: ${reason}`,entry.id);return {entry};
    }
    if(!['settle','cancel'].includes(input.action)||!uuid(input.orderId))throw fail('Aksi tidak valid');
    const order=await r.findOrder(db,workspaceId,input.orderId);
    if(!order||order.customer_user_id!==input.customerId)throw fail('Invoice tidak ditemukan',404);
    if(input.action==='cancel'){
     if(order.status==='canceled')return {order};if(order.status!=='pending')throw fail('Invoice sudah dibayar',409);
     const result=await r.cancel(db,workspaceId,order.id);await audit('invoice_canceled',text(input.reason,500,'Alasan'),order.id);return {order:result};
    }
    const reference=text(input.reference,160,'Referensi bukti pembayaran');
    const paidAt=new Date(input.paidAt);if(typeof input.paidAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(input.paidAt)||!Number.isFinite(paidAt.getTime())||paidAt.toISOString().slice(0,19)!==input.paidAt.slice(0,19)||paidAt>new Date())throw fail('Waktu pembayaran tidak valid');
    const fee=input.fee===null||input.fee===undefined||input.fee===''?null:Number(input.fee);
    if(fee!==null&&(!['number','string'].includes(typeof input.fee)||! /^\d+(\.\d{1,2})?$/.test(String(input.fee))||!Number.isFinite(fee)||fee>Number(order.amount_idr)))throw fail('Biaya pembayaran tidak valid');
    if(order.status==='completed'){if(order.payment_reference!==reference||Number(order.payment_fee_idr??-1)!==Number(fee??-1)||new Date(order.paid_at).getTime()!==paidAt.getTime())throw fail('Invoice sudah dibayar dengan bukti berbeda',409);return {order};}
    if(order.status!=='pending')throw fail('Invoice dibatalkan',409);
    const entry=await grant(db,{workspaceId,amount:Number(order.credits)+Number(order.bonus_credits),reason:'business_topup',idempotencyKey:`business:${order.id}`,metadata:{operatorId:userId,invoiceNumber:order.invoice_number,customerId:input.customerId,paymentReference:reference},creditLot:{sourceType:'paid',amountIdr:order.amount_idr,paymentFeeIdr:fee}});
    const result=await r.recordPayment(db,order,userId,reference,paidAt.toISOString(),fee,entry);
    await audit('invoice_paid',`Pembayaran diverifikasi operator: ${reference}`,order.id);return {order:result};
   });
  }
 };
}
export const backofficeService=createBackofficeService();
