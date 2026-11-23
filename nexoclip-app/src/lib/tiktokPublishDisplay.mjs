export function tiktokPublishMessage(job) {
  if(job.status==='scheduled')return 'Scheduled. You can change the time or cancel before publishing starts.';
  if(job.status==='cancelled')return 'Cancelled before sending to TikTok. Nothing was published by this job.';
  if(job.status==='awaiting_creator')return 'Sent to TikTok inbox. Open the notification in TikTok to finish editing and publish.';
  if(job.status==='published')return job.privacy_level==='SELF_ONLY'?'Published privately on TikTok.':'Published on TikTok.';
  if(job.status==='failed')return 'TikTok could not publish this post.';
  if(job.status==='needs_review')return job.can_check_status?'Delivery needs review. Check TikTok status before creating another post.':'TikTok did not confirm a publish ID. Check your TikTok profile and inbox before creating another post; automatic resending is disabled.';
  if(job.status==='queued')return 'Queued. You can close this window; publishing continues in the background.';
  if(job.status==='uploading')return job.media_type==='photo'?'Preparing photos for TikTok…':'Uploading the video to TikTok…';
  if(job.provider_status==='PROCESSING_DOWNLOAD')return 'TikTok is downloading the photos…';
  return 'TikTok is processing the post. Publication and moderation can take time.';
}
