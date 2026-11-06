import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { SignJWT } from 'jose';

export function socialError(message, status = 502, code = 'SOCIAL_UNAVAILABLE') {
  return Object.assign(new Error(message), { status, code });
}

export function postizConfigured(env = process.env) {
  return Boolean(env.POSTIZ_API_URL && env.POSTIZ_JWT_SECRET?.length >= 32);
}

function secret(env) {
  if (!postizConfigured(env)) throw socialError('Social publishing is being set up. Please try again later.', 503);
  return env.POSTIZ_JWT_SECRET;
}

// Separate encryption material from JWT signing; bind every credential to its workspace.
function encryptionKey(workspaceId, env) {
  return hkdfSync('sha256', secret(env), workspaceId, 'nexoclip-postiz-api-key-v1', 32);
}

export function encryptApiKey(value, workspaceId, env = process.env) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(workspaceId, env), iv);
  cipher.setAAD(Buffer.from(workspaceId));
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(v => v.toString('base64url')).join('.');
}

export function decryptApiKey(value, workspaceId, env = process.env) {
  try {
    const parts = value.split('.').map(v => Buffer.from(v, 'base64url'));
    if (parts.length !== 3) throw new Error('Invalid envelope');
    const [iv, tag, encrypted] = parts;
    const cipher = createDecipheriv('aes-256-gcm', encryptionKey(workspaceId, env), iv);
    cipher.setAAD(Buffer.from(workspaceId));
    cipher.setAuthTag(tag);
    return Buffer.concat([cipher.update(encrypted), cipher.final()]).toString('utf8');
  } catch {
    throw socialError('Social credentials need administrator attention.', 503);
  }
}

export function createPostizAdapter({ env = process.env, fetchImpl = fetch } = {}) {
  async function request(path, { apiKey, body, method } = {}) {
    secret(env);
    const base = new URL(env.POSTIZ_API_URL.endsWith('/') ? env.POSTIZ_API_URL : `${env.POSTIZ_API_URL}/`);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw socialError('Invalid social service configuration.', 503);
    let response;
    try {
      response = await fetchImpl(new URL(path, base), {
        method: method || (body === undefined ? 'GET' : 'POST'),
        headers: { accept: 'application/json', ...(apiKey ? { authorization: apiKey } : {}),
          ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(25_000), redirect: 'error', cache: 'no-store',
      });
      if (!response.ok) throw new Error('Upstream rejected request');
      const raw = await response.text();
      try { return JSON.parse(raw); } catch { return raw; }
    } catch {
      // Provider bodies can contain credentials; never forward or log them.
      throw socialError('The social service could not complete this request. Refresh the post list before trying again.');
    }
  }
  async function enterprise(path, payload) {
    const params = await new SignJWT(payload).setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt().setExpirationTime('2m').sign(new TextEncoder().encode(secret(env)));
    return request(`enterprise/${path}`, { body: { params } });
  }
  return {
    async provision(workspaceId) {
      const result = await enterprise('create-user', { id: workspaceId, name: 'NexoClip workspace',
        saasName: 'nexoclip', email: `workspace-${workspaceId}@nexoclip.invalid` });
      if (!result?.id || !result?.apiKey) throw socialError('Social workspace setup needs administrator attention.');
      return result;
    },
    async connect(apiKey, redirectUrl) {
      const url = await enterprise('url', { apiKey, provider: 'linkedin', redirectUrl, webhookUrl: '' });
      let parsed;
      try { parsed = new URL(url); } catch { throw socialError('LinkedIn connection is not configured yet.', 503); }
      if (parsed.protocol !== 'https:' || parsed.hostname !== 'www.linkedin.com') throw socialError('Invalid LinkedIn authorization URL.');
      return parsed.href;
    },
    channels: apiKey => request('public/v1/integrations', { apiKey }),
    posts: (apiKey, startDate, endDate) => request(`public/v1/posts?${new URLSearchParams({ startDate, endDate })}`, { apiKey }),
    upload: (apiKey, url) => request('public/v1/upload-from-url', { apiKey, body: { url } }),
    createPost: (apiKey, body) => request('public/v1/posts', { apiKey, body }),
    deletePost: (apiKey, id) => request(`public/v1/posts/${encodeURIComponent(id)}`, { apiKey, method: 'DELETE' }),
  };
}
