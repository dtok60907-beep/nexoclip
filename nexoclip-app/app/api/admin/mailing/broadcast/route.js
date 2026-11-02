import { isSameOriginRequest } from '../../../../../src/lib/auth/sameOrigin.js';
import { SESSION_COOKIE } from '../../../../../src/lib/auth/session.js';
import { requirePlatformOperator } from '../../../../../src/lib/auth/platformOperator.js';
import { getCurrentSession } from '../../../../../src/services/authService.js';
import { resendService } from '../../../../../src/services/resendService.js';

const headers = { 'Cache-Control': 'no-store', Vary: 'Cookie' };

export function createBroadcastHandlers({ sessionLookup = getCurrentSession, service = resendService, env = process.env } = {}) {
  return {
    POST: async (request) => {
      try {
        const session = await sessionLookup(request.cookies.get(SESSION_COOKIE)?.value);
        if (!session) return Response.json({ error: 'Authentication required' }, { status: 401, headers });
        requirePlatformOperator(session.user_id, env);
        if (!isSameOriginRequest(request, env)) return Response.json({ error: 'Origin tidak valid' }, { status: 403, headers });
        if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({ error: 'JSON diperlukan' }, { status: 415, headers });
        const input = await request.json().catch(() => null);
        if (!input || typeof input !== 'object' || Array.isArray(input)) return Response.json({ error: 'Permintaan tidak valid' }, { status: 400, headers });
        const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
        const html = typeof input.html === 'string' ? input.html.trim() : '';
        if (!subject || subject.length > 200) return Response.json({ error: 'Subject wajib diisi (maks. 200 karakter)' }, { status: 400, headers });
        if (!html || html.length > 500_000) return Response.json({ error: 'HTML wajib diisi (maks. 500 KB)' }, { status: 400, headers });
        const result = await service.createBroadcast({
          audienceId: typeof input.audienceId === 'string' ? input.audienceId.trim() : undefined,
          subject,
          html,
          text: typeof input.text === 'string' ? input.text.trim() : undefined,
          scheduledAt: typeof input.scheduledAt === 'string' ? input.scheduledAt : undefined,
        });
        return Response.json({ broadcast: result, message: 'Draft broadcast dibuat di Resend; review dan kirim dari dashboard/API.' }, { headers });
      } catch (error) {
        const status = error.status || 500;
        return Response.json({ error: status >= 500 ? error.message : error.message }, { status, headers });
      }
    },
  };
}

export const { POST } = createBroadcastHandlers();
