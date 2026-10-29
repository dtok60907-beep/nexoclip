// Music and voiceover for the Motion studio's Audio tab, made by ElevenLabs and kept as an asset of the user's
// workspace (src/services/motionAudio.js). `estimate: true` only prices the request, so the studio can show the cost
// on the button; otherwise the file is generated, stored and charged like the AI Director's audio. A voiceover comes
// back with when each word is spoken, for the captions.
import { getPool } from '../../../../src/db/pool.js';
import { SESSION_COOKIE } from '../../../../src/lib/auth/session.js';
import { getCurrentSession } from '../../../../src/services/authService.js';
import { getDefaultWorkspace } from '../../../../src/services/workspaceService.js';
import { audioCredits, validateAudioInput } from '../../../../src/services/elevenlabsAudio.js';
import { makeMotionAudio } from '../../../../src/services/motionAudio.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const REQUEST_ID = /^[A-Za-z0-9_-]{8,80}$/;

export function createMotionAudioHandler({
  getSession = getCurrentSession,
  findDefaultWorkspace = getDefaultWorkspace,
  loadPool = getPool,
  priceAudio = audioCredits,
  makeAudio = makeMotionAudio,
  logError = console.error,
} = {}) {
  return async function POST(request) {
    const session = await getSession(request.cookies?.get(SESSION_COOKIE)?.value).catch(() => null);
    if (!session?.user_id) return Response.json({ error: 'Masuk dulu untuk membuat audio.' }, { status: 401 });

    const body = await request.json().catch(() => null);
    let audio;
    try {
      audio = validateAudioInput(body?.audio || {});
    } catch (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (body?.estimate === true) return Response.json({ credits: (await priceAudio(audio)).credits });
    if (!REQUEST_ID.test(String(body?.requestId || ''))) return Response.json({ error: 'Invalid request' }, { status: 400 });

    const workspace = await findDefaultWorkspace(session.user_id);
    if (!workspace) return Response.json({ error: 'Workspace not found' }, { status: 404 });
    try {
      const file = await makeAudio({
        pool: loadPool(), workspaceId: workspace.id, userId: session.user_id, input: audio, idempotencyKey: `motion-audio:${body.requestId}`,
      });
      return Response.json(file, { status: 201 });
    } catch (error) {
      if (!error.status || error.status >= 500) logError('motion audio failed', error.cause || error);
      return Response.json({ error: error.status ? error.message : 'Audio tidak bisa dibuat sekarang.' }, { status: error.status || 500 });
    }
  };
}

export const POST = createMotionAudioHandler();
