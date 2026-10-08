import { SESSION_COOKIE } from '../../../../src/lib/auth/session.js';
import { getCurrentSession } from '../../../../src/services/authService.js';
import { requirePlatformOperator } from '../../../../src/lib/auth/platformOperator.js';
import { providerBillingService } from '../../../../src/services/providerBillingService.js';

const MAX_BODY_BYTES=3*1024*1024;
async function readJson(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw Object.assign(new Error('JSON diperlukan'),{status:415});
  if (Number(request.headers.get('content-length')||0)>MAX_BODY_BYTES) throw Object.assign(new Error('File terlalu besar'),{status:413});
  const reader=request.body?.getReader();
  const chunks=[];let bytes=0;
  if (reader) {
    try {
      while (true) {
        const {done,value}=await reader.read();if(done)break;
        bytes+=value.byteLength;
        if(bytes>MAX_BODY_BYTES){await reader.cancel();throw Object.assign(new Error('File terlalu besar'),{status:413});}
        chunks.push(value);
      }
    } finally {reader.releaseLock();}
  }
  try {return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch {throw Object.assign(new Error('JSON tidak valid'),{status:400});}
}
export function createProviderBillingHandlers({sessionLookup=getCurrentSession,service=providerBillingService,env=process.env}={}) {
  const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
  const handle=method=>async request=>{
    try {
      const session=await sessionLookup(request.cookies.get(SESSION_COOKIE)?.value);
      if(!session)return Response.json({error:'Authentication required'},{status:401,headers});
      requirePlatformOperator(session.user_id,env);
      if(method==='GET'){
        const params=new URL(request.url).searchParams;
        if(params.has('export')) {
          if(params.get('export')!=='reconciliation-csv')throw Object.assign(new Error('Format ekspor tidak valid'),{status:400});
          const result=await service.exportReconciliation({userId:session.user_id,id:params.get('id')});
          return new Response(result.csv,{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${result.filename}"`,'X-Content-Type-Options':'nosniff'}});
        }
        return Response.json(await service.read({userId:session.user_id,id:params.get('id'),page:params.get('page')||1,environment:params.get('environment')||'all',requestPage:params.get('requestPage')??1,requestSearch:params.get('requestSearch')??'',requestStatus:params.get('requestStatus')??'all'}),{headers});
      }
      if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Origin tidak valid'},{status:403,headers});
      const input=await readJson(request);
      return Response.json(await service.mutate({userId:session.user_id,input}),{headers});
    }catch(error){
      const status=error.status||(error.code==='23505'?409:500);
      const message=status>=500?'Billing provider tidak dapat diproses':error.code==='23505'?'Referensi atau baris tagihan sudah pernah diimpor':error.message;
      return Response.json({error:message},{status,headers});
    }
  };
  return {GET:handle('GET'),POST:handle('POST')};
}
export const {GET,POST}=createProviderBillingHandlers();
