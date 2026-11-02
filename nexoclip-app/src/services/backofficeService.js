import { accountHistoryCsv } from '../lib/accountHistoryCsv.js';
import { accountHistoryFilters } from '../lib/accountHistoryFilters.js';
import { accountDirectoryFilters } from '../lib/accountDirectoryFilters.js';
import { randomUUID } from 'node:crypto';
import { getPool } from '../db/pool.js';
import { createBackofficeRepository } from '../repositories/backofficeRepository.js';
import { appendCreditEntryInTransaction } from './creditService.js';
import { isPlatformOperator, operatorError, mapEconomicsTotals } from './economicsService.js';
import { contractPricing, costIdrPerCredit } from './enterpriseContractPricing.js';
import { resendService } from './resendService.js';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const uuid=v=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v || '');
const text=(v,max,label)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max)throw fail(`${label} tidak valid`);return v.trim();};
const count=(v,zero=false)=>{if(!['number','string'].includes(typeof v)||! /^\d{1,8}(\.\d{1,6})?$/.test(String(v))||!Number.isFinite(Number(v))||Number(v)>(10000000)||Number(v)<(zero?0:0.000001))throw fail('Jumlah kredit tidak valid');return Number(v);};
// The share of the price that is profit once the credits are bought at cost; null when the deal sells below cost.
const profitShare=(amount,totalCredits,cost)=>{const share=Math.floor((1-totalCredits*cost/amount)*10000)/100;return share>=0?share:null;};
const money=v=>{if(!['number','string'].includes(typeof v)||! /^\d+$/.test(String(v))||!Number.isSafeInteger(Number(v))||Number(v)<1||Number(v)>2000000000)throw fail('Harga IDR tidak valid');return Number(v);};
export function createBackofficeService({ repository, env=process.env, grant=appendCreditEntryInTransaction }={}) {
 const repo=()=>repository||createBackofficeRepository(getPool());
 const sendDocumentEmail=async (order, type)=>{
  if(!env.RESEND_API_KEY||!order?.customer_user_id)return;
  const pool=getPool();
  const user=(await pool.query('SELECT email, display_name FROM users WHERE id=$1',[order.customer_user_id])).rows[0];
  if(!user?.email)return;
  const origin=String(env.APP_ORIGIN||env.NEXT_PUBLIC_APP_URL||'http://localhost:3000').replace(/\/$/,'');
  const url=`${origin}/admin/documents/${order.id}?doc=${type}`;
  const common={CUSTOMER_NAME:user.display_name||user.email,INVOICE_NUMBER:order.invoice_number,TOTAL:`Rp ${Number(order.amount_idr).toLocaleString('id-ID')}`,INVOICE_URL:`${origin}/admin/documents/${order.id}?doc=invoice`};
  const templateId=type==='invoice'?(env.RESEND_TEMPLATE_INVOICE_ISSUED||'a8937a47-3a89-4b8d-ba54-eba5971e478b'):(env.RESEND_TEMPLATE_DOCUMENT_READY||'5899e1c5-e826-4127-80ea-4b69463366ee');
  const variables=type==='invoice'?common:{CUSTOMER_NAME:common.CUSTOMER_NAME,DOCUMENT_TYPE:'Konfirmasi aktivasi kredit',DOCUMENT_URL:url};
  await resendService.sendTemplate({to:user.email,templateId,variables});
 };
 function authorize(userId) {if(!isPlatformOperator(userId,env))throw operatorError();}
 function ids(workspaceId,customerId) {if(!uuid(workspaceId)||(customerId&&!uuid(customerId)))throw fail('ID tidak valid');}
 return {
  async read({userId,workspaceId,customerId,q,status,page,pageSize,history,from,to,category,pricing}) {
   authorize(userId);
   if(pricing)return contractPricing(env);
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
   const outcome=await r.transaction(async db=>{
    if(!await r.lockWorkspace(db,workspaceId))throw fail('Workspace tidak ditemukan',404);
    if(!input.customerId||!await r.member(db,workspaceId,input.customerId))throw fail('Pelanggan tidak ada pada workspace ini',404);
    const audit=(action,reason,entityId)=>r.audit(db,{workspaceId,userId,customerId:input.customerId,action,reason,entityId});
    if(input.action==='create') {
     const v={workspaceId,userId,customerId:input.customerId,requestKey:input.requestKey,invoice:`NXB-${randomUUID().toUpperCase()}`,company:text(input.company,160,'Perusahaan'),credits:count(input.credits),bonus:count(input.bonus??0,true),amount:money(input.amount),notes:typeof input.notes==='string'?input.notes.trim():'',costIdrPerCredit:costIdrPerCredit(env)};
     v.profitPercent=profitShare(v.amount,v.credits+v.bonus,v.costIdrPerCredit);
     if(v.notes.length>1000||v.credits+v.bonus>10000000)throw fail('Ketentuan tidak valid');
     const order=await r.createOrder(db,v);
     if(order.customer_user_id!==v.customerId||order.company_name!==v.company||Number(order.credits)!==v.credits||Number(order.bonus_credits)!==v.bonus||Number(order.amount_idr)!==v.amount||order.notes!==v.notes)throw fail('Kunci permintaan telah dipakai untuk ketentuan berbeda',409);
     // Replays do not duplicate audit records.
     const created=order.invoice_number===v.invoice;
     if(created)await audit('invoice_created','Penawaran kredit bisnis dibuat',order.id);
     return {order,created};
    }
    if(input.action==='grant') {
     const amount=count(input.credits);const reason=text(input.reason,500,'Alasan');
     if(!['bonus','trial','compensation'].includes(input.type))throw fail('Jenis kredit tidak valid');
     const key=`admin-grant:${input.requestKey}`;const existing=await r.existingGrant(db,workspaceId,key);
     if(existing){if(Number(existing.amount)!==amount||existing.metadata?.customerId!==input.customerId||existing.metadata?.type!==input.type||existing.metadata?.reason!==reason||existing.metadata?.operatorId!==userId)throw fail('Kunci permintaan sudah dipakai',409);return {entry:existing};}
     const entry=await grant(db,{workspaceId,amount,reason:`admin_${input.type}`,idempotencyKey:key,metadata:{operatorId:userId,customerId:input.customerId,type:input.type,reason},creditLot:{sourceType:'promo'}});
     await audit('credit_granted',`${input.type}: ${reason}`,entry.id);return {entry};
    }
    if(input.action==='adjust') {
     // Sets the workspace balance to a target (0 empties it): the ledger takes the difference.
     const target=count(input.targetBalance,true);const reason=text(input.reason,500,'Alasan');
     const key=`admin-adjust:${input.requestKey}`;const existing=await r.existingGrant(db,workspaceId,key);
     if(existing){if(existing.metadata?.targetBalance!==target||existing.metadata?.customerId!==input.customerId||existing.metadata?.reason!==reason||existing.metadata?.operatorId!==userId)throw fail('Kunci permintaan sudah dipakai',409);return {entry:existing};}
     const previous=Number((await db.query('SELECT balance FROM credit_accounts WHERE workspace_id=$1 FOR UPDATE',[workspaceId])).rows[0]?.balance||0);
     const delta=Math.round((target-previous)*1e6)/1e6;
     if(delta===0)return {entry:null,balance:previous};
     const entry=await grant(db,{workspaceId,amount:delta,reason:'admin_adjustment',idempotencyKey:key,metadata:{operatorId:userId,customerId:input.customerId,reason,targetBalance:target,previousBalance:previous},...(delta>0?{creditLot:{sourceType:'promo'}}:{})});
     await audit('credit_adjusted',`Saldo ${previous} → ${target}: ${reason}`,entry.id);return {entry,balance:target};
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
    // Settled invoices cannot be edited, so a mistyped year must not get through.
    if(paidAt<new Date(Date.now()-366*86400000))throw fail('Waktu pembayaran lebih dari setahun lalu. Periksa tahunnya.');
    const fee=input.fee===null||input.fee===undefined||input.fee===''?null:Number(input.fee);
    if(fee!==null&&(!['number','string'].includes(typeof input.fee)||! /^\d+(\.\d{1,2})?$/.test(String(input.fee))||!Number.isFinite(fee)||fee>Number(order.amount_idr)))throw fail('Biaya pembayaran tidak valid');
    if(order.status==='completed'){if(order.payment_reference!==reference||Number(order.payment_fee_idr??-1)!==Number(fee??-1)||new Date(order.paid_at).getTime()!==paidAt.getTime())throw fail('Invoice sudah dibayar dengan bukti berbeda',409);return {order,settledNow:false};}
    if(order.status!=='pending')throw fail('Invoice dibatalkan',409);
    const entry=await grant(db,{workspaceId,amount:Number(order.credits)+Number(order.bonus_credits),reason:'business_topup',idempotencyKey:`business:${order.id}`,metadata:{operatorId:userId,invoiceNumber:order.invoice_number,customerId:input.customerId,paymentReference:reference},creditLot:{sourceType:'paid',amountIdr:order.amount_idr,paymentFeeIdr:fee}});
    const result=await r.recordPayment(db,order,userId,reference,paidAt.toISOString(),fee,entry);
    await audit('invoice_paid',`Pembayaran diverifikasi operator: ${reference}`,order.id);return {order:result,settledNow:true};
   });
   if(input.action==='create'&&outcome.created) await sendDocumentEmail(outcome.order,'invoice').catch(error=>console.warn('[backoffice] invoice email failed:',error.message));
   if(input.action==='settle'&&outcome.settledNow) {
    await sendDocumentEmail(outcome.order,'invoice').catch(error=>console.warn('[backoffice] invoice email failed:',error.message));
    await sendDocumentEmail(outcome.order,'activation').catch(error=>console.warn('[backoffice] activation email failed:',error.message));
   }
   return outcome;
  }
 };
}
export const backofficeService=createBackofficeService();
