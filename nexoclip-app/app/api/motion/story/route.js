// Queues a drawn story's step for a Motion project: five ideas for a topic ('story-ideas'), or the whole video from
// the chosen idea ('story-make'). The motion worker runs it and writes into the project; followed at
// /api/motion/jobs/<projectId>.
import { getPool } from '../../../../src/db/pool.js';
import { enqueueMotionJob, planProduction } from '../../../../src/services/motionJobs.js';
import { motionQueue } from '../../../../src/queue/motionQueue.js';
import { UUID, motionTenant } from '../projects/shared.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function createMotionStoryHandler({ tenant = motionTenant, loadPool = getPool, loadQueue = motionQueue, enqueue = enqueueMotionJob, plan = planProduction, logError = console.error } = {}) {
  return async function POST(request) {
    try {
      const { workspace, user } = await tenant(request);
      const body = await request.json().catch(() => null);
      if (!UUID.test(String(body?.projectId || ''))) return Response.json({ error: 'Simpan project dulu.' }, { status: 400 });
      // 'story-plan': the production plan after the user edited the scenes or audio by hand (nothing is made yet)
      if (body.type === 'story-plan') return Response.json({ pending: await plan({ pool: loadPool(), workspaceId: workspace.id, projectId: body.projectId }) });
      if (!['story-ideas', 'story-make', 'story-chat', 'story-produce'].includes(body.type)) return Response.json({ error: 'Langkah tidak dikenal.' }, { status: 400 });
      const job = await enqueue({ pool: loadPool(), queue: loadQueue(), workspaceId: workspace.id, projectId: body.projectId, userId: user.id, input: body });
      return Response.json({ job }, { status: 202 });
    } catch (error) {
      const status = error.status || (error.message === 'Authentication required' ? 401 : error.message === 'Workspace access denied' ? 403 : 500);
      if (status >= 500) logError('motion story request failed', error);
      return Response.json({ error: status === 401 ? 'Masuk dulu untuk memakai AI.' : status >= 500 ? 'AI tidak bisa dimulai sekarang.' : error.message }, { status });
    }
  };
}

export const POST = createMotionStoryHandler();
