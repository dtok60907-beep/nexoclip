// Execution engine for AI Creative Marketing:
// - Marketing Routines CRUD
// - Human-in-the-Loop Approval Cards CRUD + Real Execution (Keyframe Image, ElevenLabs VO/Music, Meta Paused Campaign, Video)
// - Ad Agent -> My Brand direct updates (with automatic History entry)
// - Real Ad Account Performance Diagnostics (Meta Ads Insights & TikTok stats)
import { randomUUID } from 'node:crypto';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { getPool } from '../db/pool.js';
import { appendCreditEntry } from './creditService.js';
import { createStorage, importWorkspaceAsset } from './assetService.js';
import {
  ELEVENLABS_VOICES,
  MUSIC_MODEL,
  VOICEOVER_MODEL,
  audioCredits,
  generateElevenLabsAudio,
  validateAudioInput,
} from './elevenlabsAudio.js';
import { createProviderRouter } from '../providers/providerRouter.js';
import { getWorkspaceBrandKit, saveWorkspaceBrandKit } from '../repositories/brandKitRepository.js';
import { buildBaseBrandKit, validateBrandKit } from './brandKitService.js';
import { createMetaPausedCampaign, readMetaAdInsights, readMetaCampaigns } from './metaService.mjs';
import { createImageGenerationJobWithReservation, getGenerationJob } from './generationService.js';
import { generationQueueName, recoverQueuedGenerations } from '../queue/generationQueue.js';
import { createBullMqGenerationQueue } from '../queue/bullmqGenerationQueue.js';
import { getThread, updateThread } from './marketingArtifactsService.js';

const DEFAULT_KEYFRAME_MODEL = process.env.MARKETING_IMAGE_MODEL || 'bytedance-seed/seedream-4.5';
const DEFAULT_AVATAR_MODEL = process.env.MARKETING_AVATAR_MODEL || 'google/gemini-3-pro-image'; // Same model as AI Influencer Studio (nano-banana-pro)
const DEFAULT_KEYFRAME_CREDITS = 8;
const DEFAULT_VIDEO_ESTIMATED_CREDITS = 25;

const IMAGE_MODEL_ALIASES = {
  'nano-banana-pro': 'google/gemini-3-pro-image',
  'nano-banana-2': 'google/gemini-3.1-flash-image',
  'nano-banana': 'google/gemini-2.5-flash-image',
  'seedream-4.5': 'bytedance-seed/seedream-4.5',
  'seedream-5.0-pro': 'bytedance-seed/seedream-5-0-pro',
};

function resolveImageModelId(model, fallback = DEFAULT_KEYFRAME_MODEL) {
  const key = String(model || fallback).trim();
  return IMAGE_MODEL_ALIASES[key] || key;
}

const VIDEO_MODEL_SPECS = {
  'seedance-2.5': {
    id: 'seedance-2.5',
    label: 'Seedance 2.5',
    model: 'bytedance/seedance-2.5',
    minDuration: 4,
    maxDuration: 30,
    defaultDuration: 8,
    resolutions: ['480p', '720p', '1080p'],
    defaultResolution: '720p',
    supportsAudio: true,
    isSeedance25: true,
  },
  'seedance-2.0-pro': {
    id: 'seedance-2.0-pro',
    label: 'Seedance 2.0',
    model: 'bytedance/seedance-2.0',
    minDuration: 4,
    maxDuration: 15,
    defaultDuration: 8,
    resolutions: ['480p', '720p', '1080p'],
    defaultResolution: '720p',
    supportsAudio: true,
  },
  'seedance-2.0': {
    id: 'seedance-2.0',
    label: 'Seedance 2.0',
    model: 'bytedance/seedance-2.0',
    minDuration: 4,
    maxDuration: 15,
    defaultDuration: 8,
    resolutions: ['480p', '720p', '1080p'],
    defaultResolution: '720p',
    supportsAudio: true,
  },
  'kling-3.0-pro': {
    id: 'kling-3.0-pro',
    label: 'Kling 3.0 Pro',
    model: 'kwaivgi/kling-v3.0-pro',
    minDuration: 3,
    maxDuration: 15,
    defaultDuration: 5,
    resolutions: null,
    defaultResolution: null,
    supportsAudio: true,
  },
  'veo-3': {
    id: 'veo-3',
    label: 'Veo 3.1 Fast',
    model: 'google/veo-3.1-fast',
    minDuration: 8,
    maxDuration: 8,
    defaultDuration: 8,
    resolutions: ['720p', '1080p'],
    defaultResolution: '1080p',
    supportsAudio: true,
  },
  'veo-3.1': {
    id: 'veo-3.1',
    label: 'Veo 3.1',
    model: 'google/veo-3.1',
    minDuration: 8,
    maxDuration: 8,
    defaultDuration: 8,
    resolutions: ['1080p'],
    defaultResolution: '1080p',
    supportsAudio: true,
  },
  'wan-2.6': {
    id: 'wan-2.6',
    label: 'Wan 3.0',
    model: 'w3.0-video',
    minDuration: 2,
    maxDuration: 15,
    defaultDuration: 5,
    resolutions: ['480p', '720p', '1080p'],
    defaultResolution: '720p',
    supportsAudio: false,
  },
  'wan-3.0': {
    id: 'wan-3.0',
    label: 'Wan 3.0',
    model: 'w3.0-video',
    minDuration: 2,
    maxDuration: 15,
    defaultDuration: 5,
    resolutions: ['480p', '720p', '1080p'],
    defaultResolution: '720p',
    supportsAudio: false,
  },
};

const VALID_VIDEO_RATIOS = new Set(['9:16', '16:9', '1:1', '4:5', '3:4', 'adaptive']);
const TENANT_ASSET_URL_RE = /^\/api\/assets\/[^/]+\/download(?:\?|$)/;

export function resolveMarketingVideoSpec({
  videoModel = 'seedance-2.5',
  duration,
  durationSeconds,
  aspectRatio = '9:16',
  resolution,
  generateAudio = true,
  firstFrameUrl = '',
  referenceImages = [],
} = {}) {
  const key = String(videoModel || 'seedance-2.5').trim().toLowerCase();
  const spec =
    VIDEO_MODEL_SPECS[key] ||
    Object.values(VIDEO_MODEL_SPECS).find((s) => s.model.toLowerCase() === key) ||
    VIDEO_MODEL_SPECS['seedance-2.5'];

  const rawDur = Number(duration ?? durationSeconds);
  const clampedDur =
    Number.isFinite(rawDur) && rawDur > 0
      ? Math.min(Math.max(Math.round(rawDur), spec.minDuration), spec.maxDuration)
      : spec.defaultDuration;

  const cleanRatio = VALID_VIDEO_RATIOS.has(String(aspectRatio || '').trim())
    ? String(aspectRatio).trim()
    : '9:16';

  const parameters = {
    aspectRatio: cleanRatio,
    duration: clampedDur,
  };

  if (spec.resolutions) {
    const reqRes = String(resolution || '').toLowerCase();
    parameters.resolution = spec.resolutions.includes(reqRes) ? reqRes : spec.defaultResolution;
  }
  if (spec.supportsAudio) {
    parameters.generateAudio = generateAudio !== false;
  }

  const cleanFirstFrame = typeof firstFrameUrl === 'string' && TENANT_ASSET_URL_RE.test(firstFrameUrl.trim())
    ? firstFrameUrl.trim()
    : '';
  const cleanRefs = Array.isArray(referenceImages)
    ? referenceImages
        .map((u) => (typeof u === 'string' ? u.trim() : ''))
        .filter((u) => TENANT_ASSET_URL_RE.test(u) && u !== cleanFirstFrame)
        .slice(0, 6)
    : [];

  if (cleanFirstFrame && cleanRefs.length === 0) {
    parameters.frameImages = [{ url: cleanFirstFrame, frameType: 'first_frame' }];
    if (spec.isSeedance25) parameters.aspectRatio = 'adaptive';
  } else if (cleanRefs.length > 0 || cleanFirstFrame) {
    parameters.referenceImages = [cleanFirstFrame, ...cleanRefs].filter(Boolean);
  }

  return {
    id: spec.id,
    label: spec.label,
    model: spec.model,
    parameters,
  };
}

