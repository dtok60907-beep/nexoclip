// Motion studio projects (table motion_projects): a name plus the editor document. The document is cleaned to the
// shape the studio plays, so a stored project always opens.
import { STYLES, CUSTOM_ID, FAMILIES } from '../../components/motion/styles.js';
import { SCENE_LIMITS, cleanAudio, cleanScene } from '../../components/motion/sceneKinds.js';

export const MAX_NAME = 80;
export const MAX_CHAT = 60;
const FORMATS = new Set(['9:16', '1:1', '16:9']);
const STYLE_IDS = new Set([...STYLES.map((style) => style.id), CUSTOM_ID]);
const FAMILY_IDS = new Set(FAMILIES.map((family) => family.id));
const COLOR = /^#[0-9a-f]{6}$/i;

const invalid = (message) => Object.assign(new Error(message), { status: 400 });
const str = (value, max) => String(value ?? '').slice(0, max);

export function cleanName(name) {
  const value = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  if (!value) throw invalid('Nama project wajib diisi.');
  return value;
}

export function cleanDoc(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw invalid('Isi project tidak valid.');
  const scenes = (Array.isArray(doc.scenes) ? doc.scenes : []).slice(0, SCENE_LIMITS.max).map((scene) => cleanScene(scene, { loose: true }));
  if (!scenes.length) throw invalid('Project butuh minimal satu adegan.');
  const palette = doc.custom?.palette || {};
  const custom = {
    family: FAMILY_IDS.has(doc.custom?.family) ? doc.custom.family : 'pop',
    font: str(doc.custom?.font, 200),
    palette: Object.fromEntries(['bg', 'fg', 'accent', 'muted'].filter((key) => COLOR.test(palette[key] || '')).map((key) => [key, palette[key]])),
  };
  const chat = (Array.isArray(doc.chat) ? doc.chat : []).slice(-MAX_CHAT)
    .filter((message) => ['user', 'assistant'].includes(message?.role))
    .map((message) => ({
      role: message.role,
      content: str(message.content, 2000),
      ...(message.error ? { error: true } : {}),
      ...(message.plan ? { plan: { styleId: str(message.plan.styleId, 40), scenes: (message.plan.scenes || []).slice(0, SCENE_LIMITS.max).map((scene) => ({ seconds: Number(scene?.seconds) || 0 })) } } : {}),
      ...(Number(message.credits) > 0 ? { credits: Number(message.credits) } : {}),
    }));
  return {
    styleId: STYLE_IDS.has(doc.styleId) ? doc.styleId : 'auto',
    format: FORMATS.has(doc.format) ? doc.format : '9:16',
    scenes,
    custom,
    audio: cleanAudio(doc.audio, { loose: true }),
    chat,
  };
}

const summary = (row) => ({
  id: row.id,
  name: row.name,
  styleId: row.doc?.styleId || 'auto',
  format: row.doc?.format || '9:16',
  sceneCount: row.doc?.scenes?.length || 0,
  firstTitle: row.doc?.scenes?.[0]?.title || '',
  updatedAt: row.updated_at,
  createdAt: row.created_at,
});
const full = (row) => ({ ...summary(row), doc: row.doc });

export async function listMotionProjects(pool, workspaceId) {
  const result = await pool.query(
    'SELECT id, name, doc, created_at, updated_at FROM motion_projects WHERE workspace_id = $1 ORDER BY updated_at DESC LIMIT 200',
    [workspaceId],
  );
  return result.rows.map(summary);
}

export async function getMotionProject(pool, workspaceId, id) {
  const result = await pool.query('SELECT id, name, doc, created_at, updated_at FROM motion_projects WHERE workspace_id = $1 AND id = $2', [workspaceId, id]);
  return result.rows[0] ? full(result.rows[0]) : null;
}

export async function createMotionProject(pool, { workspaceId, userId, name, doc }) {
  const result = await pool.query(
    'INSERT INTO motion_projects (workspace_id, created_by, name, doc) VALUES ($1, $2, $3, $4) RETURNING id, name, doc, created_at, updated_at',
    [workspaceId, userId, cleanName(name), JSON.stringify(cleanDoc(doc))],
  );
  return full(result.rows[0]);
}

export async function updateMotionProject(pool, workspaceId, id, { name, doc }) {
  if (name === undefined && doc === undefined) throw invalid('Tidak ada yang diubah.');
  const result = await pool.query(
    `UPDATE motion_projects SET name = COALESCE($3, name), doc = COALESCE($4::jsonb, doc), updated_at = now()
     WHERE workspace_id = $1 AND id = $2 RETURNING id, name, doc, created_at, updated_at`,
    [workspaceId, id, name === undefined ? null : cleanName(name), doc === undefined ? null : JSON.stringify(cleanDoc(doc))],
  );
  return result.rows[0] ? full(result.rows[0]) : null;
}

export async function deleteMotionProject(pool, workspaceId, id) {
  const result = await pool.query('DELETE FROM motion_projects WHERE workspace_id = $1 AND id = $2', [workspaceId, id]);
  return result.rowCount > 0;
}
