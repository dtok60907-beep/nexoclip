import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Social opens the original Postiz UI through the Caddy host route', () => {
  const shell = readFileSync('components/StandaloneShell.js', 'utf8');
  assert.match(shell, /window\.location\.assign\('https:\/\/social\.nexoclip\.com'\)/);
  assert.doesNotMatch(shell, /SocialStudio/);
});
