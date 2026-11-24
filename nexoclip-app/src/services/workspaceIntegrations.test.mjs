import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decryptIntegrationToken, encryptIntegrationToken, integrationAuthorizationUrl,
  integrationOAuthConfig, integrationStateHash,
} from './workspaceIntegrations.mjs';

const env = {
  INTEGRATION_TOKEN_ENCRYPTION_KEY: '11'.repeat(32),
  GOOGLE_INTEGRATION_CLIENT_ID: 'google-client',
  GOOGLE_INTEGRATION_CLIENT_SECRET: 'google-secret',
  GOOGLE_YOUTUBE_REDIRECT_URI: 'https://app.example/api/integrations/oauth/youtube/callback',
  GOOGLE_SHEETS_REDIRECT_URI: 'https://app.example/api/integrations/oauth/google-sheets/callback',
  GOOGLE_DRIVE_REDIRECT_URI: 'https://app.example/api/integrations/oauth/google-drive/callback',
  DROPBOX_CLIENT_ID: 'dropbox-client',
  DROPBOX_CLIENT_SECRET: 'dropbox-secret',
  DROPBOX_REDIRECT_URI: 'https://app.example/api/integrations/oauth/dropbox/callback',
};

test('integration credentials are encrypted and tamper evident', () => {
  const encrypted = encryptIntegrationToken('private-token', env);
  assert.notEqual(encrypted, 'private-token');
  assert.equal(decryptIntegrationToken(encrypted, env), 'private-token');
  assert.throws(() => decryptIntegrationToken(`${encrypted.slice(0, -1)}x`, env));
});

test('OAuth config only accepts registered HTTPS callback paths per provider', () => {
  for (const provider of ['youtube', 'google-sheets', 'google-drive', 'dropbox']) {
    assert.equal(new URL(integrationOAuthConfig(provider, env).redirectUri).protocol, 'https:');
  }
  assert.throws(() => integrationOAuthConfig('meta-ads', env));
  assert.throws(() => integrationOAuthConfig('youtube', { ...env, GOOGLE_YOUTUBE_REDIRECT_URI: 'http://app.example/callback' }));
});

test('Google and Dropbox authorization URLs use scoped authorization code flow', () => {
  const google = new URL(integrationAuthorizationUrl('youtube', integrationOAuthConfig('youtube', env), 'state-value'));
  assert.equal(google.origin, 'https://accounts.google.com');
  assert.equal(google.searchParams.get('state'), 'state-value');
  assert.match(google.searchParams.get('scope'), /youtube\.upload/);
  const dropbox = new URL(integrationAuthorizationUrl('dropbox', integrationOAuthConfig('dropbox', env), 'state-value'));
  assert.equal(dropbox.searchParams.get('token_access_type'), 'offline');
  assert.equal(dropbox.searchParams.has('client_secret'), false);
  assert.equal(integrationStateHash('abc').length, 64);
});
