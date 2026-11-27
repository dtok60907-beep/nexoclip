import { requireMarketingTenant, marketingErrorResponse } from '../../../../../../src/lib/marketingAuth.js';
import { syncApprovalVideoStatus } from '../../../../../../src/services/marketingExecutionService.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const { workspace } = await requireMarketingTenant(request);
    const { approvalId } = await params;
    const { approval } = await syncApprovalVideoStatus({
      workspaceId: workspace.id,
      approvalId,
    });
    return Response.json({ approval });
  } catch (error) {
    return marketingErrorResponse(error);
  }
}
