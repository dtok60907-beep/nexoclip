import * as jobRepository from '../repositories/jobRepository.js';

function toJob(row) {
  if (!row) return null;
  const result = row.result && typeof row.result === 'object' ? { ...row.result } : row.result ?? {};
  if (row.output_asset_id && !result.outputUrl) {
    const url = `/api/assets/${encodeURIComponent(row.output_asset_id)}/download?workspace_id=${encodeURIComponent(row.workspace_id)}`;
    result.outputUrl = url;
    result.thumbnailUrl = result.thumbnailUrl || url;
  }
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    params: row.parameters ?? {},
    ...(row.prompt !== undefined ? { prompt: row.prompt } : {}),
    ...(row.model !== undefined ? { model: row.model } : {}),
    result,
    error: row.error ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createJob({ pool, workspaceId, kind, params }) {
  return toJob(await jobRepository.insertJob(pool, { workspaceId, kind, params }));
}

export async function getJob({ pool, workspaceId, id }) {
  return toJob(await jobRepository.findJob(pool, workspaceId, id));
}

export async function listJobs({ pool, workspaceId, statuses = null, kind = null, limit = 50 }) {
  const rows = await jobRepository.listJobs(pool, { workspaceId, statuses, kind, limit });
  return { jobs: rows.map(toJob) };
}

export async function updateJobStatus({ pool, workspaceId, id, status, result = null, error = null }) {
  return toJob(await jobRepository.updateJob(pool, { workspaceId, id, status, result, error }));
}
