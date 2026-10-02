// Seedance picks its task type from the content roles it receives. A request
// with a first_frame (optionally plus a last_frame) is a first/last-frame
// task; anything carrying reference_image / reference_video / reference_audio
// parts is an omni-reference task. The two cannot be mixed, so wired frames
// are only sent as real frames when nothing else references the job.

export function isSeedance25Model(model) {
  return /seedance-2[.-]5/i.test(String(model || ''));
}

// Canvas also lists a wired first frame among referenceImages (as image 1, so
// @mention numbering lines up). Those copies do not count as extra references.
export function extraReferenceImages(parameters = {}) {
  const frameUrls = new Set((parameters.frameImages || []).map((frame) => frame?.url));
  return (parameters.referenceImages || []).filter((url) => !frameUrls.has(url));
}

export function isFrameTask(parameters = {}) {
  const frames = parameters.frameImages || [];
  if (!frames.some((frame) => frame?.frameType === 'first_frame')) return false;
  if (parameters.draftTaskId) return false;
  return extraReferenceImages(parameters).length === 0
    && !(parameters.referenceVideos || []).length
    && !(parameters.referenceAudios || []).length;
}
