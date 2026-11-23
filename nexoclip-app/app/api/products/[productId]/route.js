import { getPool } from '../../../../src/db/pool.js';
import { SESSION_COOKIE } from '../../../../src/lib/auth/session.js';
import { requireCanSpend, resolveTenantContext } from '../../../../src/services/tenantContext.js';

async function context(request) {
  const workspaceId = request.headers.get('x-workspace-id');
  if (!workspaceId) throw Object.assign(new Error('workspace_id is required'), { status: 400 });
  return resolveTenantContext({ token: request.cookies.get(SESSION_COOKIE)?.value, workspaceId });
}
function errorResponse(error) {
  const status = error.status || (error.message === 'Authentication required' ? 401 : error.message === 'Workspace access denied' ? 403 : 500);
  return Response.json({ error: status === 500 ? 'Product tidak bisa diproses sekarang.' : error.message }, { status });
}
export async function PUT(request, { params }) {
  try {
    const tenant = await context(request);
    requireCanSpend(tenant);
    const { productId } = await params;
    const data = await request.json();
    const name = String(data?.name || '').trim();
    if (!name || name.length > 160) return Response.json({ error: 'Nama produk wajib diisi.' }, { status: 400 });
    const result = await getPool().query('UPDATE workspace_products SET name=$3,data=$4,updated_at=now() WHERE workspace_id=$1 AND id=$2 RETURNING id,owner_id,name,data,created_at,updated_at', [tenant.workspace.id, productId, name, JSON.stringify({ ...data, name })]);
    if (!result.rowCount) return Response.json({ error: 'Product tidak ditemukan.' }, { status: 404 });
    const row = result.rows[0];
    return Response.json({ product: { ...row.data, canDelete: tenant.workspace.role !== 'member' || row.owner_id === tenant.user.id, id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at } });
  } catch (error) { return errorResponse(error); }
}
export async function DELETE(request, { params }) {
  try {
    const tenant = await context(request);
    requireCanSpend(tenant);
    const { productId } = await params;
    const result = await getPool().query("DELETE FROM workspace_products WHERE workspace_id=$1 AND id=$2 AND (owner_id=$3 OR $4 IN ('owner','admin')) RETURNING id", [tenant.workspace.id, productId, tenant.user.id, tenant.workspace.role]);
    if (!result.rowCount) return Response.json({ error: 'Product tidak ditemukan.' }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
