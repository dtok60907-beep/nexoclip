import test from 'node:test';
import assert from 'node:assert/strict';
import { createMotionAudioHandler } from './route.js';
import { makeMotionAudio, mp3Seconds } from '../../../../src/services/motionAudio.js';

const WORKSPACE = { id: '11111111-1111-4111-8111-111111111111' };
const ASSET = '22222222-2222-4222-8222-222222222222';
const voiceover = { type: 'voiceover', text: 'Halo, kopi baru sudah datang.', voiceId: 'JBFqnCBsd6RMkjVDRZzb' };

function request(body, cookie = 'session') {
  return { cookies: { get: () => (cookie ? { value: cookie } : undefined) }, json: async () => body };
}

// makeMotionAudio with every outside call faked.
function audioDeps(overrides = {}) {
  const calls = { generated: [], charged: [], imported: [] };
  const deps = {
    readBalance: async () => 100,
    priceAudio: async (audio) => ({ usd: 0.01, credits: audio.type === 'music' ? 5 : 2 }),
    generateAudio: async (audio) => { calls.generated.push(audio); return { body: Buffer.alloc(32000), contentType: 'audio/mpeg' }; },
    generateVoiceover: async (audio) => { calls.generated.push(audio); return { body: Buffer.alloc(32000), contentType: 'audio/mpeg', words: [{ w: 'Halo,', s: 0, e: 0.4 }] }; },
    importAsset: async (workspaceId, file) => { calls.imported.push(file); return { asset: { id: ASSET }, url: `/api/assets/${ASSET}/download?workspace_id=${workspaceId}` }; },
    loadStorage: () => ({}),
    appendCredit: async (pool, entry) => { calls.charged.push(entry); },
    ...overrides,
  };
  return { deps, calls };
}

function handler(overrides = {}) {
  const { deps, calls } = audioDeps(overrides);
  const post = createMotionAudioHandler({
    getSession: async (token) => (token ? { user_id: 'u1' } : null),
    findDefaultWorkspace: async () => WORKSPACE,
    loadPool: () => ({}),
    priceAudio: deps.priceAudio,
    makeAudio: (args) => makeMotionAudio({ ...args, ...deps }),
    logError: () => {},
  });
  return { post, calls };
}

test('an estimate prices the audio without generating or charging', async () => {
  const { post, calls } = handler();
  const response = await post(request({ estimate: true, audio: { type: 'music', text: 'lo-fi', durationSeconds: 30 } }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { credits: 5 });
  assert.equal(calls.generated.length, 0);
  assert.equal(calls.charged.length, 0);
});

test('generating stores the mp3 as a workspace asset and charges once per request id', async () => {
  const { post, calls } = handler();
  const response = await post(request({ requestId: 'req_12345678', audio: voiceover }));
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.url, `/api/assets/${ASSET}/download?workspace_id=${WORKSPACE.id}`);
  assert.equal(body.seconds, 2);
  assert.equal(body.credits, 2);
  assert.deepEqual(body.words, [{ w: 'Halo,', s: 0, e: 0.4 }]);
  assert.equal(calls.imported[0].allowAudio, true);
  assert.equal(calls.charged[0].amount, -2);
  assert.equal(calls.charged[0].reason, 'motion_audio');
  assert.equal(calls.charged[0].idempotencyKey, 'motion-audio:req_12345678');
});

test('refuses guests, bad input and a balance below the price before calling ElevenLabs', async () => {
  const { post, calls } = handler({ readBalance: async () => 1 });
  assert.equal((await post(request({ requestId: 'req_12345678', audio: voiceover }, null))).status, 401);
  assert.equal((await post(request({ requestId: 'req_12345678', audio: { type: 'voiceover', text: '' } }))).status, 400);
  assert.equal((await post(request({ requestId: 'x', audio: voiceover }))).status, 400);
  assert.equal((await post(request({ requestId: 'req_12345678', audio: voiceover }))).status, 402);
  assert.equal(calls.generated.length, 0);
});

test('a provider failure is not charged', async () => {
  const { post, calls } = handler({ generateVoiceover: async () => { throw Object.assign(new Error('down'), { status: 502 }); } });
  const response = await post(request({ requestId: 'req_12345678', audio: voiceover }));
  assert.equal(response.status, 502);
  assert.equal(calls.charged.length, 0);
});

test('mp3 length follows from 128 kbit/s', () => {
  assert.equal(mp3Seconds(16000 * 5), 5);
});