async function publishVideoGenerationJob({ pool, env = process.env }) {
  if (!env.REDIS_URL) return false;
  const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const queue = createBullMqGenerationQueue({
    Queue,
    Worker,
    connection,
    queueName: generationQueueName('video'),
  });
  try {
    await recoverQueuedGenerations({ pool, queue, kind: 'video' });
    return true;
  } finally {
    await queue.close();
    await connection.quit();
  }
}

const WORKSPACE_ASSET_UUID_RE = /^\/api\/assets\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/download(?:\?|$)/i;

/**
 * Ensures every image asset in Canvas seed folders has a canonical tenant workspace asset URL
 * (`/api/assets/<uuid>/download`) and `workspaceAssetId` so Seedance 2.5 Omni @mentions work
 * out-of-the-box even for external product photos scraped from My Brand.
 */
export async function materializeCanvasSeedFolders({
  workspaceId,
  folders = [],
  db = getPool(),
  fetchImpl = fetch,
}) {
  if (!Array.isArray(folders) || !folders.length) return [];
  const storage = createStorage();
  const out = [];

  for (const folder of folders) {
    const assets = [];
    for (const asset of folder.assets || []) {
      const rawUrl = String(asset?.url || '').trim();
      if (!rawUrl) continue;
      const existingMatch = rawUrl.match(WORKSPACE_ASSET_UUID_RE);
      if (existingMatch) {
        const wsAssetId = asset.workspaceAssetId || existingMatch[1];
        assets.push({
          ...asset,
          url: `/api/assets/${wsAssetId}/download`,
          workspaceAssetId: wsAssetId,
        });
        continue;
      }

      if (/^https?:\/\//i.test(rawUrl) && (asset.mediaType || 'image') === 'image') {
        try {
          const res = await fetchImpl(rawUrl, {
            redirect: 'follow',
            signal: AbortSignal.timeout(8000),
          });
          const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
          if (res.ok && ct.startsWith('image/')) {
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length > 0 && buf.length <= 8 * 1024 * 1024) {
              const ext = ct.includes('webp') ? 'webp' : ct.includes('jpeg') || ct.includes('jpg') ? 'jpg' : 'png';
              const filename = (asset.filename || `${folder.tag || 'prop'}.${ext}`).replace(/\.[^.]+$/, `.${ext}`);
              const imported = await importWorkspaceAsset(
                workspaceId,
                { filename, contentType: ct, body: buf },
                storage,
                db,
              );
              assets.push({
                ...asset,
                url: `/api/assets/${imported.asset.id}/download`,
                workspaceAssetId: imported.asset.id,
              });
              continue;
            }
          }
        } catch {
          // Fall back gracefully to raw URL if remote host is unreachable
        }
      }
      assets.push(asset);
    }
    if (assets.length > 0) {
      out.push({ ...folder, assets });
    }
  }
  return out;
}

export async function syncApprovalIntoThreadMessages({ workspaceId, approval, db = getPool() }) {
  if (!approval?.thread_id) return;
  try {
    const thread = await getThread(workspaceId, approval.thread_id, { db });
    if (!thread || !Array.isArray(thread.messages_json)) return;
    let changed = false;
    const nextMessages = thread.messages_json.map((msg) => {
      if (!Array.isArray(msg?.approvalRefs)) return msg;
      let msgChanged = false;
      const updatedRefs = msg.approvalRefs.map((ref) => {
        if (ref?.id === approval.id) {
          msgChanged = true;
          changed = true;
          return approval;
        }
        return ref;
      });
      return msgChanged ? { ...msg, approvalRefs: updatedRefs } : msg;
    });
    if (changed) {
      await updateThread(workspaceId, thread.id, { messages: nextMessages }, { db });
    }
  } catch {
    // non-blocking thread sync
  }
}

function mp3Seconds(bytes) {
  return Math.round(((bytes * 8) / 128000) * 100) / 100;
}

async function readCreditBalance(pool, workspaceId) {
  const result = await pool.query('SELECT balance FROM credit_accounts WHERE workspace_id = $1', [workspaceId]);
  return Number(result.rows[0]?.balance ?? 0);
}

async function chargeCreditsBestEffort(pool, { workspaceId, amount, reason, idempotencyKey, metadata }) {
  const credits = Math.max(0, Math.round(Number(amount) || 0));
  if (!credits) return 0;
  try {
    await appendCreditEntry(pool, { workspaceId, amount: -credits, reason, idempotencyKey, metadata });
    return credits;
  } catch (error) {
    if (error?.message !== 'Insufficient credits') throw error;
    const balance = await readCreditBalance(pool, workspaceId);
    const partial = Math.max(0, Math.floor(balance));
    if (partial > 0) {
      await appendCreditEntry(pool, {
        workspaceId,
        amount: -partial,
        reason,
        idempotencyKey,
        metadata: { ...metadata, partial: true, quotedCredits: credits },
      });
    }
    return partial;
  }
}

// ---------- ROUTINES ----------

export async function listRoutines(workspaceId, { db = getPool() } = {}) {
  const res = await db.query(
    `SELECT * FROM marketing_routines WHERE workspace_id = $1 ORDER BY enabled DESC, updated_at DESC LIMIT 40`,
    [workspaceId],
  );
  return res.rows;
}

export async function createRoutine({
  workspaceId,
  ownerId,
  title,
  prompt,
  cadence = 'weekly',
  scheduleLabel = 'Every Monday · 09:00',
  requireApproval = true,
  db = getPool(),
}) {
  const cleanTitle = String(title || '').trim().slice(0, 140);
  const cleanPrompt = String(prompt || '').trim().slice(0, 2000);
  if (!cleanTitle || !cleanPrompt) {
    throw Object.assign(new Error('Judul dan instruksi routine wajib diisi.'), { status: 400 });
  }
  const cleanCadence = ['daily', 'weekdays', 'weekly', 'manual'].includes(cadence) ? cadence : 'weekly';
  const cleanSchedule = String(scheduleLabel || 'Every Monday · 09:00').trim().slice(0, 80);
  const res = await db.query(
    `INSERT INTO marketing_routines (workspace_id, owner_id, title, prompt, cadence, schedule_label, require_approval)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [workspaceId, ownerId, cleanTitle, cleanPrompt, cleanCadence, cleanSchedule, Boolean(requireApproval)],
  );
  return res.rows[0];
}

export async function updateRoutine(workspaceId, routineId, patch = {}, { db = getPool() } = {}) {
  const sets = ['updated_at = now()'];
  const params = [workspaceId, routineId];
  const push = (col, val) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  };
  if (typeof patch.title === 'string' && patch.title.trim()) push('title', patch.title.trim().slice(0, 140));
  if (typeof patch.prompt === 'string' && patch.prompt.trim()) push('prompt', patch.prompt.trim().slice(0, 2000));
  if (['daily', 'weekdays', 'weekly', 'manual'].includes(patch.cadence)) push('cadence', patch.cadence);
  if (typeof patch.scheduleLabel === 'string' && patch.scheduleLabel.trim()) push('schedule_label', patch.scheduleLabel.trim().slice(0, 80));
  if (typeof patch.requireApproval === 'boolean') push('require_approval', patch.requireApproval);
  if (typeof patch.enabled === 'boolean') push('enabled', patch.enabled);
  if (['idle', 'running', 'succeeded', 'failed'].includes(patch.lastStatus)) push('last_status', patch.lastStatus);
  if (patch.lastRunAt) push('last_run_at', patch.lastRunAt);
  if (patch.lastThreadId) push('last_thread_id', patch.lastThreadId);

  const res = await db.query(
    `UPDATE marketing_routines SET ${sets.join(', ')} WHERE workspace_id = $1 AND id = $2 RETURNING *`,
    params,
  );
  return res.rows[0] || null;
}

export async function deleteRoutine(workspaceId, routineId, { db = getPool() } = {}) {
  const res = await db.query(
    `DELETE FROM marketing_routines WHERE workspace_id = $1 AND id = $2 RETURNING id`,
    [workspaceId, routineId],
  );
  return Boolean(res.rows[0]);
}

// ---------- APPROVAL CARDS ----------

export async function listApprovals(workspaceId, { threadId = null, limit = 30, db = getPool() } = {}) {
  const params = [workspaceId];
  let where = 'workspace_id = $1';
  if (threadId) {
    params.push(threadId);
    where += ` AND thread_id = $${params.length}`;
  }
  params.push(Math.min(Math.max(Number(limit) || 30, 1), 100));
  const res = await db.query(
    `SELECT * FROM marketing_approvals WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
    params,
  );
  return res.rows;
}

