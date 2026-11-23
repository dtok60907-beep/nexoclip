import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../../services/spite/next.config.mjs';

test('Canvas allows the Studio to frame its pages while blocking other origins', async () => {
  const rules = await config.headers();
  const pages = rules.find(rule => rule.source === '/((?!api/).*)');
  assert.ok(pages);
  const headers = Object.fromEntries(pages.headers.map(({ key, value }) => [key, value]));
  assert.equal(headers['X-Frame-Options'], 'SAMEORIGIN');
  assert.equal(headers['Content-Security-Policy'], "frame-ancestors 'self'");
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
});
