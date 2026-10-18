import { isSameOriginRequest } from '../../../../src/lib/auth/sameOrigin.js';
import { SESSION_COOKIE } from '../../../../src/lib/auth/session.js';
import { getCurrentSession } from '../../../../src/services/authService.js';
import { businessDocumentsService } from '../../../../src/services/businessDocumentsService.js';

// The seller's details printed on business documents (Admin > Business billing).
export function createCompanyProfileHandlers({ sessionLookup = getCurrentSession, service = businessDocumentsService, env = process.env } = {}) {
  const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
  const handle = (method) => async (request) => {
    try {
      const session = await sessionLookup(request.cookies.get(SESSION_COOKIE)?.value);
      if (!session) return Response.json({ error: 'Authentication required' }, { status: 401, headers });
      if (method === 'GET') return Response.json({ profile: await service.readProfile(session.user_id) }, { headers });
      if (!isSameOriginRequest(request, env)) return Response.json({ error: 'Origin tidak valid' }, { status: 403, headers });
      const input = await request.json().catch(() => null);
      if (!input || typeof input !== 'object' || Array.isArray(input)) return Response.json({ error: 'Permintaan tidak valid' }, { status: 400, headers });
      return Response.json({ profile: await service.saveProfile(session.user_id, input) }, { headers });
    } catch (error) {
      const status = error.status || 500;
      return Response.json({ error: status >= 500 ? 'Profil perusahaan tidak dapat diproses' : error.message }, { status, headers });
    }
  };
  return { GET: handle('GET'), POST: handle('POST') };
}

export const { GET, POST } = createCompanyProfileHandlers();
