import test from 'node:test';
import assert from 'node:assert/strict';
import { GET, POST, DELETE } from '../../app/api/tiktok/drafts/route.js';
import { PATCH } from '../../app/api/tiktok/publish/[jobId]/route.js';

const request = (method, origin) => Object.assign(new Request('http://localhost/api/tiktok/drafts', {
  method, headers: origin ? { origin } : {}, ...(method === 'GET' ? {} : { body: '{}' }),
}), { cookies: { get: () => undefined } });
test('draft and publishing mutations reject missing or foreign origins', async () => {
  for (const origin of [undefined, 'https://foreign.example']) {
    for (const handler of [POST, DELETE]) assert.equal((await handler(request('POST', origin))).status, 403);
    assert.equal((await PATCH(request('PATCH', origin), { params: Promise.resolve({ jobId: 'ignored' }) })).status, 403);
  }
});
test('draft reads and same-origin mutations require a Nexoclip session', async () => {
  assert.equal((await GET(request('GET'))).status, 401);
  for (const handler of [POST, DELETE]) assert.equal((await handler(request('POST', 'http://localhost'))).status, 401);
  assert.equal((await PATCH(request('PATCH', 'http://localhost'), { params: Promise.resolve({ jobId: 'ignored' }) })).status, 401);
});
