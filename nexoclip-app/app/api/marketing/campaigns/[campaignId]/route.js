import { requireMarketingTenant, marketingErrorResponse } from '../../../../../src/lib/marketingAuth.js';
import { getCampaignWithDetails } from '../../../../../src/services/marketingArtifactsService.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const { workspace } = await requireMarketingTenant(request);
    const { campaignId } = await params;
    const campaign = await getCampaignWithDetails(workspace.id, campaignId);
    if (!campaign) return Response.json({ error: 'Campaign tidak ditemukan.' }, { status: 404 });
    return Response.json({ campaign });
  } catch (error) {
    return marketingErrorResponse(error);
  }
}
