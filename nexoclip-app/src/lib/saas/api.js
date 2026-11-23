const SAFE_NETWORK_MESSAGE = 'Unable to reach the NexoClip service.';
const SAFE_HTTP_MESSAGE = 'The NexoClip request could not be completed.';

function errorWith(code, status, message) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

export async function saasFetch(path, options = {}) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
    throw errorWith('INVALID_PATH', 0, 'SaaS requests must use same-origin paths.');
  }
  const headers = { accept: 'application/json', ...(options.headers || {}) };
  for (const name of Object.keys(headers)) {
    if (/^(authorization|x-api-key|muapi-api-key)$/i.test(name)) {
      throw errorWith('UNSUPPORTED_HEADER', 0, 'Provider credentials are not supported by the SaaS client.');
    }
  }
  try {
    const response = await fetch(path, { ...options, credentials: 'include', headers });
    const payload = await response.json().catch(() => null);
    if (response.ok) return payload;
    if (response.status === 401 && !path.startsWith('/api/auth/') && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('nexoclip:session-expired'));
    }
    throw errorWith(payload?.code || `HTTP_${response.status}`, response.status, payload?.error || SAFE_HTTP_MESSAGE);
  } catch (error) {
    if (error?.status) throw error;
    throw errorWith('NETWORK_ERROR', 0, SAFE_NETWORK_MESSAGE);
  }
}
