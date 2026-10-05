import { getPool } from '../db/pool.js';
import {
  createSessionToken,
  hashSessionToken,
} from '../lib/auth/session.js';
import { hashPassword, verifyPassword } from '../lib/auth/password.js';
import {
  createSessionRecord,
  findActiveSession,
  revokeSession,
} from '../repositories/sessionRepository.js';
import {
  createUserWithWorkspace,
  findUserByEmail,
} from '../repositories/userRepository.js';

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 30;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function slugify(value) {
  const slug = String(value || 'workspace')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return slug || 'workspace';
}

async function createSessionForClient(client, userId, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  const record = await createSessionRecord(client, {
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt,
  });
  return { token, expiresAt, session: record };
}

export async function registerUser({ email, password, displayName, workspaceName }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !normalizedEmail.includes('@')) throw new Error('Valid email is required');
  const passwordHash = await hashPassword(password);
  const name = String(workspaceName || `${displayName || 'Personal'} workspace`).trim();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const existing = await findUserByEmail(client, normalizedEmail);
    if (existing) throw new Error('Email already registered');

    const { user, workspace } = await createUserWithWorkspace(client, {
      email: normalizedEmail,
      passwordHash,
      displayName: String(displayName || '').trim() || null,
      workspaceName: name,
      workspaceSlug: `${slugify(name)}-${cryptoRandomSuffix()}`,
    });
    const session = await createSessionForClient(client, user.id);
    await client.query('COMMIT');
    return { user, workspace, ...session };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function loginUser({ email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const pool = getPool();
  const client = await pool.connect();
  try {
    const user = await findUserByEmail(client, normalizedEmail);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      throw new Error('Invalid email or password');
    }
    const session = await createSessionForClient(client, user.id);
    return { user: { id: user.id, email: user.email, display_name: user.display_name }, ...session };
  } finally {
    client.release();
  }
}

function cryptoRandomSuffix() {
  return createSessionToken().slice(0, 10);
}

// Google OAuth sign-in: find the user by their Google email, or provision a new
// account+workspace on first login (with an unusable random password), then start
// a session. Returns { user, token, expiresAt }.
export async function loginWithGoogle({ email, displayName }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !normalizedEmail.includes('@')) throw new Error('Valid email is required');
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let user = await findUserByEmail(client, normalizedEmail);
    const isNew = !user;
    if (!user) {
      const passwordHash = await hashPassword(createSessionToken());
      const name = `${displayName || 'Personal'} workspace`;
      const created = await createUserWithWorkspace(client, {
        email: normalizedEmail,
        passwordHash,
        displayName: String(displayName || '').trim() || null,
        workspaceName: name,
        workspaceSlug: `${slugify(name)}-${cryptoRandomSuffix()}`,
      });
      user = created.user;
    }
    const session = await createSessionForClient(client, user.id);
    await client.query('COMMIT');
    return { user: { id: user.id, email: user.email, display_name: user.display_name }, isNew, ...session };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function createSession({ userId, ttlSeconds = DEFAULT_TTL_SECONDS }) {
  if (!userId) throw new Error('userId is required');
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const session = await createSessionForClient(client, userId, ttlSeconds);
    await client.query('COMMIT');
    return session;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getCurrentSession(token) {
  if (!token) return null;
  return findActiveSession(getPool(), hashSessionToken(token));
}

export async function revokeCurrentSession(token) {
  if (!token) return false;
  return revokeSession(getPool(), hashSessionToken(token));
}
