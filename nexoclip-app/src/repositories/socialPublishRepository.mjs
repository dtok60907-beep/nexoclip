export async function listSocialPublishJobs(pool, { workspaceId, userId }) {
  return (await pool.query(`SELECT j.id,j.mode,j.media_type,j.status,j.caption,j.privacy_level,j.public_post_ids,
    j.provider_status,j.provider_error,j.created_at,j.updated_at,j.scheduled_at,j.schedule_timezone,
    (j.provider_publish_id IS NOT NULL) AS can_check_status,
    (j.provider_publish_id IS NOT NULL AND j.upload_url_encrypted IS NOT NULL) AS can_resume_upload,
    a.display_name AS account_name FROM social_publish_jobs j
    JOIN social_accounts a ON a.id=j.social_account_id AND a.workspace_id=j.workspace_id
    WHERE j.workspace_id=$1 AND j.user_id=$2 AND j.provider='tiktok' ORDER BY j.created_at DESC LIMIT 30`, [workspaceId, userId])).rows;
}

export async function findSocialPublishJob(pool, { workspaceId, userId, jobId }) {
  return (await pool.query(`SELECT id,mode,media_type,status,caption,privacy_level,public_post_ids,provider_status,
    provider_error,created_at,updated_at,scheduled_at,schedule_timezone,
    (provider_publish_id IS NOT NULL) AS can_check_status,
    (provider_publish_id IS NOT NULL AND upload_url_encrypted IS NOT NULL) AS can_resume_upload
    FROM social_publish_jobs WHERE id=$1 AND workspace_id=$2 AND user_id=$3 AND provider='tiktok'`, [jobId, workspaceId, userId])).rows[0] || null;
}

export async function listSocialPublishDrafts(pool, { workspaceId, userId }) {
  return (await pool.query(`SELECT id,content,version,created_at,updated_at FROM social_publish_drafts
    WHERE workspace_id=$1 AND user_id=$2 ORDER BY updated_at DESC LIMIT 50`, [workspaceId, userId])).rows;
}