export async function createApproval({
  workspaceId,
  threadId = null,
  ownerId,
  actionType,
  title,
  description = '',
  estimatedCredits = 0,
  payload = {},
  db = getPool(),
}) {
  const ALLOWED = new Set([
    'generate_keyframe',
    'generate_voiceover',
    'generate_music',
    'generate_video',
    'launch_meta_campaign',
    'update_brand',
  ]);
  if (!ALLOWED.has(actionType)) {
    throw Object.assign(new Error(`Tipe approval tidak dikenal: ${actionType}`), { status: 400 });
  }
  const cleanTitle = String(title || 'Confirm Production Action').trim().slice(0, 160);
  const cleanDesc = String(description || '').trim().slice(0, 1000);
  const est = Math.max(0, Math.round(Number(estimatedCredits) || 0));
  const res = await db.query(
    `INSERT INTO marketing_approvals (workspace_id, thread_id, owner_id, action_type, title, description, estimated_credits, payload_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     RETURNING *`,
    [workspaceId, threadId, ownerId, actionType, cleanTitle, cleanDesc, est, JSON.stringify(payload || {})],
  );
  return res.rows[0];
}

// ---------- REAL MEDIA EXECUTION HELPERS ----------

export async function executeGenerateVoiceover({
  workspaceId,
  userId,
  text,
  voiceId,
  targetSeconds = null,
  db = getPool(),
  env = process.env,
}) {
  const selectedVoice =
    ELEVENLABS_VOICES.find((v) => v.id === voiceId || v.name.toLowerCase() === String(voiceId || '').toLowerCase()) ||
    ELEVENLABS_VOICES[3]; // Liam (energetic) or default
  const audio = validateAudioInput({ type: 'voiceover', voiceId: selectedVoice.id, text });
  const { usd, credits } = await audioCredits(audio, { env });
  const balance = await readCreditBalance(db, workspaceId);
  if (balance < credits) {
    throw Object.assign(new Error(`Kredit workspace tidak cukup (butuh ${credits} kredit, saldo ${balance}).`), { status: 402 });
  }

  const file = await generateElevenLabsAudio(audio, { env });
  const slug = selectedVoice.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const imported = await importWorkspaceAsset(
    workspaceId,
    {
      filename: `ad-vo-${slug}-${Date.now()}.mp3`,
      contentType: file.contentType || 'audio/mpeg',
      body: file.body,
      allowAudio: true,
    },
    createStorage(),
    db,
  );
  const charged = await chargeCreditsBestEffort(db, {
    workspaceId,
    amount: credits,
    reason: 'marketing_voiceover',
    idempotencyKey: `mkt-vo:${randomUUID()}`,
    metadata: { model: `elevenlabs/${VOICEOVER_MODEL}`, voiceId: selectedVoice.id, assetId: imported.asset.id, providerCostUsd: usd, userId },
  });

  const seconds = mp3Seconds(file.body.length);
  const wordCount = audio.text.split(/\s+/).filter(Boolean).length;
  const hasDigits = /\d/.test(audio.text);
  let speechCheckNote = `Durasi ${seconds}s (${wordCount} kata) — tempo pas untuk iklan singkat.`;
  if (targetSeconds && seconds > Number(targetSeconds) + 2) {
    speechCheckNote = `Durasi ${seconds}s melebihi target ${targetSeconds}s — disarankan pangkas ${Math.ceil((seconds - targetSeconds) * 2.3)} kata.`;
  } else if (hasDigits) {
    speechCheckNote = `Durasi ${seconds}s (${wordCount} kata) — cek pelafalan angka agar natural.`;
  }

  return {
    mediaType: 'audio',
    subtype: 'voiceover',
    assetId: imported.asset.id,
    url: imported.url,
    voiceName: selectedVoice.name,
    seconds,
    creditsCharged: charged,
    speechCheckNote,
  };
}

export async function executeGenerateMusic({
  workspaceId,
  userId,
  prompt,
  durationSeconds = 25,
  db = getPool(),
  env = process.env,
}) {
  const seconds = Math.min(Math.max(Math.round(Number(durationSeconds) || 25), 10), 60);
  const audio = validateAudioInput({ type: 'music', text: prompt, durationSeconds: seconds, instrumental: true });
  const { usd, credits } = await audioCredits(audio, { env });
  const balance = await readCreditBalance(db, workspaceId);
  if (balance < credits) {
    throw Object.assign(new Error(`Kredit workspace tidak cukup (butuh ${credits} kredit, saldo ${balance}).`), { status: 402 });
  }

  const file = await generateElevenLabsAudio(audio, { env });
  const imported = await importWorkspaceAsset(
    workspaceId,
    {
      filename: `ad-music-${Date.now()}.mp3`,
      contentType: file.contentType || 'audio/mpeg',
      body: file.body,
      allowAudio: true,
    },
    createStorage(),
    db,
  );
  const charged = await chargeCreditsBestEffort(db, {
    workspaceId,
    amount: credits,
    reason: 'marketing_music',
    idempotencyKey: `mkt-music:${randomUUID()}`,
    metadata: { model: `elevenlabs/${MUSIC_MODEL}`, durationSeconds: seconds, assetId: imported.asset.id, providerCostUsd: usd, userId },
  });

  return {
    mediaType: 'audio',
    subtype: 'music',
    assetId: imported.asset.id,
    url: imported.url,
    seconds: mp3Seconds(file.body.length) || seconds,
    creditsCharged: charged,
    prompt,
  };
}

