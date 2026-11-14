import { isIP } from 'node:net';

export const MAX_TIKTOK_VIDEO_BYTES=250*1024*1024;

export function videoUploadPlan(size) {
  if(!Number.isSafeInteger(size)||size<1||size>500*1024*1024)throw new Error('Invalid TikTok video size');
  const chunkSize=Math.min(size,10*1024*1024);
  return {source:'FILE_UPLOAD',video_size:size,chunk_size:chunkSize,total_chunk_count:Math.max(1,Math.floor(size/chunkSize))};
}
export function uploadChunkEnd(start,size,chunkSize) {
  return size-start<2*chunkSize?size:start+chunkSize;
}
export async function readTikTokAsset(storage,key) {
  const download=await storage.createDownloadUrl({key});
  return storage.get(download.url||download);
}
export function verifiedPhotoUrl(value,env=process.env) {
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search)throw new Error('Photo URL must be public HTTPS without credentials or query parameters');
  if(isIP(url.hostname.replace(/^\[|\]$/g,''))||url.hostname==='localhost'||url.hostname.endsWith('.localhost'))throw new Error('Photo media must use a verified public domain');
  const prefixes=String(env.TIKTOK_VERIFIED_MEDIA_PREFIXES||'').split(',').map(p=>p.trim()).filter(Boolean);
  const allowedDomain=String(env.TIKTOK_VERIFIED_MEDIA_DOMAINS||'').split(',').map(d=>d.trim().toLowerCase()).filter(Boolean).some(domain=>
    /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(domain)&&!isIP(domain)&&!url.port&&(url.hostname===domain||url.hostname.endsWith(`.${domain}`)));
  const allowed=allowedDomain||prefixes.some(value=>{
    try{const prefix=new URL(value);return prefix.protocol==='https:'&&!prefix.username&&!prefix.password&&!prefix.search&&!prefix.hash&&url.origin===prefix.origin&&url.pathname.startsWith(prefix.pathname.replace(/\/?$/,'/'));}catch{return false;}
  });
  if(!allowed)throw Object.assign(new Error('Verify the photo media domain in TikTok and configure its URL prefix first'),{status:409});
  return url.href;
}
export function publicPostIds(result) {
  return [...new Set((Array.isArray(result.publicaly_available_post_id)?result.publicaly_available_post_id:[])
    .filter(id=>typeof id==='string'&&/^\d{1,30}$/.test(id)||typeof id==='number'&&Number.isSafeInteger(id)&&id>0).map(String))];
}
export function publishState(result,mode) {
  if(result.status==='PUBLISH_COMPLETE')return 'published';
  if(result.status==='FAILED')return 'failed';
  if(result.status==='SEND_TO_USER_INBOX'&&mode==='upload')return 'awaiting_creator';
  if(['PROCESSING_UPLOAD','PROCESSING_DOWNLOAD'].includes(result.status))return 'processing';
  throw Object.assign(new Error('TikTok returned an unknown publish status'),{code:'UNKNOWN_PUBLISH_STATUS'});
}
export function publishingError(error) {
  return error.code?String(error.code).replace(/[^a-zA-Z0-9_.-]/g,'').slice(0,100):String(error.message||'Publishing failed').replace(/https?:\/\/\S+/g,'[media URL]').slice(0,300);
}
