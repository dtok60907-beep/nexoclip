const API = 'https://open.tiktokapis.com/v2';

async function parseResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data.error==='string' || data.error?.code && data.error.code !== 'ok') {
    const error = new Error(data.error?.message || data.error_description || `TikTok request failed (${response.status})`);
    error.status = response.status;
    error.retryAfter = response.headers.get('retry-after');
    error.code = typeof data.error==='string'?data.error:data.error?.code || 'TIKTOK_REQUEST_FAILED';
    throw error;
  }
  return data.data || data;
}

export async function exchangeTikTokCode(code, redirectUri, env = process.env, fetcher = fetch, codeVerifier = null) {
  return parseResponse(await fetcher(`${API}/oauth/token/`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: redirectUri, ...(codeVerifier?{code_verifier:codeVerifier}:{}) }),
  }));
}

export async function refreshTikTokToken(refreshToken, env = process.env, fetcher = fetch) {
  return parseResponse(await fetcher(`${API}/oauth/token/`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  }));
}

export async function revokeTikTokToken(token, env = process.env, fetcher = fetch) {
  return parseResponse(await fetcher(`${API}/oauth/revoke/`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET, token }),
  }));
}

export async function tikTokJson(path, accessToken, body, fetcher = fetch) {
  return parseResponse(await fetcher(`${API}${path}`, {
    method: 'POST', headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(body || {}),signal:AbortSignal.timeout(30_000),
  }));
}

export async function tikTokUserInfo(accessToken, fetcher = fetch, scopes = ['user.info.basic']) {
  const fields=['open_id','avatar_url','display_name'];
  if(scopes.includes('user.info.profile')) fields.push('username','bio_description','profile_deep_link','is_verified');
  if(scopes.includes('user.info.stats')) fields.push('follower_count','following_count','likes_count','video_count');
  const response = await fetcher(`${API}/user/info/?fields=${fields.join(',')}`, { headers: { authorization: `Bearer ${accessToken}` },signal:AbortSignal.timeout(30_000) });
  const data = await parseResponse(response);
  const user=data.user||data;
  return Object.fromEntries(fields.filter(field=>{
    const value=user[field];
    if(field.endsWith('_count'))return Number.isSafeInteger(value)&&value>=0;
    if(field==='is_verified')return typeof value==='boolean';
    return typeof value==='string';
  }).map(field=>[field,user[field]]));
}

export async function verifyTikTokWebhook(rawBody, signature, secret, now = Date.now()) {
  const values = Object.fromEntries(String(signature || '').split(',').map((item) => item.trim().split('=')));
  const timestamp = Number(values.t);
  if (!Number.isInteger(timestamp) || !values.s || Math.abs(now / 1000 - timestamp) > 300) return false;
  const { createHmac, timingSafeEqual } = await import('node:crypto');
  const expected = createHmac('sha256', secret).update(`${values.t}.${rawBody}`).digest();
  let supplied;
  try { supplied = Buffer.from(values.s, 'hex'); } catch { return false; }
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
