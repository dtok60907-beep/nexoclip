import { SESSION_COOKIE } from '../../../src/lib/auth/session.js';
import { getCurrentSession } from '../../../src/services/authService.js';
import {
  WorkspaceError,
  createWorkspace as createWorkspaceService,
  getUserWorkspaces,
} from '../../../src/services/workspaceService.js';

export const dynamic = 'force-dynamic';

export function createWorkspacesHandlers({
  getSession = getCurrentSession,
  listWorkspaces = getUserWorkspaces,
  createWorkspace = createWorkspaceService,
} = {}) {
  async function session(request) {
    return getSession(request.cookies?.get(SESSION_COOKIE)?.value);
  }

  // The current workspace is first in the list.
  async function GET(request) {
    const current = await session(request);
    if (!current) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const workspaces = await listWorkspaces(current.user_id);
    return Response.json({ workspaces });
  }

  async function POST(request) {
    const current = await session(request);
    if (!current) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    try {
      const workspace = await createWorkspace({ userId: current.user_id, name: body?.name });
      const workspaces = await listWorkspaces(current.user_id);
      return Response.json({ workspace, workspaces }, { status: 201 });
    } catch (error) {
      if (error instanceof WorkspaceError) return Response.json({ error: error.message }, { status: error.status });
      throw error;
    }
  }

  return { GET, POST };
}

const handlers = createWorkspacesHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
