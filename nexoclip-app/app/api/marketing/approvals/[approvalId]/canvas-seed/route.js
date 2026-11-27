import { requireMarketingTenant, marketingErrorResponse } from '../../../../../../src/lib/marketingAuth.js';
import { getPool } from '../../../../../../src/db/pool.js';
import { loadWorkspaceMarketingContext } from '../../../../../../src/services/brandMemoryService.js';
import {
  buildApprovalCanvasSeedPayload,
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
    const { approvalId } = await params;
    const db = getPool();

    const apprRes = await db.query(
      `SELECT * FROM marketing_approvals WHERE workspace_id = $1 AND id = $2 LIMIT 1`,
      [workspace.id, approvalId],
    );
    const approval = apprRes.rows[0];
    if (!approval) return Response.json({ error: 'Approval card tidak ditemukan.' }, { status: 404 });

    let relatedApprovals = [];
    let selectedProductIds = [];
    if (approval.thread_id) {
      const [sibRes, threadRes] = await Promise.all([
        db.query(
          `SELECT * FROM marketing_approvals
           WHERE workspace_id = $1 AND thread_id = $2 AND id <> $3 AND status = 'completed'
           ORDER BY updated_at DESC LIMIT 8`,
          [workspace.id, approval.thread_id, approval.id],
        ),
        db.query(
          `SELECT selected_product_ids FROM marketing_threads
           WHERE workspace_id = $1 AND id = $2 LIMIT 1`,
          [workspace.id, approval.thread_id],
        ),
      ]);
      relatedApprovals = sibRes.rows || [];
      selectedProductIds = threadRes.rows[0]?.selected_product_ids || [];
    }

    const ctx = await loadWorkspaceMarketingContext({
      workspaceId: workspace.id,
      selectedProductIds,
      includeBrand: true,
    });

    const referenceText = [
      approval.title,
      approval.description,
      approval.payload_json?.prompt,
      approval.payload_json?.sceneKit?.productName,
    ]
      .filter(Boolean)
      .join(' ');
    const focusedProducts = selectRelevantProducts(ctx.products, {
      selectedProducts: ctx.selectedProducts,
      referenceText,
    });

    const seed = buildApprovalCanvasSeedPayload({
      approval,
      brandKit: ctx.brandKit,
      products: focusedProducts,
      relatedApprovals,
    });
    const durNum = parseInt(String(seed.duration || '8s'), 10) || 8;
    const [materializedFolders, optimizedPrompt] = await Promise.all([
      materializeCanvasSeedFolders({
        workspaceId: workspace.id,
        folders: seed.folders,
        db,
      }),
      optimizeSeedancePrompt({
        rawPrompt: seed.visualPrompt,
        title: approval.title,
        format: approval.description || 'UGC vertical video',
        durationSeconds: durNum,
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
