import test from 'node:test';
import assert from 'node:assert/strict';
import { BytePlusAssetsError } from '../../src/providers/byteplusAssetsClient.js';
import { deleteTrustedWorkspaceAsset } from '../../src/services/unifiedAssetDeletionService.js';

function fixture({ link = true, links, providerError, projectName = 'project-x', finalLinkDeleted = true, finalAssetDeleted = true, canvasComplete = true } = {}) {
  const calls = [];
  const asset = { id: 'asset-1', workspace_id: 'workspace-1', storage_key: 'workspace-1/a.png' };
  const mapping = link ? { provider_asset_id: 'provider-1', project_name: projectName, attempt_id: 'attempt-1' } : null;
  const mappings = links || [{ ...asset, ...mapping }];
  let connection = 0;
  const pool = { async connect() {
    const phase = connection++;
    return { async query(text, values) {
      calls.push({ text, values });
      if (text.startsWith('SELECT') && text.includes('FROM assets a')) return { rows: mappings };
      if (text.startsWith('DELETE FROM byteplus_asset_links')) return { rowCount: finalLinkDeleted ? mappings.filter(row => row.provider_asset_id).length : 0, rows: [] };
      if (text.startsWith('DELETE FROM assets')) return { rowCount: finalAssetDeleted ? 1 : 0, rows: [] };
      return { rows: [], rowCount: 1 };
    }, release() { calls.push({ text: `RELEASE-${phase}` }); } };
  } };
  const storage = { async delete(key) { calls.push({ text: 'STORAGE', key }); } };
  const provider = { async deleteAsset(input) { calls.push({ text: 'PROVIDER', input }); if (providerError) throw providerError; return {}; } };
  const cleanupCanvasReferences = async input => { calls.push({ text: 'CANVAS', input }); return { complete: canvasComplete }; };
  return { calls, pool, storage, provider, cleanupCanvasReferences };
}

const run = (f, overrides = {}) => deleteTrustedWorkspaceAsset({
  workspaceId: 'workspace-1', localAssetId: 'asset-1', pool: f.pool, storage: f.storage,
  bytePlusClient: f.provider, cleanupCanvasReferences: f.cleanupCanvasReferences,
  configuredProjectName: 'project-x', ...overrides,
});

test('deletes provider, storage, Canvas references, mapping, outputs, and asset', async () => {
  const f = fixture();
  assert.deepEqual(await run(f), { deleted: true, providerAlreadyMissing: false });
  assert.deepEqual(f.calls.find(c => c.text === 'PROVIDER').input, { assetId: 'provider-1', projectName: 'project-x' });
  assert.ok(f.calls.find(c => c.text === 'STORAGE'));
  assert.ok(f.calls.find(c => c.text === 'CANVAS'));
  assert.ok(
    f.calls.findIndex(c => c.text === 'CANVAS') < f.calls.findIndex(c => c.text === 'STORAGE'),
    'Canvas cleanup must succeed before destructive storage deletion',
  );
  const mappingDelete = f.calls.find(c => c.text?.startsWith('DELETE FROM byteplus_asset_links'));
  assert.match(mappingDelete.text, /WHERE workspace_id = \$1 AND local_asset_id = \$2/);
  assert.deepEqual(mappingDelete.values, ['workspace-1', 'asset-1']);
  assert.ok(f.calls.find(c => c.text?.startsWith('DELETE FROM assets')));
});

test('deletes every project-specific provider copy before deleting a shared workspace asset', async () => {
  const asset = { id: 'asset-1', workspace_id: 'workspace-1', storage_key: 'workspace-1/a.png' };
  const f = fixture({ links: [
    { ...asset, provider_asset_id: 'provider-a', project_name: 'project-x', attempt_id: 'attempt-a' },
    { ...asset, provider_asset_id: 'provider-b', project_name: 'project-x', attempt_id: 'attempt-b' },
  ] });

  assert.deepEqual(await run(f), { deleted: true, providerAlreadyMissing: false });
  assert.deepEqual(f.calls.filter(call => call.text === 'PROVIDER').map(call => call.input.assetId), ['provider-a', 'provider-b']);
});

test('provider not found is idempotent and still cleans locally', async () => {
  const f = fixture({ providerError: new BytePlusAssetsError('missing', { code: 'AssetNotFound', status: 404 }) });
  assert.deepEqual(await run(f), { deleted: true, providerAlreadyMissing: true });
  assert.ok(f.calls.find(c => c.text === 'STORAGE'));
});

test('transient provider failure preserves every local system', async () => {
  const f = fixture({ providerError: new BytePlusAssetsError('busy', { code: 'BYTEPLUS_ASSETS_UNAVAILABLE', status: 503, retryable: true }) });
  await assert.rejects(run(f), error => error.code === 'BYTEPLUS_ASSET_DELETE_RETRYABLE');
  assert.equal(f.calls.some(c => ['STORAGE', 'CANVAS'].includes(c.text)), false);
  assert.equal(f.calls.some(c => c.text?.startsWith('DELETE FROM assets')), false);
});

test('project mismatch and incomplete Canvas cleanup preserve local metadata', async () => {
  const mismatch = fixture({ projectName: 'other-project' });
  await assert.rejects(run(mismatch), error => error.code === 'BYTEPLUS_PROJECT_MISMATCH');
  assert.equal(mismatch.calls.some(c => c.text === 'PROVIDER'), false);

  const canvas = fixture({ canvasComplete: false });
  await assert.rejects(run(canvas), error => error.code === 'CANVAS_REFERENCE_CLEANUP_INCOMPLETE');
  assert.equal(canvas.calls.some(c => c.text?.startsWith('DELETE FROM assets')), false);
});

test('asset deletion stops if a Trust mapping appears after an empty snapshot', async () => {
  const f = fixture({ link: false, finalAssetDeleted: false });
  await assert.rejects(run(f), error => error.code === 'ASSET_DELETE_CHANGED');
  const assetDelete = f.calls.find(c => c.text?.startsWith('DELETE FROM assets'));
  assert.match(assetDelete.text, /NOT EXISTS/);
});

test('compare-and-set refuses to delete a newer Trust mapping', async () => {
  const f = fixture({ finalLinkDeleted: false });
  await assert.rejects(run(f), error => error.code === 'ASSET_TRUST_CHANGED');
  assert.equal(f.calls.some(c => c.text?.startsWith('DELETE FROM assets')), false);
});

test('a delete that fails after removing the BytePlus copy marks its trust as missing', async () => {
  const canvas = fixture({ canvasComplete: false });
  await assert.rejects(run(canvas), error => error.code === 'CANVAS_REFERENCE_CLEANUP_INCOMPLETE');
  const providerIndex = canvas.calls.findIndex(c => c.text === 'PROVIDER');
  const markIndex = canvas.calls.findIndex(c => c.text?.includes("SET status = 'failed'"));
  assert.ok(providerIndex >= 0 && markIndex > providerIndex);
  assert.deepEqual(canvas.calls[markIndex].values, ['workspace-1', 'asset-1', JSON.stringify({ code: 'BYTEPLUS_ASSET_NOT_FOUND' })]);

  const untrusted = fixture({ link: false, links: [{ id: 'asset-1', workspace_id: 'workspace-1', storage_key: 'k' }], canvasComplete: false });
  await assert.rejects(run(untrusted), error => error.code === 'CANVAS_REFERENCE_CLEANUP_INCOMPLETE');
  assert.equal(untrusted.calls.some(c => c.text?.includes("SET status = 'failed'")), false);
});
