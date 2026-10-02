import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProductionEnvironment } from '../../scripts/production-config.mjs';

test('accepts the minimum full-stack production environment for realtime deployment', () => {
  assert.deepEqual(validateProductionEnvironment({
    NODE_ENV: 'production',
    DATABASE_URL_NEXOCLIP: 'postgres://user:pass@db.example/nexoclip',
    DATABASE_URL_SPITE: 'postgres://user:pass@db.example/spite',
    LOCAL_OBJECT_STORAGE_SECRET: 'long-production-secret',
    CANVAS_AUTH_URL: 'http://spite-realtime:3007/internal/authorize',
    CANVAS_AUTH_HMAC_SECRET: 'canvas-hmac-secret',
    REALTIME_JWT_SECRET: 'realtime-jwt-secret',
    NEXOCLIP_INTERNAL_URL: 'http://nexoclip:3000',
    NEXT_PUBLIC_REALTIME_URL: '/spite/ws',
    POSTGRES_PASSWORD: 'a-production-postgres-password-0123',
  }), { ok: true, errors: [] });
});

test('rejects missing realtime secrets and public database credentials without echoing values', () => {
  const result = validateProductionEnvironment({
    NODE_ENV: 'production',
    DATABASE_URL_NEXOCLIP: 'postgres://user:pass@db.example/nexoclip',
    DATABASE_URL_SPITE: 'postgres://user:pass@db.example/spite',
    MUAPI_API_KEY: 'secret-value',
    LOCAL_OBJECT_STORAGE_SECRET: 'development-only-change-me',
    NEXT_PUBLIC_DATABASE_URL_SPITE: 'postgres://public:public@db.example/spite',
  });

  assert.equal(result.ok, false);
  const joined = result.errors.join('\n');
  assert.doesNotMatch(joined, /MUAPI/);
  assert.match(joined, /CANVAS_AUTH_URL/);
  assert.match(joined, /CANVAS_AUTH_HMAC_SECRET/);
  assert.match(joined, /REALTIME_JWT_SECRET/);
  assert.match(joined, /NEXOCLIP_INTERNAL_URL/);
  assert.match(joined, /LOCAL_OBJECT_STORAGE_SECRET/);
  assert.match(joined, /NEXT_PUBLIC_REALTIME_URL/);
  assert.match(joined, /NEXT_PUBLIC_DATABASE_URL_SPITE/);
  assert.doesNotMatch(joined, /secret-value|postgres:\/\/public:public@db\.example\/spite/);
});

test('does not require production-only values for development', () => {
  assert.deepEqual(validateProductionEnvironment({ NODE_ENV: 'development' }), { ok: true, errors: [] });
});

test('MUAPI_API_KEY is optional: unset or empty does not fail the production check', () => {
  const base = {
    NODE_ENV: 'production',
    DATABASE_URL_SPITE: 'postgres://user:pw@db.example/spite',
    LOCAL_OBJECT_STORAGE_SECRET: 'long-production-secret',
    CANVAS_AUTH_URL: 'http://spite-realtime:3007/internal/authorize',
    CANVAS_AUTH_HMAC_SECRET: 'canvas-hmac-secret',
    REALTIME_JWT_SECRET: 'realtime-jwt-secret',
    NEXOCLIP_INTERNAL_URL: 'http://nexoclip:3000',
    NEXT_PUBLIC_REALTIME_URL: '/spite/ws',
    POSTGRES_PASSWORD: 'a-production-postgres-password-0123',
  };
  assert.deepEqual(validateProductionEnvironment(base), { ok: true, errors: [] });
  assert.deepEqual(validateProductionEnvironment({ ...base, MUAPI_API_KEY: '' }), { ok: true, errors: [] });
  const missing = validateProductionEnvironment({ ...base, REALTIME_JWT_SECRET: '' });
  assert.equal(missing.ok, false);
});
