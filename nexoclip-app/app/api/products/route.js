import { getPool } from '../../../src/db/pool.js';
import { SESSION_COOKIE } from '../../../src/lib/auth/session.js';
import { requireCanSpend, resolveTenantContext } from '../../../src/services/tenantContext.js';

async function context(request) {
  const workspaceId = request.headers.get('x-workspace-id');
  if (!workspaceId) throw Object.assign(new Error('workspace_id is required'), { status: 400 });
  return resolveTenantContext({ token: request.cookies.get(SESSION_COOKIE)?.value, workspaceId });
}
function errorResponse(error) {
  const status = error.status || (error.message === 'Authentication required' ? 401 : error.message === 'Workspace access denied' ? 403 : 500);
  return Response.json({ error: status === 500 ? 'Products tidak bisa diproses sekarang.' : error.message }, { status });
}
export async function GET(request) {
  try {
    const { workspace, user } = await context(request);
    const result = await getPool().query('SELECT id,owner_id,name,data,created_at,updated_at FROM workspace_products WHERE workspace_id=$1 ORDER BY updated_at DESC', [workspace.id]);
    return Response.json({ products: result.rows.map(row => ({ ...row.data, canDelete: workspace.role !== 'member' || row.owner_id === user.id, id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at })) });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request) {
  try {
    const tenant = await context(request);
    requireCanSpend(tenant);
    const data = await request.json();
    const name = String(data?.name || '').trim();
    if (!name || name.length > 160) return Response.json({ error: 'Nama produk wajib diisi.' }, { status: 400 });
    const result = await getPool().query('INSERT INTO workspace_products(workspace_id,owner_id,name,data) VALUES($1,$2,$3,$4) RETURNING id,name,data,created_at,updated_at', [tenant.workspace.id, tenant.user.id, name, JSON.stringify({ ...data, name })]);
    const row = result.rows[0];
    return Response.json({ product: { ...row.data, id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at } }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