async function downloadImagePayload(output) {
  const url = typeof output === 'string' ? output : output?.url;
  if (!url) throw new Error('Provider tidak mengembalikan gambar.');
  if (url.startsWith('data:')) {
    const m = url.match(/^data:([^;,]+)?;base64,(.+)$/);
    if (!m) throw new Error('Data URL gambar tidak valid.');
    return { body: Buffer.from(m[2], 'base64'), contentType: m[1] || 'image/png' };
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gagal mengunduh gambar (${res.status}).`);
  return {
    body: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get('content-type') || 'image/png',
  };
}

export async function executeGenerateKeyframe({
  workspaceId,
  userId,
  prompt,
  aspectRatio = '9:16',
  model = DEFAULT_KEYFRAME_MODEL,
  referenceImages = [],
  db = getPool(),
}) {
  const balance = await readCreditBalance(db, workspaceId);
  if (balance < DEFAULT_KEYFRAME_CREDITS) {
    throw Object.assign(
      new Error(`Kredit workspace tidak cukup (butuh ${DEFAULT_KEYFRAME_CREDITS} kredit, saldo ${balance}).`),
      { status: 402 },
    );
  }
  const router = createProviderRouter();
  const cleanRefs = Array.isArray(referenceImages)
    ? referenceImages.filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u)).slice(0, 4)
    : [];
  const resolvedModel = resolveImageModelId(model, DEFAULT_KEYFRAME_MODEL);
  const result = await router.generateImage({
    model: resolvedModel,
    prompt: String(prompt || '').trim(),
    aspectRatio: ['9:16', '1:1', '4:5', '16:9', '3:4'].includes(aspectRatio) ? aspectRatio : '9:16',
    ...(cleanRefs.length ? { referenceImages: cleanRefs } : {}),
  });
  const first = result?.outputs?.[0];
  const { body, contentType } = await downloadImagePayload(first);
  const imported = await importWorkspaceAsset(
    workspaceId,
    {
      filename: `ad-keyframe-${Date.now()}.png`,
      contentType,
      body,
    },
    createStorage(),
    db,
  );
  const charged = await chargeCreditsBestEffort(db, {
    workspaceId,
    amount: DEFAULT_KEYFRAME_CREDITS,
    reason: 'marketing_keyframe',
    idempotencyKey: `mkt-kf:${randomUUID()}`,
    metadata: { model, aspectRatio, assetId: imported.asset.id, userId },
  });

  return {
    mediaType: 'image',
    subtype: 'keyframe',
    assetId: imported.asset.id,
    url: imported.url,
    model,
    aspectRatio,
    creditsCharged: charged,
  };
}

/**
 * Builds an "Imperfection First" candid smartphone UGC portrait prompt
 * (anti-studio, anti-stock-photo, natural skin pores, lived-in Indonesian setting)
 * suitable for Seedream generation AND Seedance 2.5 Omni Character reference consistency.
 */
export function buildImperfectionFirstAvatarPrompt({
  name = 'UGC Creator',
  appearance = '',
  wardrobe = '',
  setting = '',
  lighting = '',
  rawPrompt = '',
} = {}) {
  const custom = String(rawPrompt || '').trim();
  const baseDetails = [
    custom || `Candid smartphone selfie-style portrait of an ordinary, relatable Indonesian person (${appearance || 'mid-20s, natural dark hair, friendly understated expression, subtle everyday features, NOT a glamorous model'}).`,
    wardrobe ? `Wardrobe: ${wardrobe}.` : 'Wardrobe: casual everyday cotton t-shirt or lived-in homewear.',
    setting ? `Setting: ${setting}.` : 'Setting: lived-in modern Indonesian bedroom or cozy apartment corner with natural background clutter slightly out of focus.',
    lighting ? `Lighting: ${lighting}.` : 'Lighting: soft natural daylight from a side window, slightly uneven realistic indoor shadows.',
    'Camera & Realism (Imperfection First): Shot on iPhone front camera at eye-level arm\'s length, head-and-shoulders to chest framing, natural skin texture with visible pores, slight stray hairs, authentic phone dynamic range and light grain, natural direct eye contact with a relaxed half-smile.',
    'STRICTLY AVOID: studio lighting, softbox beauty light, stock photo look, over-polished airbrushed plastic skin, heavy makeup, glamorous fashion pose, cinematic teal-orange grading, ring-light eye reflections, text, logos, watermarks.',
  ];
  return baseDetails.filter(Boolean).join(' ');
}

export async function executeGenerateBrandAvatar({
  workspaceId,
  userId,
  name = 'Brand Creator',
  description = '',
  appearance = '',
  wardrobe = '',
  voiceStyle = '',
  lighting = '',
  setting = '',
  prompt = '',
  aspectRatio = '3:4',
  model = DEFAULT_AVATAR_MODEL,
  db = getPool(),
  deps = {},
}) {
  const cleanName = String(name || 'Brand Creator').trim().slice(0, 100);
  const avatarPrompt = buildImperfectionFirstAvatarPrompt({
    name: cleanName,
    appearance: appearance || description,
    wardrobe,
    setting,
    lighting,
    rawPrompt: prompt,
  });

  const genKeyframe = deps.executeGenerateKeyframe || executeGenerateKeyframe;
  const resolvedAspect = ['3:4', '9:16', '1:1', '4:5'].includes(aspectRatio) ? aspectRatio : '3:4';
  const primaryModel = resolveImageModelId(model, DEFAULT_AVATAR_MODEL);
  let generated;
  try {
    generated = await genKeyframe({
      workspaceId,
      userId,
      prompt: avatarPrompt,
      aspectRatio: resolvedAspect,
      model: primaryModel,
      db,
    });
  } catch (err) {
    // Graceful fallback to Seedream if Nano Banana Pro / Google Gemini image endpoint is unavailable
    if (primaryModel !== DEFAULT_KEYFRAME_MODEL && !deps.executeGenerateKeyframe) {
      generated = await genKeyframe({
        workspaceId,
        userId,
        prompt: avatarPrompt,
        aspectRatio: resolvedAspect,
        model: DEFAULT_KEYFRAME_MODEL,
        db,
      });
    } else {
      throw err;
    }
  }

  const canonicalUrl = generated.assetId
    ? `/api/assets/${generated.assetId}/download?workspace_id=${encodeURIComponent(workspaceId)}`
    : generated.url;

  const fullDescription = [
    String(description || appearance || '').trim(),
    wardrobe ? `Wardrobe: ${wardrobe}` : '',
    voiceStyle ? `Gaya bicara: ${voiceStyle}` : '',
    lighting ? `Lighting: ${lighting}` : '',
    setting ? `Setting: ${setting}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 580);

  // Save directly into My Brand (brandKit.avatars + Ad Agent History entry)
  const loadBrand = deps.getWorkspaceBrandKit || getWorkspaceBrandKit;
  const saveBrand = deps.saveWorkspaceBrandKit || saveWorkspaceBrandKit;
  const existing = (await loadBrand(db, workspaceId)) || {};
  const currentAvatars = Array.isArray(existing.avatars) ? [...existing.avatars] : [];
  const existingIdx = currentAvatars.findIndex(
    (a) => String(a?.name || '').trim().toLowerCase() === cleanName.toLowerCase(),
  );
  const avatarEntry = {
    id: existingIdx >= 0 ? currentAvatars[existingIdx].id : `avatar-${Date.now()}`,
    name: cleanName,
    description: fullDescription || 'UGC Brand Creator (Imperfection First)',
    tag: 'UGC Avatar',
    imageUrl: canonicalUrl,
    assetId: generated.assetId || '',
    wardrobe: String(wardrobe || '').slice(0, 300),
    voiceStyle: String(voiceStyle || '').slice(0, 300),
    lighting: String(lighting || '').slice(0, 300),
    setting: String(setting || '').slice(0, 300),
  };
  if (existingIdx >= 0) currentAvatars[existingIdx] = avatarEntry;
  else currentAvatars.unshift(avatarEntry);

  const historyEntry = {
    id: `hist-avatar-${Date.now()}`,
    actorType: 'agent',
    actorName: 'Ad Agent',
    source: 'AI Marketing Chat',
    createdAt: new Date().toISOString(),
    pages: [
      {
        targetType: 'section',
        targetId: 'avatars',
        title: `Avatars · ${cleanName}`,
        summary: `Generated & saved UGC Avatar "${cleanName}" (Imperfection First) to My Brand`,
      },
    ],
  };

  const nextBrand = validateBrandKit({
    ...buildBaseBrandKit(existing),
    avatars: currentAvatars,
    history: [historyEntry, ...(Array.isArray(existing.history) ? existing.history : [])].slice(0, 50),
  });
  await saveBrand(db, { workspaceId, userId, data: nextBrand });

  return {
    mediaType: 'avatar',
    subtype: 'brand_avatar',
    engine: 'ai-influencer',
    modelLabel: (generated.model || primaryModel).includes('gemini-3-pro') ? 'AI Influencer (Nano Banana Pro)' : (generated.model || primaryModel),
    assetId: generated.assetId,
    url: canonicalUrl,
    name: cleanName,
    description: avatarEntry.description,
    wardrobe: avatarEntry.wardrobe,
    voiceStyle: avatarEntry.voiceStyle,
    lighting: avatarEntry.lighting,
    setting: avatarEntry.setting,
    savedToMyBrand: true,
    model: generated.model || primaryModel,
    aspectRatio: generated.aspectRatio || aspectRatio,
    creditsCharged: generated.creditsCharged || DEFAULT_KEYFRAME_CREDITS,
  };
}

