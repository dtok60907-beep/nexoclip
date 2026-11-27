import { requireMarketingTenant, marketingErrorResponse } from '../../../../../src/lib/marketingAuth.js';
import { deleteThread, getThread, listArtifacts, getCampaignWithDetails, updateThread } from '../../../../../src/services/marketingArtifactsService.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const { workspace } = await requireMarketingTenant(request);
    const { threadId } = await params;
    const thread = await getThread(workspace.id, threadId);
    if (!thread) return Response.json({ error: 'Sesi tidak ditemukan.' }, { status: 404 });
    const [artifacts, campaign] = await Promise.all([
      listArtifacts(workspace.id, { threadId: thread.id }),
      thread.linked_campaign_id ? getCampaignWithDetails(workspace.id, thread.linked_campaign_id) : Promise.resolve(null),
    ]);
    return Response.json({ thread, artifacts, campaign });
  } catch (error) {
    return marketingErrorResponse(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    const { workspace } = await requireMarketingTenant(request);
    const { threadId } = await params;
    const body = await request.json().catch(() => ({}));
    const thread = await updateThread(workspace.id, threadId, {
      title: body.title,
      mode: body.mode,
      brandContextEnabled: body.brandContextEnabled,
      selectedProductIds: body.selectedProductIds,
      linkedCampaignId: body.linkedCampaignId,
    });
    if (!thread) return Response.json({ error: 'Sesi tidak ditemukan.' }, { status: 404 });
    return Response.json({ thread });
  } catch (error) {
    return marketingErrorResponse(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    const { workspace } = await requireMarketingTenant(request);
    const { threadId } = await params;
    const deleted = await deleteThread(workspace.id, threadId);
    if (!deleted) return Response.json({ error: 'Sesi tidak ditemukan.' }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    return marketingErrorResponse(error);
  }
}
