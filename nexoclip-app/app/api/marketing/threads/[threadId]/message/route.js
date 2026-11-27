import { requireMarketingTenant, marketingErrorResponse } from '../../../../../../src/lib/marketingAuth.js';
import { getThread, updateThread } from '../../../../../../src/services/marketingArtifactsService.js';
import { runMarketingAgentTurn } from '../../../../../../src/services/marketingAgent.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request, { params }) {
  let tenant;
  let thread;
  let body;
  try {
    tenant = await requireMarketingTenant(request);
    const { threadId } = await params;
    thread = await getThread(tenant.workspace.id, threadId);
    if (!thread) return Response.json({ error: 'Sesi tidak ditemukan.' }, { status: 404 });
    body = await request.json().catch(() => ({}));
    const message = String(body?.message || '').trim();
    if (!message) return Response.json({ error: 'Pesan tidak boleh kosong.' }, { status: 400 });
  } catch (error) {
    return marketingErrorResponse(error);
  }

  const message = String(body.message).trim();
  const mode = body.mode || thread.mode || 'agent';
  const brandContextEnabled = body.brandContextEnabled ?? thread.brand_context_enabled ?? true;
  const selectedProductIds = Array.isArray(body.selectedProductIds)
    ? body.selectedProductIds
    : thread.selected_product_ids || [];
  const contextRefs = Array.isArray(body.contextRefs) ? body.contextRefs : [];
  const llmModel = typeof body.llmModel === 'string' && body.llmModel.trim() ? body.llmModel.trim() : null;
  const videoModel = typeof body.videoModel === 'string' && body.videoModel.trim() ? body.videoModel.trim() : 'seedance-2.5';
  const skillId = typeof body.skillId === 'string' && body.skillId.trim() ? body.skillId.trim() : null;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // client disconnected
        }
      };

      try {
        await updateThread(tenant.workspace.id, thread.id, { status: 'running' });
        const result = await runMarketingAgentTurn({
          workspaceId: tenant.workspace.id,
          userId: tenant.user.id,
          thread,
          userMessage: message,
          mode,
          brandContextEnabled,
          selectedProductIds,
          contextRefs,
          llmModel,
          videoModel,
          skillId,
          onEvent: send,
        });
        send({ type: 'done', result });
      } catch (error) {
        console.error('[marketing-agent-stream]', error);
        await updateThread(tenant.workspace.id, thread.id, { status: 'error' }).catch(() => {});
        send({
          type: 'error',
          error: error?.status && error.status < 500
            ? error.message
            : error?.message || 'Agent gagal menyelesaikan tugas. Coba lagi sebentar.',
        });
      } finally {
        try { controller.close(); } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