// ---------- PRE-PRODUCTION SCENE KIT (AVATAR + BACKGROUND A/B/C + PRODUCT SUB-PROPS + EXTRA PROPS) ----------

export function buildImperfectionFirstLocationPrompt({
  name = 'Indoor Room',
  description = '',
  angleLabel = '',
  rawPrompt = '',
} = {}) {
  const custom = String(rawPrompt || '').trim();
  return [
    custom || `Authentic everyday smartphone photo of ${name}${description ? ` (${description})` : ''}${angleLabel ? `, ${angleLabel}` : ''}.`,
    'EMPTY SETTING — strictly NO people, NO humans, NO hands in frame.',
    'Imperfection First Realism: Shot on iPhone main camera at natural eye-level, lived-in Indonesian room/environment with minor natural everyday clutter slightly out of focus, natural window daylight with soft realistic uneven shadows, authentic phone dynamic range and subtle grain.',
    'STRICTLY AVOID: studio lighting, architectural 3D render look, glossy magazine interior, stock photo look, over-polished HDR, cinematic teal-orange grading, text, logos, watermarks, people.',
  ].join(' ');
}

export function buildImperfectionFirstSubPropPrompt({
  productName = 'Product',
  propLabel = '',
  rawPrompt = '',
} = {}) {
  const custom = String(rawPrompt || '').trim();
  return [
    custom || `Candid close-up smartphone photo of ${productName}${propLabel ? ` — ${propLabel}` : ''}, resting on a lived-in wooden table or kitchen counter.`,
    'Preserve exact original product packaging, colors, typography, and tub/bottle shape faithfully if a reference image is attached.',
    'Imperfection First Realism: Natural daylight from a side window, authentic tactile powder/liquid/material texture, slight everyday reflections, natural handheld smartphone depth of field.',
    'STRICTLY AVOID: studio product photography, floating CGI packshot, glossy commercial splash render, stock photo look, artificial neon lighting, watermarks, overlaid promotional badges.',
  ].join(' ');
}

export async function executeGenerateSceneKit({
  workspaceId,
  userId,
  sceneKit = {},
  heroProductName = '',
  heroProductImageUrl = '',
  aspectRatio = '9:16',
  db = getPool(),
  deps = {},
}) {
  const kit = sceneKit && typeof sceneKit === 'object' ? sceneKit : {};
  const genKeyframe = deps.executeGenerateKeyframe || executeGenerateKeyframe;
  const genAvatar = deps.executeGenerateBrandAvatar || executeGenerateBrandAvatar;
  const safeAspect = ['9:16', '3:4', '1:1', '4:5', '16:9'].includes(aspectRatio) ? aspectRatio : '9:16';

  const MAX_TOTAL_IMAGES = 6;
  let generatedCount = 0;
  let totalCredits = 0;

  // 1. Optional Brand Avatar (via AI Influencer nano-banana-pro + auto-save to My Brand)
  let avatarResult = null;
  if (kit.avatar && typeof kit.avatar === 'object' && (kit.avatar.name || kit.avatar.appearance || kit.avatar.prompt)) {
    generatedCount += 1;
    const av = await genAvatar({
      workspaceId,
      userId,
      name: kit.avatar.name || 'Brand Creator',
      description: kit.avatar.description || kit.avatar.appearance || '',
      appearance: kit.avatar.appearance || '',
      wardrobe: kit.avatar.wardrobe || '',
      voiceStyle: kit.avatar.voiceStyle || '',
      lighting: kit.avatar.lighting || '',
      setting: kit.avatar.setting || '',
      prompt: kit.avatar.prompt || '',
      aspectRatio: '3:4',
      db,
      deps,
    });
    avatarResult = {
      name: av.name,
      tag: av.name.replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, ''),
      url: av.url,
      assetId: av.assetId,
      description: av.description,
      savedToMyBrand: av.savedToMyBrand,
      modelLabel: av.modelLabel,
    };
    totalCredits += Number(av.creditsCharged || DEFAULT_KEYFRAME_CREDITS);
  }

  // 2. Background / Location A/B/C angles (stored under ONE Location folder in Canvas)
  let locationResult = null;
  if (kit.location && typeof kit.location === 'object' && (kit.location.name || Array.isArray(kit.location.shots))) {
    const locName = String(kit.location.name || 'Lokasi Syuting').trim().slice(0, 60);
    const locDesc = String(kit.location.description || '').trim().slice(0, 240);
    const rawShots = Array.isArray(kit.location.shots) && kit.location.shots.length
      ? kit.location.shots
      : [{ label: 'Background A · Wide View', prompt: kit.location.prompt || locDesc || locName }];

    const locAssets = [];
    for (const shot of rawShots.slice(0, 3)) {
      if (generatedCount >= MAX_TOTAL_IMAGES) break;
      generatedCount += 1;
      const label = String(shot?.label || `Background ${String.fromCharCode(65 + locAssets.length)}`).trim().slice(0, 60);
      const locPrompt = buildImperfectionFirstLocationPrompt({
        name: locName,
        description: locDesc,
        angleLabel: label,
        rawPrompt: shot?.prompt || '',
      });
      const res = await genKeyframe({
        workspaceId,
        userId,
        prompt: locPrompt,
        aspectRatio: safeAspect,
        model: DEFAULT_KEYFRAME_MODEL,
        db,
      });
      locAssets.push({
        label,
        url: res.assetId ? `/api/assets/${res.assetId}/download?workspace_id=${encodeURIComponent(workspaceId)}` : res.url,
        assetId: res.assetId || '',
      });
      totalCredits += Number(res.creditsCharged || DEFAULT_KEYFRAME_CREDITS);
    }
    if (locAssets.length > 0) {
      locationResult = {
        name: locName,
        tag: locName.replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, ''),
        description: locDesc || `Location reference (${locAssets.length} angles)`,
        assets: locAssets,
      };
    }
  }

  // 3. Hero Product Sub-Props (e.g. Prop B: tutup dibuka, Prop C: disekop/tuang) -> merged into Hero Product folder!
  let productSubPropsResult = null;
  const subPropShots = Array.isArray(kit.productSubProps?.shots)
    ? kit.productSubProps.shots
    : Array.isArray(kit.productSubProps)
      ? kit.productSubProps
      : [];
  const resolvedProductName = String(kit.productSubProps?.productName || kit.productName || heroProductName || 'Hero Product').trim().slice(0, 60);
  const refImg = String(kit.productSubProps?.referenceImageUrl || heroProductImageUrl || '').trim();
  const refImages = /^https?:\/\//i.test(refImg) ? [refImg] : [];

  if (subPropShots.length > 0) {
    const subAssets = [];
    for (const shot of subPropShots.slice(0, 3)) {
      if (generatedCount >= MAX_TOTAL_IMAGES) break;
      generatedCount += 1;
      const label = String(shot?.label || `Sub-Prop ${String.fromCharCode(66 + subAssets.length)}`).trim().slice(0, 60);
      const subPrompt = buildImperfectionFirstSubPropPrompt({
        productName: resolvedProductName,
        propLabel: label,
        rawPrompt: shot?.prompt || '',
      });
      const res = await genKeyframe({
        workspaceId,
        userId,
        prompt: subPrompt,
        aspectRatio: '3:4',
        model: DEFAULT_KEYFRAME_MODEL,
        referenceImages: refImages,
        db,
      });
      subAssets.push({
        label,
        url: res.assetId ? `/api/assets/${res.assetId}/download?workspace_id=${encodeURIComponent(workspaceId)}` : res.url,
        assetId: res.assetId || '',
      });
      totalCredits += Number(res.creditsCharged || DEFAULT_KEYFRAME_CREDITS);
    }
    if (subAssets.length > 0) {
      productSubPropsResult = {
        productName: resolvedProductName,
        tag: resolvedProductName.replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, ''),
        assets: subAssets,
      };
    }
  }

  // 4. Optional Standalone Extra Props (e.g. @Skop-Whey, @Shaker-Bening) -> own mentionable Props folders!
  const extraPropsResult = [];
  const rawExtraProps = Array.isArray(kit.extraProps) ? kit.extraProps : [];
  for (const prop of rawExtraProps.slice(0, 2)) {
    if (generatedCount >= MAX_TOTAL_IMAGES) break;
    const pName = String(prop?.name || '').trim().slice(0, 60);
    if (!pName) continue;
    generatedCount += 1;
    const pPrompt = buildImperfectionFirstSubPropPrompt({
      productName: pName,
      propLabel: prop.description || '',
      rawPrompt: prop.prompt || '',
    });
    const res = await genKeyframe({
      workspaceId,
      userId,
      prompt: pPrompt,
      aspectRatio: '1:1',
      model: DEFAULT_KEYFRAME_MODEL,
      db,
    });
    extraPropsResult.push({
      name: pName,
      tag: pName.replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, ''),
      description: String(prop.description || `Prop: ${pName}`).slice(0, 200),
      url: res.assetId ? `/api/assets/${res.assetId}/download?workspace_id=${encodeURIComponent(workspaceId)}` : res.url,
      assetId: res.assetId || '',
    });
    totalCredits += Number(res.creditsCharged || DEFAULT_KEYFRAME_CREDITS);
  }

  return {
    mediaType: 'scene_kit',
    subtype: 'preproduction_pack',
    avatar: avatarResult,
    location: locationResult,
    productSubProps: productSubPropsResult,
    extraProps: extraPropsResult,
    totalAssets: generatedCount,
    creditsCharged: totalCredits,
  };
}

