// Persistent storage & Canvas handoff payload builder for AI Creative Marketing.
import { getPool } from '../db/pool.js';

export const ARTIFACT_TYPES = [
  'research_report',
  'creative_strategy',
  'content_calendar',
  'script_pack',
  'performance_report',
];

export const AGENT_MODES = ['copilot', 'agent', 'autopilot'];
export const CAMPAIGN_STATUSES = ['draft', 'active', 'paused', 'completed', 'archived'];
export const DELIVERABLE_STATUSES = ['idea', 'scripted', 'producing', 'ready', 'scheduled', 'published'];

// --- THREADS ---

export async function listThreads(workspaceId, { limit = 40, db = getPool() } = {}) {
  const res = await db.query(
    `SELECT id, workspace_id, user_id, title, mode, brand_context_enabled, selected_product_ids,
            linked_campaign_id, status, created_at, updated_at,
            jsonb_array_length(COALESCE(messages_json, '[]'::jsonb)) AS message_count
     FROM marketing_threads
     WHERE workspace_id = $1
     ORDER BY updated_at DESC
     LIMIT $2`,
    [workspaceId, Math.min(Math.max(Number(limit) || 40, 1), 100)],
  );
  return res.rows;
}

export async function getThread(workspaceId, threadId, { db = getPool() } = {}) {
  const res = await db.query(
    `SELECT * FROM marketing_threads WHERE workspace_id = $1 AND id = $2 LIMIT 1`,
    [workspaceId, threadId],
  );
  return res.rows[0] || null;
}

export async function createThread({
  workspaceId,
  userId,
  title = 'New Marketing Session',
  mode = 'agent',
  brandContextEnabled = true,
  selectedProductIds = [],
  linkedCampaignId = null,
  db = getPool(),
}) {
  const safeMode = AGENT_MODES.includes(mode) ? mode : 'agent';
  const safeTitle = String(title || 'New Marketing Session').trim().slice(0, 160) || 'New Marketing Session';
  const res = await db.query(
    `INSERT INTO marketing_threads
       (workspace_id, user_id, title, mode, brand_context_enabled, selected_product_ids, linked_campaign_id)
     VALUES ($1, $2, $3, $4, $5, $6::uuid[], $7)
     RETURNING *`,
    [workspaceId, userId, safeTitle, safeMode, Boolean(brandContextEnabled), selectedProductIds || [], linkedCampaignId],
  );
  return res.rows[0];
}

export async function updateThread(workspaceId, threadId, patch = {}, { db = getPool() } = {}) {
  const sets = [];
  const params = [workspaceId, threadId];
  const push = (col, val, cast = '') => {
    params.push(val);
    sets.push(`${col} = $${params.length}${cast}`);
  };
  if (patch.title !== undefined) push('title', String(patch.title).trim().slice(0, 160));
  if (patch.mode !== undefined && AGENT_MODES.includes(patch.mode)) push('mode', patch.mode);
  if (patch.brandContextEnabled !== undefined) push('brand_context_enabled', Boolean(patch.brandContextEnabled));
  if (patch.selectedProductIds !== undefined) push('selected_product_ids', patch.selectedProductIds || [], '::uuid[]');
  if (patch.linkedCampaignId !== undefined) push('linked_campaign_id', patch.linkedCampaignId);
  if (patch.messages !== undefined) push('messages_json', JSON.stringify(patch.messages), '::jsonb');
  if (patch.activity !== undefined) push('activity_json', JSON.stringify(patch.activity), '::jsonb');
  if (patch.status !== undefined) push('status', patch.status);
  if (!sets.length) return getThread(workspaceId, threadId, { db });
  sets.push('updated_at = now()');

  const res = await db.query(
    `UPDATE marketing_threads SET ${sets.join(', ')} WHERE workspace_id = $1 AND id = $2 RETURNING *`,
    params,
  );
  return res.rows[0] || null;
}

export async function deleteThread(workspaceId, threadId, { db = getPool() } = {}) {
  const res = await db.query(
    `DELETE FROM marketing_threads WHERE workspace_id = $1 AND id = $2 RETURNING id`,
    [workspaceId, threadId],
  );
  return Boolean(res.rows[0]);
}

// --- ARTIFACTS ---

