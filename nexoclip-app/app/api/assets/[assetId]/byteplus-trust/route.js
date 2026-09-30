import { SESSION_COOKIE } from '../../../../../src/lib/auth/session.js';
import { getCurrentSession } from '../../../../../src/services/authService.js';
import {
  deleteBytePlusAssetTrust,
  getBytePlusAssetTrust,
  startBytePlusAssetTrust,
} from '../../../../../src/services/byteplusAssetTrustService.js';
import { resolveTenantContext } from '../../../../../src/services/tenantContext.js';
import { getDefaultWorkspace } from '../../../../../src/services/workspaceService.js';

const safeErrors = {
  BYTEPLUS_ASSETS_NOT_CONFIGURED: ['BytePlus Assets API is not configured.', 503],
  BYTEPLUS_ASSETS_UNAVAILABLE: ['BytePlus Assets API is temporarily unavailable.', 503],
  BYTEPLUS_ASSETS_REQUEST_FAILED: ['BytePlus Assets API request failed.', 400],
  BYTEPLUS_ASSETS_INVALID_RESPONSE: ['BytePlus Assets API returned an invalid response.', 502],
  BYTEPLUS_ASSETS_INVALID_INPUT: ['BytePlus Assets API input is invalid.', 400],
  BYTEPLUS_ASSET_TYPE_UNSUPPORTED: ['Only image assets can be trusted for Seedance.', 400],
  BYTEPLUS_ASSET_SOURCE_UNAVAILABLE: ['Asset storage is not available to BytePlus.', 503],
  BYTEPLUS_ASSET_TRUST_FAILED: ['Unable to update trusted asset.', 502],
  BYTEPLUS_ASSET_TRUST_CONFLICT: ['Trusted asset changed while it was being removed. Try again.', 409],
};

function errorResponse(error) {
  if (error.message === 'Authentication required') {
    return Response.json({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication required' } }, { status: 401 });
  }
  if (error.message === 'Workspace access denied') {
    return Response.json({ error: { code: 'WORKSPACE_ACCESS_DENIED', message: 'Workspace access denied' } }, { status: 403 });
  }
  const safe = safeErrors[error.code];
  if (safe) {
    console.error('[byteplus-trust]', error.code, error.message, JSON.stringify({
      status: error.status, action: error.action, providerCode: error.providerCode,
    }));
    return Response.json({ error: { code: error.code, message: safe[0] } }, { status: error.status || safe[1] });
  }
  // Unexpected failures (e.g. a DB error) are masked for the client, so log
  // the real cause — otherwise production shows nothing but a bare 500.
  console.error('[byteplus-trust] unexpected error', error);
  return Response.json({
    error: { code: 'BYTEPLUS_ASSET_TRUST_FAILED', message: 'Unable to update trusted asset.' },
  }, { status: 500 });
}

async function resolveDefaultTenant({ token }) {
  const session = await getCurrentSession(token);
  if (!session) throw Object.assign(new Error('Authentication required'), { status: 401 });
  const workspace = await getDefaultWorkspace(session.user_id);
  if (!workspace) throw Object.assign(new Error('Workspace access denied'), { status: 403 });
  return resolveTenantContext({ token, workspaceId: workspace.id });
}

export function createBytePlusAssetTrustHandlers(deps = {}) {
  const resolveTenant = deps.resolveTenantContext || resolveDefaultTenant;
  const trustService = deps.trustService || {
    deleteTrust: deleteBytePlusAssetTrust,
    getTrust: getBytePlusAssetTrust,
    startTrust: startBytePlusAssetTrust,
  };

  async function handle(operation, request, { params }) {
    try {
      const tenant = await resolveTenant({ token: request.cookies.get(SESSION_COOKIE)?.value });
      const { assetId } = await params;
      const requestedProjectId = request?.url
        ? new URL(request.url).searchParams.get('canvas_project_id')
        : null;
      const canvasProjectId = requestedProjectId?.trim() || 'workspace';
      if (canvasProjectId !== 'workspace' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(canvasProjectId)) {
        return Response.json({ error: 'Invalid Canvas project id' }, { status: 400 });
      }
      const state = requestedProjectId
        ? await trustService[operation](tenant.workspace.id, assetId, canvasProjectId)
        : await trustService[operation](tenant.workspace.id, assetId);
      if (!state) {
        return Response.json({ error: { code: 'ASSET_NOT_FOUND', message: 'Asset not found' } }, { status: 404 });
      }
      return Response.json(state);
    } catch (error) {
      return errorResponse(error);
    }
  }

  return {
    DELETE: (request, context) => handle('deleteTrust', request, context),
    GET: (request, context) => handle('getTrust', request, context),
    POST: (request, context) => handle('startTrust', request, context),
  };
}

const handlers = createBytePlusAssetTrustHandlers();
export const DELETE = handlers.DELETE;
export const GET = handlers.GET;
export const POST = handlers.POST;
