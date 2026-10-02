import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  for (const [method, handler] of [['GET', v1.GET], ['POST', v1.POST], ['PUT', v1.PUT], ['PATCH', v1.PATCH], ['DELETE', v1.DELETE], ['OPTIONS', v1.OPTIONS], ['HEAD', v1.HEAD]]) {
    const res = await handler(new Request('http://app/api/api/v1/models', { method, ...(['POST', 'PUT', 'PATCH'].includes(method) ? { body: '{}' } : {}) }), ctx('models'));
    assert.equal(res.status, 410);
    if (method !== 'HEAD') assert.equal((await res.json()).error.code, 'ENDPOINT_RETIRED');
  }
  assert.equal(calls.length, 0);
}));

test('/api/workflow is retired on every method (410) and makes no upstream fetch', withStubs(async (calls) => {
  const cases = [
    ['GET', workflow.GET, ['get-workflow-defs']],
    ['GET', workflow.GET, ['get-workflow-def', 'wf-1']],
    ['POST', workflow.POST, ['wf-1', 'run']],
    ['POST', workflow.POST, ['architect']],
    ['POST', workflow.POST, ['publish', 'wf-1']],
    ['PUT', workflow.PUT, ['update-name', 'wf-1']],
    ['PATCH', workflow.PATCH, ['wf-1']],
    ['DELETE', workflow.DELETE, ['delete-workflow', 'wf-1']],
  ];
  for (const [method, handler, path] of cases) {
    const init = { method, headers: { 'x-api-key': 'user-key' }, ...(method === 'GET' || method === 'DELETE' ? {} : { body: '{}' }) };
    const res = await handler(new Request(`http://app/api/workflow/${path.join('/')}`, init), ctx(...path));
    assert.equal(res.status, 410, `${method} ${path.join('/')}`);
    assert.equal((await res.json()).error.code, 'ENDPOINT_RETIRED');
  }
  assert.equal(calls.length, 0);
}));

test('/api/workflow route never references MUAPI_API_KEY', () => {
  const src = readFileSync(new URL('../../app/api/workflow/[[...path]]/route.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /MUAPI_API_KEY/);
});
