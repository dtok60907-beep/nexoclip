import { requireMarketingTenant, marketingErrorResponse } from '../../../../../src/lib/marketingAuth.js';
import { deleteRoutine, updateRoutine } from '../../../../../src/services/marketingExecutionService.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  try {
    const { workspace } = await requireMarketingTenant(request);
    const { routineId } = await params;
    const body = await request.json().catch(() => ({}));
    const routine = await updateRoutine(workspace.id, routineId, body);
    if (!routine) return Response.json({ error: 'Routine tidak ditemukan.' }, { status: 404 });
    return Response.json({ routine });
  } catch (error) {
    return marketingErrorResponse(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    const { workspace } = await requireMarketingTenant(request);
    const { routineId } = await params;
    const deleted = await deleteRoutine(workspace.id, routineId);
    if (!deleted) return Response.json({ error: 'Routine tidak ditemukan.' }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    return marketingErrorResponse(error);
  }
}
