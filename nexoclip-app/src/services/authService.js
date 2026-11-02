import { getPool } from '../db/pool.js';
import { createHash } from 'node:crypto';
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
import { resendService } from './resendService.js';

const TEMPLATE_IDS = {
  verify: process.env.RESEND_TEMPLATE_VERIFY_EMAIL || '88c15456-2802-48bd-bd68-ccebf429762f',
  reset: process.env.RESEND_TEMPLATE_PASSWORD_RESET || '961e7f38-cecd-4667-b75d-1dcd1501345d',
  welcome: process.env.RESEND_TEMPLATE_WELCOME || '63187cda-1287-4b79-948d-fec4f7e58605',
};
const tokenHash = (token) => createHash('sha256').update(token).digest();
const appOrigin = () => process.env.PUBLIC_APP_URL || 'http://localhost:3000';

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

async function syncMarketingContact(user) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_AUDIENCE_ID || !user?.email) return;
  const parts = String(user.display_name || '').trim().split(/\s+/).filter(Boolean);
  try {
    await resendService.createContact({
      email: user.email,
      firstName: parts[0] || undefined,
      lastName: parts.slice(1).join(' ') || undefined,
      unsubscribed: !user.marketing_opt_in,
    });
  } catch (error) {
    // Marketing sync must never block account creation; the next sync can retry it.
    console.warn('Resend contact sync failed:', error.message);
  }
}

async function issueEmailToken(userId, purpose, ttlMs) {
  const raw = createSessionToken();
  const pool = getPool();
  await pool.query('DELETE FROM auth_email_tokens WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL', [userId, purpose]);
  await pool.query('INSERT INTO auth_email_tokens (token_hash, user_id, purpose, expires_at) VALUES ($1, $2, $3, $4)', [tokenHash(raw), userId, purpose, new Date(Date.now() + ttlMs)]);
  return raw;
}

async function sendTemplateSafe(input) {
  if (!process.env.RESEND_API_KEY) return;
  try { await resendService.sendTemplate(input); } catch (error) { console.warn('Resend transactional email failed:', error.message); }
}

export async function sendVerificationEmail(user) {
  const token = await issueEmailToken(user.id, 'verify_email', 24 * 60 * 60 * 1000);
  await sendTemplateSafe({ to: [user.email], templateId: TEMPLATE_IDS.verify, variables: { CUSTOMER_NAME: user.display_name || 'creator', VERIFY_URL: `${appOrigin()}/api/auth/verify?token=${encodeURIComponent(token)}`, EXPIRES_AT: '24 jam' } });
}

export async function requestPasswordReset(email) {
  const normalized = normalizeEmail(email);
  const user = await findUserByEmail(getPool(), normalized);
  if (!user) return;
  const token = await issueEmailToken(user.id, 'password_reset', 60 * 60 * 1000);
  await sendTemplateSafe({ to: [user.email], templateId: TEMPLATE_IDS.reset, variables: { RESET_URL: `${appOrigin()}/reset-password?token=${encodeURIComponent(token)}`, EXPIRES_AT: '1 jam' } });
}

export async function verifyEmailToken(rawToken) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const row = (await client.query(`SELECT t.user_id, u.email, u.display_name FROM auth_email_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = $1 AND t.purpose = 'verify_email' AND t.consumed_at IS NULL AND t.expires_at > now() FOR UPDATE`, [tokenHash(rawToken)])).rows[0];
    if (!row) throw Object.assign(new Error('Verification link is invalid or expired'), { status: 400 });
    await client.query('UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now() WHERE id = $1', [row.user_id]);
    await client.query('UPDATE auth_email_tokens SET consumed_at = now() WHERE token_hash = $1', [tokenHash(rawToken)]);
    await client.query('COMMIT');
    await sendTemplateSafe({ to: [row.email], templateId: TEMPLATE_IDS.welcome, variables: { CUSTOMER_NAME: row.display_name || 'creator', STUDIO_URL: `${appOrigin()}/studio` } });
    return row;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function resetPassword(rawToken, password) {
  const passwordHash = await hashPassword(password);
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const row = (await client.query(`SELECT user_id FROM auth_email_tokens WHERE token_hash = $1 AND purpose = 'password_reset' AND consumed_at IS NULL AND expires_at > now() FOR UPDATE`, [tokenHash(rawToken)])).rows[0];
    if (!row) throw Object.assign(new Error('Reset link is invalid or expired'), { status: 400 });
    await client.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [row.user_id, passwordHash]);
    await client.query('UPDATE auth_email_tokens SET consumed_at = now() WHERE token_hash = $1', [tokenHash(rawToken)]);
    await client.query('UPDATE sessions SET revoked_at = now(), updated_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [row.user_id]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function changePassword(userId, currentPassword, password) {
  const client = await getPool().connect();
  try {
    const user = (await client.query('SELECT password_hash FROM users WHERE id = $1', [userId])).rows[0];
    if (!user || !(await verifyPassword(currentPassword, user.password_hash))) throw Object.assign(new Error('Current password is incorrect'), { status: 400 });
    const passwordHash = await hashPassword(password);
    await client.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [userId, passwordHash]);
    await client.query('UPDATE sessions SET revoked_at = now(), updated_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
  } finally { client.release(); }
}

export async function registerUser({ email, password, displayName, workspaceName, marketingOptIn = false }) {
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
      marketingOptIn,
      workspaceName: name,
      workspaceSlug: `${slugify(name)}-${cryptoRandomSuffix()}`,
    });
    const session = await createSessionForClient(client, user.id);
    await client.query('COMMIT');
    sendVerificationEmail(user).catch((error) => console.warn('Verification email setup failed:', error.message));
    await syncMarketingContact(user);
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
    return { user: { id: user.id, email: user.email, display_name: user.display_name, email_verified_at: user.email_verified_at }, ...session };
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
        marketingOptIn: false,
        workspaceName: name,
        workspaceSlug: `${slugify(name)}-${cryptoRandomSuffix()}`,
      });
      user = created.user;
    }
    const session = await createSessionForClient(client, user.id);
    await client.query('COMMIT');
    if (isNew) await syncMarketingContact(user);
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