export async function listArtifacts(workspaceId, { campaignId = null, threadId = null, type = null, limit = 60, db = getPool() } = {}) {
  const params = [workspaceId];
  const clauses = ['workspace_id = $1'];
  if (campaignId) {
    params.push(campaignId);
    clauses.push(`campaign_id = $${params.length}`);
  }
  if (threadId) {
    params.push(threadId);
    clauses.push(`thread_id = $${params.length}`);
  }
  if (type && ARTIFACT_TYPES.includes(type)) {
    params.push(type);
    clauses.push(`type = $${params.length}`);
  }
  params.push(Math.min(Math.max(Number(limit) || 60, 1), 150));
  const res = await db.query(
    `SELECT * FROM marketing_artifacts
     WHERE ${clauses.join(' AND ')}
     ORDER BY pinned DESC, updated_at DESC
     LIMIT $${params.length}`,
    params,
  );
  return res.rows;
}

export async function getArtifact(workspaceId, artifactId, { db = getPool() } = {}) {
  const res = await db.query(
    `SELECT * FROM marketing_artifacts WHERE workspace_id = $1 AND id = $2 LIMIT 1`,
    [workspaceId, artifactId],
  );
  return res.rows[0] || null;
}

export async function saveArtifact({
  workspaceId,
  ownerId,
  campaignId = null,
  threadId = null,
  type,
  title,
  summary = '',
  data = {},
  pinned = false,
  db = getPool(),
}) {
  if (!ARTIFACT_TYPES.includes(type)) {
    throw Object.assign(new Error(`Tipe artifact tidak valid: ${type}`), { status: 400 });
  }
  const cleanTitle = String(title || 'Untitled Artifact').trim().slice(0, 200);
  const res = await db.query(
    `INSERT INTO marketing_artifacts
       (workspace_id, owner_id, campaign_id, thread_id, type, title, summary, data_json, pinned)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
     RETURNING *`,
    [
      workspaceId,
      ownerId,
      campaignId,
      threadId,
      type,
      cleanTitle,
      String(summary || '').slice(0, 600),
      JSON.stringify(data || {}),
      Boolean(pinned),
    ],
  );
  return res.rows[0];
}

export async function deleteArtifact(workspaceId, artifactId, { db = getPool() } = {}) {
  const res = await db.query(
    `DELETE FROM marketing_artifacts WHERE workspace_id = $1 AND id = $2 RETURNING id`,
    [workspaceId, artifactId],
  );
  return Boolean(res.rows[0]);
}

// --- CAMPAIGNS & DELIVERABLES ---

export async function listCampaigns(workspaceId, { limit = 40, db = getPool() } = {}) {
  const res = await db.query(
    `SELECT c.*,
            (SELECT count(*)::int FROM marketing_deliverables d WHERE d.campaign_id = c.id) AS deliverable_count,
            (SELECT count(*)::int FROM marketing_deliverables d WHERE d.campaign_id = c.id AND d.status IN ('ready','scheduled','published')) AS ready_count
     FROM marketing_campaigns c
     WHERE c.workspace_id = $1 AND c.status <> 'archived'
     ORDER BY c.updated_at DESC
     LIMIT $2`,
    [workspaceId, Math.min(Math.max(Number(limit) || 40, 1), 100)],
  );
  return res.rows;
}

export async function getCampaignWithDetails(workspaceId, campaignId, { db = getPool() } = {}) {
  const [cRes, dRes, aRes] = await Promise.all([
    db.query('SELECT * FROM marketing_campaigns WHERE workspace_id = $1 AND id = $2 LIMIT 1', [workspaceId, campaignId]),
    db.query(
      'SELECT * FROM marketing_deliverables WHERE workspace_id = $1 AND campaign_id = $2 ORDER BY day_index ASC, created_at ASC',
      [workspaceId, campaignId],
    ),
    db.query(
      'SELECT * FROM marketing_artifacts WHERE workspace_id = $1 AND campaign_id = $2 ORDER BY updated_at DESC',
      [workspaceId, campaignId],
    ),
  ]);
  const campaign = cRes.rows[0];
  if (!campaign) return null;
  return { ...campaign, deliverables: dRes.rows, artifacts: aRes.rows };
}

