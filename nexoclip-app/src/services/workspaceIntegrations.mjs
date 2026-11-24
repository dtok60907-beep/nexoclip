import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const INTEGRATION_PROVIDERS = ['youtube', 'google-sheets', 'google-drive', 'dropbox'];
export const integrationStateHash = (state) => createHash('sha256').update(String(state)).digest('hex');

function encryptionKey(env) {
  if (!/^[a-f\d]{64}$/i.test(env.INTEGRATION_TOKEN_ENCRYPTION_KEY || '')) throw new Error('Integration token encryption is not configured');
  return Buffer.from(env.INTEGRATION_TOKEN_ENCRYPTION_KEY, 'hex');
}

export function encryptIntegrationToken(value, env = process.env) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey(env), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptIntegrationToken(value, env = process.env) {
  const [iv, tag, encrypted] = String(value).split('.').map((part) => Buffer.from(part, 'base64url'));
  if (!iv || !tag || !encrypted || iv.length !== 12 || tag.length !== 16) throw new Error('Integration credential is invalid');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(env), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

const GOOGLE_SCOPES = {
  youtube: ['openid', 'email', 'https://www.googleapis.com/auth/youtube.upload'],
  'google-sheets': ['openid', 'email', 'https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file'],
  'google-drive': ['openid', 'email', 'https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive.metadata.readonly'],
};

export function integrationOAuthConfig(provider, env = process.env) {
  if (!INTEGRATION_PROVIDERS.includes(provider)) throw new Error('Integration provider not supported');
  const google = provider !== 'dropbox';
  const clientId = google ? (env.GOOGLE_INTEGRATION_CLIENT_ID || env.GOOGLE_CLIENT_ID) : env.DROPBOX_CLIENT_ID;
  const clientSecret = google ? (env.GOOGLE_INTEGRATION_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET) : env.DROPBOX_CLIENT_SECRET;
  const redirectUri = google ? ({
    youtube: env.GOOGLE_YOUTUBE_REDIRECT_URI,
    'google-sheets': env.GOOGLE_SHEETS_REDIRECT_URI,
    'google-drive': env.GOOGLE_DRIVE_REDIRECT_URI,
  })[provider] : env.DROPBOX_REDIRECT_URI;
  const expectedPath = `/api/integrations/oauth/${provider}/callback`;
  let callback;
  try { callback = new URL(redirectUri); } catch { throw new Error(`${provider} OAuth callback is not configured`); }
  if (!clientId || !clientSecret || callback.protocol !== 'https:' || callback.username || callback.password || callback.search || callback.hash || callback.pathname !== expectedPath) {
    throw new Error(`${provider} OAuth is not configured`);
  }
  return { clientId, clientSecret, redirectUri: callback.href, scopes: google ? GOOGLE_SCOPES[provider] : [] };
}

export function integrationAuthorizationUrl(provider, config, state) {
  if (provider === 'dropbox') {
    const url = new URL('https://www.dropbox.com/oauth2/authorize');
    url.search = new URLSearchParams({ client_id: config.clientId, response_type: 'code', token_access_type: 'offline', redirect_uri: config.redirectUri, state }).toString();
    return url.href;
  }
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: 'code', scope: config.scopes.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state }).toString();
  return url.href;
}

async function readJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('External provider authorization failed');
  return data;
}

export async function exchangeIntegrationCode(provider, code, config, fetcher = fetch) {
  const google = provider !== 'dropbox';
  const body = new URLSearchParams({ code, grant_type: 'authorization_code', redirect_uri: config.redirectUri, client_id: config.clientId, client_secret: config.clientSecret });
  const response = await fetcher(google ? 'https://oauth2.googleapis.com/token' : 'https://api.dropboxapi.com/oauth2/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, redirect: 'error', signal: AbortSignal.timeout(20_000),
  });
  const token = await readJson(response);
  if (typeof token.access_token !== 'string' || !token.access_token) throw new Error('Provider access token missing');
  let profile;
  if (google) {
    profile = await readJson(await fetcher('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { authorization: `Bearer ${token.access_token}` }, redirect: 'error', signal: AbortSignal.timeout(15_000),
    }));
  } else {
    profile = await readJson(await fetcher('https://api.dropboxapi.com/2/users/get_current_account', {
      method: 'POST', headers: { authorization: `Bearer ${token.access_token}`, 'content-type': 'application/json' }, body: 'null', redirect: 'error', signal: AbortSignal.timeout(15_000),
    }));
    profile = { sub: profile.account_id, name: profile.name?.display_name, email: profile.email };
  }
  if (typeof profile.sub !== 'string' || !profile.sub) throw new Error('Provider profile is invalid');
  return {
    providerUserId: profile.sub,
    displayName: (profile.name || profile.email || provider).slice(0, 200),
    accessToken: token.access_token,
    refreshToken: typeof token.refresh_token === 'string' ? token.refresh_token : null,
    scopes: typeof token.scope === 'string' ? token.scope.split(/[ ,]+/).filter(Boolean) : config.scopes,
    expiresAt: Number.isFinite(Number(token.expires_in)) ? new Date(Date.now() + Number(token.expires_in) * 1000) : null,
  };
}
