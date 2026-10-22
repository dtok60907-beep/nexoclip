import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = () => readFile(new URL('../../components/StandaloneShell.js', import.meta.url), 'utf8');

test('the sidebar renders only the curated agents and tools', async () => {
  const source = await shell();
  const nav = source.match(/<nav data-tour="studio-nav"[\s\S]*?<\/nav>/)?.[0] || '';
  // Agents: only the AI Director (Chat Mode was removed).
  assert.match(nav, /aria-label="AI Director"/);
  assert.doesNotMatch(source, /Chat Mode/);
  for (const id of ['lipsync', 'body-swap', 'marketing', 'vibe-motion']) {
    assert.doesNotMatch(nav, new RegExp(`navLink\\('${id}'`));
  }
});

test('removed features stay removed', async () => {
  const source = await shell();
  // AI Clipping and the Jellyfish /storyboard app were removed entirely.
  assert.doesNotMatch(source, /ClippingStudio|id: 'clipping'/);
  assert.doesNotMatch(source, /id: 'storyboard'|\/storyboard\//);
  assert.doesNotMatch(source, /href="\/ai-storyboard"/);
});
