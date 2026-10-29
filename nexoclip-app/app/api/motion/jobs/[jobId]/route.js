// The state of one Motion AI job (queued, running with a progress line, done or failed), for the studio to follow.
import { getPool } from '../../../../../src/db/pool.js';
import { getMotionJob } from '../../../../../src/services/motionJobs.js';
import { UUID, errorResponse, motionTenant } from '../../projects/shared.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function createMotionJobHandler({ tenant = motionTenant, loadPool = getPool } = {}) {
  return async function GET(request, { params }) {
    try {
      const { jobId } = await params;
      if (!UUID.test(jobId || '')) return Response.json({ error: 'Not found' }, { status: 404 });
      const { workspace } = await tenant(request);
      const job = await getMotionJob(loadPool(), workspace.id, jobId);
      return job ? Response.json({ job }, { headers: { 'Cache-Control': 'no-store' } }) : Response.json({ error: 'Not found' }, { status: 404 });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export const GET = createMotionJobHandler();
