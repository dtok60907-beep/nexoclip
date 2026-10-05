import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../packages/studio/src/components/CinemaStudio.jsx', import.meta.url), 'utf8');

test('Cinema Studio submits Seedream 4.5 through the SaaS image client', () => {
  assert.match(source, /generateSaasImage/);
  assert.match(source, /const CINEMA_MODEL = "bytedance-seed\/seedream-4\.5"/);
  assert.match(source, /model: CINEMA_MODEL/);
  assert.doesNotMatch(source, /generateImage\(apiKey/);
});
