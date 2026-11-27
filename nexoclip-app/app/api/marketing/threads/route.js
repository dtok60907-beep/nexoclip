import { requireMarketingTenant, marketingErrorResponse } from '../../../../src/lib/marketingAuth.js';
import { createThread, listThreads } from '../../../../src/services/marketingArtifactsService.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { workspace } = await requireMarketingTenant(request);
    const threads = await listThreads(workspace.id);
    return Response.json({ threads });
  } catch (error) {
    return marketingErrorResponse(error);
  }
}

export async function POST(request) {
  try {
    const { workspace, user } = await requireMarketingTenant(request);
    const body = await request.json().catch(() => ({}));
    const thread = await createThread({
      workspaceId: workspace.id,
      userId: user.id,
      title: body?.title || 'New Marketing Session',
      mode: body?.mode || 'agent',
      brandContextEnabled: body?.brandContextEnabled ?? true,
      selectedProductIds: Array.isArray(body?.selectedProductIds) ? body.selectedProductIds : [],
      linkedCampaignId: body?.linkedCampaignId || null,
    });
    return Response.json({ thread }, { status: 201 });
  } catch (error) {
    return marketingErrorResponse(error);
  }
}
