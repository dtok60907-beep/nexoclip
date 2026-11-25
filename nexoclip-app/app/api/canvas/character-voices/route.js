import { getPool } from '../../../../src/db/pool.js';
import { SESSION_COOKIE } from '../../../../src/lib/auth/session.js';
import { getCurrentSession } from '../../../../src/services/authService.js';
import { getDefaultWorkspace } from '../../../../src/services/workspaceService.js';
import { generateCharacterVoice, listCharacterVoices } from '../../../../src/services/characterVoiceService.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request) {
  const session = await getCurrentSession(request.cookies?.get(SESSION_COOKIE)?.value).catch(() => null);
  if (!session?.user_id) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }
  const catalog = await listCharacterVoices();
  return Response.json(catalog);
}

export async function POST(request) {
  const session = await getCurrentSession(request.cookies?.get(SESSION_COOKIE)?.value).catch(() => null);
  if (!session?.user_id) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const workspace = await getDefaultWorkspace(session.user_id);
  if (!workspace) {
    return Response.json({ error: 'Workspace not found' }, { status: 404 });
  }

  try {
    const result = await generateCharacterVoice({
      pool: getPool(),
      workspaceId: workspace.id,
      userId: session.user_id,
      voiceId: body.voiceId,
      text: body.text,
      characterName: body.characterName,
      requestId: typeof body.requestId === 'string' && body.requestId.trim() ? body.requestId.trim() : undefined,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (!error.status || error.status >= 500) {
      console.error('[character-voices] failed:', error.cause || error);
    }
    return Response.json(
      { error: error.status ? error.message : 'Gagal membuat sample suara karakter.', code: error.code || undefined },
      { status: error.status || 500 },
    );
  }
}
