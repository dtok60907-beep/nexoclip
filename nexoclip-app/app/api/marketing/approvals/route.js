import { requireMarketingTenant, marketingErrorResponse } from '../../../../src/lib/marketingAuth.js';
import { listApprovals } from '../../../../src/services/marketingExecutionService.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { workspace } = await requireMarketingTenant(request);
    const url = new URL(request.url);
    const threadId = url.searchParams.get('threadId') || null;
    const approvals = await listApprovals(workspace.id, { threadId });
    return Response.json({ approvals });
  } catch (error) {
    return marketingErrorResponse(error);
  }
}
