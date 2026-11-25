import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultCharacterVoiceSample,
  generateCharacterVoice,
  listCharacterVoices,
} from './characterVoiceService.js';

test('listCharacterVoices returns the 12 curated ElevenLabs voices and sample cost', async () => {
  const result = await listCharacterVoices({
    env: { ELEVENLABS_API_KEY: 'test-key' },
    priceAudio: async () => ({ usd: 0.02, credits: 1 }),
  });
  assert.equal(result.configured, true);
  assert.equal(result.voices.length, 12);
  assert.equal(result.sampleCredits, 1);
  assert.match(result.defaultSampleText, /natural speaking voice/i);
});

test('generateCharacterVoice generates mp3, imports as workspace audio, and charges credits', async () => {
  let importedArgs = null;
  let creditArgs = null;
  const result = await generateCharacterVoice({
    pool: {},
    workspaceId: 'ws-1',
    userId: 'u-1',
    voiceId: 'JBFqnCBsd6RMkjVDRZzb',
    characterName: 'Raka',
    requestId: 'req-12345678',
    readBalance: async () => 50,
    priceAudio: async () => ({ usd: 0.016, credits: 1 }),
    generateAudio: async (input) => {
      assert.equal(input.type, 'voiceover');
      assert.equal(input.voiceId, 'JBFqnCBsd6RMkjVDRZzb');
      assert.match(input.text, /Raka/);
      return { body: Buffer.alloc(16000), contentType: 'audio/mpeg' };
    },
    importAsset: async (workspaceId, opts) => {
      importedArgs = { workspaceId, ...opts };
      return {
        asset: { id: 'asset-voice-1' },
        url: '/api/assets/asset-voice-1/download?workspace_id=ws-1',
      };
    },
    loadStorage: () => ({}),
    appendCredit: async (_pool, entry) => {
      creditArgs = entry;
    },
  });

  assert.equal(result.assetId, 'asset-voice-1');
  assert.equal(result.url, '/api/assets/asset-voice-1/download?workspace_id=ws-1');
  assert.equal(result.voiceName, 'George');
  assert.equal(result.credits, 1);
  assert.equal(result.seconds, 1);
  assert.equal(importedArgs.allowAudio, true);
  assert.equal(importedArgs.filename, 'character-voice-george.mp3');
  assert.equal(creditArgs.reason, 'character_voice');
  assert.equal(creditArgs.amount, -1);
});

test('defaultCharacterVoiceSample falls back cleanly when characterName is empty', () => {
  assert.match(defaultCharacterVoiceSample(''), /Hi there/);
  assert.match(defaultCharacterVoiceSample('Sinta'), /I'm Sinta/);
});
