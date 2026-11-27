import { requireMarketingTenant, marketingErrorResponse } from '../../../../src/lib/marketingAuth.js';
import { deleteArtifact, listArtifacts } from '../../../../src/services/marketingArtifactsService.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { workspace } = await requireMarketingTenant(request);
    const { searchParams } = new URL(request.url);
    const artifacts = await listArtifacts(workspace.id, {
      campaignId: searchParams.get('campaignId') || null,
      threadId: searchParams.get('threadId') || null,
      type: searchParams.get('type') || null,
    });
    return Response.json({ artifacts });
  } catch (error) {
    return marketingErrorResponse(error);
  }
}

export async function DELETE(request) {
  try {
    const { workspace } = await requireMarketingTenant(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return Response.json({ error: 'id is required' }, { status: 400 });
    const ok = await deleteArtifact(workspace.id, id);
    if (!ok) return Response.json({ error: 'Artifact tidak ditemukan.' }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    return marketingErrorResponse(error);
  }
}
