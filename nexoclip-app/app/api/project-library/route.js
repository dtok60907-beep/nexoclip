import { getPool } from '../../../src/db/pool.js';
import { UUID, motionTenant } from '../motion/projects/shared.js';
import { requireCanSpend } from '../../../src/services/tenantContext.js';
import { catalog } from '../../../src/services/projectCatalog.js';
import { changeFolder, restoreWork } from '../../../src/repositories/studioWork.js';
export const dynamic = 'force-dynamic';

function failure(error) {
  const status =
    error.status || { 'Authentication required': 401, 'Workspace access denied': 403 }[error.message] || 500;
  return Response.json({ error: status === 500 ? 'Projects belum bisa dimuat.' : error.message }, { status });
}
export async function GET(request) {
  try {
    const { workspace, user } = await motionTenant(request);
    const params = new URL(request.url).searchParams;
    if (params.has('id')) {
      if (!UUID.test(params.get('id'))) throw Object.assign(new Error('ID tidak valid.'), { status: 400 });
      return Response.json(
        await restoreWork(getPool(), workspace.id, user.id, params.get('id'), params.get('studio')),
      );
    }
    return Response.json(await catalog(getPool(), workspace.id, user.id, request));
  } catch (err) {
    return failure(err);
  }
}
export async function POST(request) {
  try {
    const tenant = await motionTenant(request);
    requireCanSpend(tenant);
    const { workspace, user } = tenant;
    const body = await request.json();
    if (body.action === 'move') {
      const { projects } = await catalog(getPool(), workspace.id, user.id, request);
      if (!projects.some((p) => p.studio === body.studio && p.id === body.id))
        throw Object.assign(new Error('Project tidak ditemukan.'), { status: 404 });
    }
    await changeFolder(getPool(), workspace.id, user.id, body);
    return Response.json({ ok: true });
  } catch (err) {
    return failure(err);
  }
}
