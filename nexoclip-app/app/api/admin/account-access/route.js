import {requirePlatformOperator} from '../../../../src/lib/auth/platformOperator.js';
import {SESSION_COOKIE} from '../../../../src/lib/auth/session.js';
import {getCurrentSession} from '../../../../src/services/authService.js';
import {accountAccessService} from '../../../../src/services/accountAccessService.js';
export function createAccountAccessHandlers({sessionLookup=getCurrentSession,service=accountAccessService,env=process.env}={}) {
 const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
 const handle=method=>async request=>{
  try {
   const session=await sessionLookup(request.cookies.get(SESSION_COOKIE)?.value);
   if(!session)return Response.json({error:'Authentication required'},{status:401,headers});
   requirePlatformOperator(session.user_id,env);
   if(method==='GET')return Response.json(await service.read({userId:session.user_id,targetUserId:new URL(request.url).searchParams.get('targetUserId')}),{headers});
   if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Origin tidak valid'},{status:403,headers});
   if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return Response.json({error:'JSON diperlukan'},{status:415,headers});
   const reader=request.body?.getReader();let size=0;const chunks=[];
   if(reader){try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4000){await reader.cancel();throw Object.assign(new Error('Permintaan terlalu besar'),{status:413});}chunks.push(value);}}finally{reader.releaseLock();}}
   let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Object.assign(new Error('JSON tidak valid'),{status:400});}
   return Response.json(await service.mutate({userId:session.user_id,input}),{headers});
  }catch(error){const status=error.status||(error.code==='23505'?409:500);return Response.json({error:status>=500?'Akses akun tidak dapat diproses':error.code==='23505'?'Kunci tindakan sudah digunakan':error.message},{status,headers});}
 };
 return {GET:handle('GET'),POST:handle('POST')};
}
export const {GET,POST}=createAccountAccessHandlers();
