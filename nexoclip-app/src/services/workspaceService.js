import { randomBytes } from 'node:crypto';
import { getPool } from '../db/pool.js';
import {
  countOwnedWorkspaces,
  findWorkspaceMembership,
  insertWorkspace,
  listUserWorkspaces,
  setCurrentWorkspace,
} from '../repositories/workspaceRepository.js';

export const MAX_OWNED_WORKSPACES = 10;

export class WorkspaceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function getUserWorkspaces(userId) {
  if (!userId) throw new Error('userId is required');
  return listUserWorkspaces(getPool(), userId);
}

export async function getDefaultWorkspace(userId) {
  const workspaces = await getUserWorkspaces(userId);
  return workspaces[0] || null;
}

export async function requireWorkspaceMembership({ userId, workspaceId }) {
  if (!userId || !workspaceId) return null;
  return findWorkspaceMembership(getPool(), workspaceId, userId);
}

function slugify(value) {
  const slug = String(value || 'workspace').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return slug || 'workspace';
}

async function inTransaction(pool, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Create a workspace owned by the user (own credit wallet, starts at 0) and switch to it. */
export async function createWorkspace({ userId, name, pool = getPool() }) {
  const clean = String(name || '').trim().replace(/\s+/g, ' ');
  if (clean.length < 2 || clean.length > 60) throw new WorkspaceError('Nama workspace harus 2–60 karakter.');
  return inTransaction(pool, async (client) => {
    if (await countOwnedWorkspaces(client, userId) >= MAX_OWNED_WORKSPACES) {
      throw new WorkspaceError(`Maksimal ${MAX_OWNED_WORKSPACES} workspace per akun.`);
    }
    const slug = `${slugify(clean)}-${randomBytes(3).toString('hex')}`;
    const workspace = await insertWorkspace(client, { name: clean, slug, ownerId: userId });
    await setCurrentWorkspace(client, userId, workspace.id);
    return workspace;
  });
}

/** Make one of the user's workspaces the one every page and generation uses. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function switchWorkspace({ userId, workspaceId, pool = getPool() }) {
  if (!UUID.test(String(workspaceId || ''))) throw new WorkspaceError('Workspace tidak ditemukan.', 404);
  const membership = await findWorkspaceMembership(pool, workspaceId, userId);
  if (!membership) throw new WorkspaceError('Workspace tidak ditemukan.', 404);
  await setCurrentWorkspace(pool, userId, workspaceId);
  return membership;
}
