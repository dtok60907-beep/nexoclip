import { SignJWT, jwtVerify } from 'jose';

export const REALTIME_TOKEN_ALGORITHM = 'HS256';
export const REALTIME_TOKEN_ISSUER = 'nexoclip';
export const REALTIME_TOKEN_AUDIENCE = 'nexoclip-realtime';
export const REALTIME_TOKEN_TTL_SECONDS = 60;

const textEncoder = new TextEncoder();

function requireSecret(secret) {
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new Error('Realtime token secret is required');
  }

  return textEncoder.encode(secret);
}

function requireIdentity(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Realtime token ${field} is required`);
  }

  return value;
}

export async function issueRealtimeToken({ userId, projectId, sessionId }, secret) {
  const subject = requireIdentity(userId, 'userId');
  const roomProjectId = requireIdentity(projectId, 'projectId');
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + REALTIME_TOKEN_TTL_SECONDS;

  const token = await new SignJWT({ projectId: roomProjectId, sessionId: requireIdentity(sessionId, 'sessionId') })
    .setProtectedHeader({ alg: REALTIME_TOKEN_ALGORITHM, typ: 'JWT' })
    .setSubject(subject)
    .setIssuer(REALTIME_TOKEN_ISSUER)
    .setAudience(REALTIME_TOKEN_AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(requireSecret(secret));

  return { token, expiresAt };
}

export async function verifyRealtimeToken(token, expectedProjectId, secret) {
  if (typeof token !== 'string' || token.length === 0) {
    return null;
  }

  if (typeof expectedProjectId !== 'string' || expectedProjectId.length === 0) {
    return null;
  }

  try {
    const { payload, protectedHeader } = await jwtVerify(token, requireSecret(secret), {
      algorithms: [REALTIME_TOKEN_ALGORITHM],
      issuer: REALTIME_TOKEN_ISSUER,
      audience: REALTIME_TOKEN_AUDIENCE,
    });

    if (protectedHeader.alg !== REALTIME_TOKEN_ALGORITHM) {
      return null;
    }

    if (payload.projectId !== expectedProjectId) {
      return null;
    }

    if (typeof payload.sessionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.sessionId)) {
      return null;
    }

    if (typeof payload.sub !== 'string' || typeof payload.iat !== 'number' || typeof payload.exp !== 'number') {
      return null;
    }

    return {
      sessionId: payload.sessionId,
      userId: payload.sub,
      projectId: payload.projectId,
      issuedAt: payload.iat,
      expiresAt: payload.exp,
    };
  } catch {
    return null;
  }
}
