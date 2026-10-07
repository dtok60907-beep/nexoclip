import { requirePlatformOperator } from '../../../../src/lib/auth/platformOperator.js';
import { SESSION_COOKIE } from '../../../../src/lib/auth/session.js';
import { getCurrentSession } from '../../../../src/services/authService.js';
import { backofficeService } from '../../../../src/services/backofficeService.js';
export function createBackofficeHandlers({ sessionLookup=getCurrentSession,service=backofficeService,env=process.env }={}) {
 const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
 const handle=method=>async request=>{
  try {
   const session=await sessionLookup(request.cookies.get(SESSION_COOKIE)?.value);
   if(!session)return Response.json({error:'Authentication required'},{status:401,headers});
   requirePlatformOperator(session.user_id,env);
   if(method==='POST'){
    if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Origin tidak valid'},{status:403,headers});
    if(!request.headers.get('content-type')?.startsWith('application/json'))return Response.json({error:'JSON diperlukan'},{status:415,headers});
    if(Number(request.headers.get('content-length')||0)>12000)return Response.json({error:'Permintaan terlalu besar'},{status:413,headers});
    const body=await request.text();if(body.length>12000)return Response.json({error:'Permintaan terlalu besar'},{status:413,headers});
    let input;try{input=JSON.parse(body);}catch{ return Response.json({error:'JSON tidak valid'},{status:400,headers}); }
    if(!input||typeof input!=='object'||Array.isArray(input))return Response.json({error:'Permintaan tidak valid'},{status:400,headers});
    return Response.json(await service.mutate({userId:session.user_id,workspaceId:input.workspaceId,input}),{headers});
   }
   const p=new URL(request.url).searchParams;
   return Response.json(await service.read({userId:session.user_id,workspaceId:p.get('workspaceId'),customerId:p.get('customerId'),q:p.get('q')}),{headers});
  }catch(e){const status=e.status||(e.code==='23505'?409:500);return Response.json({error:status>=500?'Backoffice tidak dapat diproses':e.code==='23505'?'Referensi pembayaran sudah digunakan':e.message},{status,headers});}
 };
 return {GET:handle('GET'),POST:handle('POST')};
}
export const {GET,POST}=createBackofficeHandlers();
