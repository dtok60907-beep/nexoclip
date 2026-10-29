// List and create the workspace's Motion projects.
import { getPool } from '../../../../src/db/pool.js';
import { createMotionProject, listMotionProjects } from '../../../../src/services/motionProjects.js';
import { errorResponse, motionTenant } from './shared.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function createMotionProjectsHandlers({ tenant = motionTenant, loadPool = getPool } = {}) {
  return {
    async GET(request) {
      try {
        const { workspace } = await tenant(request);
        return Response.json({ projects: await listMotionProjects(loadPool(), workspace.id) });
      } catch (error) { return errorResponse(error); }
    },
    async POST(request) {
      try {
        const { workspace, user } = await tenant(request);
        const body = await request.json().catch(() => null);
        const project = await createMotionProject(loadPool(), { workspaceId: workspace.id, userId: user.id, name: body?.name, doc: body?.doc });
        return Response.json({ project }, { status: 201 });
      } catch (error) { return errorResponse(error); }
    },
  };
}

export const { GET, POST } = createMotionProjectsHandlers();
