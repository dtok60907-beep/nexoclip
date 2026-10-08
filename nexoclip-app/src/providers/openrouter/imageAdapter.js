const DEFAULT_BASE_URL = 'https://openrouter.ai';

const ERROR_MESSAGES = {
  401: ['OPENROUTER_AUTHENTICATION_FAILED', 'OpenRouter authentication failed'],
  403: ['OPENROUTER_AUTHORIZATION_FAILED', 'OpenRouter authorization failed'],
  404: ['OPENROUTER_NOT_FOUND', 'OpenRouter model or endpoint not found'],
};

const MODEL_UNAVAILABLE_PATTERN = /model/i;
const UNAVAILABLE_REASON_PATTERN = /(not found|not a valid|unsupported|unavailable|does not exist|no endpoints)/i;
function isModelUnavailableDetail(detail) {
  return MODEL_UNAVAILABLE_PATTERN.test(detail) && UNAVAILABLE_REASON_PATTERN.test(detail);
}

function networkError() {
  return { code: 'OPENROUTER_UNAVAILABLE', status: 503, message: 'OpenRouter is temporarily unavailable' };
}

async function normalizeError(response) {
  const status = response.status;
  if (ERROR_MESSAGES[status]) {
    const [code, message] = ERROR_MESSAGES[status];
    return { code, status, message };
  }
  if (status === 400) {
    let detail = '';
    try { const body = await response.json(); detail = body?.error?.message || body?.message || ''; } catch { /* no readable body */ }
    if (isModelUnavailableDetail(detail)) {
      return { code: 'OPENROUTER_MODEL_UNAVAILABLE', status, message: 'OpenRouter has no route for this model' };
    }
    return { code: 'OPENROUTER_REQUEST_FAILED', status, message: 'OpenRouter request failed' };
  }
  return status >= 500
    ? { code: 'OPENROUTER_UNAVAILABLE', status, message: 'OpenRouter is temporarily unavailable' }
    : { code: 'OPENROUTER_REQUEST_FAILED', status, message: 'OpenRouter request failed' };
}

function normalizeImage(image) {
  const mimeType = image?.media_type || 'image/png';
  if (typeof image?.b64_json === 'string') {
    return { url: `data:${mimeType};base64,${image.b64_json}`, mimeType };
  }
  if (typeof image?.url === 'string') return { url: image.url, mimeType };
  throw Object.assign(new Error('OpenRouter returned an invalid image'), { code: 'OPENROUTER_INVALID_RESPONSE' });
}

export function createOpenRouterImageAdapter({ baseUrl = DEFAULT_BASE_URL, apiKey, fetch: fetchImpl = globalThis.fetch } = {}) {
  if (!apiKey || typeof apiKey !== 'string') throw new TypeError('apiKey is required');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch is required');
  const root = String(baseUrl).replace(/\/+$/, '');

  return {
    async generate({ model, prompt, aspectRatio, resolution, quality, seed, referenceImages } = {}) {
      if (!model || typeof model !== 'string') throw new TypeError('model is required');
      if (!prompt || typeof prompt !== 'string') throw new TypeError('prompt is required');
      const body = { model, prompt };
      if (aspectRatio) body.aspect_ratio = aspectRatio;
      if (resolution) body.resolution = resolution;
      if (quality) body.quality = quality;
      if (seed !== undefined) body.seed = seed;
      if (referenceImages?.length) {
        body.input_references = referenceImages.map((url) => ({ type: 'image_url', image_url: { url } }));
      }

      let response;
      try {
        response = await fetchImpl(`${root}/api/v1/images`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch {
        throw networkError();
      }
      if (!response.ok) throw await normalizeError(response);
      const payload = await response.json();
      // A creation timestamp is not a request identity: retries can share it.
      const providerRequestId = payload.id || response.headers?.get?.('x-request-id') || null;
      const rawCost = payload.usage?.cost;
      const validCost = (typeof rawCost === 'number' || (typeof rawCost === 'string' && rawCost.trim()))
        && Number.isFinite(Number(rawCost)) && Number(rawCost) >= 0;
      const usage = payload.usage && typeof payload.usage === 'object' ? {
        ...(validCost ? { cost: rawCost, costUsd: Number(rawCost) } : {}),
        ...(payload.usage.total_tokens !== undefined ? { total_tokens: payload.usage.total_tokens } : {}),
      } : {};
      let outputs;
      try {
        outputs = (payload.data || []).map(normalizeImage);
        if (!outputs.length) throw Object.assign(new Error('OpenRouter returned no images'), { code: 'OPENROUTER_INVALID_RESPONSE' });
      } catch (error) {
        throw Object.assign(error, { providerRequestId, usage });
      }
      return {
        provider: 'openrouter',
        status: 'succeeded',
        providerRequestId,
        outputs,
        usage,
      };
    },
  };
}
