import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('hides legacy studios from sidebar navigation without removing routes', async () => {
  const source = await readFile(new URL('../../components/StandaloneShell.js', import.meta.url), 'utf8');
  for (const id of ['audio', 'lipsync', 'body-swap', 'marketing', 'vibe-motion', 'storyboard']) {
    assert.match(source, new RegExp(`id: '${id}',[\\s\\S]{0,160}?hidden: true`));
  }
  // AI Clipping was removed entirely, not just hidden.
  assert.doesNotMatch(source, /ClippingStudio|id: 'clipping'/);
  assert.doesNotMatch(source, /href="\/ai-storyboard"/);
});

test('the storyboard sidebar link itself is not rendered while hidden', async () => {
  const source = await readFile(new URL('../../components/StandaloneShell.js', import.meta.url), 'utf8');
  assert.match(source, /if \(!storyboardTab \|\| storyboardTab\.hidden\) return null;/);
});
