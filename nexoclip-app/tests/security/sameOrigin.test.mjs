import test from 'node:test';
import assert from 'node:assert/strict';

const { isSameOriginRequest } = await import('../../src/lib/auth/sameOrigin.js');
const request = (url, headers) => new Request(url, { method: 'POST', headers });

test('accepts the page origin behind a proxy that forwards host and protocol', () => {
  assert.equal(isSameOriginRequest(request('http://nexoclip-app:3000/api/admin/backoffice', { origin: 'https://app.nexoclip.com', 'x-forwarded-host': 'app.nexoclip.com', 'x-forwarded-proto': 'https' }), {}), true);
  assert.equal(isSameOriginRequest(request('http://0.0.0.0:3000/api/admin/backoffice', { origin: 'http://localhost', 'x-forwarded-host': 'localhost', 'x-forwarded-proto': 'http' }), {}), true);
  assert.equal(isSameOriginRequest(request('http://localhost/api/admin/backoffice', { origin: 'http://localhost' }), {}), true);
});

test('accepts the configured public app URL and rejects other sites', () => {
  const env = { PUBLIC_APP_URL: 'https://app.nexoclip.com/studio' };
  assert.equal(isSameOriginRequest(request('http://internal:3000/x', { origin: 'https://app.nexoclip.com' }), env), true);
  assert.equal(isSameOriginRequest(request('http://internal:3000/x', { origin: 'https://evil.example', 'x-forwarded-host': 'app.nexoclip.com', 'x-forwarded-proto': 'https' }), env), false);
  assert.equal(isSameOriginRequest(request('http://internal:3000/x', {}), env), false);
});
