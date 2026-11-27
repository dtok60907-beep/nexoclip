import { requireMarketingTenant, marketingErrorResponse } from '../../../../src/lib/marketingAuth.js';
import { createCampaignWithDeliverables, listCampaigns } from '../../../../src/services/marketingArtifactsService.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { workspace } = await requireMarketingTenant(request);
    const campaigns = await listCampaigns(workspace.id);
    return Response.json({ campaigns });
  } catch (error) {
    return marketingErrorResponse(error);
  }
}

export async function POST(request) {
  try {
    const { workspace, user } = await requireMarketingTenant(request);
    const body = await request.json().catch(() => ({}));
    const campaign = await createCampaignWithDeliverables({
      workspaceId: workspace.id,
      ownerId: user.id,
      title: body?.title || 'New Campaign',
      objective: body?.objective || '',
      productIds: Array.isArray(body?.productIds) ? body.productIds : [],
      platforms: Array.isArray(body?.platforms) ? body.platforms : ['tiktok', 'instagram'],
      durationDays: body?.durationDays || 7,
      summary: body?.summary || {},
      deliverables: Array.isArray(body?.deliverables) ? body.deliverables : [],
    });
    return Response.json({ campaign }, { status: 201 });
  } catch (error) {
    return marketingErrorResponse(error);
  }
}
