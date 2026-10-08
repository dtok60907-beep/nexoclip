import {getPool} from '../db/pool.js';
import {requirePlatformOperator} from '../lib/auth/platformOperator.js';
import {createAccountAccessRepository} from '../repositories/accountAccessRepository.js';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const uuid=value=>typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function createAccountAccessService({repository,env=process.env}={}) {
 const repo=()=>repository || createAccountAccessRepository(getPool());
 const canManage=(actor,target)=>actor.toLowerCase()!==target.toLowerCase() && !String(env.NEXOCLIP_OPERATOR_USER_IDS || '').split(',').some(id=>id.trim().toLowerCase()===target.toLowerCase());
 return {
  async read({userId,targetUserId}) {
   requirePlatformOperator(userId,env);if(!uuid(targetUserId))throw fail('ID akun tidak valid');
   const r=repo(),account=await r.account(targetUserId);if(!account)throw fail('Akun tidak ditemukan',404);
   return {account,canManage:canManage(userId,targetUserId),audit:await r.history(targetUserId)};
  },
  async mutate({userId,input}) {
   requirePlatformOperator(userId,env);
   if(!input || typeof input!=='object' || Array.isArray(input))throw fail('Permintaan tidak valid');
   const {targetUserId,requestKey,action,expectedVersion}=input;
   if(!uuid(targetUserId)||!uuid(requestKey))throw fail('ID akun atau kunci permintaan tidak valid');
   if(!canManage(userId,targetUserId))throw fail('Akun sendiri dan akun operator dilindungi dari perubahan akses melalui dashboard',409);
   if(!['suspend','activate','revoke_sessions'].includes(action))throw fail('Aksi tidak valid');
   if(typeof expectedVersion!=='string'||! /^(0|[1-9][0-9]{0,18})$/.test(expectedVersion)||BigInt(expectedVersion)>=9223372036854775807n)throw fail('Versi akun tidak valid');
   if(typeof input.reason!=='string'||input.reason.trim().length<10||input.reason.trim().length>500)throw fail('Alasan harus 10–500 karakter');
   const reason=input.reason.trim(),r=repo();
   return r.transaction(async db=>{
    const current=await r.account(targetUserId,db,true);if(!current)throw fail('Akun tidak ditemukan',404);
    const prior=await r.replay(db,userId,requestKey);
    if(prior){if(prior.target_user_id.toLowerCase()!==targetUserId.toLowerCase()||prior.action!==action||prior.reason!==reason||prior.previous_version!==expectedVersion)throw fail('Kunci permintaan telah digunakan untuk tindakan berbeda',409);return {event:prior,replayed:true};}
    if(current.access_version!==expectedVersion)throw fail('Status akun berubah. Muat ulang sebelum melanjutkan.',409);
    if(action==='suspend' && current.suspended_at)throw fail('Akun sudah disuspend',409);
    if(action==='activate' && !current.suspended_at)throw fail('Akun sudah aktif',409);
    const revokedSessions=action==='activate'?0:await r.revokeSessions(db,targetUserId);
    const account=await r.update(db,targetUserId,action);
    const event=await r.audit(db,{targetUserId,userId,requestKey,action,reason,previousVersion:expectedVersion,account,revokedSessions});
    return {event,replayed:false};
   });
  },
 };
}
export const accountAccessService=createAccountAccessService();
