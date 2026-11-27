import { requireMarketingTenant, marketingErrorResponse } from '../../../../src/lib/marketingAuth.js';
import { createRoutine, listRoutines } from '../../../../src/services/marketingExecutionService.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { workspace } = await requireMarketingTenant(request);
    const routines = await listRoutines(workspace.id);
    return Response.json({ routines });
  } catch (error) {
    return marketingErrorResponse(error);
  }
}

export async function POST(request) {
  try {
    const { workspace, user } = await requireMarketingTenant(request);
    const body = await request.json().catch(() => ({}));
    const routine = await createRoutine({
      workspaceId: workspace.id,
      ownerId: user.id,
      title: body.title,
      prompt: body.prompt,
      cadence: body.cadence,
      scheduleLabel: body.scheduleLabel,
      requireApproval: body.requireApproval !== false,
    });
    return Response.json({ routine }, { status: 201 });
  } catch (error) {
    return marketingErrorResponse(error);
  }
}
