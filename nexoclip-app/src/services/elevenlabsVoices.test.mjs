import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ELEVENLABS_VOICES } from './elevenlabsAudio.js';

// The Director offers the same voices to its agent (director_service/nexoclip.py VOICES).
test('the Director lists the same voices as nexoclip', () => {
  const source = readFileSync(new URL('../../services/OpenMontage/director_service/nexoclip.py', import.meta.url), 'utf8');
  const block = source.slice(source.indexOf('VOICES = ['), source.indexOf(']', source.indexOf('VOICES = [')));
  const director = [...block.matchAll(/\{"id": "([^"]+)", "name": "([^"]+)", "gender": "([^"]+)", "description": "([^"]+)"\}/g)]
    .map(([, id, name, gender, description]) => ({ id, name, gender, description }));
  assert.deepEqual(director, ELEVENLABS_VOICES);
});
