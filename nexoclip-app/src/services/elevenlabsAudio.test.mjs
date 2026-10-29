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

test('voiceover with timestamps turns the character alignment into words', async () => {
  const { generateVoiceoverWithTimestamps, wordsFromAlignment } = await import('./elevenlabsAudio.js');
  const text = 'Halo, dunia ini';
  const alignment = {
    characters: [...text],
    character_start_times_seconds: [...text].map((_, i) => i * 0.1),
    character_end_times_seconds: [...text].map((_, i) => i * 0.1 + 0.08),
  };
  assert.deepEqual(wordsFromAlignment(alignment), [
    { w: 'Halo,', s: 0, e: 0.48 }, { w: 'dunia', s: 0.6, e: 1.08 }, { w: 'ini', s: 1.2, e: 1.48 },
  ]);
  let called = null;
  const result = await generateVoiceoverWithTimestamps({ type: 'voiceover', text, voiceId: 'JBFqnCBsd6RMkjVDRZzb' }, {
    apiKey: 'k',
    fetchImpl: async (url, init) => { called = { url, body: JSON.parse(init.body) }; return { ok: true, json: async () => ({ audio_base64: Buffer.from('mp3').toString('base64'), alignment }) }; },
  });
  assert.match(called.url, /\/v1\/text-to-speech\/JBFqnCBsd6RMkjVDRZzb\/with-timestamps\?output_format=mp3_44100_128$/);
  assert.equal(called.body.model_id, 'eleven_v3');
  assert.equal(result.body.toString(), 'mp3');
  assert.equal(result.words.length, 3);
});