// ---------- MY BRAND AGENT UPDATE ----------

export async function updateMyBrandFromAgent({
  workspaceId,
  userId,
  summary = 'Updated by Ad Agent',
  fieldPatch = {},
  subpage = null,
  db = getPool(),
}) {
  const existing = (await getWorkspaceBrandKit(db, workspaceId)) || {};
  const next = {
    ...buildBaseBrandKit(existing),
    subpages: Array.isArray(existing.subpages) ? [...existing.subpages] : [],
    history: Array.isArray(existing.history) ? [...existing.history] : [],
  };

  const updatedPages = [];

  // Apply safe text/array field patches
  const ALLOWED_TEXT = new Set(['about', 'category', 'positioning', 'tone', 'compareAgainst', 'leadWith', 'disclaimer']);
  const ALLOWED_ARRAY = new Set(['audience', 'sellingPoints', 'claimsToAvoid', 'competitors', 'glossary', 'products']);
  for (const [k, v] of Object.entries(fieldPatch || {})) {
    if (ALLOWED_TEXT.has(k) && typeof v === 'string' && v.trim()) {
      next[k] = v.trim();
      updatedPages.push({ targetType: 'section', targetId: k === 'compareAgainst' ? 'competitors' : k === 'leadWith' ? 'products' : k === 'tone' || k === 'disclaimer' ? 'messaging' : 'overview', title: k, summary });
    } else if (ALLOWED_ARRAY.has(k) && Array.isArray(v) && v.length) {
      const current = Array.isArray(next[k]) ? next[k] : [];
      const merged = [...current];
      for (const item of v) {
        const s = String(item || '').trim();
        if (s && !merged.some((x) => x.toLowerCase() === s.toLowerCase())) merged.push(s);
      }
      next[k] = merged;
      const secId = k === 'sellingPoints' || k === 'claimsToAvoid' || k === 'glossary' ? 'messaging' : k;
      updatedPages.push({ targetType: 'section', targetId: secId, title: secId.charAt(0).toUpperCase() + secId.slice(1), summary });
    }
  }

  // Upsert subpage (product or competitor)
  if (subpage && typeof subpage === 'object' && String(subpage.title || '').trim()) {
    const title = String(subpage.title).trim();
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `page-${Date.now()}`;
    const parent = ['products', 'competitors', 'overview', 'audience', 'messaging', 'custom'].includes(subpage.parent)
      ? subpage.parent
      : 'competitors';
    const idx = next.subpages.findIndex(
      (p) => p.parent === parent && String(p.title || '').trim().toLowerCase() === title.toLowerCase(),
    );
    const id = idx >= 0 ? next.subpages[idx].id : `sub-${parent}-${slug}`;
    const newSub = {
      id,
      slug,
      parent,
      title,
      subtitle: String(subpage.subtitle || (idx >= 0 ? next.subpages[idx].subtitle : '') || '').slice(0, 240),
      url: String(subpage.url || (idx >= 0 ? next.subpages[idx].url : '') || '').slice(0, 500),
      imageUrl: String(subpage.imageUrl || (idx >= 0 ? next.subpages[idx].imageUrl : '') || '').slice(0, 800),
      blocks: Array.isArray(subpage.blocks) && subpage.blocks.length ? subpage.blocks : idx >= 0 ? next.subpages[idx].blocks : [],
    };
    if (idx >= 0) next.subpages[idx] = newSub;
    else next.subpages.push(newSub);
    updatedPages.push({ targetType: 'subpage', targetId: id, title, summary });
  }

  const historyEntry = {
    id: `hist-agent-${Date.now()}`,
    actorType: 'agent',
    actorName: 'Ad Agent',
    source: 'AI Marketing Chat',
    createdAt: new Date().toISOString(),
    pages: updatedPages.length
      ? updatedPages
      : [{ targetType: 'section', targetId: 'overview', title: 'Overview', summary }],
  };
  next.history = [historyEntry, ...next.history].slice(0, 50);

  const validated = validateBrandKit(next);
  await saveWorkspaceBrandKit(db, { workspaceId, userId, data: validated });
  return { ok: true, updatedPages, historyEntry };
}

// ---------- AD ACCOUNT DIAGNOSTICS ----------

