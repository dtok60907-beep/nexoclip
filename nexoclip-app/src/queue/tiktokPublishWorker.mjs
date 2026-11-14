import { executePublishJob, pollTikTokPublishJobs } from '../services/tiktokService.mjs';
import { syncDueTikTokPosts } from '../services/tiktokPostSync.mjs';
import { syncDueTikTokProfiles } from '../services/tiktokProfileSync.mjs';

export function createTikTokPublishWorker({Queue,Worker,connection,pool,storage,env=process.env,schedule=globalThis.setInterval,clearSchedule=globalThis.clearInterval,onError=console.error}) {
  const queueName='tiktok-publishing',queue=new Queue(queueName,{connection});
  const worker=new Worker(queueName,async job=>executePublishJob(pool,storage,job.data.jobId,env),{connection,concurrency:1,limiter:{max:6,duration:60_000}});
  let scanning=false;
  const scan=async()=>{
    if(scanning)return;
    scanning=true;
    try {
    await pool.query(`UPDATE social_publish_jobs SET status=CASE WHEN provider_publish_id IS NULL THEN 'needs_review' ELSE 'queued' END,provider_error='Worker lease expired; safe resume required',updated_at=now() WHERE status='uploading' AND updated_at<now()-interval '10 minutes'`);
    const pending=await pool.query(`SELECT id FROM social_publish_jobs WHERE status='queued' AND (next_poll_at IS NULL OR next_poll_at<=now()) AND (scheduled_at IS NULL OR scheduled_at<=now()) ORDER BY created_at LIMIT 50`);
    for(const row of pending.rows) {
      const delivery=await queue.add('publish',{jobId:row.id},{jobId:row.id,removeOnComplete:true,removeOnFail:false});
      if(await delivery.getState()==='failed') await delivery.retry('failed');
    }
    await pollTikTokPublishJobs(pool,env);
    await syncDueTikTokPosts(pool,env);
    await syncDueTikTokProfiles(pool,env);
    } finally { scanning=false; }
  };
  const timer=schedule(()=>scan().catch(onError),10_000); timer.unref?.();
  return {async close(){clearSchedule(timer);await worker.pause();await worker.close();await queue.close();}};
}
