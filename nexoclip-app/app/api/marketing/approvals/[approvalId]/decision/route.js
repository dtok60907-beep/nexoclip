import { requireMarketingTenant, marketingErrorResponse } from '../../../../../../src/lib/marketingAuth.js';
import { decideApproval, syncApprovalIntoThreadMessages } from '../../../../../../src/services/marketingExecutionService.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request, { params }) {
  try {
    const { workspace, user } = await requireMarketingTenant(request);
    const { approvalId } = await params;
    const body = await request.json().catch(() => ({}));
    const decision = body?.decision === 'reject' ? 'reject' : 'approve';

    const approval = await decideApproval({
      workspaceId: workspace.id,
      userId: user.id,
      approvalId,
      decision,
    });

    await syncApprovalIntoThreadMessages({ workspaceId: workspace.id, approval });

    return Response.json({ approval });
  } catch (error) {
    return marketingErrorResponse(error);
  }
}
