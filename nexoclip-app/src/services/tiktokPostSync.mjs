import { getTikTokAccessToken } from './tiktokService.mjs';
import { tikTokJson } from './tiktokApi.mjs';
import { claimTikTokPostSync, storeTikTokPostPage, failTikTokPostSync } from '../repositories/tiktokPostsRepository.mjs';

export async function syncDueTikTokPosts(pool, env=process.env, fetcher=fetch, getToken=getTikTokAccessToken) {
  const account=await claimTikTokPostSync(pool);
  if (!account) return;
  try {
    const token=await getToken(pool,account.id,env,fetcher);
    const body={max_count:20};
    if (account.posts_sync_cursor!==null) body.cursor=Number(account.posts_sync_cursor);
    const page=await tikTokJson('/video/list/?fields=id,title,video_description,cover_image_url,share_url,duration,create_time',token,body,
      (url,options)=>fetcher(url,{...options,signal:AbortSignal.timeout(30_000)}));
    if (!Array.isArray(page.videos)||typeof page.has_more!=='boolean'
      ||page.videos.some(v=>typeof v.id!=='string'||!/^\d+$/.test(v.id)||!Number.isFinite(v.create_time)||v.create_time<=0)
      ||(page.has_more&&(!Number.isSafeInteger(page.cursor)||String(page.cursor)===String(account.posts_sync_cursor)))) {
      throw Object.assign(new Error('Invalid TikTok video list'),{code:'INVALID_VIDEO_LIST'});
    }
    await storeTikTokPostPage(pool,account,page);
  } catch(error) { await failTikTokPostSync(pool,account,error); }
}
