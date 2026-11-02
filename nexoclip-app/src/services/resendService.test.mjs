import test from 'node:test';
import assert from 'node:assert/strict';
import { createResendService } from './resendService.js';

test('broadcast uses the configured audience and adds Resend unsubscribe placeholder', async () => {
  let call;
  const service = createResendService({
    env: { RESEND_API_KEY: 're_test', RESEND_FROM: 'NexoClip <hello@nexoclip.com>', RESEND_AUDIENCE_ID: 'aud_1' },
    fetchImpl: async (url, options) => {
      call = { url, options };
      return new Response(JSON.stringify({ id: 'br_1' }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const result = await service.createBroadcast({ subject: 'Update', html: '<p>Hello</p>' });
  assert.equal(result.id, 'br_1');
  assert.equal(call.url, 'https://api.resend.com/broadcasts');
  const body = JSON.parse(call.options.body);
  assert.equal(body.audience_id, 'aud_1');
  assert.match(body.html, /RESEND_UNSUBSCRIBE_URL/);
  assert.equal(call.options.headers.Authorization, 'Bearer re_test');
});

test('missing credentials fail before making a request', async () => {
  const service = createResendService({ env: {}, fetchImpl: () => { throw new Error('must not call'); } });
  await assert.rejects(() => service.sendEmail({ to: ['a@example.com'], subject: 'x', html: '<p>x</p>' }), /RESEND_API_KEY/);
});

test('contact sync targets the configured audience and preserves unsubscribe state', async () => {
  let call;
  const service = createResendService({
    env: { RESEND_API_KEY: 're_test', RESEND_AUDIENCE_ID: 'aud_1' },
    fetchImpl: async (url, options) => {
      call = { url, options };
      return new Response(JSON.stringify({ id: 'ct_1' }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  await service.createContact({ email: 'user@example.com', firstName: 'User', unsubscribed: true });
  assert.equal(call.url, 'https://api.resend.com/audiences/aud_1/contacts');
  assert.deepEqual(JSON.parse(call.options.body), { email: 'user@example.com', first_name: 'User', unsubscribed: true });
});
