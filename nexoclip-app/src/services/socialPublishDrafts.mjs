import { listSocialPublishDrafts } from '../repositories/socialPublishRepository.mjs';

const uuid = value => typeof value === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

export function normalizeSocialDraft(content) {
  if (!content || !['photo', 'video'].includes(content.mediaType) || !['upload', 'direct'].includes(content.mode)) throw fail('Invalid draft type');
  const draft = { mediaType: content.mediaType, mode: content.mode };
  if (draft.mediaType === 'video') {
    if (!uuid(content.generationId)) throw fail('Choose a completed video');
    draft.generationId = content.generationId;
  } else {
    if (!Array.isArray(content.assetIds) || !content.assetIds.length || content.assetIds.length > 35 ||
      content.assetIds.some(id => !uuid(id)) || new Set(content.assetIds).size !== content.assetIds.length) throw fail('Choose 1–35 distinct photos');
    draft.assetIds = content.assetIds;
  }
  if (content.accountId && !uuid(content.accountId)) throw fail('Invalid TikTok account');
  draft.accountId = content.accountId || null;
  for (const [key, max] of [['caption', draft.mediaType === 'photo' ? 4000 : 2200], ['photoTitle', 90], ['privacyLevel', 64], ['scheduledAt', 64], ['timeZone', 100]]) {
    if (content[key] != null && (typeof content[key] !== 'string' || content[key].length > max)) throw fail(`Invalid draft ${key}`);
    draft[key] = content[key] || '';
  }
  for (const key of ['disableComment', 'disableDuet', 'disableStitch', 'brandContentToggle', 'brandOrganicToggle', 'autoAddMusic', 'isAigc', 'scheduleEnabled']) {
    if (typeof content[key] !== 'boolean') throw fail(`Invalid draft ${key}`);
    draft[key] = content[key];
  }
  draft.photoCoverIndex = content.photoCoverIndex ?? 0;
  if (!Number.isInteger(draft.photoCoverIndex) || draft.photoCoverIndex < 0 || draft.photoCoverIndex >= (draft.assetIds?.length || 1)) throw fail('Invalid draft cover');
  // Consent and idempotency keys are deliberately not restored from a draft.
  return draft;
}

export async function resolveSocialDraftMedia(pool, { workspaceId, userId }, content) {
  const url = id => `/api/assets/${encodeURIComponent(id)}/download?workspace_id=${encodeURIComponent(workspaceId)}`;
  if (content.mediaType === 'video') {
    const result = await pool.query(`SELECT g.id,a.id AS asset_id,a.filename FROM generation_jobs g
      JOIN generation_outputs o ON o.workspace_id=g.workspace_id AND o.generation_job_id=g.id
      JOIN assets a ON a.workspace_id=o.workspace_id AND a.id=o.asset_id
      WHERE g.workspace_id=$1 AND g.created_by_user_id=$2 AND g.id=$3 AND g.kind='video' AND g.status='succeeded'
        AND a.content_type IN ('video/mp4','video/quicktime') AND a.size_bytes<=262144000 ORDER BY o.output_index LIMIT 1`,
    [workspaceId, userId, content.generationId]);
    if (!result.rows[0]) throw fail('The draft video is no longer available', 409);
    return { video: { ...result.rows[0], url: url(result.rows[0].asset_id) }, photos: [] };
  }
  const result = await pool.query(`SELECT id,filename,EXISTS(SELECT 1 FROM generation_outputs o WHERE o.workspace_id=assets.workspace_id AND o.asset_id=assets.id) AS generated
    FROM assets WHERE workspace_id=$1 AND id=ANY($2::uuid[]) AND content_type IN ('image/png','image/jpeg','image/webp') AND size_bytes<=20971520`, [workspaceId, content.assetIds]);
  const byId = new Map(result.rows.map(row => [row.id, row]));
  if (content.assetIds.some(id => !byId.has(id))) throw fail('Some draft photos are no longer available', 409);
  return { video: null, photos: content.assetIds.map(id => ({ ...byId.get(id), url: url(id) })) };
}

export async function saveSocialPublishDraft(pool, owner, input) {
  const content = normalizeSocialDraft(input.content);
  await resolveSocialDraftMedia(pool, owner, content);
  if (content.accountId) {
    const account = await pool.query('SELECT id FROM social_accounts WHERE id=$1 AND workspace_id=$2 AND user_id=$3', [content.accountId, owner.workspaceId, owner.userId]);
    if (!account.rowCount) throw fail('TikTok account not found', 404);
  }
  if (input.id && (!uuid(input.id) || !Number.isInteger(input.version))) throw fail('Invalid draft version');
  const result = input.id ? await pool.query(`UPDATE social_publish_drafts SET content=$4::jsonb,version=version+1,updated_at=now()
    WHERE id=$1 AND workspace_id=$2 AND user_id=$3 AND version=$5 RETURNING id,content,version,updated_at`,
  [input.id, owner.workspaceId, owner.userId, JSON.stringify(content), input.version]) :
    await pool.query(`INSERT INTO social_publish_drafts(workspace_id,user_id,content) VALUES($1,$2,$3::jsonb) RETURNING id,content,version,updated_at`,
    [owner.workspaceId, owner.userId, JSON.stringify(content)]);
  if (!result.rowCount) throw fail('Draft changed in another window or is no longer available. Reload your drafts.', 409);
  return result.rows[0];
}

export async function getSocialPublishDraft(pool, owner, id) {
  if (!uuid(id)) throw fail('Invalid draft ID');
  const result = await pool.query('SELECT id,content,version,updated_at FROM social_publish_drafts WHERE id=$1 AND workspace_id=$2 AND user_id=$3', [id, owner.workspaceId, owner.userId]);
  if (!result.rowCount) throw fail('Draft not found', 404);
  const draft = result.rows[0];
  return { ...draft, ...await resolveSocialDraftMedia(pool, owner, draft.content) };
}

export async function deleteSocialPublishDraft(pool, owner, id, version) {
  if (!uuid(id) || !Number.isInteger(version)) throw fail('Invalid draft ID or version');
  const result = await pool.query('DELETE FROM social_publish_drafts WHERE id=$1 AND workspace_id=$2 AND user_id=$3 AND version=$4 RETURNING id', [id, owner.workspaceId, owner.userId, version]);
  if (!result.rowCount) throw fail('Draft changed or is no longer available. Reload your drafts.', 409);
}

export { listSocialPublishDrafts };
