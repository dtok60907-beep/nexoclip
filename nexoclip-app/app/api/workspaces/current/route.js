import { SESSION_COOKIE } from '../../../../src/lib/auth/session.js';
import { getCurrentSession } from '../../../../src/services/authService.js';
import {
  WorkspaceError,
  getUserWorkspaces,
  switchWorkspace as switchWorkspaceService,
} from '../../../../src/services/workspaceService.js';

export const dynamic = 'force-dynamic';

// Switch the user's current workspace (credits, generations and assets follow it).
export function createSwitchWorkspaceHandler({
  getSession = getCurrentSession,
  switchWorkspace = switchWorkspaceService,
  listWorkspaces = getUserWorkspaces,
} = {}) {
  return async function PUT(request) {
    const session = await getSession(request.cookies?.get(SESSION_COOKIE)?.value);
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    if (!body?.workspaceId) return Response.json({ error: 'workspaceId is required' }, { status: 400 });
    try {
      await switchWorkspace({ userId: session.user_id, workspaceId: String(body.workspaceId) });
    } catch (error) {
      if (error instanceof WorkspaceError) return Response.json({ error: error.message }, { status: error.status });
      throw error;
    }
    return Response.json({ workspaces: await listWorkspaces(session.user_id) });
  };
}

export const PUT = createSwitchWorkspaceHandler();
