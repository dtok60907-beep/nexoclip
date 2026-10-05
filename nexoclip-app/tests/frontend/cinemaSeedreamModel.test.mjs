import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Cinema Studio uses Seedream 4.5 for creation and reference editing', async () => {
  const source = await readFile(new URL('../../packages/studio/src/components/CinemaStudio.jsx', import.meta.url), 'utf8');
  assert.match(source, /const CINEMA_MODEL = "bytedance-seed\/seedream-4\.5"/);
  assert.match(source, /model: CINEMA_MODEL/);
  assert.doesNotMatch(source, /nano-banana-pro(?:-edit)?/);
});
