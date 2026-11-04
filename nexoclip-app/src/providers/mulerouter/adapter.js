const DEFAULT_BASE_URL = 'https://api.mulerouter.ai';
const DEFAULT_VENDOR = 'carrothub';
const MODEL_VENDORS = Object.freeze({
  'qwen-image-edit-spicy': 'carrothub',
  'wan-2.5': 'alibaba',
  'wan-2.6': 'alibaba',
  'wan-2.7': 'alibaba',
  'w3.0-video': 'alibaba',
  'w3.0-video-pro': 'alibaba',
  'w3.0-video-prime': 'alibaba',
  'w3.0-video-prime-pro': 'alibaba',
});

export const MULEROUTER_MODELS = Object.freeze([
  'w3.0-video', 'w3.0-video-pro', 'w3.0-video-prime', 'w3.0-video-prime-pro',
  'berry-1.0', 'berry-1.0-pro', 'berry-1.0-turbo', 'berry-1.0-turbo-pro',
  'z-image-spicy-pro', 'qwen-image-edit-spicy',
]);

const TERMINAL = new Set(['completed', 'succeeded', 'success', 'failed', 'cancelled', 'canceled', 'expired', 'error']);

function errorFor(status, message = '') {
  const code = status === 401 ? 'MULEROUTER_AUTHENTICATION_FAILED'
    : status === 403 ? 'MULEROUTER_AUTHORIZATION_FAILED'
      : status >= 500 ? 'MULEROUTER_UNAVAILABLE' : 'MULEROUTER_REQUEST_FAILED';
  return Object.assign(new Error(message || 'MuleRouter request failed'), { code, status });
}

function value(payload, ...keys) {
  for (const key of keys) {
    const parts = key.split('.');
    let current = payload;
    for (const part of parts) current = current?.[part];
    if (current !== undefined && current !== null) return current;
  }
  return undefined;
}

function normalizeStatus(payload) {
  const raw = String(value(payload, 'status', 'state', 'task_info.status', 'data.status', 'data.task_info.status') || '').toLowerCase();
  const status = raw === 'succeeded' || raw === 'success' ? 'completed'
    : raw === 'canceled' || raw === 'error' ? (raw === 'error' ? 'failed' : 'cancelled')
      : raw || 'running';
  const output = value(payload, 'output', 'data.output', 'outputs', 'data.outputs', 'images', 'data.images', 'videos', 'data.videos', 'result', 'data.result');
  const urls = Array.isArray(output) ? output : output ? [output] : [];
  return {
    ...payload,
    status,
    ...(urls.length ? { output: urls[0], outputs: urls } : {}),
    ...(value(payload, 'error', 'message', 'data.error') ? { error: value(payload, 'error', 'message', 'data.error') } : {}),
  };
}

function outputUrl(output) {
  if (typeof output === 'string') return output;
  return output?.url || output?.video_url || output?.image_url || output?.uri || null;
}

function routeFor(model, vendor) {
  const raw = String(model || '').trim();
  if (!raw) throw new TypeError('model is required');
  const slash = raw.indexOf('/');
  if (raw.startsWith('mulerouter/') && slash > 0) return { vendor: raw.slice(slash + 1).split('/')[0], model: raw.slice(raw.indexOf('/', slash + 1) + 1) || raw.slice(slash + 1) };
  return { vendor: MODEL_VENDORS[raw] || vendor || DEFAULT_VENDOR, model: raw };
}

function requestBody(params) {
  if (params.frameImages?.length && (params.referenceImages?.length || params.referenceVideos?.length || params.referenceAudios?.length)) {
    throw Object.assign(new Error('Keyframes cannot be combined with reference media'), { code: 'INVALID_REFERENCE_COMBINATION', status: 400 });
  }
  const body = { prompt: params.prompt };
  const isQwenImageEditSpicy = params.model === 'qwen-image-edit-spicy';
  if (params.duration !== undefined) body.duration = Number(params.duration);
  if (params.resolution) body.resolution = params.resolution;
  if (params.aspectRatio && !isQwenImageEditSpicy) body.ratio = params.aspectRatio;
  if (params.seed !== undefined) body.seed = params.seed;
  if (params.generateAudio !== undefined) body.audio = Boolean(params.generateAudio);
  if (params.quality) body.quality = params.quality;
  if (params.referenceImages?.length) {
    if (isQwenImageEditSpicy) {
      body.image = params.referenceImages[0];
      if (params.referenceImages.length > 1) body.reference_images = params.referenceImages.slice(1, 3);
    } else {
      body.reference_images = params.referenceImages;
    }
  }
  if (params.referenceVideos?.length) body.reference_videos = params.referenceVideos;
  if (params.referenceAudios?.length) body.reference_audios = params.referenceAudios;
  if (params.frameImages?.length) {
    const first = params.frameImages.find((frame) => frame?.frame_type === 'first_frame' || frame?.frameType === 'first_frame')?.image_url?.url;
    const last = params.frameImages.find((frame) => frame?.frame_type === 'last_frame' || frame?.frameType === 'last_frame')?.image_url?.url;
    if (first) body.first_frame = first;
    if (last) body.last_frame = last;
  }
  return { ...body, ...(params.muleRouterPayload || {}) };
}