export async function auditWorkspaceAdAccounts({ workspaceId, period = 'last_7d', db = getPool(), env = process.env }) {
  const safePeriod = ['last_7d', 'last_30d', 'this_month'].includes(period) ? period : 'last_7d';
  const report = { period: safePeriod, metaAccounts: [], tiktokAccounts: [], integrations: [], notes: [] };

  try {
    const intRes = await db.query(
      `SELECT provider, display_name, status FROM workspace_integrations WHERE workspace_id = $1 AND status = 'connected'`,
      [workspaceId],
    );
    report.integrations = intRes.rows || [];
  } catch {}

  try {
    const saRes = await db.query(
      `SELECT id, provider, display_name, status, profile_data FROM social_accounts WHERE workspace_id = $1 AND status = 'connected' LIMIT 10`,
      [workspaceId],
    );
    for (const acc of saRes.rows || []) {
      if (acc.provider === 'tiktok') {
        report.tiktokAccounts.push({
          id: acc.id,
          name: acc.display_name || 'TikTok Account',
          stats: acc.profile_data || {},
        });
      }
    }
  } catch {}

  try {
    const metaAccRes = await db.query(
      `SELECT id, name, currency, status FROM meta_ad_accounts WHERE workspace_id = $1 LIMIT 5`,
      [workspaceId],
    );
    for (const acc of metaAccRes.rows || []) {
      try {
        const [insights, campaigns] = await Promise.all([
          readMetaAdInsights(db, { workspaceId, accountId: acc.id, period: safePeriod }, env).catch(() => null),
          readMetaCampaigns(db, { workspaceId, accountId: acc.id, period: safePeriod }, env).catch(() => null),
        ]);
        report.metaAccounts.push({
          id: acc.id,
          name: acc.name,
          currency: acc.currency,
          insights: insights?.rows?.[0] || null,
          campaigns: (campaigns?.campaigns || []).slice(0, 12),
        });
      } catch (err) {
        report.notes.push(`Meta account ${acc.name}: ${err.message}`);
      }
    }
  } catch {
    // meta_ad_accounts table or credentials not configured yet
  }

  if (!report.metaAccounts.length && !report.tiktokAccounts.length) {
    report.notes.push(
      'Belum ada akun Meta Ads atau TikTok yang terhubung di Integrations (/studio/accounts). User bisa menghubungkan akun untuk audit ROAS/CPA/CTR real.',
    );
  }
  return report;
}

export async function executeGenerateVideo({
  workspaceId,
  userId,
  approvalId,
  prompt,
  videoModel = 'seedance-2.5',
  duration,
  durationSeconds,
  aspectRatio = '9:16',
  resolution,
  generateAudio = true,
  firstFrameUrl = '',
  referenceImages = [],
  db = getPool(),
  env = process.env,
  deps = {},
}) {
  const cleanPrompt = String(prompt || '').trim();
  if (!cleanPrompt) throw Object.assign(new Error('Prompt video tidak boleh kosong.'), { status: 400 });

  const spec = resolveMarketingVideoSpec({
    videoModel,
    duration,
    durationSeconds,
    aspectRatio,
    resolution,
    generateAudio,
    firstFrameUrl,
    referenceImages,
  });

  const reserve = deps.reserve || createImageGenerationJobWithReservation;
  const publish = deps.publish || publishVideoGenerationJob;
  const idempotencyKey = `mkt-vid:${approvalId || randomUUID()}`;

  const generation = await reserve(
    db,
    workspaceId,
    {
      kind: 'video',
      prompt: cleanPrompt,
      model: spec.model,
      parameters: spec.parameters,
      idempotencyKey,
    },
    { userId },
  );

  try {
    await publish({ pool: db, env });
  } catch (err) {
    console.error('[marketing] video_generation_publish_deferred', generation?.id, err?.message);
  }

  return {
    mediaType: 'video_job',
    generationId: generation.id,
    jobStatus: generation.status || 'queued',
    progress: Number(generation.progress || 0),
    videoModel: spec.id,
    videoModelLabel: spec.label,
    providerModel: spec.model,
    prompt: cleanPrompt,
    aspectRatio: spec.parameters.aspectRatio,
    duration: spec.parameters.duration,
    resolution: spec.parameters.resolution || '720p',
    generateAudio: spec.parameters.generateAudio ?? false,
    estimatedCredits: Number(generation.estimated_cost || DEFAULT_VIDEO_ESTIMATED_CREDITS),
    studioUrl: `/studio/video?prompt=${encodeURIComponent(cleanPrompt.slice(0, 1200))}`,
  };
}

