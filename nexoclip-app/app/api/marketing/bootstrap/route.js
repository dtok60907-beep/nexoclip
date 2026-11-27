import { requireMarketingTenant, marketingErrorResponse } from '../../../../src/lib/marketingAuth.js';
import { extractBrandContextTree, loadWorkspaceMarketingContext } from '../../../../src/services/brandMemoryService.js';
import { listArtifacts, listCampaigns, listThreads } from '../../../../src/services/marketingArtifactsService.js';
import { listApprovals, listRoutines } from '../../../../src/services/marketingExecutionService.js';
import { listPublicMarketingSkills } from '../../../../src/services/marketingSkills.js';
import { createResearchProvider } from '../../../../src/services/researchProvider.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { workspace } = await requireMarketingTenant(request);
    const [ctx, threads, campaigns, artifacts, routines, approvals] = await Promise.all([
      loadWorkspaceMarketingContext({ workspaceId: workspace.id, includeBrand: true }),
      listThreads(workspace.id),
      listCampaigns(workspace.id),
      listArtifacts(workspace.id),
      listRoutines(workspace.id).catch(() => []),
      listApprovals(workspace.id).catch(() => []),
    ]);
    const research = createResearchProvider();
    return Response.json({
      workspace: { id: workspace.id, name: workspace.name },
      brandKit: ctx.brandKit
        ? {
            brandName: ctx.brandKit.brandName || '',
            category: ctx.brandKit.category || '',
            tone: ctx.brandKit.tone || '',
            positioning: ctx.brandKit.positioning || '',
            logoDataUrl: ctx.brandKit.logoDataUrl || '',
            configured: Boolean(ctx.brandKit.brandName),
          }
        : { configured: false },
      brandContextTree: extractBrandContextTree(ctx.brandKit, ctx.products),
      products: (ctx.products || []).map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category || '',
        price: p.price || '',
        imageUrl:
          p.imageUrl ||
          p.image ||
          p.thumbnailUrl ||
          (Array.isArray(p.images) && typeof p.images[0] === 'string' ? p.images[0] : p.images?.[0]?.url || ''),
      })),
      memories: ctx.memories || [],
      integrations: ctx.integrations || [],
      capabilities: {
        scrapeAtlasReady: research.isConfigured(),
        videoWatcherReady: Boolean(process.env.BYTEPLUS_API_KEY && process.env.BYTEPLUS_BASE_URL),
        llmReady: Boolean(process.env.BYTEPLUS_API_KEY || process.env.OPENROUTER_API_KEY),
      },
      threads,
      campaigns,
      artifacts,
      routines,
      approvals,
      skills: listPublicMarketingSkills(),
    });
  } catch (error) {
    return marketingErrorResponse(error);
  }
}