export function createMuleRouterAdapter({ baseUrl = DEFAULT_BASE_URL, apiKey, vendor = DEFAULT_VENDOR, fetch: fetchImpl = globalThis.fetch, pollIntervalMs = 1_000, maxPolls = 120 } = {}) {
  if (!apiKey || typeof apiKey !== 'string') throw new TypeError('apiKey is required');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch is required');
  const root = String(baseUrl).replace(/\/+$/, '');
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  const endpoint = (model, id = '') => {
    const route = routeFor(model, vendor);
    return `${root}/vendors/${encodeURIComponent(route.vendor)}/v1/${encodeURIComponent(route.model)}/generation${id ? `/${encodeURIComponent(id)}` : ''}`;
  };
  async function json(url, options) {
    let response;
    try { response = await fetchImpl(url, options); } catch { throw errorFor(503, 'MuleRouter is temporarily unavailable'); }
    if (!response.ok) {
      let detail = '';
      try { const body = await response.json(); detail = body?.error?.message || body?.message || ''; } catch { /* empty */ }
      throw errorFor(response.status, detail);
    }
    return response.json();
  }
  async function submit(params = {}) {
    if (!params.prompt || typeof params.prompt !== 'string') throw new TypeError('prompt is required');
    const payload = await json(endpoint(params.model), { method: 'POST', headers, body: JSON.stringify(requestBody(params)) });
    const id = value(payload, 'id', 'task_id', 'taskId', 'task_info.id', 'data.id', 'data.task_id', 'data.task_info.id');
    if (!id) throw Object.assign(new Error('MuleRouter returned no task id'), { code: 'MULEROUTER_INVALID_RESPONSE' });
    const route = routeFor(params.model, vendor);
    const requestId = `mulerouter:${route.vendor}:${route.model}:${id}`;
    return { provider: 'mulerouter', providerRequestId: requestId, id: requestId, status: normalizeStatus(payload).status, usage: payload.usage || {} };
  }
  async function poll(jobId, model = '') {
    if (!jobId || typeof jobId !== 'string') throw new TypeError('jobId is required');
    const encoded = jobId.startsWith('mulerouter:') ? jobId.split(':') : null;
    const routeModel = encoded ? `mulerouter/${encoded[1]}/${encoded[2]}` : (model || 'w3.0-video');
    const taskId = encoded ? encoded.slice(3).join(':') : jobId;
    const payload = await json(endpoint(routeModel, taskId), { headers: { Authorization: headers.Authorization } });
    const status = normalizeStatus(payload);
    if (status.status === 'completed' && !status.output && !status.outputs?.length) {
      const output = value(payload, 'data.url', 'url', 'video_url', 'image_url');
      if (output) status.output = output;
    }
    return status;
  }
  async function downloadContent(jobId, index = 0, output) {
    let url = outputUrl(output);
    if (!url) {
      const status = await poll(jobId);
      url = outputUrl((status.outputs || [])[index] || status.output);
    }
    if (!url) throw Object.assign(new Error('MuleRouter returned no output URL'), { code: 'MULEROUTER_INVALID_RESPONSE' });
    let response;
    try { response = await fetchImpl(url, { headers: { Authorization: headers.Authorization } }); } catch { throw errorFor(503); }
    if (!response.ok) throw errorFor(response.status);
    return { buffer: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get('content-type') || 'application/octet-stream' };
  }
  async function generate(params = {}) {
    const submitted = await submit(params);
    for (let attempt = 0; attempt < maxPolls; attempt += 1) {
      const status = await poll(submitted.providerRequestId, params.model);
      if (status.status === 'completed') {
        const outputs = status.outputs || (status.output ? [status.output] : []);
        return { ...submitted, status: 'succeeded', outputs, usage: { ...submitted.usage, ...(status.usage || {}) } };
      }
      if (TERMINAL.has(status.status)) throw Object.assign(new Error('MuleRouter generation failed'), { code: 'MULEROUTER_GENERATION_FAILED', status: 502, providerRequestId: submitted.providerRequestId, providerStatus: status });
      if (attempt < maxPolls - 1) await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    throw Object.assign(new Error('MuleRouter generation timed out'), { code: 'MULEROUTER_TIMEOUT', status: 504, providerRequestId: submitted.providerRequestId });
  }
  return { submit, poll, generate, downloadContent };
}
