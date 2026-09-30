import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../src/services/assetService.js', import.meta.url), 'utf8');

test('asset listing uses the authenticated download route instead of a storage URL', () => {
  assert.match(source, /\/api\/assets\/\$\{encodeURIComponent\(asset\.id\)\}\/download\?workspace_id=/);
  // Listings must not hand out public storage URLs. (R2_PUBLIC_URL may still
  // configure the storage client; what matters is what the listing returns.)
  const start = source.indexOf('export async function listWorkspaceAssets');
  assert.ok(start >= 0, 'listWorkspaceAssets not found');
  const next = source.indexOf('\nexport ', start + 1);
  const listing = source.slice(start, next === -1 ? undefined : next);
  assert.doesNotMatch(listing, /publicUrl|R2_PUBLIC_URL/);
});
