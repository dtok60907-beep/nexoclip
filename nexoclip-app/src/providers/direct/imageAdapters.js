const OPENAI_IMAGE_SIZES = {
  '1:1': '1024x1024',
  '2:3': '1024x1536',
  '3:2': '1536x1024',
  '9:16': '1024x1536',
  '16:9': '1536x1024',
};

// Seedream rejects dimensions below 3,686,400 pixels. These 64px-aligned sizes
// both satisfy that floor and preserve every Studio ratio.
const BYTEPLUS_IMAGE_SIZES = {
  '1:1': '1920x1920',
  '2:3': '1728x2560',
  '3:2': '2560x1728',
  '9:16': '1728x3072',
  '16:9': '3072x1728',
};

function openAIImageSize(aspectRatio, fallback) {
  return OPENAI_IMAGE_SIZES[aspectRatio] || fallback;
}

function bytePlusImageSize(aspectRatio, resolution) {
  return BYTEPLUS_IMAGE_SIZES[aspectRatio] || resolution;
}

function normalizeImagePayload(payload) {
  const images = payload?.data || payload?.predictions || (payload?.candidates || []).flatMap((candidate) => candidate?.content?.parts || []).map((part) => part?.inlineData).filter(Boolean);
  return images.map((image) => {
    const mimeType = image.mimeType || image.mime_type || 'image/png';
    if (image.b64_json || image.bytesBase64Encoded || image.data) return { url: `data:${mimeType};base64,${image.b64_json || image.bytesBase64Encoded || image.data}`, mimeType };
    if (image.url) return { url: image.url, mimeType };
    return null;
  }).filter(Boolean);
}

function transientError(provider, error, detail) {
  const suffix = detail ? `: ${detail}` : '';
  return Object.assign(new Error(`${provider} image request failed${suffix}`), { provider, status: error?.status || 503, code: `${provider.toUpperCase()}_IMAGE_FAILED` });
}

function usageCount(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

function responseRequestId(payload, response) {
  const id = payload?.id || payload?.responseId || response.headers?.get?.('x-request-id') || response.headers?.get?.('x-tt-logid');
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

async function readErrorDetail(response) {
  try {
    const body = await response.json();
    return body?.error?.message || body?.message || null;
  } catch { return null; }
}

async function fetchAsBlob(url, fetchImpl) {
  const response = await fetchImpl(url);
  if (!response.ok) throw Object.assign(new Error(`Failed to fetch reference image: ${response.status}`), { status: 502 });
  const contentType = response.headers.get('content-type') || 'image/png';
  const buffer = await response.arrayBuffer();
  return new Blob([buffer], { type: contentType });
}

// Token usage in the shape generationPricing expects, so jobs settle at
// what the provider actually used.
export function openAIImageUsage(usage) {
  if (!usage || typeof usage !== 'object') return {};
  const inputTokens = usageCount(usage.input_tokens);
  const imageOutputTokens = usageCount(usage.output_tokens);
  return {
    ...(inputTokens === null ? {} : { inputTokens }),
    ...(imageOutputTokens === null ? {} : { imageOutputTokens }),
  };
}

export function googleImageUsage(metadata) {
  if (!metadata || typeof metadata !== 'object') return {};
  let imageOutputTokens = null;
  let textOutputTokens = usageCount(metadata.thoughtsTokenCount);
  const details = Array.isArray(metadata.candidatesTokensDetails) ? metadata.candidatesTokensDetails : [];
  if (details.length) {
    for (const detail of details) {
      const count = usageCount(detail?.tokenCount);
      if (count === null) continue;
      if (String(detail?.modality).toUpperCase() === 'IMAGE') imageOutputTokens = (imageOutputTokens ?? 0) + count;
      else textOutputTokens = (textOutputTokens ?? 0) + count;
    }
  } else {
    imageOutputTokens = usageCount(metadata.candidatesTokenCount);
  }
  const inputTokens = usageCount(metadata.promptTokenCount);
  return {
    ...(inputTokens === null ? {} : { inputTokens }),
    ...(imageOutputTokens === null ? {} : { imageOutputTokens }),
    ...(textOutputTokens === null ? {} : { textOutputTokens }),
  };
}

export function createOpenAIImageAdapter({ apiKey, baseUrl = 'https://api.openai.com/v1', fetch: fetchImpl = globalThis.fetch } = {}) {
  return { async generate({ model, prompt, size, aspectRatio, quality, referenceImages }) {
    const imageSize = openAIImageSize(aspectRatio, size);
    const root = String(baseUrl).replace(/\/+$/, '');
    let response;
    try {
      if (referenceImages?.length) {
        // Reference images require the edits endpoint (multipart) — /images/generations is text-only.
        const form = new FormData();
        form.append('model', model);
        form.append('prompt', prompt);
        if (imageSize) form.append('size', imageSize);
        if (quality) form.append('quality', quality);
        const blobs = await Promise.all(referenceImages.map((url) => fetchAsBlob(url, fetchImpl)));
        blobs.forEach((blob, i) => form.append('image[]', blob, `reference-${i}.png`));
        response = await fetchImpl(`${root}/images/edits`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form });
      } else {
        response = await fetchImpl(`${root}/images/generations`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, prompt, ...(imageSize ? { size: imageSize } : {}), ...(quality ? { quality } : {}) }) });
      }
    } catch (error) { throw transientError('openai', error); }
    if (!response.ok) throw transientError('openai', response, await readErrorDetail(response));
    const payload = await response.json();
    const outputs = normalizeImagePayload(payload);
    const providerRequestId = responseRequestId(payload, response);
    const usage = openAIImageUsage(payload?.usage);
    if (!outputs.length) throw Object.assign(new Error('OpenAI returned no images'), { code: 'OPENAI_INVALID_RESPONSE', status: 502, providerRequestId, usage });
    return { provider: 'openai', status: 'succeeded', providerRequestId, outputs, usage };
  } };
}

