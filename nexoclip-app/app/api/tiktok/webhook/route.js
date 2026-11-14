import { verifyTikTokWebhook } from '../../../../src/services/tiktokApi.mjs';
import { getPool } from '../../../../src/db/pool.js';
import { processTikTokWebhook } from '../../../../src/services/tiktokService.mjs';

export const runtime='nodejs'; export const dynamic='force-dynamic';
const supported=new Set(['authorization.removed','post.publish.failed','post.publish.complete','post.publish.inbox_delivered','post.publish.publicly_available','post.publish.no_longer_publicaly_available']);
export async function POST(request) {
  const raw=await request.text();
  if(!await verifyTikTokWebhook(raw,request.headers.get('tiktok-signature'),process.env.TIKTOK_CLIENT_SECRET||'')) return Response.json({error:'Invalid webhook signature'},{status:401});
  let event; try { event=JSON.parse(raw); if(typeof event.content==='string') event.content=JSON.parse(event.content); } catch { return Response.json({error:'Invalid event payload'},{status:400}); }
  if(event.client_key!==process.env.TIKTOK_CLIENT_KEY) return Response.json({error:'Unknown TikTok application'},{status:401});
  if(!supported.has(event.event)) return Response.json({ok:true,ignored:true});
  try { const result=await processTikTokWebhook(getPool(),event,raw); return Response.json({ok:true,...result}); }
  catch { return Response.json({error:'Webhook could not be processed'},{status:500}); }
}
