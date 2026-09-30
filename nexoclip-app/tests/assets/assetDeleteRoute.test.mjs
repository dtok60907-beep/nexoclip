import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssetDeleteHandler } from '../../app/api/assets/[assetId]/route.js';

const request = { cookies: { get: () => ({ value: 'session' }) } };

test('workspace asset delete requires authentication', async () => {
  const handler = createAssetDeleteHandler({
    resolveTenantContext: async () => { throw Object.assign(new Error('Authentication required'), { status: 401 }); },
    deleteWorkspaceAsset: async () => { throw new Error('must not delete'); },
  });
  const response = await handler(request, { params: Promise.resolve({ assetId: 'asset-1' }) });
  assert.equal(response.status, 401);
});

test('workspace asset delete returns 404 when asset is outside resolved workspace', async () => {
  const handler = createAssetDeleteHandler({
    resolveTenantContext: async () => ({ workspace: { id: 'workspace-1' } }),
    deleteWorkspaceAsset: async () => null,
  });
  const response = await handler(request, { params: Promise.resolve({ assetId: 'asset-2' }) });
  assert.equal(response.status, 404);
});

test('workspace asset delete returns stable retryable cleanup errors', async () => {
  const handler = createAssetDeleteHandler({
    resolveTenantContext: async () => ({ workspace: { id: 'workspace-1' } }),
    deleteWorkspaceAsset: async () => { throw Object.assign(new Error('Canvas reference cleanup is incomplete.'), {
      code: 'CANVAS_REFERENCE_CLEANUP_INCOMPLETE', status: 503, retryable: true,
    }); },
  });
  const response = await handler(request, { params: Promise.resolve({ assetId: 'asset-1' }) });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: 'Canvas reference cleanup is incomplete.', code: 'CANVAS_REFERENCE_CLEANUP_INCOMPLETE', retryable: true,
  });
});

test('workspace asset delete uses the authenticated workspace', async () => {
  const calls = [];
  const handler = createAssetDeleteHandler({
    resolveTenantContext: async () => ({ workspace: { id: 'workspace-1' } }),
    deleteWorkspaceAsset: async (...args) => { calls.push(args); return { id: 'asset-1' }; },
  });
  const response = await handler(request, { params: Promise.resolve({ assetId: 'asset-1' }) });
  assert.equal(response.status, 200);
  assert.deepEqual(calls[0], ['workspace-1', 'asset-1']);
});

test('Canvas cleanup URL includes the Canvas base path', async () => {
  const { spiteCleanupUrl } = await import('../../app/api/assets/[assetId]/route.js');
  assert.equal(
    spiteCleanupUrl('asset-1', { SPITE_INTERNAL_URL: 'http://spite.internal:8080/', NEXT_PUBLIC_SPITE_URL: '/canvas' }),
    'http://spite.internal:8080/canvas/api/assets/asset-1?cleanup=1',
  );
  assert.equal(
    spiteCleanupUrl('asset-1', { SPITE_INTERNAL_URL: 'http://spite.internal:8080/canvas' }),
    'http://spite.internal:8080/canvas/api/assets/asset-1?cleanup=1',
  );
  assert.equal(
    spiteCleanupUrl('asset-1', { NEXT_PUBLIC_SPITE_URL: 'https://app.example/canvas' }),
    'https://app.example/canvas/api/assets/asset-1?cleanup=1',
  );
  assert.equal(spiteCleanupUrl('asset-1', { NEXT_PUBLIC_SPITE_URL: '/canvas' }), null);
});
