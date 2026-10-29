// Sends one message to the Motion studio's AI director. The request is queued as a job (src/services/motionJobs.js)
// and run by the motion worker, which charges the plan's tokens and any voiceover and music it makes; the studio
// follows it at /api/motion/jobs/<id>, so a refresh does not stop it.
import { getPool } from '../../../../src/db/pool.js';
import { enqueueMotionJob } from '../../../../src/services/motionJobs.js';
import { motionQueue } from '../../../../src/queue/motionQueue.js';
import { UUID, motionTenant } from '../projects/shared.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function createMotionPlanHandler({ tenant = motionTenant, loadPool = getPool, loadQueue = motionQueue, enqueue = enqueueMotionJob, logError = console.error } = {}) {
  return async function POST(request) {
    try {
      const { workspace, user } = await tenant(request);
      const body = await request.json().catch(() => null);
      if (!UUID.test(String(body?.projectId || ''))) return Response.json({ error: 'Simpan project dulu sebelum memakai AI.' }, { status: 400 });
      const job = await enqueue({
        pool: loadPool(), queue: loadQueue(), workspaceId: workspace.id, projectId: body.projectId, userId: user.id,
        input: { brief: body.brief, messages: body.messages, current: body.current, format: body.format },
      });
      return Response.json({ job }, { status: 202 });
    } catch (error) {
      const status = error.status || (error.message === 'Authentication required' ? 401 : error.message === 'Workspace access denied' ? 403 : 500);
      if (status >= 500) logError('motion plan request failed', error);
      return Response.json({ error: status === 401 ? 'Masuk dulu untuk memakai AI.' : status >= 500 ? 'AI sedang tidak bisa dihubungi.' : error.message }, { status });
    }
  };
}

export const POST = createMotionPlanHandler();