export function createBytePlusImageAdapter({ apiKey, baseUrl, fetch: fetchImpl = globalThis.fetch } = {}) {
  if (!baseUrl) throw new TypeError('baseUrl is required');
  const root = String(baseUrl).replace(/\/+$/, '');
  return { async generate({ model, prompt, aspectRatio, resolution, referenceImages }) {
    // Deployment endpoints accept resolution presets; base models use explicit dimensions to preserve ratio.
    const providerResolution = model === 'ep-20260907150312-xx7gf' && resolution?.toUpperCase() === '1K' ? '2K' : resolution;
    const presetOnly = model.startsWith('ep-') || model.includes('seedream-5-0-pro');
    const size = presetOnly ? providerResolution : bytePlusImageSize(aspectRatio, providerResolution);
    let response;
    try {
      response = await fetchImpl(`${root}/images/generations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model, prompt, response_format: 'url',
          ...(size ? { size } : {}),
          ...(referenceImages?.length ? { image: referenceImages } : {}),
        }),
      });
    } catch (error) { throw transientError('byteplus', error); }
    if (!response.ok) throw Object.assign(transientError('byteplus', response, await readErrorDetail(response)),
      {providerRequestId:responseRequestId(null,response)});
    const payload = await response.json();
    const outputs = normalizeImagePayload(payload);
    const providerRequestId = responseRequestId(payload, response);
    const reportedImages = usageCount(payload?.usage?.generated_images);
    const usage = reportedImages === null && !outputs.length ? {} : { generated_images: reportedImages ?? outputs.length };
    if (!outputs.length) throw Object.assign(new Error('BytePlus returned no images'), { code: 'BYTEPLUS_INVALID_RESPONSE', status: 502, providerRequestId, usage });
    return { provider: 'byteplus', status: 'succeeded', providerRequestId, outputs, usage };
  } };
}

async function fetchAsInlineData(url, fetchImpl) {
  const response = await fetchImpl(url);
  if (!response.ok) throw Object.assign(new Error(`Failed to fetch reference image: ${response.status}`), { status: 502 });
  const mimeType = response.headers.get('content-type') || 'image/png';
  const buffer = await response.arrayBuffer();
  return { inlineData: { mimeType, data: Buffer.from(buffer).toString('base64') } };
}

export function createGoogleImageAdapter({ apiKey, baseUrl = 'https://generativelanguage.googleapis.com/v1beta', fetch: fetchImpl = globalThis.fetch } = {}) {
  return { async generate({ model, prompt, aspectRatio, resolution, referenceImages }) {
    let response;
    try {
      // Reference images must ride as inlineData parts ahead of the text part — Gemini's
      // generateContent has no separate "reference image" field, image conditioning only
      // works via multimodal parts in the same request.
      const imageParts = referenceImages?.length ? await Promise.all(referenceImages.map((url) => fetchAsInlineData(url, fetchImpl))) : [];
      response = await fetchImpl(`${String(baseUrl).replace(/\/+$/, '')}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [...imageParts, { text: prompt }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'], ...((aspectRatio || resolution) ? { imageConfig: { ...(aspectRatio ? { aspectRatio } : {}), ...(resolution ? { imageSize: resolution } : {}) } } : {}) } }) });
    } catch (error) { throw transientError('google', error); }
    if (!response.ok) {
      const detail = await response.text().catch(() => 'Unable to read provider error');
      let safeDetail = detail;
      try {
        const parsed = JSON.parse(detail);
        safeDetail = parsed?.error?.message || parsed?.message || detail;
      } catch {
        // Keep non-JSON provider response as-is.
      }
      console.error('[google-image] provider request failed', {
        status: response.status,
        detail: String(safeDetail).slice(0, 1000),
      });
      throw Object.assign(new Error(`Google image request failed: ${String(safeDetail).slice(0, 300)}`), {
        provider: 'google',
        status: response.status,
        code: 'GOOGLE_IMAGE_FAILED',
      });
    }
    const payload = await response.json();
    const outputs = normalizeImagePayload(payload);
    const providerRequestId = responseRequestId(payload, response);
    const usage = googleImageUsage(payload?.usageMetadata);
    if (!outputs.length) throw Object.assign(new Error('Google returned no images'), { code: 'GOOGLE_INVALID_RESPONSE', status: 502, providerRequestId, usage });
    return { provider: 'google', status: 'succeeded', providerRequestId, outputs, usage };
  } };
}
