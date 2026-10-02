import test from 'node:test';
import assert from 'node:assert/strict';
import * as v1 from '../../app/api/api/v1/[[...path]]/route.js';
import * as workflow from '../../app/api/workflow/[[...path]]/route.js';

const PLATFORM_KEY = 'platform-secret-key';

function withStubs(fn) {
  return async () => {
    const realFetch = globalThis.fetch;
    const realKey = process.env.MUAPI_API_KEY;
    const calls = [];
    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url: String(url), method: init.method, headers: new Headers(init.headers) });
      return Response.json({ ok: true });
    };
    process.env.MUAPI_API_KEY = PLATFORM_KEY;
    try { await fn(calls); } finally {
      globalThis.fetch = realFetch;
      if (realKey === undefined) delete process.env.MUAPI_API_KEY; else process.env.MUAPI_API_KEY = realKey;
    }
  };
}

const ctx = (...path) => ({ params: Promise.resolve({ path }) });

test('/api/api/v1 GET and POST are retired (410) and make no upstream fetch', withStubs(async (calls) => {
  for (const [method, handler] of [['GET', v1.GET], ['POST', v1.POST]]) {
    const res = await handler(new Request('http://app/api/api/v1/models', { method, ...(method === 'POST' ? { body: '{}' } : {}) }), ctx('models'));
    assert.equal(res.status, 410);
    assert.equal((await res.json()).error.code, 'ENDPOINT_RETIRED');
  }
  assert.equal(calls.length, 0);
}));

test('/api/workflow never forwards the platform key when the client sends none', withStubs(async (calls) => {
  const cases = [
    ['GET', workflow.GET, ['get-workflow-def', 'wf-1']],
    ['POST', workflow.POST, ['wf-1', 'run']],
    ['POST', workflow.POST, ['architect']],
    ['PUT', workflow.PUT, ['update-name', 'wf-1']],
    ['DELETE', workflow.DELETE, ['delete-workflow', 'wf-1']],
  ];
  for (const [method, handler, path] of cases) {
    const init = { method, ...(method === 'GET' || method === 'DELETE' ? {} : { body: '{}' }) };
    await handler(new Request(`http://app/api/workflow/${path.join('/')}`, init), ctx(...path));
  }
  assert.equal(calls.length, cases.length);
  for (const call of calls) {
    assert.equal(call.headers.has('x-api-key'), false, `${call.method} ${call.url}`);
    assert.doesNotMatch(JSON.stringify([...call.headers]), new RegExp(PLATFORM_KEY));
  }
}));

test('/api/workflow treats literal "null" x-api-key as absent and forwards a real client key', withStubs(async (calls) => {
  await workflow.GET(new Request('http://app/api/workflow/x', { headers: { 'x-api-key': 'null' } }), ctx('x'));
  await workflow.GET(new Request('http://app/api/workflow/x', { headers: { 'x-api-key': 'user-key' } }), ctx('x'));
  assert.equal(calls[0].headers.has('x-api-key'), false);
  assert.equal(calls[1].headers.get('x-api-key'), 'user-key');
}));
