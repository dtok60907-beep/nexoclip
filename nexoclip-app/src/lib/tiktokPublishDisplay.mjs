export function tiktokPublishMessage(job) {
  if(job.status==='awaiting_creator')return 'Sent to TikTok inbox. Open the notification in TikTok to finish editing and publish.';
  if(job.status==='published')return job.privacy_level==='SELF_ONLY'?'Published privately on TikTok.':'Published on TikTok.';
  if(job.status==='failed')return 'TikTok could not publish this post.';
  if(job.status==='needs_review')return 'Delivery could not be confirmed. Check TikTok before creating another post.';
  if(job.status==='queued')return 'Queued. You can close this window; publishing continues in the background.';
  if(job.status==='uploading')return job.media_type==='photo'?'Preparing photos for TikTok…':'Uploading the video to TikTok…';
  if(job.provider_status==='PROCESSING_DOWNLOAD')return 'TikTok is downloading the photos…';
  return 'TikTok is processing the post. Publication and moderation can take time.';
}
