import { NextResponse } from 'next/server.js';
import { SESSION_COOKIE } from '../../../src/lib/auth/session.js';
import { isSameOriginRequest, publicAppOrigin } from '../../../src/lib/auth/sameOrigin.js';
import { resolveTenantContext } from '../../../src/services/tenantContext.js';
import { createSocialService } from '../../../src/services/socialService.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function createSocialHandlers({ resolveTenant = resolveTenantContext, service = createSocialService() } = {}) {
  async function tenant(request) {
    const workspaceId = request.headers.get('x-workspace-id');
    if (!/^[0-9a-f-]{36}$/i.test(workspaceId || '')) throw Object.assign(new Error('A valid workspace is required.'), { status: 400 });
    return resolveTenant({ token: request.cookies.get(SESSION_COOKIE)?.value, workspaceId });
  }
  function failure(error) {
    const status = error.status || (error.message === 'Authentication required' ? 401 : error.message === 'Workspace access denied' ? 403 : 500);
    return NextResponse.json({ error: status === 500 ? 'Social publishing is temporarily unavailable.' : error.message,
      code: error.code || 'SOCIAL_ERROR' }, { status });
  }
  return {
    async GET(request) {
      try { return NextResponse.json(await service.status(await tenant(request)), { headers: { 'cache-control': 'no-store' } }); }
      catch (error) { return failure(error); }
    },
    async POST(request) {
      try {
        if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
        const context = await tenant(request);
        const raw = await request.text();
        if (raw.length > 12_000) return NextResponse.json({ error: 'Request too large.' }, { status: 413 });
        let body;
        try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
        if (body?.action === 'activate') return NextResponse.json(await service.activate(context));
        if (body?.action === 'connect') return NextResponse.json(await service.connect(context, publicAppOrigin(request)));
        if (body?.action === 'cancel') return NextResponse.json(await service.cancel(context, body.postId));
        if (body?.action === 'submit') return NextResponse.json(await service.submit(context, body));
        return NextResponse.json({ error: 'Unknown social action.' }, { status: 400 });
      } catch (error) { return failure(error); }
    },
  };
}

export const { GET, POST } = createSocialHandlers();
