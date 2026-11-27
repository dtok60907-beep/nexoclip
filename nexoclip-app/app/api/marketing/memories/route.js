import { requireMarketingTenant, marketingErrorResponse } from '../../../../src/lib/marketingAuth.js';
import { createBrandMemory, deleteBrandMemory, listBrandMemories } from '../../../../src/services/brandMemoryService.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { workspace } = await requireMarketingTenant(request);
    const memories = await listBrandMemories(workspace.id);
    return Response.json({ memories });
  } catch (error) {
    return marketingErrorResponse(error);
  }
}

export async function POST(request) {
  try {
    const { workspace, user } = await requireMarketingTenant(request);
    const body = await request.json().catch(() => ({}));
    const memory = await createBrandMemory({
      workspaceId: workspace.id,
      ownerId: user.id,
      category: body?.category || 'preference',
      content: body?.content || '',
      sourceType: 'user',
    });
    return Response.json({ memory }, { status: 201 });
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
    const ok = await deleteBrandMemory({ workspaceId: workspace.id, memoryId: id });
    if (!ok) return Response.json({ error: 'Memory tidak ditemukan.' }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    return marketingErrorResponse(error);
  }
}
