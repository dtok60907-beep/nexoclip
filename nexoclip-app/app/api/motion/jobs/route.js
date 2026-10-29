// Queues sound for a Motion project as it is saved (the Audio tab's buttons): music and/or the voiceover lines,
// made by the motion worker and charged per file, so a refresh does not stop it. Followed at /api/motion/jobs/<id>.
import { getPool } from '../../../../src/db/pool.js';
import { enqueueMotionJob } from '../../../../src/services/motionJobs.js';
import { motionQueue } from '../../../../src/queue/motionQueue.js';
import { UUID, motionTenant } from '../projects/shared.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function createMotionAudioJobHandler({ tenant = motionTenant, loadPool = getPool, loadQueue = motionQueue, enqueue = enqueueMotionJob, logError = console.error } = {}) {
  return async function POST(request) {
    try {
      const { workspace, user } = await tenant(request);
      const body = await request.json().catch(() => null);
      if (!UUID.test(String(body?.projectId || ''))) return Response.json({ error: 'Simpan project dulu sebelum membuat audio.' }, { status: 400 });
      const job = await enqueue({
        pool: loadPool(), queue: loadQueue(), workspaceId: workspace.id, projectId: body.projectId, userId: user.id,
        input: { type: 'audio', music: body.music === true, voiceover: body.voiceover === true, scenes: body.scenes },
      });
      return Response.json({ job }, { status: 202 });
    } catch (error) {
      const status = error.status || (error.message === 'Authentication required' ? 401 : error.message === 'Workspace access denied' ? 403 : 500);
      if (status >= 500) logError('motion audio job request failed', error);
      return Response.json({ error: status === 401 ? 'Masuk dulu untuk membuat audio.' : status >= 500 ? 'Audio tidak bisa dibuat sekarang.' : error.message }, { status });
    }
  };
}

export const POST = createMotionAudioJobHandler();
