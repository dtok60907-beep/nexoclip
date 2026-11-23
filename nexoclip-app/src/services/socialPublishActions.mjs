import { getTikTokAccessToken } from './tiktokService.mjs';
import { tikTokJson } from './tiktokApi.mjs';
import { publishingError, publishState, publicPostIds } from './tiktokPublishMedia.mjs';
import { validateSocialSchedule } from '../lib/socialSchedule.mjs';
import { findSocialPublishJob } from '../repositories/socialPublishRepository.mjs';

const fail = (message, status) => Object.assign(new Error(message), { status });
export async function actOnSocialPublishJob(pool, input, { env = process.env, fetcher = fetch, getToken = getTikTokAccessToken } = {}) {
  const { workspaceId, userId, jobId, action } = input;
  if (!['cancel', 'reschedule', 'check', 'resume'].includes(action)) throw fail('Unsupported publishing action', 400);
  if (action === 'cancel' || action === 'reschedule') {
    const schedule = action === 'reschedule' ? validateSocialSchedule(input.scheduledAt, input.timeZone) : null;
    if (schedule && !schedule.scheduledAt) throw fail('Choose a future publish time', 400);
    const changed = await pool.query(`UPDATE social_publish_jobs SET
      status=CASE WHEN $4='cancel' THEN 'cancelled' ELSE 'scheduled' END,
      scheduled_at=CASE WHEN $4='reschedule' THEN $5::timestamptz ELSE scheduled_at END,
      schedule_timezone=CASE WHEN $4='reschedule' THEN $6 ELSE schedule_timezone END,updated_at=now()
      WHERE id=$1 AND workspace_id=$2 AND user_id=$3 AND provider='tiktok' AND status='scheduled' AND provider_publish_id IS NULL RETURNING id`,
    [jobId, workspaceId, userId, action, schedule?.scheduledAt || null, schedule?.timeZone || null]);
    if (!changed.rowCount) {
      if (!await findSocialPublishJob(pool, input)) throw fail('Publishing job not found', 404);
      throw fail('Only a scheduled post that has not started can be changed', 409);
    }
    return findSocialPublishJob(pool, input);
  }
  // Claim a short status-check lease; neither action creates a new TikTok request.
  const claim = await pool.query(`UPDATE social_publish_jobs SET next_poll_at=date_trunc('milliseconds',now())+interval '60 seconds'
    WHERE id=$1 AND workspace_id=$2 AND user_id=$3 AND provider='tiktok' AND status='needs_review' AND provider_publish_id IS NOT NULL
      AND (next_poll_at IS NULL OR next_poll_at<=now()) RETURNING *`, [jobId, workspaceId, userId]);
  const job = claim.rows[0];
  if (!job) {
    const own = await findSocialPublishJob(pool, input);
    if (!own) throw fail('Publishing job not found', 404);
    throw fail(own.can_check_status ? 'Status is being checked or has changed. Wait a minute, then refresh before trying again.' :
      'TikTok did not return a publish ID. Check the TikTok account before creating another post; this request cannot be safely resent.', 409);
  }
  try {
    const token = await getToken(pool, job.social_account_id, env, fetcher);
    const result = await tikTokJson('/post/publish/status/fetch/', token, { publish_id: job.provider_publish_id }, fetcher);
    let next = publishState(result, job.mode);
    if (result.status === 'PROCESSING_UPLOAD') {
      next = action === 'resume' && job.upload_url_encrypted ? 'queued' : 'needs_review';
    }
    await pool.query(`UPDATE social_publish_jobs SET status=$2,provider_status=$3,provider_error=$4,public_post_ids=$5,
      next_poll_at=CASE WHEN $2='queued' THEN now() WHEN $2 IN ('processing','awaiting_creator') THEN now()+interval '60 seconds' WHEN $2='needs_review' THEN next_poll_at ELSE NULL END,
      updated_at=now() WHERE id=$1 AND status='needs_review' AND next_poll_at=$6`,
    [job.id, next, result.status, result.fail_reason || null, publicPostIds(result), job.next_poll_at]);
  } catch (error) {
    await pool.query(`UPDATE social_publish_jobs SET provider_error=$2,updated_at=now()
      WHERE id=$1 AND status='needs_review' AND next_poll_at=$3`, [job.id, publishingError(error), job.next_poll_at]);
    throw fail('TikTok status could not be checked. Wait a minute and try again; no new post was sent.', 502);
  }
  return findSocialPublishJob(pool, input);
}
