import { requireMarketingTenant, marketingErrorResponse } from '../../../../../../src/lib/marketingAuth.js';
import { loadWorkspaceMarketingContext } from '../../../../../../src/services/brandMemoryService.js';
import {
  buildCanvasSeedPayload,
  getDeliverable,
  selectRelevantProducts,
  weaveMentionsIntoPrompt,
} from '../../../../../../src/services/marketingArtifactsService.js';
import { materializeCanvasSeedFolders } from '../../../../../../src/services/marketingExecutionService.js';
import { optimizeSeedancePrompt } from '../../../../../../src/services/seedancePromptOptimizer.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const { workspace } = await requireMarketingTenant(request);
    const { deliverableId } = await params;
    const deliverable = await getDeliverable(workspace.id, deliverableId);
    if (!deliverable) return Response.json({ error: 'Deliverable tidak ditemukan.' }, { status: 404 });
    const ctx = await loadWorkspaceMarketingContext({
      workspaceId: workspace.id,
      selectedProductIds: deliverable.campaign_product_ids || [],
      includeBrand: true,
    });
    const focusedProducts = selectRelevantProducts(ctx.products, {
      selectedProducts: ctx.selectedProducts,
      referenceText: `${deliverable.title || ''} ${deliverable.hook || ''} ${deliverable.angle || ''} ${deliverable.script_json?.visualPrompt || ''}`,
    });
    const seed = buildCanvasSeedPayload({
      deliverable,
      brandKit: ctx.brandKit,
      products: focusedProducts,
    });
    const [materializedFolders, optimizedPrompt] = await Promise.all([
      materializeCanvasSeedFolders({
        workspaceId: workspace.id,
        folders: seed.folders,
      }),
      optimizeSeedancePrompt({
        rawPrompt: seed.visualPrompt,
        title: deliverable.title,
        format: deliverable.format,
        hook: deliverable.hook,
        angle: deliverable.angle,
        cta: deliverable.cta,
        voiceover: deliverable.script_json?.voiceover || '',
        durationSeconds: 8,
        aspectRatio: seed.aspectRatio,
        brandKit: ctx.brandKit,
        folderTags: seed.folders,
      }),
    ]);
    seed.folders = materializedFolders;
    seed.visualPrompt = weaveMentionsIntoPrompt(optimizedPrompt, seed.folders);
    return Response.json({ seed });
  } catch (error) {
    return marketingErrorResponse(error);
  }
}
