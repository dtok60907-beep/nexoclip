import test from 'node:test';
import assert from 'node:assert/strict';
import { ELEVENLABS_PRICES, audioCostUsd, generateElevenLabsAudio, validateAudioInput } from './elevenlabsAudio.js';

test('prices voiceover per character and music per minute', () => {
  const text = 'x'.repeat(500);
  assert.equal(audioCostUsd({ type: 'voiceover', text, voiceId: 'JBFqnCBsd6RMkjVDRZzb' }), 0.5 * ELEVENLABS_PRICES.voiceoverPerThousandChars);
  assert.equal(audioCostUsd({ type: 'music', text: 'lo-fi', durationSeconds: 30 }), 0.5 * ELEVENLABS_PRICES.musicPerMinute);
});

test('validates audio input', () => {
  assert.throws(() => validateAudioInput({ type: 'voiceover', text: '', voiceId: 'JBFqnCBsd6RMkjVDRZzb' }), /text is required/);
  assert.throws(() => validateAudioInput({ type: 'voiceover', text: 'hi', voiceId: '../x' }), /voiceId/);
  assert.throws(() => validateAudioInput({ type: 'music', text: 'lo-fi', durationSeconds: 1 }), /3-300/);
  assert.throws(() => validateAudioInput({ type: 'sfx', text: 'boom' }), /voiceover or music/);
  assert.equal(validateAudioInput({ type: 'music', text: 'lo-fi', durationSeconds: 20 }).instrumental, true);
});

test('calls ElevenLabs text to speech and music with the right payload', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, body: JSON.parse(init.body), key: init.headers['xi-api-key'] }); return new Response(Buffer.from('mp3')); };
  await generateElevenLabsAudio({ type: 'voiceover', text: 'Halo', voiceId: 'JBFqnCBsd6RMkjVDRZzb' }, { apiKey: 'k', fetchImpl });
  await generateElevenLabsAudio({ type: 'music', text: 'lo-fi', durationSeconds: 12, instrumental: false }, { apiKey: 'k', fetchImpl });
  assert.match(calls[0].url, /\/v1\/text-to-speech\/JBFqnCBsd6RMkjVDRZzb\?output_format=mp3_44100_128$/);
  assert.deepEqual(calls[0].body, { text: 'Halo', model_id: 'eleven_v3' });
  assert.deepEqual(calls[1].body, { prompt: 'lo-fi', music_length_ms: 12000, model_id: 'music_v1', force_instrumental: false });
  const failing = async () => new Response(JSON.stringify({ detail: { message: 'quota exceeded' } }), { status: 401 });
  await assert.rejects(generateElevenLabsAudio({ type: 'voiceover', text: 'Halo', voiceId: 'JBFqnCBsd6RMkjVDRZzb' }, { apiKey: 'k', fetchImpl: failing }), /quota exceeded/);
});
