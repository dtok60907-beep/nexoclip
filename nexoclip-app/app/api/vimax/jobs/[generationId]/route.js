import { SESSION_COOKIE } from '../../../../../src/lib/auth/session.js';
import { getCurrentSession } from '../../../../../src/services/authService.js';
import { getDefaultWorkspace } from '../../../../../src/services/workspaceService.js';
import { getGenerationJob, toPublicGeneration } from '../../../../../src/services/generationService.js';
import { createStorage } from '../../../../../src/services/assetService.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function createVimaxJobStatusHandler({
  getSession = getCurrentSession,
  getWorkspace = getDefaultWorkspace,
  getJob = (workspaceId, generationId) => getGenerationJob(workspaceId, generationId, createStorage()),
} = {}) {
  return async function GET(request, { params }) {
    const token = request.cookies?.get(SESSION_COOKIE)?.value;
    const session = await getSession(token);
    if (!session?.user_id) return Response.json({ error: 'Not authenticated' }, { status: 401 });

    const workspace = await getWorkspace(session.user_id);
    if (!workspace?.id) return Response.json({ error: 'No workspace is available' }, { status: 403 });

    const { generationId } = await params;
    const generation = await getJob(workspace.id, generationId);
    if (!generation) return Response.json({ error: 'Generation not found' }, { status: 404 });
    return Response.json({ generation: toPublicGeneration(generation) });
  };
}

export const GET = createVimaxJobStatusHandler();
