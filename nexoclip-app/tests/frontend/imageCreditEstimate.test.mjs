import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('image studio prices the batch with the server model price', async () => {
  const source = await readFile(new URL('../../packages/studio/src/components/ImageStudio.jsx', import.meta.url), 'utf8');
  assert.match(source, /useGenerationPrice\(/);
  assert.match(source, /pricePerImage \* batchSize/);
  // The flat per-operation estimate showed 2.5 credits for every model.
  assert.doesNotMatch(source, /\/api\/generations\/estimate/);
  assert.doesNotMatch(source, /CREDITS_PER_USD|unitPrice\s*=/);
});

test('the price hook asks the same pricing route the reservation uses', async () => {
  const source = await readFile(new URL('../../packages/studio/src/lib/useGenerationPrice.js', import.meta.url), 'utf8');
  assert.match(source, /\/api\/generations\/price\?/);
});