export async function createCampaignWithDeliverables({
  workspaceId,
  ownerId,
  title,
  objective = '',
  productIds = [],
  platforms = ['tiktok', 'instagram'],
  durationDays = 7,
  summary = {},
  deliverables = [],
  db = getPool(),
}) {
  const cleanTitle = String(title || 'Marketing Campaign').trim().slice(0, 180);
  const cRes = await db.query(
    `INSERT INTO marketing_campaigns
       (workspace_id, owner_id, title, objective, product_ids, platforms, duration_days, summary_json)
     VALUES ($1, $2, $3, $4, $5::uuid[], $6::text[], $7, $8::jsonb)
     RETURNING *`,
    [
      workspaceId,
      ownerId,
      cleanTitle,
      String(objective || '').slice(0, 500),
      productIds || [],
      Array.isArray(platforms) && platforms.length ? platforms : ['tiktok', 'instagram'],
      Math.max(1, Math.min(Number(durationDays) || 7, 90)),
      JSON.stringify(summary || {}),
    ],
  );
  const campaign = cRes.rows[0];

  const createdDeliverables = [];
  for (let i = 0; i < (deliverables || []).length; i += 1) {
    const d = deliverables[i] || {};
    const dRes = await db.query(
      `INSERT INTO marketing_deliverables
         (campaign_id, workspace_id, day_index, title, platform, format, hook, angle, cta, script_json, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
       RETURNING *`,
      [
        campaign.id,
        workspaceId,
        Number(d.dayIndex ?? d.day_index ?? i + 1) || i + 1,
        String(d.title || `Day ${i + 1} Content`).trim().slice(0, 180),
        String(d.platform || 'tiktok').toLowerCase().slice(0, 40),
        String(d.format || 'ugc_video').slice(0, 60),
        String(d.hook || '').slice(0, 400),
        String(d.angle || '').slice(0, 400),
        String(d.cta || '').slice(0, 240),
        JSON.stringify(d.script || d.script_json || {}),
        DELIVERABLE_STATUSES.includes(d.status) ? d.status : d.script?.visualPrompt ? 'scripted' : 'idea',
      ],
    );
    createdDeliverables.push(dRes.rows[0]);
  }

  return { ...campaign, deliverables: createdDeliverables };
}

export async function updateDeliverable(workspaceId, deliverableId, patch = {}, { db = getPool() } = {}) {
  const sets = [];
  const params = [workspaceId, deliverableId];
  const push = (col, val, cast = '') => {
    params.push(val);
    sets.push(`${col} = $${params.length}${cast}`);
  };
  if (patch.title !== undefined) push('title', String(patch.title).trim().slice(0, 180));
  if (patch.platform !== undefined) push('platform', String(patch.platform).toLowerCase().slice(0, 40));
  if (patch.format !== undefined) push('format', String(patch.format).slice(0, 60));
  if (patch.hook !== undefined) push('hook', String(patch.hook).slice(0, 400));
  if (patch.angle !== undefined) push('angle', String(patch.angle).slice(0, 400));
  if (patch.cta !== undefined) push('cta', String(patch.cta).slice(0, 240));
  if (patch.status !== undefined && DELIVERABLE_STATUSES.includes(patch.status)) push('status', patch.status);
  if (patch.canvasProjectId !== undefined) push('canvas_project_id', patch.canvasProjectId);
  if (patch.script !== undefined) push('script_json', JSON.stringify(patch.script), '::jsonb');
  if (!sets.length) return null;
  sets.push('updated_at = now()');
  const res = await db.query(
    `UPDATE marketing_deliverables SET ${sets.join(', ')} WHERE workspace_id = $1 AND id = $2 RETURNING *`,
    params,
  );
  return res.rows[0] || null;
}

export async function getDeliverable(workspaceId, deliverableId, { db = getPool() } = {}) {
  const res = await db.query(
    `SELECT d.*, c.title AS campaign_title, c.objective AS campaign_objective, c.product_ids AS campaign_product_ids
     FROM marketing_deliverables d
     JOIN marketing_campaigns c ON c.id = d.campaign_id
     WHERE d.workspace_id = $1 AND d.id = $2
     LIMIT 1`,
    [workspaceId, deliverableId],
  );
  return res.rows[0] || null;
}

export function canvasTagFromName(name) {
  return String(name || '')
    .trim()
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'Asset';
}

const WORKSPACE_ASSET_URL_RE = /^\/api\/assets\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/download(?:\?|$)/i;

function extractWorkspaceAssetId(url) {
  const m = String(url || '').trim().match(WORKSPACE_ASSET_URL_RE);
  return m ? m[1] : null;
}

