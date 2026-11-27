import { requireMarketingTenant, marketingErrorResponse } from '../../../../../src/lib/marketingAuth.js';
import { updateDeliverable } from '../../../../../src/services/marketingArtifactsService.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  try {
    const { workspace } = await requireMarketingTenant(request);
    const { deliverableId } = await params;
    const body = await request.json().catch(() => ({}));
    const deliverable = await updateDeliverable(workspace.id, deliverableId, {
      title: body.title,
      platform: body.platform,
      format: body.format,
      hook: body.hook,
      angle: body.angle,
      cta: body.cta,
      status: body.status,
      canvasProjectId: body.canvasProjectId,
      script: body.script,
    });
    if (!deliverable) return Response.json({ error: 'Deliverable tidak ditemukan.' }, { status: 404 });
    return Response.json({ deliverable });
  } catch (error) {
    return marketingErrorResponse(error);
  }
}
