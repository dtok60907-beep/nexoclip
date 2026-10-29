// Open, save (rename and/or the editor document) and delete one Motion project.
import { getPool } from '../../../../../src/db/pool.js';
import { deleteMotionProject, getMotionProject, updateMotionProject } from '../../../../../src/services/motionProjects.js';
import { activeMotionJob } from '../../../../../src/services/motionJobs.js';
import { UUID, errorResponse, motionTenant } from '../shared.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const notFound = () => Response.json({ error: 'Project tidak ditemukan.' }, { status: 404 });

export function createMotionProjectHandlers({ tenant = motionTenant, loadPool = getPool } = {}) {
  const withProject = (handler) => async (request, ctx) => {
    try {
      const { projectId } = await ctx.params;
      if (!UUID.test(projectId || '')) return notFound();
      const { workspace } = await tenant(request);
      return await handler({ request, pool: loadPool(), workspaceId: workspace.id, projectId });
    } catch (error) { return errorResponse(error); }
  };
  return {
    GET: withProject(async ({ pool, workspaceId, projectId }) => {
      const project = await getMotionProject(pool, workspaceId, projectId);
      // A job still running for it, so a reopened studio picks it up again.
      return project ? Response.json({ project, job: await activeMotionJob(pool, workspaceId, projectId) }) : notFound();
    }),
    PATCH: withProject(async ({ request, pool, workspaceId, projectId }) => {
      const body = await request.json().catch(() => null);
      const project = await updateMotionProject(pool, workspaceId, projectId, { name: body?.name, doc: body?.doc });
      return project ? Response.json({ project }) : notFound();
    }),
    DELETE: withProject(async ({ pool, workspaceId, projectId }) => (
      await deleteMotionProject(pool, workspaceId, projectId) ? new Response(null, { status: 204 }) : notFound()
    )),
  };
}

export const { GET, PATCH, DELETE } = createMotionProjectHandlers();