export async function syncApprovalVideoStatus({
  workspaceId,
  approvalId,
  db = getPool(),
  deps = {},
}) {
  const existingRes = await db.query(
    `SELECT * FROM marketing_approvals WHERE workspace_id = $1 AND id = $2 LIMIT 1`,
    [workspaceId, approvalId],
  );
  const approval = existingRes.rows[0];
  if (!approval) throw Object.assign(new Error('Approval card tidak ditemukan.'), { status: 404 });

  const currentResult = approval.result_json || {};
  const generationId = currentResult.generationId;
  if (!generationId) return { approval, generation: null };

  const getGen = deps.getGenerationJob || ((wsId, genId) => getGenerationJob(wsId, genId, createStorage()));
  const generation = await getGen(workspaceId, generationId);
  if (!generation) return { approval, generation: null };

  const genStatus = String(generation.status || 'queued').toLowerCase();
  const progress = Number(generation.progress || 0);

  if (genStatus === 'succeeded') {
    const outputs = Array.isArray(generation.outputs) ? generation.outputs : [];
    const videoOut = outputs.find((o) => /^video\//i.test(String(o?.contentType || ''))) || outputs[0] || null;
    const assetId = videoOut?.assetId || null;
    const wsQuery = `workspace_id=${encodeURIComponent(workspaceId)}`;
    const url = assetId
      ? `/api/assets/${assetId}/download?${wsQuery}`
      : videoOut?.download?.url || currentResult.url || '';
    const downloadUrl = assetId
      ? `/api/assets/${assetId}/download?${wsQuery}&download=1`
      : url;

    const nextResult = {
      ...currentResult,
      mediaType: 'video',
      jobStatus: 'succeeded',
      progress: 100,
      assetId,
      url,
      downloadUrl,
      filename: videoOut?.filename || `ad-video-${generationId.slice(0, 8)}.mp4`,
      contentType: videoOut?.contentType || 'video/mp4',
      creditsCharged: Number(generation.estimated_cost || currentResult.estimatedCredits || 0),
    };
    const updatedRes = await db.query(
      `UPDATE marketing_approvals
       SET status = 'completed', result_json = $2::jsonb, updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [approvalId, JSON.stringify(nextResult)],
    );
    const updated = updatedRes.rows[0];
    await syncApprovalIntoThreadMessages({ workspaceId, approval: updated, db });
    return { approval: updated, generation };
  }

  if (['failed', 'cancelled', 'expired'].includes(genStatus)) {
    const errMsg =
      typeof generation.error === 'string' && generation.error.trim()
        ? generation.error.trim()
        : `Video generation ${genStatus}.`;
    const nextResult = {
      ...currentResult,
      mediaType: 'video_job',
      jobStatus: genStatus,
      error: errMsg,
    };
    const updatedRes = await db.query(
      `UPDATE marketing_approvals
       SET status = 'failed', result_json = $2::jsonb, updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [approvalId, JSON.stringify(nextResult)],
    );
    const updated = updatedRes.rows[0];
    await syncApprovalIntoThreadMessages({ workspaceId, approval: updated, db });
    return { approval: updated, generation };
  }

  // Still queued / processing — return live status & progress
  const liveResult = {
    ...currentResult,
    jobStatus: genStatus,
    progress,
  };
  if (currentResult.jobStatus !== genStatus || Number(currentResult.progress || 0) !== progress) {
    const updatedRes = await db.query(
      `UPDATE marketing_approvals SET result_json = $2::jsonb, updated_at = now() WHERE id = $1 RETURNING *`,
      [approvalId, JSON.stringify(liveResult)],
    );
    return { approval: updatedRes.rows[0], generation };
  }
  return { approval: { ...approval, result_json: liveResult }, generation };
}

/**
 * Collects canonical workspace asset reference URLs from completed Step 1 Pre-Production
 * Scene Kits / Avatars / Keyframes in the same thread (plus saved My Brand avatar),
 * so direct-in-chat `Approve & Run` on Step 2 `generate_video` gets the exact same
 * multi-reference Seedance 2.5 consistency as Canvas!
 */
export async function collectThreadVideoReferenceImages({
  workspaceId,
  approval,
  payloadRefs = [],
  db = getPool(),
  deps = {},
} = {}) {
  const seen = new Set();
  const ordered = [];
  const pushRef = (rawUrl, assetId = '') => {
    const cleanId = String(assetId || '').trim();
    let url = String(rawUrl || '').trim();
    if (!url && cleanId) {
      url = `/api/assets/${encodeURIComponent(cleanId)}/download?workspace_id=${encodeURIComponent(workspaceId)}`;
    }
    if (!url || !TENANT_ASSET_URL_RE.test(url)) return;
    if (!url.includes('workspace_id=') && workspaceId) {
      url = `${url}${url.includes('?') ? '&' : '?'}workspace_id=${encodeURIComponent(workspaceId)}`;
    }
    const dedupeKey = url.split('?')[0].toLowerCase();
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    ordered.push(url);
  };

  for (const r of Array.isArray(payloadRefs) ? payloadRefs : []) pushRef(r);

  if (approval?.thread_id && typeof db?.query === 'function') {
    try {
      const sibRes = await db.query(
        `SELECT action_type, result_json FROM marketing_approvals
         WHERE workspace_id = $1 AND thread_id = $2 AND id <> $3 AND status = 'completed'
         ORDER BY updated_at DESC LIMIT 8`,
        [workspaceId, approval.thread_id, approval.id],
      );
      for (const row of sibRes.rows || []) {
        const r = row?.result_json || {};
        if (r.mediaType === 'scene_kit') {
          if (r.avatar) pushRef(r.avatar.url, r.avatar.assetId);
          for (const a of Array.isArray(r.location?.assets) ? r.location.assets.slice(0, 2) : []) {
            pushRef(a?.url, a?.assetId);
          }
          for (const a of Array.isArray(r.productSubProps?.assets) ? r.productSubProps.assets.slice(0, 2) : []) {
            pushRef(a?.url, a?.assetId);
          }
          for (const ep of Array.isArray(r.extraProps) ? r.extraProps.slice(0, 2) : []) {
            pushRef(ep?.url, ep?.assetId);
          }
        } else if (r.mediaType === 'avatar' || r.mediaType === 'image') {
          pushRef(r.url, r.assetId);
        }
      }
    } catch {
      // Non-blocking: proceed with any available refs
    }
  }

  // Fallback: include primary saved My Brand avatar if not yet attached
  if (ordered.length < 6) {
    try {
      const loadBrand = deps.getWorkspaceBrandKit || getWorkspaceBrandKit;
      const brandKit = await loadBrand(db, workspaceId);
      const primaryAv = Array.isArray(brandKit?.avatars) ? brandKit.avatars[0] : null;
      if (primaryAv) pushRef(primaryAv.imageUrl, primaryAv.assetId);
    } catch {
      // Non-blocking
    }
  }

  return ordered.slice(0, 6);
}

// ---------- EXECUTE APPROVED ACTION ----------

export async function decideApproval({
  workspaceId,
  userId,
  approvalId,
  decision,
  db = getPool(),
  env = process.env,
}) {
  const existingRes = await db.query(
    `SELECT * FROM marketing_approvals WHERE workspace_id = $1 AND id = $2 LIMIT 1`,
    [workspaceId, approvalId],
  );
  const approval = existingRes.rows[0];
  if (!approval) throw Object.assign(new Error('Approval card tidak ditemukan.'), { status: 404 });
  if (approval.status !== 'pending') {
    return approval;
  }

  if (decision === 'reject') {
    const rej = await db.query(
      `UPDATE marketing_approvals SET status = 'rejected', updated_at = now() WHERE id = $1 RETURNING *`,
      [approvalId],
    );
    return rej.rows[0];
  }

  await db.query(`UPDATE marketing_approvals SET status = 'executing', updated_at = now() WHERE id = $1`, [approvalId]);
  const payload = approval.payload_json || {};

  try {
    let result = {};
    let nextStatus = 'completed';
    if (approval.action_type === 'generate_keyframe') {
      result = await executeGenerateKeyframe({
        workspaceId,
        userId,
        prompt: payload.prompt,
        aspectRatio: payload.aspectRatio || '9:16',
        model: payload.model || DEFAULT_KEYFRAME_MODEL,
        referenceImages: payload.referenceImages || [],
        db,
      });
    } else if (approval.action_type === 'generate_brand_avatar') {
      result = await executeGenerateBrandAvatar({
        workspaceId,
        userId,
        name: payload.name || approval.title,
        description: payload.description || approval.description || '',
        appearance: payload.appearance || '',
        wardrobe: payload.wardrobe || '',
        voiceStyle: payload.voiceStyle || '',
        lighting: payload.lighting || '',
        setting: payload.setting || '',
        prompt: payload.prompt || '',
        aspectRatio: payload.aspectRatio || '3:4',
        model: payload.model || DEFAULT_AVATAR_MODEL,
        db,
      });
    } else if (approval.action_type === 'generate_scene_kit') {
      result = await executeGenerateSceneKit({
        workspaceId,
        userId,
        sceneKit: payload.sceneKit || payload,
        heroProductName: payload.heroProductName || payload.sceneKit?.productName || '',
        heroProductImageUrl: payload.heroProductImageUrl || payload.sceneKit?.productSubProps?.referenceImageUrl || '',
        aspectRatio: payload.aspectRatio || '9:16',
        db,
      });
    } else if (approval.action_type === 'generate_voiceover') {
      result = await executeGenerateVoiceover({
        workspaceId,
        userId,
        text: payload.text,
        voiceId: payload.voiceId,
        targetSeconds: payload.targetSeconds,
        db,
        env,
      });
    } else if (approval.action_type === 'generate_music') {
      result = await executeGenerateMusic({
        workspaceId,
        userId,
        prompt: payload.prompt,
        durationSeconds: payload.durationSeconds || 25,
        db,
        env,
      });
    } else if (approval.action_type === 'launch_meta_campaign') {
      result = await createMetaPausedCampaign(
        db,
        {
          workspaceId,
          userId,
          accountId: payload.accountId,
          name: payload.name,
          objective: payload.objective || 'OUTCOME_TRAFFIC',
          specialCategory: payload.specialCategory || 'NONE',
          countries: payload.countries || ['ID'],
          dailyBudgetMinor: Number(payload.dailyBudgetMinor) || 100000,
          confirm: true,
        },
        env,
      );
    } else if (approval.action_type === 'update_brand') {
      result = await updateMyBrandFromAgent({
        workspaceId,
        userId,
        summary: payload.summary || approval.title,
        fieldPatch: payload.fieldPatch,
        subpage: payload.subpage,
        db,
      });
    } else if (approval.action_type === 'generate_video') {
      const mergedRefs = await collectThreadVideoReferenceImages({
        workspaceId,
        approval,
        payloadRefs: payload.referenceImages || [],
        db,
      });
      result = await executeGenerateVideo({
        workspaceId,
        userId,
        approvalId,
        prompt: payload.prompt || '',
        videoModel: payload.videoModel || 'seedance-2.5',
        duration: payload.duration,
        durationSeconds: payload.durationSeconds,
        aspectRatio: payload.aspectRatio || '9:16',
        resolution: payload.resolution,
        generateAudio: payload.generateAudio !== false,
        firstFrameUrl: payload.firstFrameUrl || payload.firstFrameAssetUrl || '',
        referenceImages: mergedRefs,
        db,
        env,
      });
      result.referenceCount = mergedRefs.length;
      nextStatus = 'executing';
    }

    const done = await db.query(
      `UPDATE marketing_approvals SET status = $3, result_json = $2::jsonb, updated_at = now() WHERE id = $1 RETURNING *`,
      [approvalId, JSON.stringify(result), nextStatus],
    );
    return done.rows[0];
  } catch (error) {
    const failed = await db.query(
      `UPDATE marketing_approvals SET status = 'failed', result_json = $2::jsonb, updated_at = now() WHERE id = $1 RETURNING *`,
      [approvalId, JSON.stringify({ error: error?.message || 'Eksekusi gagal.' })],
    );
    return failed.rows[0];
  }
}
