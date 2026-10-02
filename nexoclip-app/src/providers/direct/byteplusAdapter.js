import { createOpenAIAdapter } from './openaiAdapter.js';

export function createBytePlusAdapter({ apiKey, baseUrl, fetch: fetchImpl = globalThis.fetch } = {}) {
  if (!baseUrl) throw new TypeError('baseUrl is required');
  const adapter = createOpenAIAdapter({ apiKey, baseUrl, fetch: fetchImpl });
  const root = String(baseUrl).replace(/\/+$/, '');
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  async function request(path, options = {}) {
    let response;
    try { response = await fetchImpl(`${root}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } }); }
    catch { throw Object.assign(new Error('BytePlus direct request failed'), { provider: 'byteplus', status: 503, code: 'BYTEPLUS_UNAVAILABLE' }); }
    if (!response.ok) {
      // BytePlus returns a real reason (content moderation, invalid param, quota, ...) in the
      // response body — surface it instead of a generic "request failed" that hides why.
      let detail = null;
      try {
        const body = await response.json();
        detail = body?.error?.message || body?.message || null;
      } catch { /* no readable body */ }
      const suffix = detail ? `: ${detail}` : '';
      const assetNotFound = response.status === 404 || /(?:asset|reference)[^\n]*not found|not found[^\n]*(?:asset|reference)/i.test(detail || '');
      throw Object.assign(new Error(`BytePlus direct request failed${suffix}`), {
        provider: 'byteplus', status: response.status, code: 'BYTEPLUS_REQUEST_FAILED', assetNotFound,
      });
    }
    return response;
  }
  return {
    ...adapter,
    async generate(params) { return { ...(await adapter.generate(params)), provider: 'byteplus' }; },
    async submit({ model, prompt, duration, resolution, aspectRatio, generateAudio, watermark, returnLastFrame, draft, outputFormat, omniReferenceTaskType, draftTaskId, frameTask = false, frameImages, referenceImages, referenceVideos, referenceAudios } = {}) {
      // Draft finalization uses only a draft_task content item. BytePlus reuses the
      // original prompt/assets/settings from the draft and rejects them if repeated.
      const content = draftTaskId
        ? [{ type: 'draft_task', draft_task: { id: draftTaskId } }]
        : [{ type: 'text', text: prompt }];
      // BytePlus requires an explicit role on image/video content parts — some models
      // (e.g. the mini variant) reject an image_url with no role ("role must be
      // specified for image contents"); others silently accept it without one. Always
      // sending it is the only combination confirmed to work across model variants.
      if (!draftTaskId) {
        for (const image of referenceImages || []) content.push({ type: 'image_url', role: 'reference_image', image_url: { url: image } });
        // A first/last-frame task keeps each frame's own role so Seedance pins it
        // as the opening/closing frame. Mixed with references it is an omni
        // reference task, where frame roles are not allowed.
        for (const frame of frameImages || []) {
          const url = frame?.image_url?.url;
          if (!url) continue;
          const role = frameTask && ['first_frame', 'last_frame'].includes(frame.frame_type) ? frame.frame_type : 'reference_image';
          content.push({ type: 'image_url', role, image_url: { url } });
        }
        for (const video of referenceVideos || []) content.push({ type: 'video_url', role: 'reference_video', video_url: { url: video } });
        for (const audio of referenceAudios || []) content.push({ type: 'audio_url', role: 'reference_audio', audio_url: { url: audio } });
      }
      // Video generation is async-task based and lives under /tasks — /contents/generations
      // (used for images) silently accepts the request and returns an empty 200 for video models.
      const response = await request('/contents/generations/tasks', { method: 'POST', body: JSON.stringify({ model, content, ...(duration !== undefined && !draftTaskId ? { duration } : {}), ...(resolution ? { resolution } : {}), ...(aspectRatio && !draftTaskId ? { ratio: aspectRatio } : {}), ...(generateAudio !== undefined && !draftTaskId ? { generate_audio: generateAudio } : {}), ...(draft !== undefined ? { draft: Boolean(draft) } : {}), ...(outputFormat ? { output_format: outputFormat } : {}), ...(watermark !== undefined ? { watermark: Boolean(watermark) } : {}), ...(returnLastFrame ? { return_last_frame: true } : {}), ...(omniReferenceTaskType && !draftTaskId ? { omni_reference_task_type: omniReferenceTaskType } : {}) }) });
      const payload = await response.json();
      return { ...payload, provider: 'byteplus', polling_url: payload.polling_url || null };
    },
    async poll(jobId) { return request(`/contents/generations/tasks/${encodeURIComponent(jobId)}`).then((response) => response.json()); },
    async downloadContent(jobId, index = 0) {
      const status = await this.poll(jobId);
      // A completed task's `content` is a single object ({ video_url }), not an array.
      const url = status?.content?.video_url || status?.content?.url || status?.content?.[index]?.url || status?.content?.[index]?.video_url || status?.output?.[index]?.url;
      if (!url) throw Object.assign(new Error('BytePlus returned no video content'), { provider: 'byteplus', status: 502, code: 'BYTEPLUS_INVALID_RESPONSE' });
      // The task result is a pre-signed TOS URL on a *different* host than the Ark API
      // (ark-acg-...tos-...volces.com, not the Ark base URL) — fetch it directly, unauthenticated,
      // rather than routing it through `request()` (which would send it to the wrong host).
      let response;
      try { response = await fetchImpl(url); }
      catch { throw Object.assign(new Error('BytePlus video download failed'), { provider: 'byteplus', status: 503, code: 'BYTEPLUS_UNAVAILABLE' }); }
      if (!response.ok) throw Object.assign(new Error('BytePlus video download failed'), { provider: 'byteplus', status: response.status, code: 'BYTEPLUS_REQUEST_FAILED' });
      return { buffer: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get('content-type') || 'video/mp4' };
    },
  };
}
