import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = () => readFile(new URL('../../components/StandaloneShell.js', import.meta.url), 'utf8');

test('the sidebar renders only the curated agents and tools', async () => {
  const source = await shell();
  // Agents: only the AI Director (Chat Mode was removed).
  assert.match(source, /renderAgentItem\('director', 'Director Mode'/);
  assert.doesNotMatch(source, /Chat Mode/);
  const tools = source.match(/const toolItems = \[([\s\S]*?)\];/)?.[1] || '';
  for (const id of ['lipsync', 'body-swap', 'marketing', 'vibe-motion']) {
    assert.doesNotMatch(tools, new RegExp(`'${id}'`));
  }
});

test('removed features stay removed', async () => {
  const source = await shell();
  // AI Clipping and the Jellyfish /storyboard app were removed entirely.
  assert.doesNotMatch(source, /ClippingStudio|id: 'clipping'/);
  assert.doesNotMatch(source, /id: 'storyboard'|\/storyboard\//);
  assert.doesNotMatch(source, /href="\/ai-storyboard"/);
});