function collectBrandAvatarSeedFolders(brandKit = null) {
  const avatars = Array.isArray(brandKit?.avatars) ? brandKit.avatars : [];
  const folders = [];
  const seen = new Set();

  for (const av of avatars) {
    const cleanName = String(av?.name || '').trim().slice(0, 60);
    const url = String(av?.imageUrl || (av?.assetId ? `/api/assets/${av.assetId}/download` : '')).trim();
    if (!cleanName || !url || seen.has(cleanName.toLowerCase())) continue;
    if (!/^https?:\/\//i.test(url) && !url.startsWith('/api/')) continue;
    seen.add(cleanName.toLowerCase());
    folders.push({
      name: cleanName,
      tag: canvasTagFromName(cleanName),
      type: 'character',
      description: String(av.description || `Brand UGC Avatar: ${cleanName}`).slice(0, 240),
      assets: [
        {
          url,
          mediaType: 'image',
          filename: `${canvasTagFromName(cleanName)}.png`,
          workspaceAssetId: av.assetId || extractWorkspaceAssetId(url),
        },
      ],
    });
  }
  return folders.slice(0, 2);
}

/**
 * Picks ONLY the products actually chosen by the user (selectedProducts) or explicitly
 * referenced in the prompt/title — never dumping every unrelated product in My Brand into Canvas.
 */
export function selectRelevantProducts(allProducts = [], { selectedProducts = [], referenceText = '' } = {}) {
  const cleanAll = Array.isArray(allProducts) ? allProducts.filter(Boolean) : [];
  const cleanSelected = Array.isArray(selectedProducts) ? selectedProducts.filter(Boolean) : [];
  const text = String(referenceText || '').toLowerCase();

  // If user explicitly selected 1+ products in the thread, strictly respect their selection
  if (cleanSelected.length > 0) {
    if (cleanSelected.length === 1 || !text) return cleanSelected;
    // If multiple were selected in the thread, narrow to those explicitly named in this specific card if any match
    const narrowed = cleanSelected.filter((p) => matchesProductInText(p, text));
    return narrowed.length > 0 ? narrowed : cleanSelected;
  }

  // Otherwise match ONLY products explicitly named in the approval/deliverable title or prompt
  if (text && cleanAll.length > 0) {
    const matched = cleanAll.filter((p) => matchesProductInText(p, text));
    if (matched.length > 0) return matched.slice(0, 2);
  }

  // Safe fallback: at most 1 hero product (never dump all 4!)
  return cleanAll.slice(0, 1);
}

const GENERIC_PRODUCT_WORDS = new Set([
  'with', 'and', 'for', 'the', 'new', 'pro', 'plus', 'max', 'pack', 'box', 'set',
  'bundle', 'series', 'edition', 'original', 'official', 'promo', 'produk', 'product',
]);

function matchesProductInText(product, lowerText) {
  const name = String(product?.name || '').trim().toLowerCase();
  if (!name || !lowerText) return false;
  if (lowerText.includes(name)) return true;
  const tag = canvasTagFromName(name).toLowerCase();
  if (tag && lowerText.includes(tag)) return true;
  const words = name.split(/[^a-z0-9]+/i).filter((w) => w.length >= 3);
  if (words.length >= 2) {
    const firstTwo = `${words[0]} ${words[1]}`;
    const firstTwoDash = `${words[0]}-${words[1]}`;
    if (lowerText.includes(firstTwo) || lowerText.includes(firstTwoDash)) return true;
  }
  // Check distinctive tokens (>= 5 chars and not generic filler)
  const distinctive = words.filter((w) => w.length >= 5 && !GENERIC_PRODUCT_WORDS.has(w));
  return distinctive.some((tok) => new RegExp(`\\b${tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lowerText));
}

function collectProductSeedFolders(products = [], brandKit = null) {
  const folders = [];
  const seen = new Set();

  // Index Brand Kit product subpages ONLY to supplement extra images for matched products
  const subpageImgIndex = new Map();
  if (Array.isArray(brandKit?.subpages)) {
    for (const sp of brandKit.subpages) {
      if (sp?.parent !== 'products' || !sp.title) continue;
      const blockImgUrls = Array.isArray(sp.blocks)
        ? sp.blocks.filter((b) => b?.type === 'image' && b.url).map((b) => b.url)
        : [];
      const urls = [sp.imageUrl, ...blockImgUrls].filter(Boolean);
      if (urls.length) subpageImgIndex.set(String(sp.title).trim().toLowerCase(), { urls, subtitle: sp.subtitle || '' });
    }
  }

  const pushProduct = (name, rawUrls = [], description = '') => {
    const cleanName = String(name || '').trim().slice(0, 60);
    if (!cleanName || seen.has(cleanName.toLowerCase())) return;
    const extraFromSubpage = subpageImgIndex.get(cleanName.toLowerCase())?.urls || [];
    const urls = [...new Set(
      [...(rawUrls || []), ...extraFromSubpage]
        .map((u) => (typeof u === 'string' ? u : u?.url || u?.downloadUrl || ''))
        .map((u) => String(u || '').trim())
        .filter((u) => /^https?:\/\//i.test(u) || u.startsWith('/api/')),
    )];
    if (!urls.length) return;
    seen.add(cleanName.toLowerCase());
    folders.push({
      name: cleanName,
      tag: canvasTagFromName(cleanName),
      type: 'prop',
      description: String(description || `Product prop: ${cleanName}`).slice(0, 200),
      assets: urls.slice(0, 3).map((url, idx) => ({
        url,
        mediaType: 'image',
        filename: `${canvasTagFromName(cleanName)}-${idx + 1}.png`,
        workspaceAssetId: extractWorkspaceAssetId(url),
      })),
    });
  };

  for (const p of products || []) {
    const mediaUrls = Array.isArray(p.media)
      ? p.media.filter((m) => !m?.kind || m.kind === 'image').map((m) => m.url)
      : [];
    pushProduct(
      p.name,
      [
        p.imageUrl,
        p.image,
        p.thumbnailUrl,
        ...mediaUrls,
        ...(Array.isArray(p.images) ? p.images : []),
        ...(Array.isArray(p.photos) ? p.photos : []),
      ],
      p.advantages || p.description || '',
    );
  }

  // Fallback to Brand Kit subpage ONLY if no workspace products were passed at all (max 1)
  if (folders.length === 0 && Array.isArray(brandKit?.subpages)) {
    for (const sp of brandKit.subpages) {
      if (sp?.parent !== 'products') continue;
      const entry = subpageImgIndex.get(String(sp.title || '').trim().toLowerCase());
      if (entry) {
        pushProduct(sp.title, entry.urls, entry.subtitle);
        break;
      }
    }
  }

  return folders.slice(0, 4);
}

function buildFolderTagAliases(folder) {
  const exactTag = folder.tag || canvasTagFromName(folder.name);
  const words = String(folder.name || '')
    .trim()
    .split(/[^\w]+/)
    .filter(Boolean);
  const aliases = new Set();
  if (exactTag) aliases.add(exactTag);
  // Shortened prefix aliases (e.g. "New-Evowhey" for "New-Evowhey-with-Evosorption")
  if (words.length >= 3) {
    aliases.add(words.slice(0, 2).join('-'));
    aliases.add(words.slice(0, 3).join('-'));
  }
  if (words.length >= 2) {
    aliases.add(words[0]);
    const distinctive = words.find((w) => w.length >= 5 && !GENERIC_PRODUCT_WORDS.has(w.toLowerCase()));
    if (distinctive) aliases.add(distinctive);
  }
  // Sort longest first so longer prefixes match before shorter ones
  return [...aliases].filter((a) => a.length >= 3).sort((a, b) => b.length - a.length);
}

export function weaveMentionsIntoPrompt(rawPrompt, folders = []) {
  let prompt = String(rawPrompt || '').trim();
  const validTagsLower = new Set();
  const missingChars = [];
  const missingLocs = [];
  const missingProps = [];
  const missingOther = [];

  for (const folder of folders) {
    const tag = folder.tag || canvasTagFromName(folder.name);
    if (!tag) continue;
    validTagsLower.add(tag.toLowerCase());

    // 1. Normalize ANY exact OR shortened @alias (e.g. @New-Evowhey -> @New-Evowhey-with-Evosorption)
    let matchedInBody = false;
    for (const alias of buildFolderTagAliases(folder)) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const aliasRe = new RegExp(`@${escaped}(?![\\w-])`, 'gi');
      if (aliasRe.test(prompt)) {
        prompt = prompt.replace(aliasRe, `@${tag}`);
        matchedInBody = true;
      }
    }
    if (matchedInBody) continue;

    // 2. Replace plain un-prefixed folder name in body if present
    const nameClean = String(folder.name || '').trim();
    if (nameClean.length >= 3) {
      const nameRe = new RegExp(`(?<!@)\\b${nameClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      if (nameRe.test(prompt)) {
        prompt = prompt.replace(nameRe, `@${tag}`);
        continue;
      }
    }

    if (folder.type === 'character') missingChars.push(`@${tag}`);
    else if (folder.type === 'location') missingLocs.push(`@${tag}`);
    else if (folder.type === 'prop') missingProps.push(`@${tag}`);
    else missingOther.push(`@${tag}`);
  }

  // 3. Strip stray hallucinated @mentions that do NOT match any real Canvas folder
  // (converts dead "@FakeTag" to plain "Fake Tag" so there are NEVER broken unchipped @mentions)
  if (folders.length > 0) {
    prompt = prompt.replace(/@([A-Za-z][A-Za-z0-9_-]{1,60})\b/g, (full, token) => {
      if (validTagsLower.has(token.toLowerCase())) return full;
      return token.replace(/[-_]+/g, ' ');
    });
  }

  const anchors = [];
  if (missingChars.length) anchors.push(`Character: ${missingChars.join(', ')}.`);
  if (missingLocs.length) anchors.push(`Location: ${missingLocs.join(', ')}.`);
  if (missingProps.length) anchors.push(`Product & Props: ${missingProps.join(', ')}.`);
  if (missingOther.length) anchors.push(`Reference Media: ${missingOther.join(', ')}.`);

  if (anchors.length) {
    prompt = `${anchors.join(' ')}\n\n${prompt}`.trim();
  }
  return prompt;
}

/**
 * Converts a deliverable (+ optional product & brand context + thread media) into a
 * Seedance 2.5 Omni Canvas blueprint (Props / Characters folders + @mentions + nodes).
 */
export function buildCanvasSeedPayload({ deliverable, brandKit = null, products = [], extraFolders = [] }) {
  const script = deliverable.script_json || {};
  const basePrompt =
    script.visualPrompt ||
    script.visual_prompt ||
    [
      `GLOBAL STYLE: Imperfection First ${deliverable.format || 'vertical 9:16 handheld smartphone UGC video'} for ${brandKit?.brandName || 'brand'} — candid selfie/eye-level framing, subtle handheld micro-shake, natural daylight from a side window, authentic visible skin texture, lived-in everyday environment.`,
      deliverable.angle ? `CREATIVE ANGLE: ${deliverable.angle}.` : '',
      deliverable.hook ? `SHOT 1 (0–2.5s · Hook): Handheld smartphone medium close-up, casual natural expression, spoken naturally: {${deliverable.hook}}` : '',
      script.body || script.voiceover ? `SHOT 2 (2.5–5.5s · Problem/Solution & Product Demo): Continuous natural movement demonstrating the product physically toward the phone camera. ${script.body || script.voiceover}` : '',
      deliverable.cta ? `SHOT 3 (5.5–8s · Natural CTA): Relaxed eye contact with product held clearly upright facing the lens: {${deliverable.cta}}` : '',
      brandKit?.tone ? `TONE: ${brandKit.tone}.` : '',
      'NEGATIVE / AVOID: studio lighting, softbox beauty light, ring-light reflections, stock photo aesthetic, over-polished airbrushed plastic skin, stiff commercial ad pose, on-screen text overlays, subtitles, watermarks.',
    ]
      .filter(Boolean)
      .join('\n');

  const briefNote = [
    `CAMPAIGN: ${deliverable.campaign_title || 'Marketing Campaign'} (Day ${deliverable.day_index})`,
    `PLATFORM: ${(deliverable.platform || 'tiktok').toUpperCase()} · FORMAT: ${deliverable.format}`,
    deliverable.hook ? `\nHOOK (0–3s):\n${deliverable.hook}` : '',
    deliverable.angle ? `\nANGLE:\n${deliverable.angle}` : '',
    deliverable.cta ? `\nCTA:\n${deliverable.cta}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const avatarFolders = collectBrandAvatarSeedFolders(brandKit);
  const productFolders = collectProductSeedFolders(products, brandKit);
  const folders = [...avatarFolders, ...productFolders, ...(Array.isArray(extraFolders) ? extraFolders : [])].slice(0, 6);
  const visualPrompt = weaveMentionsIntoPrompt(basePrompt, folders);
  const productImages = productFolders.map((f) => ({ name: f.name, url: f.assets[0]?.url || '' })).filter((p) => p.url);

  return {
    projectName: `Day ${deliverable.day_index} · ${deliverable.title}`.slice(0, 120),
    deliverableId: deliverable.id,
    campaignId: deliverable.campaign_id,
    briefNote,
    visualPrompt,
    modelId: 'seedance-2.5',
    aspectRatio: deliverable.platform === 'youtube' ? '16:9' : '9:16',
    duration: '8s',
    resolution: '720p',
    enableAudio: true,
    folders,
    productImages: productImages.slice(0, 2),
  };
}

/**
 * Converts a chat Approval Card (Video / Keyframe / Voiceover / Music) + workspace products
 * into a Seedance 2.5 Omni Canvas blueprint with Props/Characters folders and @mentions wired.
 */
export function buildApprovalCanvasSeedPayload({ approval, brandKit = null, products = [], relatedApprovals = [] }) {
  const payload = approval?.payload_json || {};
  const result = approval?.result_json || {};
  const productFolders = collectProductSeedFolders(products, brandKit);
  const extraFolders = [];

  const isUgcLike = /\b(ugc|creator|talent|testimonial|review|talking|selfie|orang|pria|wanita|cewek|cowok|influencer)\b/i.test(
    `${approval?.title || ''} ${approval?.description || ''} ${payload.prompt || ''}`,
  );

  // Collect completed media from this approval + sibling approvals in the same thread
  const allMediaApprovals = [approval, ...(Array.isArray(relatedApprovals) ? relatedApprovals : [])].filter(Boolean);
  const seenAssetUrls = new Set();
  let characterFolder = null;

  for (const item of allMediaApprovals) {
    const r = item?.result_json || {};

    // Unpack Pre-Production Scene Kit (Avatar + Location A/B/C + Product Sub-Props A/B/C + Extra Props)
    if (r.mediaType === 'scene_kit') {
      if (r.avatar?.url && !seenAssetUrls.has(r.avatar.url)) {
        seenAssetUrls.add(r.avatar.url);
        const avName = r.avatar.name || 'Creator';
        const avAsset = {
          url: r.avatar.url,
          mediaType: 'image',
          filename: `${canvasTagFromName(avName)}.png`,
          workspaceAssetId: r.avatar.assetId || extractWorkspaceAssetId(r.avatar.url),
        };
        if (!characterFolder) {
          characterFolder = {
            name: avName,
            tag: canvasTagFromName(avName),
            type: 'character',
            description: r.avatar.description || `UGC Avatar: ${avName}`,
            assets: [avAsset],
          };
          extraFolders.push(characterFolder);
        } else {
          characterFolder.assets.push(avAsset);
        }
      }
      if (r.location && Array.isArray(r.location.assets) && r.location.assets.length) {
        const locName = r.location.name || 'Location';
        const locAssets = [];
        for (const a of r.location.assets) {
          const u = String(a?.url || '').trim();
          if (!u || seenAssetUrls.has(u)) continue;
          seenAssetUrls.add(u);
          locAssets.push({
            url: u,
            mediaType: 'image',
            filename: `${canvasTagFromName(a.label || locName)}.png`,
            workspaceAssetId: a.assetId || extractWorkspaceAssetId(u),
          });
        }
        if (locAssets.length) {
          extraFolders.push({
            name: locName,
            tag: canvasTagFromName(locName),
            type: 'location',
            description: r.location.description || `Background angles: ${locName}`,
            assets: locAssets,
          });
        }
      }
      if (r.productSubProps && Array.isArray(r.productSubProps.assets) && r.productSubProps.assets.length) {
        const subName = String(r.productSubProps.productName || '').trim();
        const subAssets = [];
        for (const a of r.productSubProps.assets) {
          const u = String(a?.url || '').trim();
          if (!u || seenAssetUrls.has(u)) continue;
          seenAssetUrls.add(u);
          subAssets.push({
            url: u,
            mediaType: 'image',
            filename: `${canvasTagFromName(a.label || subName || 'sub-prop')}.png`,
            workspaceAssetId: a.assetId || extractWorkspaceAssetId(u),
          });
        }
        if (subAssets.length) {
          // Merge directly into the matching Hero Product folder (so Prop A=original, B=opened, C=scooped share ONE @Product mention!)
          const targetProductFolder =
            productFolders.find((pf) => subName && (pf.name.toLowerCase().includes(subName.toLowerCase()) || subName.toLowerCase().includes(pf.name.toLowerCase()))) ||
            productFolders[0];
          if (targetProductFolder) {
            targetProductFolder.assets = [...targetProductFolder.assets, ...subAssets].slice(0, 6);
          } else {
            const pName = subName || 'Hero Product';
            extraFolders.push({
              name: pName,
              tag: canvasTagFromName(pName),
              type: 'prop',
              description: `Product & sub-props: ${pName}`,
              assets: subAssets,
            });
          }
        }
      }
      if (Array.isArray(r.extraProps)) {
        for (const ep of r.extraProps) {
          const u = String(ep?.url || '').trim();
          const epName = String(ep?.name || '').trim();
          if (!u || !epName || seenAssetUrls.has(u)) continue;
          seenAssetUrls.add(u);
          extraFolders.push({
            name: epName,
            tag: canvasTagFromName(epName),
            type: 'prop',
            description: ep.description || `Prop: ${epName}`,
            assets: [
              {
                url: u,
                mediaType: 'image',
                filename: `${canvasTagFromName(epName)}.png`,
                workspaceAssetId: ep.assetId || extractWorkspaceAssetId(u),
              },
            ],
          });
        }
      }
      continue;
    }

    const url = String(r.url || '').trim();
    if (!url || seenAssetUrls.has(url)) continue;
    seenAssetUrls.add(url);

    if (r.mediaType === 'image' || r.mediaType === 'avatar') {
      const folderType = r.mediaType === 'avatar' || isUgcLike ? 'character' : 'general';
      const folderName = r.mediaType === 'avatar' && r.name ? r.name : isUgcLike ? 'Creator' : 'Hero Keyframe';
      const assetObj = {
        url,
        mediaType: 'image',
        filename: `${canvasTagFromName(folderName)}.png`,
        workspaceAssetId: r.assetId || extractWorkspaceAssetId(url),
      };
      if (folderType === 'character' && !characterFolder) {
        characterFolder = {
          name: folderName,
          tag: canvasTagFromName(folderName),
          type: 'character',
          description: r.description || item.title || 'UGC Creator / Talent',
          assets: [assetObj],
        };
        extraFolders.push(characterFolder);
      } else {
        extraFolders.push({
          name: folderName,
          tag: canvasTagFromName(folderName),
          type: folderType,
          description: r.description || item.title || 'Generated Keyframe',
          assets: [assetObj],
        });
      }
    } else if (r.mediaType === 'audio' && r.subtype === 'voiceover') {
      const assetObj = {
        url,
        mediaType: 'audio',
        filename: 'creator-voice.mp3',
        workspaceAssetId: r.assetId || extractWorkspaceAssetId(url),
      };
      if (characterFolder) {
        characterFolder.assets.push(assetObj);
      } else {
        characterFolder = {
          name: r.voiceName ? `${r.voiceName} Voice` : 'Creator Voice',
          tag: canvasTagFromName(r.voiceName ? `${r.voiceName} Voice` : 'Creator Voice'),
          type: 'character',
          description: 'ElevenLabs Voiceover for Seedance 2.5 Omni voice matching',
          assets: [assetObj],
        };
        extraFolders.push(characterFolder);
      }
    } else if (r.mediaType === 'audio' && r.subtype === 'music') {
      extraFolders.push({
        name: 'Ad Music',
        tag: 'Ad-Music',
        type: 'general',
        description: 'ElevenLabs Background Music',
        assets: [
          {
            url,
            mediaType: 'audio',
            filename: 'ad-music.mp3',
            workspaceAssetId: r.assetId || extractWorkspaceAssetId(url),
          },
        ],
      });
    } else if (r.mediaType === 'video') {
      extraFolders.push({
        name: 'Rendered Clip',
        tag: 'Rendered-Clip',
        type: 'general',
        description: item.title || 'Rendered Video Clip for Seedance 2.5 Omni',
        assets: [
          {
            url,
            mediaType: 'video',
            filename: r.filename || 'rendered-clip.mp4',
            workspaceAssetId: r.assetId || extractWorkspaceAssetId(url),
          },
        ],
      });
    }
  }

  const savedAvatarFolders = characterFolder ? [] : collectBrandAvatarSeedFolders(brandKit);
  const folders = [...savedAvatarFolders, ...extraFolders, ...productFolders].slice(0, 8);
  const rawPrompt =
    String(payload.prompt || result.prompt || '').trim() ||
    String(payload.text || '').trim() ||
    `${approval?.title || 'Ad Video'} for ${brandKit?.brandName || 'brand'}.`;
  const visualPrompt = weaveMentionsIntoPrompt(rawPrompt, folders);
  const durNum = Math.min(Math.max(Math.round(Number(result.duration || payload.duration || payload.durationSeconds || 8)), 4), 30);

  return {
    projectName: String(approval?.title || 'AI Marketing Ad').slice(0, 120),
    approvalId: approval?.id || null,
    briefNote: [
      `SOURCE: AI Creative Marketing (${approval?.action_type || 'production'})`,
      `TITLE: ${approval?.title || 'Creative Production'}`,
      approval?.description ? `\nBRIEF:\n${approval.description}` : '',
      brandKit?.brandName ? `\nBRAND: ${brandKit.brandName}` : '',
      `\nMODEL: Seedance 2.5 Omni (Props & Characters auto-inserted with @mentions)`,
    ]
      .filter(Boolean)
      .join('\n'),
    visualPrompt,
    modelId: 'seedance-2.5',
    aspectRatio: result.aspectRatio || payload.aspectRatio || '9:16',
    duration: `${durNum}s`,
    resolution: result.resolution || payload.resolution || '720p',
    enableAudio: result.generateAudio !== false && payload.generateAudio !== false,
    renderedVideoUrl: result.mediaType === 'video' ? result.url || null : null,
    folders,
    productImages: productFolders.map((f) => ({ name: f.name, url: f.assets[0]?.url || '' })).filter((p) => p.url),
  };
}
