import { getPool } from '../../../../src/db/pool.js';
import { SESSION_COOKIE } from '../../../../src/lib/auth/session.js';
import { isSameOriginRequest } from '../../../../src/lib/auth/sameOrigin.js';
import { getCurrentSession } from '../../../../src/services/authService.js';
import { invitation, teamAction } from '../../../../src/services/workspaceTeam.js';

export async function POST(request) {
  if (!isSameOriginRequest(request)) return Response.json({error:'Origin tidak valid.'},{status:403});
  try {
    const body=await request.json();
    if(body.action==='preview') return Response.json(await invitation(getPool(),body.token));
    const session=await getCurrentSession(request.cookies.get(SESSION_COOKIE)?.value);
    if(!session) return Response.json({error:'Login dulu.'},{status:401});
    if(session.impersonation_read_only) return Response.json({error:'Mode lihat saja.'},{status:403});
    return Response.json(await teamAction(session,body));
  } catch(e){return Response.json({error:e.status?e.message:'Gagal memproses permintaan tim.'},{status:e.status||400});}
}
