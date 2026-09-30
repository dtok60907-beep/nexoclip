import { isBytePlusAssetNotFound } from '../providers/byteplusAssetsClient.js';
import { thumbnailKeyFor } from './assetThumbnailService.js';

export class UnifiedAssetDeletionError extends Error {
  constructor(message, { code, status = 409, retryable = false } = {}) {
    super(message);
    this.name = 'UnifiedAssetDeletionError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

const failure = (message, options) => new UnifiedAssetDeletionError(message, options);

export async function deleteTrustedWorkspaceAsset({
  workspaceId,
  localAssetId,
  pool,
  storage,
  bytePlusClient,
  cleanupCanvasReferences,
  configuredProjectName,
}) {
  if (!workspaceId || !localAssetId) throw failure('Asset identity is required.', { code: 'ASSET_DELETE_INVALID', status: 400 });
  const snapshotClient = await pool.connect();
  let asset;
  let providerLinks = [];
  try {
    await snapshotClient.query('BEGIN');
    const result = await snapshotClient.query(
      `SELECT a.id, a.workspace_id, a.storage_key,
              bal.provider_asset_id, bal.project_name, bal.attempt_id
       FROM assets a
       LEFT JOIN byteplus_asset_links bal
         ON bal.workspace_id = a.workspace_id AND bal.local_asset_id = a.id
       WHERE a.workspace_id = $1 AND a.id = $2
       FOR UPDATE OF a`,
      [workspaceId, localAssetId],
    );
    asset = result.rows[0] || null;
    providerLinks = result.rows
      .filter(row => row.provider_asset_id)
      .map(row => ({
        providerAssetId: row.provider_asset_id,
        projectName: row.project_name,
        attemptId: row.attempt_id,
      }));
    await snapshotClient.query('COMMIT');
  } catch (error) {
    await snapshotClient.query('ROLLBACK');
    throw error;
  } finally {
    snapshotClient.release();
  }
  if (!asset) return null;

  if (providerLinks.some(link => link.projectName !== configuredProjectName)) {
    throw failure('Trusted asset belongs to another BytePlus project.', {
      code: 'BYTEPLUS_PROJECT_MISMATCH', status: 409,
    });
  }

  let providerAlreadyMissing = false;
  for (const link of providerLinks) {
    try {
      await bytePlusClient.deleteAsset({ assetId: link.providerAssetId, projectName: link.projectName });
    } catch (error) {
      if (isBytePlusAssetNotFound(error)) providerAlreadyMissing = true;
      else {
        console.error('[asset-delete] BytePlus DeleteAsset failed', JSON.stringify({
          localAssetId, code: error?.code, providerCode: error?.providerCode, status: error?.status, retryable: error?.retryable,
        }));
        throw failure('BytePlus asset deletion can be retried.', {
          code: 'BYTEPLUS_ASSET_DELETE_RETRYABLE', status: 503, retryable: true,
        });
      }
    }
  }

  // From here on the BytePlus copies are gone. If a later step fails the local
  // asset survives, so its trust records must stop claiming "active" — otherwise
  // generation sends the photo raw and BytePlus rejects it as a real person.
  const markProviderCopiesMissing = async () => {
    if (!providerLinks.length) return;
    let client;
    try {
      client = await pool.connect();
      await client.query(
        `UPDATE byteplus_asset_links
         SET status = 'failed', error = $3::jsonb, updated_at = now()
         WHERE workspace_id = $1 AND local_asset_id = $2 AND provider_asset_id IS NOT NULL`,
        [workspaceId, localAssetId, JSON.stringify({ code: 'BYTEPLUS_ASSET_NOT_FOUND' })],
      );
    } catch (error) {
      console.error('[asset-delete] could not mark trust as missing', localAssetId, error?.message);
    } finally {
      client?.release();
    }
  };

  const canvas = await cleanupCanvasReferences({
    workspaceId, localAssetId, canonicalUrl: `/api/assets/${encodeURIComponent(localAssetId)}/download`,
  }).catch((error) => {
    console.error('[asset-delete] Canvas reference cleanup failed', localAssetId, error?.message);
    return { complete: false };
  });
  if (!canvas?.complete) {
    await markProviderCopiesMissing();
    throw failure('Canvas reference cleanup is incomplete.', {
      code: 'CANVAS_REFERENCE_CLEANUP_INCOMPLETE', status: 503, retryable: true,
    });
  }

  try {
    await storage.delete(asset.storage_key);
    // Best effort: a missing thumbnail is fine, a leftover one is only waste.
    await Promise.resolve(storage.delete(thumbnailKeyFor(asset.storage_key))).catch(() => {});
  } catch (error) {
    console.error('[asset-delete] storage delete failed', localAssetId, error?.name, error?.message);
    await markProviderCopiesMissing();
    throw failure('Asset storage deletion failed.', {
      code: 'ASSET_STORAGE_DELETE_FAILED', status: 503, retryable: true,
    });
  }

  const finalClient = await pool.connect();
  try {
    await finalClient.query('BEGIN');
    if (providerLinks.length > 0) {
      const deletedLinks = await finalClient.query(
        `DELETE FROM byteplus_asset_links
         WHERE workspace_id = $1 AND local_asset_id = $2`,
        [workspaceId, localAssetId],
      );
      if (deletedLinks.rowCount !== providerLinks.length) {
        throw failure('Asset Trust changed during deletion.', { code: 'ASSET_TRUST_CHANGED', status: 409, retryable: true });
      }
    }
    await finalClient.query('DELETE FROM generation_outputs WHERE workspace_id = $1 AND asset_id = $2', [workspaceId, localAssetId]);
    const deleted = await finalClient.query(
      `DELETE FROM assets a
       WHERE a.workspace_id = $1 AND a.id = $2
         AND NOT EXISTS (
           SELECT 1 FROM byteplus_asset_links bal
           WHERE bal.workspace_id = a.workspace_id AND bal.local_asset_id = a.id
         )`,
      [workspaceId, localAssetId],
    );
    if (deleted.rowCount !== 1) throw failure('Asset changed during deletion.', { code: 'ASSET_DELETE_CHANGED', status: 409, retryable: true });
    await finalClient.query('COMMIT');
  } catch (error) {
    await finalClient.query('ROLLBACK');
    throw error;
  } finally {
    finalClient.release();
  }
  return { deleted: true, providerAlreadyMissing };
}
