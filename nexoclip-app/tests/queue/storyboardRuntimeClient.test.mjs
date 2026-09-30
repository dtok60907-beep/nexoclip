import test from 'node:test';
import assert from 'node:assert/strict';
import { createStoryboardRuntimeClient } from '../../src/queue/storyboardRuntimeClient.js';

test('posts only structured worker-owned execution data with the service token', async () => {
  let captured;
  const fetch = async (url, init) => {
    captured = { url, init };
    return new Response(JSON.stringify({ ok: true, result: {} }));
  };
  const client = createStoryboardRuntimeClient({ baseUrl: 'http://ai-storyboard:4173', token: 'secret', fetch });

  await client.execute({
    id: 'g1', workspace_id: 'w1', kind: 'vimax_render_video', parameters: { sessionId: 's1', ignored: 'nope' }, prompt: 'ignored',
    attempt_count: 2, claim_token: 'claim-1',
  });

  assert.equal(captured.url, 'http://ai-storyboard:4173/internal/v1/jobs/g1/execute');
  assert.equal(captured.init.headers['X-NexoClip-Runtime-Token'], 'secret');
  assert.deepEqual(JSON.parse(captured.init.body), {
    workspace_id: 'w1', kind: 'vimax_render_video', session_id: 's1', input: {},
    // Claim fencing: the runtime rejects results from a superseded attempt.
    attempt: 2, claim_token: 'claim-1',
  });
});

test('supplies a worker-authenticated progress callback to the runtime', async () => {
  let body;
  const client = createStoryboardRuntimeClient({
    baseUrl: 'http://ai-storyboard:4173', token: 'secret', fetch: async (_url, init) => {
      body = JSON.parse(init.body);
      return new Response(JSON.stringify({ok: true}));
    },
    progressCallbackUrl: 'http://worker/internal/progress', progressToken: 'callback-token',
  });
  await client.execute({id: 'g1', workspace_id: 'w1', kind: 'vimax_render_video', parameters: {sessionId: 's1'}});
  assert.deepEqual(body.progress_callback, {url: 'http://worker/internal/progress/g1', token: 'callback-token'});
});

test('drops unknown runtime input fields', async () => {
  let body;
  const client = createStoryboardRuntimeClient({
    baseUrl: 'http://ai-storyboard:4173', token: 'secret', fetch: async (_url, init) => {
      body = JSON.parse(init.body);
      return new Response(JSON.stringify({ ok: true }));
    },
  });

  await client.execute({
    id: 'g1', workspace_id: 'w1', kind: 'vimax_narrative_planning',
    parameters: { sessionId: 's1', input: { idea: 'moon cat', unknown: 'drop' } },
  });

  assert.deepEqual(body.input, { idea: 'moon cat' });
});

test('marks invalid runtime requests as non-retryable', async () => {
  const client = createStoryboardRuntimeClient({
    baseUrl: 'http://ai-storyboard:4173', token: 'secret', fetch: async () => new Response('', { status: 400 }),
  });

  await assert.rejects(
    client.execute({ id: 'g1', workspace_id: 'w1', kind: 'vimax_render_video', parameters: { sessionId: 'missing' } }),
    (failure) => failure.code === 'RUNTIME_REQUEST_FAILED' && failure.retryable === false,
  );
});

test('marks runtime server errors as retryable provider failures', async () => {
  const client = createStoryboardRuntimeClient({
    baseUrl: 'http://ai-storyboard:4173', token: 'secret', fetch: async () => new Response('', { status: 500 }),
  });

  await assert.rejects(
    client.execute({ id: 'g1', workspace_id: 'w1', kind: 'vimax_render_video', parameters: { sessionId: 's1' } }),
    (failure) => failure.code === 'PROVIDER_UNAVAILABLE' && failure.retryable === true,
  );
});

test('returns a safe error for a failed runtime response', async () => {
  const client = createStoryboardRuntimeClient({
    baseUrl: 'http://ai-storyboard:4173', token: 'secret', fetch: async () => new Response('runtime details', { status: 500 }),
  });

  await assert.rejects(
    client.execute({ id: 'g1', workspace_id: 'w1', kind: 'vimax_render_video', parameters: {} }),
    /Storyboard runtime request failed with status 500/,
  );
});

for (const [name, error, code] of [
  ['timeout', Object.assign(new Error('request aborted'), { name: 'AbortError' }), 'PROVIDER_TIMEOUT'],
  ['network failure', new Error('socket reset'), 'PROVIDER_UNAVAILABLE'],
]) {
  test(`marks a runtime ${name} as safe and retryable`, async () => {
    const client = createStoryboardRuntimeClient({
      baseUrl: 'http://ai-storyboard:4173', token: 'secret', fetch: async () => { throw error; },
    });

    await assert.rejects(
      client.execute({ id: 'g1', workspace_id: 'w1', kind: 'vimax_render_video', parameters: {} }),
      (failure) => failure.code === code && failure.retryable === true && !failure.message.includes('secret') && !failure.message.includes('socket reset'),
    );
  });
}
