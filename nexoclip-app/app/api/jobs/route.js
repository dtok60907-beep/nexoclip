import { SESSION_COOKIE } from '../../../src/lib/auth/session.js';
import { getCurrentSession } from '../../../src/services/authService.js';
import { getDefaultWorkspace } from '../../../src/services/workspaceService.js';
import { getPool } from '../../../src/db/pool.js';
import { listJobs as listJobsService } from '../../../src/services/jobService.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function createJobsListHandler({
  getSession = getCurrentSession,
  getWorkspace = getDefaultWorkspace,
  listJobs = listJobsService,
  pool,
  poolFactory = getPool,
} = {}) {
  return async function GET(request) {
    const session = await getSession(request.cookies?.get(SESSION_COOKIE)?.value);
    if (!session?.user_id) return Response.json({ error: 'Not authenticated' }, { status: 401 });
    const workspace = await getWorkspace(session.user_id);
    if (!workspace?.id) return Response.json({ error: 'No workspace is available' }, { status: 403 });

    const url = new URL(request.url);
    const statuses = url.searchParams.get('status') === 'active' ? ['queued', 'running'] : null;
    const kind = url.searchParams.get('kind') || null;
    const resolvedPool = pool ?? poolFactory();
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 200);
    const { jobs } = await listJobs({ pool: resolvedPool, workspaceId: workspace.id, statuses, kind, limit });
    return Response.json({ jobs });
  };
}

export const GET = createJobsListHandler();
