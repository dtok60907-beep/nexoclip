import { randomUUID } from 'node:crypto';
import { getTikTokAccessToken } from './tiktokService.mjs';
import { tikTokJson } from './tiktokApi.mjs';
import { storeTikTokVideoDetails } from '../repositories/tiktokPostsRepository.mjs';

export const TIKTOK_VIDEO_FIELDS='id,title,video_description,cover_image_url,share_url,duration,create_time,view_count,like_count,comment_count,share_count';
export async function queryTikTokVideos(pool,{accountId,workspaceId,userId,videoIds},env=process.env,fetcher=fetch,getToken=getTikTokAccessToken) {
  if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(String(accountId)))throw Object.assign(new Error('Invalid TikTok account'),{status:400});
  if(!Array.isArray(videoIds)||videoIds.length<1||videoIds.length>20||videoIds.some(id=>typeof id!=='string'||!/^\d{1,30}$/.test(id)))throw Object.assign(new Error('Provide 1–20 TikTok video IDs as strings'),{status:400});
  const result=await pool.query(`SELECT id FROM social_accounts WHERE id=$1 AND workspace_id=$2 AND user_id=$3 AND provider='tiktok' AND status='connected' AND 'video.list'=ANY(granted_scopes)`,[accountId,workspaceId,userId]);
  if(!result.rowCount)throw Object.assign(new Error('TikTok account unavailable or video.list permission missing'),{status:404});
  const ids=[...new Set(videoIds)];
  const token=await getToken(pool,accountId,env,fetcher);
  const data=await tikTokJson(`/video/query/?fields=${TIKTOK_VIDEO_FIELDS}`,token,{filters:{video_ids:ids}},(url,options)=>fetcher(url,{...options,signal:AbortSignal.timeout(30_000)}));
  if(!Array.isArray(data.videos)||data.videos.some(v=>!ids.includes(v.id)||!Number.isFinite(v.create_time)||v.create_time<=0))throw Object.assign(new Error('TikTok returned invalid video metadata'),{status:502});
  await storeTikTokVideoDetails(pool,{accountId,workspaceId,userId,videos:data.videos,runId:randomUUID()});
  return {refreshedIds:data.videos.map(v=>v.id),unavailableIds:ids.filter(id=>!data.videos.some(v=>v.id===id))};
}
