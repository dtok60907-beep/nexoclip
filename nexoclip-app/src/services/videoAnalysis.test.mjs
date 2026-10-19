import test from 'node:test';
import assert from 'node:assert/strict';
import { SEED_VIDEO_MODEL, analyzeVideo, videoAnalysisCostUsd } from './videoAnalysis.js';

const env = { BYTEPLUS_API_KEY: 'k', BYTEPLUS_BASE_URL: 'https://ark.example/api/v3/' };

test('asks the Seed vision model about the whole video at one frame per second', async () => {
  let sent;
  const fetchImpl = async (url, init) => {
    sent = { url, body: JSON.parse(init.body), auth: init.headers.Authorization };
    return new Response(JSON.stringify({ choices: [{ message: { content: ' 00:00 a dog runs ' } }], usage: { prompt_tokens: 900, completion_tokens: 80 } }));
  };
  const result = await analyzeVideo({ url: 'https://r2.example/v.mp4', question: 'what happens?', env, fetchImpl });
  assert.deepEqual(result, { text: '00:00 a dog runs', usage: { prompt_tokens: 900, completion_tokens: 80 } });
  assert.equal(sent.url, 'https://ark.example/api/v3/chat/completions');
  assert.equal(sent.body.model, SEED_VIDEO_MODEL);
  assert.deepEqual(sent.body.messages[0].content[0], { type: 'video_url', video_url: { url: 'https://r2.example/v.mp4', fps: 1 } });
  assert.equal(sent.auth, 'Bearer k');
});

test('flags an unreachable video URL so the caller can send the file inline', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ error: { message: 'Invalid video_url.', param: 'video_url' } }), { status: 400 });
  await assert.rejects(analyzeVideo({ url: 'https://x', env, fetchImpl }), (error) => error.invalidUrl === true);
  await assert.rejects(analyzeVideo({ url: 'https://x', env: {}, fetchImpl }), /not configured/);
});

test('prices the tokens it used', () => {
  assert.equal(videoAnalysisCostUsd({ prompt_tokens: 1_000_000, completion_tokens: 1_000_000 }), 3);
});
