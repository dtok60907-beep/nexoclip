// AI jobs of the Motion studio (table motion_jobs), run by the motion worker (src/queue/motionWorker.mjs) instead of
// the browser, so a refresh or a closed tab does not stop them. A job is one message to the AI director: the plan
// (charged by tokens), then the voiceover and music it was asked to make (charged per file). Every step is written
// into the project's document as it lands, so the studio shows progress and partial results after a reload.
import { randomUUID } from 'node:crypto';
import { appendCreditEntry } from './creditService.js';
import { storyboardTextCredits } from './storyboardTextPricing.js';
import { LONG_VIDEO_MAX, LONG_VIDEO_SECONDS, MAX_BRIEF, MOTION_MODEL, PLAN_SCENES, planLongMotion, planMotion, targetSeconds } from './motionDirector.js';
import { cleanDoc } from './motionProjects.js';
import { makeMotionAudio, readCreditBalance } from './motionAudio.js';
import { SCENE_LIMITS } from '../../components/motion/sceneKinds.js';
import { ELEVENLABS_VOICES, audioCredits } from './elevenlabsAudio.js';
import { loadUsdIdrRate, usdToCredits } from './generationPricing.js';
import { STORY_MODEL, animateStory, designCast, narrationText, storyIdeas, storyScript, timeScenes } from './motionStory.js';
import { productionNeeds, runAgentTurn } from './motionAgent.js';
import { findAssets as findStoryAssets } from './motionAssets.js';
import { analyzeReference, inspectScene } from './motionInspect.js';
import { importWebImage as fetchWebImage, readWebPage } from './motionWeb.js';
import { createAssetDownload, createStorage, DISPLAY_DOWNLOAD_CACHE, importWorkspaceAsset } from './assetService.js';
import { DRAW_STYLES, MAX_NOTE, MAX_TOPIC, PACES, STORY_SCENES, cleanStory, paceOf } from '../../components/motion/draw/story.js';

export const MOTION_QUEUE = 'motion-jobs';
const VOICE_CONCURRENCY = 2;
const fail = (message, status) => Object.assign(new Error(message), { status });
const round = (credits) => Math.round(credits * 100) / 100;

const publicJob = (row) => row && ({
  id: row.id, projectId: row.project_id, status: row.status, progress: row.progress, error: row.error,
  credits: Number(row.credits) || 0, createdAt: row.created_at, finishedAt: row.finished_at,
});

export async function getMotionJob(pool, workspaceId, id) {
  const result = await pool.query('SELECT * FROM motion_jobs WHERE workspace_id = $1 AND id = $2', [workspaceId, id]);
  return publicJob(result.rows[0]);
}

export async function activeMotionJob(pool, workspaceId, projectId) {
  const result = await pool.query(
    "SELECT * FROM motion_jobs WHERE workspace_id = $1 AND project_id = $2 AND status IN ('queued', 'running') ORDER BY created_at DESC LIMIT 1",
    [workspaceId, projectId],
  );
  return publicJob(result.rows[0]);
}

// Read-modify-write of a project's document under a row lock, so the worker and the editor's autosave never
// interleave inside one change. `change(doc)` returns the new document.
export async function changeProjectDoc(pool, projectId, change) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT doc FROM motion_projects WHERE id = $1 FOR UPDATE', [projectId]);
    if (!result.rows[0]) throw fail('Project tidak ditemukan.', 404);
    const doc = cleanDoc(change(result.rows[0].doc));
    await client.query('UPDATE motion_projects SET doc = $2, updated_at = now() WHERE id = $1', [projectId, JSON.stringify(doc)]);
    await client.query('COMMIT');
    return doc;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// "adegan 12", "adegan 12-15", "adegan 3 sampai 5" → [from, to) of the scenes (at most PLAN_SCENES), or null.
export function sceneRange(brief, count) {
  const match = String(brief || '').match(/adegan\s+(\d+)(?:\s*(?:-|–|sampai|s\.?d\.?|hingga|ke)\s*(\d+))?/i);
  if (!match) return null;
  const from = Math.min(count, Math.max(1, Number(match[1]))) - 1;
  const to = Math.min(count, Math.max(from + 1, Number(match[2] || match[1])), from + PLAN_SCENES);
  return [from, to];
}

// What sound a message asks for, when it only asks for sound ("buatkan musik dan vo-nya"), or null.
export function soundWanted(brief) {
  const value = String(brief || '').toLowerCase();
  const music = /\b(musik|music|lagu|backsound|soundtrack)\b/.test(value);
  const voiceover = /\b(vo|vonya|voice ?over|narasi|narator|suara|dubbing)\b/.test(value);
  return music || voiceover ? { music, voiceover } : null;
}

// "lanjutkan", "lanjut", "teruskan", "continue" on its own (a few words at most).
export const wantsContinue = (brief) => /^\s*(lanjut(kan)?|teruskan|continue|resume)\b/i.test(String(brief || '')) && String(brief).trim().split(/\s+/).length <= 4;

// The project's last long video that stopped before its last chapter: { outline, chaptersDone, brief }, or null.
async function stoppedLongJob(pool, job) {
  const result = await pool.query(
    "SELECT input FROM motion_jobs WHERE project_id = $1 AND id <> $2 AND status = 'failed' AND input ? 'outline' ORDER BY created_at DESC LIMIT 1",
    [job.project_id, job.id],
  );
  const input = result.rows[0]?.input;
  if (!input?.outline?.chapters?.length || !(input.chaptersDone < input.outline.chapters.length)) return null;
  return { outline: input.outline, chaptersDone: Number(input.chaptersDone) || 0, brief: input.longBrief || input.brief };
}

async function keepLongState(pool, job, state) {
  job.input = { ...job.input, ...state };
  await pool.query('UPDATE motion_jobs SET input = $2, updated_at = now() WHERE id = $1', [job.id, JSON.stringify(job.input)]);
}

const say = (doc, message) => ({ ...doc, chat: [...(doc.chat || []), message] });

// Queue one job for a project: a message to the AI director (type 'plan', the default; the user's message goes into
// the chat right away), or sound for the document as it is (type 'audio': `music` and/or `voiceover`, optionally only
// for the scene indexes in `scenes`).
// A drawn story's request: 'story-ideas' (five ideas for a topic) or 'story-make' (script, narration, drawings).
export function storyInput(input) {
  const topic = String(input?.topic || '').trim();
  const pace = PACES.some((p) => p.id === input?.pace) ? input.pace : 'normal';
  const style = DRAW_STYLES.some((d) => d.id === input?.style) ? input.style : DRAW_STYLES[0].id;
  const sceneCount = STORY_SCENES.includes(Number(input?.sceneCount)) ? Number(input.sceneCount) : 10;
  const note = String(input?.note || '').trim().slice(0, MAX_NOTE);
  if (input.type === 'story-ideas') {
    if (!topic) throw fail('Tulis dulu topik videonya.', 400);
    if (topic.length > MAX_TOPIC) throw fail(`Topik maksimal ${MAX_TOPIC} karakter.`, 400);
    return { type: 'story-ideas', topic, pace, style, sceneCount, note };
  }
  const idea = input?.idea || {};
  const clip = (value, max) => String(value || '').trim().slice(0, max);
  const chosen = { title: clip(idea.title, 120), hook: clip(idea.hook, 240), angle: clip(idea.angle, 500), visualStyle: clip(idea.visualStyle, 400) };
  if (!chosen.title || !chosen.hook) throw fail('Pilih dulu salah satu ide.', 400);
  const voiceId = ELEVENLABS_VOICES.some((v) => v.id === input?.voiceId) ? input.voiceId : '';
  return { type: 'story-make', topic, pace, style, sceneCount, note, idea: chosen, voiceId, music: input?.music !== false };
}

// What a whole drawn video is likely to cost (credits): the text, the narration and the music. Checked up front so
// a video does not stop halfway for lack of credits.
export async function storyEstimate({ sceneCount, pace, music }, { env = process.env, loadRate = loadUsdIdrRate, priceAudio = audioCredits } = {}) {
  const rate = await loadRate({ env });
  const text = usdToCredits(0.09 * sceneCount, env, rate); // ten scenes measured $0.71 of Sonnet (its thinking included), with room to spare
  const chars = sceneCount * paceOf(pace).words[1] * 7;
  const voice = (await priceAudio({ type: 'voiceover', text: 'x'.repeat(Math.min(5000, chars)), voiceId: ELEVENLABS_VOICES[0].id })).credits;
  const seconds = Math.min(300, Math.max(3, Math.round(sceneCount * paceOf(pace).sceneSeconds[1])));
  const song = music ? (await priceAudio({ type: 'music', text: 'music', durationSeconds: seconds })).credits : 0;
  return Math.ceil(text + voice + song);
}

// What producing the pending part of a chat story costs (credits): drawings per scene, the narration, the music.
export async function produceEstimate({ story, needs }, { env = process.env, loadRate = loadUsdIdrRate, priceAudio = audioCredits } = {}) {
  const rate = await loadRate({ env });
  // drawing measured ≈ $0.062 a scene; designing the free canvas's characters ≈ one more scene each
  const designs = needs.draw.length && story.canvas === 2 ? (story.cast || []).filter((c) => !c.code || c.madeFrom !== c.look).length : 0;
  const text = usdToCredits(0.075 * Math.max(needs.draw.length + designs, needs.voice ? 1 : 0), env, rate);
  const chars = needs.voice ? Math.min(5000, Math.max(1, narrationText(story.scenes, story.paceSpec || story.pace).length)) : 0;
  const voice = chars ? (await priceAudio({ type: 'voiceover', text: 'x'.repeat(chars), voiceId: ELEVENLABS_VOICES[0].id })).credits : 0;
  const seconds = Math.min(300, Math.max(3, Math.round(story.scenes.reduce((sum, scene) => sum + scene.duration, 0) + 2)));
  const song = needs.music ? (await priceAudio({ type: 'music', text: 'music', durationSeconds: seconds })).credits : 0;
  let sound = 0;
  for (const key of needs.sounds || []) {
    const item = (story.sounds || []).find((x) => x.key === key);
    if (item) sound += (await priceAudio({ type: 'sound', text: 'x', durationSeconds: item.seconds })).credits;
  }
  return { credits: Math.ceil(text + voice + song + sound), breakdown: { draw: Math.ceil(text), voice: Math.ceil(voice), music: Math.ceil(song), sounds: Math.ceil(sound) } };
}

// The production plan of a story, saved as its pending request so the user can review it and press "Buat":
// what will be made (narration, music, which scenes are drawn) and what each costs.
export async function planProduction({ pool, workspaceId, projectId, estimate = produceEstimate }) {
  const project = await pool.query('SELECT id FROM motion_projects WHERE workspace_id = $1 AND id = $2', [workspaceId, projectId]);
  if (!project.rows[0]) throw fail('Project tidak ditemukan.', 404);
  const saved = await changeProjectDoc(pool, projectId, (doc) => doc);
  const story = cleanStory(saved?.kind === 'story' ? saved.story : {});
  if (!story.scenes.length) throw fail('Belum ada naskah.', 400);
  const needs = productionNeeds(story);
  const what = [needs.voice && 'voice', needs.music && 'music', needs.draw.length && 'draw', needs.sounds.length && 'sounds'].filter(Boolean);
  if (!what.length) {
    await changeStory(pool, projectId, (s) => ({ ...s, pending: null }));
    return null;
  }
  const { credits, breakdown } = await estimate({ story, needs });
  const pending = { what, scenes: needs.draw, credits, breakdown, note: '' };
  await changeStory(pool, projectId, (s) => ({ ...s, pending }));
  return pending;
}

export async function enqueueMotionJob({ pool, queue, workspaceId, projectId, userId, input, readBalance = readCreditBalance, newId = randomUUID, estimate = storyEstimate }) {
  if (input?.type === 'story-chat' || input?.type === 'story-produce') {
    const message = String(input.message || '').trim();
    // files sent with the message: workspace assets uploaded through /api/uploads (pictures and videos only)
    const attachments = (Array.isArray(input.attachments) ? input.attachments : []).slice(0, 6)
      .map((a) => ({ assetId: String(a?.id || a?.assetId || ''), url: String(a?.url || ''), type: String(a?.contentType || '').startsWith('video/') ? 'video' : 'image', name: String(a?.name || '').slice(0, 120), contentType: String(a?.contentType || '') }))
      .filter((a) => /^[0-9a-f-]{36}$/.test(a.assetId) && a.url.startsWith('/api/assets/') && /^(image|video)\//.test(a.contentType));
    if (input.type === 'story-chat' && !message && !attachments.length) throw fail('Tulis dulu pesannya.', 400);
    if (message.length > MAX_BRIEF) throw fail(`Maksimal ${MAX_BRIEF} karakter.`, 400);
    const project = await pool.query('SELECT id FROM motion_projects WHERE workspace_id = $1 AND id = $2', [workspaceId, projectId]);
    if (!project.rows[0]) throw fail('Project tidak ditemukan.', 404);
    const balance = await readBalance(pool, workspaceId);
    if (balance <= 0) throw fail('Kredit kamu habis. Top up dulu untuk memakai AI.', 402);
    if (input.type === 'story-produce') {
      const saved = await changeProjectDoc(pool, projectId, (doc) => doc);
      const pending = saved?.kind === 'story' ? saved.story.pending : null;
      if (!pending) throw fail('Tidak ada yang menunggu dibuat.', 400);
      if (balance < pending.credits) throw fail(`Kredit kurang. Ini butuh sekitar ${pending.credits} kredit.`, 402);
    }
    const id = newId();
    try {
      await pool.query(
        'INSERT INTO motion_jobs (id, project_id, workspace_id, user_id, input, progress) VALUES ($1, $2, $3, $4, $5, $6)',
        [id, projectId, workspaceId, userId, JSON.stringify({ type: input.type, message, attachments }), 'Menunggu giliran…'],
      );
    } catch (error) {
      if (error?.code === '23505') throw fail('AI masih mengerjakan permintaan sebelumnya di project ini.', 409);
      throw error;
    }
    if (input.type === 'story-chat') {
      await changeStory(pool, projectId, (s) => {
        // each file becomes a reference (ref-1, ref-2, ...); pictures can also be drawn into scenes with s.image
        const refs = [...s.references];
        const assets = { ...s.assets };
        const sent = attachments.map((a) => {
          let n = refs.length + 1;
          while (refs.some((r) => r.key === `ref-${n}`)) n += 1;
          const key = `ref-${n}`;
          refs.push({ key, type: a.type, url: a.url, assetId: a.assetId, name: a.name, seen: '' });
          if (a.type === 'image') assets[key] = { type: 'image', source: 'upload', url: a.url, assetId: a.assetId, description: a.name || 'gambar dari user', credit: '' };
          return { key, type: a.type, url: a.url, name: a.name };
        });
        return { ...s, references: refs, assets, chat: [...s.chat, { role: 'user', content: message || '(kirim file)', ...(sent.length ? { attachments: sent } : {}) }] };
      });
    }
    await queue.add('run', { jobId: id }, { jobId: id, attempts: 1, removeOnComplete: 500, removeOnFail: 500 });
    return getMotionJob(pool, workspaceId, id);
  }
  if (input?.type === 'story-ideas' || input?.type === 'story-make') {
    const stored = storyInput(input);
    const project = await pool.query('SELECT id FROM motion_projects WHERE workspace_id = $1 AND id = $2', [workspaceId, projectId]);
    if (!project.rows[0]) throw fail('Project tidak ditemukan.', 404);
    const balance = await readBalance(pool, workspaceId);
    if (balance <= 0) throw fail('Kredit kamu habis. Top up dulu untuk memakai AI.', 402);
    if (stored.type === 'story-make') {
      const needed = await estimate(stored);
      if (balance < needed) throw fail(`Kredit kurang. Satu video ini butuh sekitar ${needed} kredit.`, 402);
    }
    const id = newId();
    try {
      await pool.query(
        'INSERT INTO motion_jobs (id, project_id, workspace_id, user_id, input, progress) VALUES ($1, $2, $3, $4, $5, $6)',
        [id, projectId, workspaceId, userId, JSON.stringify(stored), 'Menunggu giliran…'],
      );
    } catch (error) {
      if (error?.code === '23505') throw fail('AI masih mengerjakan permintaan sebelumnya di project ini.', 409);
      throw error;
    }
    await queue.add('run', { jobId: id }, { jobId: id, attempts: 1, removeOnComplete: 500, removeOnFail: 500 });
    return getMotionJob(pool, workspaceId, id);
  }
  const audio = input?.type === 'audio';
  const brief = typeof input?.brief === 'string' ? input.brief.trim() : '';
  if (!audio && !brief) throw fail('Tulis dulu video yang kamu mau.', 400);
  if (brief.length > MAX_BRIEF) throw fail(`Maksimal ${MAX_BRIEF} karakter.`, 400);
  if (audio && !input.music && !input.voiceover) throw fail('Pilih musik atau suara yang mau dibuat.', 400);
  const stored = audio
    ? { type: 'audio', music: Boolean(input.music), voiceover: Boolean(input.voiceover), scenes: Array.isArray(input.scenes) ? input.scenes.filter(Number.isInteger).slice(0, 20) : null }
    : { type: 'plan', brief, messages: input.messages || [], current: input.current || null, format: input.format };
  const project = await pool.query('SELECT id FROM motion_projects WHERE workspace_id = $1 AND id = $2', [workspaceId, projectId]);
  if (!project.rows[0]) throw fail('Project tidak ditemukan.', 404);
  if (await readBalance(pool, workspaceId) <= 0) throw fail('Kredit kamu habis. Top up dulu untuk memakai AI.', 402);
  const id = newId();
  try {
    await pool.query(
      'INSERT INTO motion_jobs (id, project_id, workspace_id, user_id, input, progress) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, projectId, workspaceId, userId, JSON.stringify(stored), 'Menunggu giliran…'],
    );
  } catch (error) {
    if (error?.code === '23505') throw fail('AI masih mengerjakan permintaan sebelumnya di project ini.', 409);
    throw error;
  }
  if (!audio) await changeProjectDoc(pool, projectId, (doc) => say(doc, { role: 'user', content: brief }));
  await queue.add('run', { jobId: id }, { jobId: id, attempts: 1, removeOnComplete: 500, removeOnFail: 500 });
  return getMotionJob(pool, workspaceId, id);
}

async function setJob(pool, id, fields) {
  const keys = Object.keys(fields);
  await pool.query(
    `UPDATE motion_jobs SET ${keys.map((key, i) => `${key} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1`,
    [id, ...keys.map((key) => fields[key])],
  );
}

// Text tokens of the plan, charged like the AI Director's text; what is left is taken if the balance ran out.
async function chargeText({ pool, job, result, priceText, appendCredit, readBalance, step = '' }) {
  const usage = {
    model: result.model,
    inputTokens: Number(result.usage.prompt_tokens) || 0,
    outputTokens: Number(result.usage.completion_tokens) || 0,
    cachedInputTokens: Number(result.usage.prompt_tokens_details?.cached_tokens) || 0,
  };
  // OpenRouter says what a request really cost (cache writes included); bill that when it is known.
  const { usd, credits } = Number.isFinite(result.costUsd)
    ? { usd: result.costUsd, credits: usdToCredits(result.costUsd, process.env, await loadUsdIdrRate({ env: process.env })) }
    : await priceText(usage);
  if (credits <= 0) return 0;
  const entry = {
    workspaceId: job.workspace_id, reason: 'motion_text', idempotencyKey: `motion-text:${job.id}${step ? `:${step}` : ''}`,
    metadata: { ...usage, providerCostUsd: usd, userId: job.user_id, motionJobId: job.id },
  };
  try {
    await appendCredit(pool, { ...entry, amount: -credits });
    return credits;
  } catch (error) {
    if (error?.message !== 'Insufficient credits') throw error;
    const left = Math.max(0, Math.floor((await readBalance(pool, job.workspace_id)) * 10) / 10);
    if (left > 0) await appendCredit(pool, { ...entry, amount: -left, metadata: { ...entry.metadata, partial: true, quotedCredits: credits } });
    return left;
  }
}

// The plan on top of the document: kept voiceover recordings for lines the AI did not change.
export function applyPlan(doc, plan) {
  const scenes = plan.scenes.map((scene) => {
    const before = (doc.scenes || []).find((old) => old.voAudio && old.vo && old.vo === scene.vo);
    return before ? { ...scene, voAudio: before.voAudio } : scene;
  });
  return {
    ...doc,
    styleId: plan.styleId,
    format: plan.format,
    scenes,
    audio: {
      ...doc.audio, voiceId: plan.voiceId || doc.audio?.voiceId || '', musicPrompt: plan.musicPrompt || doc.audio?.musicPrompt || '',
      ...(plan.captionStyle ? { captionStyle: plan.captionStyle } : {}),
    },
  };
}

export async function runMotionJob(jobId, {
  pool, plan = planMotion, planLong = planLongMotion, priceText = storyboardTextCredits, appendCredit = appendCreditEntry,
  readBalance = readCreditBalance, makeAudio = makeMotionAudio, logError = console.error,
  story = { storyIdeas, storyScript, animateStory, designCast }, agent, findAssets, estimate,
}) {
  const claimed = await pool.query(
    "UPDATE motion_jobs SET status = 'running', progress = CASE WHEN input->>'type' = 'audio' THEN 'Menyiapkan audio…' ELSE 'Menyusun adegan…' END, updated_at = now() WHERE id = $1 AND status = 'queued' RETURNING *",
    [jobId],
  );
  const job = claimed.rows[0];
  if (!job) return; // already run, or gone with its project
  if (String(job.input?.type).startsWith('story-')) {
    await runStoryJob(job, { pool, priceText, appendCredit, readBalance, makeAudio, logError, story, ...(agent ? { agent } : {}), ...(findAssets ? { findAssets } : {}), ...(estimate ? { estimate } : {}) });
    return;
  }
  let spent = 0;
  let longState = null; // { outline, chaptersDone } while a long video is being written
  try {
    let doc;
    let wants;
    if (job.input.type === 'audio') {
      doc = await changeProjectDoc(pool, job.project_id, (current) => current);
      wants = { voiceover: job.input.voiceover, music: job.input.music, scenes: job.input.scenes };
    } else if (targetSeconds(job.input.brief) > LONG_VIDEO_SECONDS || (wantsContinue(job.input.brief) && await stoppedLongJob(pool, job))) {
      // A long video: the outline, then chapter by chapter, each request charged and its scenes written in as it lands.
      // The outline and the chapters done are kept on the job, so "lanjutkan" can pick up where a failure stopped it.
      const stopped = wantsContinue(job.input.brief) ? await stoppedLongJob(pool, job) : null;
      let outline = stopped?.outline || null;
      let resume = null;
      if (stopped) {
        const saved = await changeProjectDoc(pool, job.project_id, (current) => current);
        resume = { outline: stopped.outline, start: stopped.chaptersDone, previous: stopped.chaptersDone ? saved.scenes.slice(-2) : [], total: stopped.chaptersDone ? saved.scenes.length : 0 };
        longState = { outline: stopped.outline, chaptersDone: stopped.chaptersDone, longBrief: stopped.brief };
        await keepLongState(pool, job, longState);
      }
      const brief = stopped?.brief || job.input.brief;
      const result = await planLong({
        brief, messages: job.input.messages, format: job.input.format, seconds: targetSeconds(brief) || LONG_VIDEO_MAX, resume,
        onStep: (step) => setJob(pool, job.id, {
          progress: step.kind === 'outline' ? 'Menyusun kerangka cerita…' : `Menulis bab ${step.index + 1}/${step.total}: ${step.title}…`,
        }),
        onResult: async ({ kind, index, usage, outline: planned, scenes }) => {
          spent += await chargeText({ pool, job, result: { usage, model: MOTION_MODEL }, priceText, appendCredit, readBalance, step: kind === 'outline' ? 'outline' : `chapter${index}` });
          if (kind === 'outline') {
            outline = planned;
            longState = { outline: planned, chaptersDone: 0, longBrief: job.input.brief };
            await keepLongState(pool, job, longState);
            const capped = targetSeconds(job.input.brief) > LONG_VIDEO_MAX ? ` Maksimal ${LONG_VIDEO_MAX / 60} menit per video, jadi aku buat ${LONG_VIDEO_MAX / 60} menit.` : '';
            doc = await changeProjectDoc(pool, job.project_id, (current) => say(applyPlan(current, { ...planned, scenes: current.scenes || [] }), {
              role: 'assistant', content: `${planned.message || 'Ini kerangkanya.'}${capped} Kerangka ${planned.chapters.length} bab: ${planned.chapters.map((chapter, i) => `${i + 1}. ${chapter.title}`).join(', ')}.`,
            }));
          } else {
            doc = await changeProjectDoc(pool, job.project_id, (current) => ({ ...current, scenes: index === 0 ? scenes : [...current.scenes, ...scenes] }));
            longState = { ...longState, chaptersDone: index + 1 };
            await keepLongState(pool, job, longState);
          }
        },
      });
      const length = doc.scenes.reduce((sum, scene) => sum + scene.seconds, 0);
      doc = await changeProjectDoc(pool, job.project_id, (current) => say(current, {
        role: 'assistant', content: `Selesai: ${outline.chapters.length} bab, ${current.scenes.length} adegan, ${Math.floor(length / 60)}:${String(length % 60).padStart(2, '0')}.`,
        plan: { styleId: outline.styleId, scenes: current.scenes, skills: result.skills }, credits: round(spent),
      }));
      wants = { voiceover: outline.generate?.voiceover, music: outline.generate?.music, scenes: null };
    } else {
      const saved = await changeProjectDoc(pool, job.project_id, (current) => current);
      const long = saved.scenes.length > PLAN_SCENES;
      const range = long ? sceneRange(job.input.brief, saved.scenes.length) : null;
      const sound = long && !range ? soundWanted(job.input.brief) : null;
      if (long && !range && !sound) {
        // One answer cannot rewrite a long video: say how to ask instead of replacing it with a short one.
        doc = await changeProjectDoc(pool, job.project_id, (current) => say(current, {
          role: 'assistant',
          content: `Video ini punya ${saved.scenes.length} adegan. Untuk revisi, sebut adegannya, misalnya "adegan 12-15 lebih dramatis" (maksimal ${PLAN_SCENES} adegan sekali revisi), minta "buatkan musik dan vo", atau minta ulang dengan durasi, misalnya "jadikan 4 menit".`,
        }));
        wants = { voiceover: false, music: false, scenes: null };
      } else if (sound) {
        doc = saved;
        wants = { ...sound, scenes: null };
      } else {
        // A short video, or a window of a long one (its scenes go to the AI and come back in their place).
        const [from, to] = range || [0, saved.scenes.length];
        const input = range ? { ...job.input, current: { ...(job.input.current || {}), styleId: saved.styleId, format: saved.format, scenes: saved.scenes.slice(from, to).map(({ voAudio, ...scene }) => scene) } } : job.input;
        const result = await plan(input);
        spent += await chargeText({ pool, job, result, priceText, appendCredit, readBalance });
        const planned = result.plan;
        doc = await changeProjectDoc(pool, job.project_id, (current) => {
          const next = range
            ? applyPlan(current, { ...planned, scenes: [...current.scenes.slice(0, from), ...planned.scenes, ...current.scenes.slice(to)] })
            : applyPlan(current, planned);
          return say(next, { role: 'assistant', content: planned.message || 'Ini rencananya.', plan: planned, credits: round(spent) });
        });
        wants = { voiceover: planned.generate?.voiceover, music: planned.generate?.music, scenes: null };
      }
    }

    const made = [];
    const failed = [];
    const voiceId = doc.audio.voiceId || ELEVENLABS_VOICES[0].id;
    if (wants.voiceover) {
      const todo = doc.scenes.map((scene, index) => ({ scene, index }))
        .filter(({ index }) => !wants.scenes || wants.scenes.includes(index))
        .filter(({ scene }) => scene.vo?.trim() && !(scene.voAudio && scene.voAudio.text === scene.vo && scene.voAudio.voiceId === voiceId));
      let done = 0;
      await setJob(pool, job.id, { progress: `Membuat suara 0/${todo.length}…` });
      const queue = [...todo];
      const worker = async () => {
        while (queue.length) {
          const { scene, index } = queue.shift();
          try {
            const file = await makeAudio({
              pool, workspaceId: job.workspace_id, userId: job.user_id, idempotencyKey: `motion-audio:${job.id}:vo:${index}`,
              input: { type: 'voiceover', text: scene.vo.trim(), voiceId },
            });
            spent += file.credits;
            doc = await changeProjectDoc(pool, job.project_id, (current) => ({
              ...current,
              scenes: current.scenes.map((item, i) => (i === index && item.vo === scene.vo ? {
                ...item,
                voAudio: { url: file.url, seconds: file.seconds, text: scene.vo, voiceId, words: file.words },
                seconds: Math.min(SCENE_LIMITS.maxSeconds, Math.max(item.seconds, Math.ceil(file.seconds + 0.6))),
              } : item)),
            }));
          } catch (error) {
            if (!error.status || error.status >= 500) logError('motion voiceover failed', error.cause || error);
            failed.push(`suara adegan ${index + 1}: ${error.message}`);
          }
          done += 1;
          await setJob(pool, job.id, { progress: `Membuat suara ${done}/${todo.length}…` });
        }
      };
      await Promise.all(Array.from({ length: VOICE_CONCURRENCY }, worker));
      const ok = todo.length - failed.length;
      if (ok > 0) made.push(`suara ${ok} adegan`);
    }
    if (wants.music && doc.audio.musicPrompt) {
      const seconds = Math.min(300, Math.max(3, Math.round(doc.scenes.reduce((sum, scene) => sum + scene.seconds, 0))));
      await setJob(pool, job.id, { progress: `Membuat musik ${seconds} dtk…` });
      try {
        const file = await makeAudio({
          pool, workspaceId: job.workspace_id, userId: job.user_id, idempotencyKey: `motion-audio:${job.id}:music`,
          input: { type: 'music', text: doc.audio.musicPrompt, durationSeconds: seconds },
        });
        spent += file.credits;
        await changeProjectDoc(pool, job.project_id, (current) => ({
          ...current, audio: { ...current.audio, music: { url: file.url, seconds: file.seconds, text: current.audio.musicPrompt } },
        }));
        made.push(`musik ${seconds} dtk`);
      } catch (error) {
        if (!error.status || error.status >= 500) logError('motion music failed', error.cause || error);
        failed.push(`musik: ${error.message}`);
      }
    }
    if (wants.music && !doc.audio.musicPrompt) failed.push('musik: tulis dulu gaya musiknya');
    if (made.length || failed.length) {
      const lines = [];
      if (made.length) lines.push(`Selesai dibuat: ${made.join(' dan ')}. Tekan play untuk mendengar.`);
      if (failed.length) lines.push(`Gagal: ${failed.join('; ')}`);
      await changeProjectDoc(pool, job.project_id, (current) => say(current, {
        role: 'assistant', content: lines.join(' '), ...(made.length ? {} : { error: true }),
      }));
    }
    await setJob(pool, job.id, { status: 'done', progress: '', credits: round(spent), finished_at: new Date() });
  } catch (error) {
    logError('motion job failed', error, error.detail || '');
    const unfinished = longState && longState.chaptersDone < longState.outline.chapters.length;
    const message = unfinished
      ? `Berhenti di bab ${longState.chaptersDone + 1} dari ${longState.outline.chapters.length}${error.transient ? ' karena koneksi ke AI terputus' : ''}${error.status === 402 ? ` (${error.message})` : ''}. Bab yang sudah jadi tetap tersimpan. Ketik "lanjutkan" untuk meneruskan dari bab ${longState.chaptersDone + 1}.`
      : error.status === 402 ? error.message : job.input.type === 'audio' ? 'Audio tidak bisa dibuat sekarang. Coba lagi sebentar lagi.' : 'AI sedang tidak bisa membuat rencana. Coba lagi sebentar lagi.';
    await changeProjectDoc(pool, job.project_id, (current) => say(current, { role: 'assistant', content: message, error: true })).catch(() => {});
    await setJob(pool, job.id, { status: 'failed', progress: '', error: message, credits: round(spent), finished_at: new Date() });
  }
}

const changeStory = (pool, projectId, change) => changeProjectDoc(pool, projectId, (doc) => ({
  kind: 'story', story: change(cleanStory(doc?.kind === 'story' ? doc.story : {})),
}));
const textResult = (usage) => ({
  model: STORY_MODEL, costUsd: usage.costUsd ?? undefined,
  usage: { prompt_tokens: usage.inputTokens, completion_tokens: usage.outputTokens, prompt_tokens_details: { cached_tokens: usage.cachedInputTokens } },
});

// A drawn story's job: five ideas, or the whole video from the chosen idea (script, then one narration whose word
// timings set each scene's length, then the music and the drawings side by side). Each step is saved as it lands.
async function runStoryJob(job, deps) {
  if (job.input.type === 'story-chat') return runStoryChat(job, deps);
  if (job.input.type === 'story-produce') return runStoryProduce(job, deps);
  return runStorySteps(job, deps);
}

// At most one call every `ms`, the last one always delivered (a streamed reply only needs a few writes a second).
function throttle(fn, ms) {
  let last = 0;
  let timer = null;
  let pending = null;
  return (value) => {
    pending = value;
    const now = Date.now();
    if (now - last >= ms) { last = now; return fn(value).catch(() => {}); }
    if (!timer) timer = setTimeout(() => { timer = null; last = Date.now(); fn(pending).catch(() => {}); }, ms - (now - last));
    return undefined;
  };
}

const TOOL_PROGRESS = { look_at_reference: 'Melihat kiriman…', read_web: 'Membaca halaman web…', use_web_image: 'Mengambil gambar…', add_sound: 'Merencanakan suara…', inspect_scene: 'Melihat adegan…', show_card: 'Menyiapkan…', update_plan: 'Menyusun rencana…', propose_ideas: 'Mencari ide…', write_script: 'Menulis naskah…', edit_scenes: 'Merevisi adegan…', find_assets: 'Mencari gambar…', produce: 'Menghitung biaya…' };

// One chat message to the Motion agent: it edits the story with its tools and answers in the chat.
// The bytes of a workspace asset (a reference the user sent), from storage.
async function assetBytes(workspaceId, assetId) {
  const storage = createStorage();
  const result = await createAssetDownload(workspaceId, assetId, storage, DISPLAY_DOWNLOAD_CACHE, {});
  if (!result) throw fail('File tidak ditemukan.', 404);
  const target = result.download.url;
  if (new URL(target).protocol === 'local:') {
    const object = await storage.get(target);
    return { bytes: Buffer.from(object.body), contentType: object.contentType || result.asset?.content_type || '' };
  }
  const response = await fetch(target, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw fail('File tidak bisa dibaca.', 502);
  return { bytes: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get('content-type') || result.asset?.content_type || '' };
}

async function runStoryChat(job, { pool, priceText, appendCredit, readBalance, logError, agent = runAgentTurn, findAssets = findStoryAssets, estimate = produceEstimate, inspect = inspectScene }) {
  let spent = 0;
  try {
    await setJob(pool, job.id, { progress: 'Berpikir…' });
    const doc = await changeProjectDoc(pool, job.project_id, (d) => d);
    const story = cleanStory(doc?.kind === 'story' ? doc.story : {});
    const turn = await agent({
      story, message: job.input.message,
      findAssets: (args) => findAssets({ pool, workspaceId: job.workspace_id, ...args }),
      estimate: (args) => estimate(args),
      inspect: (args) => inspect(args),
      lookReference: async ({ reference, question }) => analyzeReference({ ...(await assetBytes(job.workspace_id, reference.assetId)), question }),
      readWeb: (args) => readWebPage(args),
      importWebImage: async ({ url, description }) => {
        const { body, contentType } = await fetchWebImage({ url });
        const imported = await importWorkspaceAsset(job.workspace_id, { filename: `web-${Date.now()}.${contentType.split('/')[1]}`, contentType, body }, createStorage(), pool);
        return { type: 'image', source: 'web', url: imported.url, assetId: imported.asset.id, description, credit: `Gambar dari ${new URL(url).hostname} (diberikan user)` };
      },
      onStep: (names) => setJob(pool, job.id, { progress: TOOL_PROGRESS[names[names.length - 1]] || 'Berpikir…' }),
      // the reply as it is written: "§" marks a streamed draft in the progress line (StoryStudio shows it live)
      onText: throttle((soFar) => setJob(pool, job.id, { progress: `§${soFar.slice(-3000)}` }), 350),
    });
    for (const [i, usage] of turn.usages.entries()) spent += await chargeText({ pool, job, result: textResult(usage), priceText, appendCredit, readBalance, step: `chat${i}` });
    for (const [i, usage] of (turn.extra || []).entries()) spent += await chargeText({ pool, job, result: usage, priceText, appendCredit, readBalance, step: `look${i}` });
    await changeStory(pool, job.project_id, (current) => ({
      ...turn.story,
      chat: [...current.chat, { role: 'assistant', content: turn.reply || 'Siap.', ...(turn.ideas.length ? { ideas: turn.ideas } : {}), ...(turn.cards?.length ? { cards: turn.cards } : {}), credits: round(spent) }],
    }));
    if (turn.story.title && turn.story.title !== story.title) {
      await pool.query('UPDATE motion_projects SET name = $2, updated_at = now() WHERE id = $1', [job.project_id, turn.story.title.slice(0, 80)]);
    }
    await setJob(pool, job.id, { status: 'done', progress: '', credits: round(spent), finished_at: new Date() });
  } catch (error) {
    logError('motion chat failed', error, error.detail || '');
    const message = error.status === 402 ? error.message : 'AI sedang tidak bisa membalas. Coba kirim lagi sebentar lagi.';
    await changeStory(pool, job.project_id, (s) => ({ ...s, chat: [...s.chat, { role: 'assistant', content: message, error: true }] })).catch(() => {});
    await setJob(pool, job.id, { status: 'failed', progress: '', error: message, credits: round(spent), finished_at: new Date() });
  }
}

// The approved production of a chat story: the narration (when its text changed), the music, and the drawings of
// the scenes that need them (a new narration also redraws scenes it stretched or shrank by more than a fifth).
async function runStoryProduce(job, { pool, priceText, appendCredit, readBalance, makeAudio, logError, story: steps }) {
  let spent = 0;
  const problems = [];
  try {
    const doc = await changeProjectDoc(pool, job.project_id, (d) => d);
    let story = cleanStory(doc?.kind === 'story' ? doc.story : {});
    if (!story.pending) throw fail('Tidak ada yang menunggu dibuat.', 400);
    const needs = productionNeeds(story);
    const pace = paceOf(story.paceSpec || story.pace);
    let draw = new Set(needs.draw);
    if (needs.voice) {
      await setJob(pool, job.id, { progress: 'Merekam suara narator…' });
      const text = narrationText(story.scenes, story.paceSpec || story.pace);
      try {
        const file = await makeAudio({
          pool, workspaceId: job.workspace_id, userId: job.user_id, idempotencyKey: `motion-audio:${job.id}:narration`,
          input: { type: 'voiceover', text, voiceId: story.voiceId || ELEVENLABS_VOICES[0].id, stability: pace.stability },
        });
        spent += file.credits;
        const before = story.scenes.map((s) => s.duration);
        const timed = timeScenes(story.scenes, file.words, file.seconds);
        timed.forEach((scene, i) => { if (scene.code && Math.abs(scene.duration - before[i]) > before[i] * 0.2) draw.add(i); });
        story = await changeStory(pool, job.project_id, (s) => ({ ...s, scenes: timed.map((t, i) => ({ ...s.scenes[i], duration: t.duration, words: t.words })), voice: { url: file.url, seconds: file.seconds }, voiceText: text, voiceFor: story.voiceId || ELEVENLABS_VOICES[0].id }))
          .then((d) => d.story);
      } catch (error) {
        if (!error.status || error.status >= 500) logError('motion story narration failed', error.cause || error);
        problems.push(`suara narator: ${error.message}`);
      }
    }
    const length = Math.round(story.scenes.reduce((sum, scene) => sum + scene.duration, 0));
    const musicPrompt = story.musicPrompt || pace.music;
    const song = needs.music ? (async () => {
      try {
        const file = await makeAudio({
          pool, workspaceId: job.workspace_id, userId: job.user_id, idempotencyKey: `motion-audio:${job.id}:music`,
          input: { type: 'music', text: musicPrompt, durationSeconds: Math.min(300, Math.max(3, length + 1)) },
        });
        spent += file.credits;
        await changeStory(pool, job.project_id, (s) => ({ ...s, musicTrack: { url: file.url, seconds: file.seconds }, musicFor: story.musicPrompt || '' }));
      } catch (error) {
        if (!error.status || error.status >= 500) logError('motion story music failed', error.cause || error);
        problems.push(`musik: ${error.message}`);
      }
    })() : Promise.resolve();
    const effects = (needs.sounds || []).length ? (async () => {
      for (const key of needs.sounds) {
        const item = story.sounds.find((x) => x.key === key);
        if (!item) continue;
        try {
          const file = await makeAudio({
            pool, workspaceId: job.workspace_id, userId: job.user_id, idempotencyKey: `motion-audio:${job.id}:sound:${key}`,
            input: { type: 'sound', text: item.prompt, durationSeconds: item.seconds, loop: item.kind !== 'effect' },
          });
          spent += file.credits;
          await changeStory(pool, job.project_id, (s) => ({ ...s, sounds: s.sounds.map((x) => (x.key === key ? { ...x, url: file.url, madeFrom: item.prompt } : x)) }));
        } catch (error) {
          if (!error.status || error.status >= 500) logError('motion story sound failed', error.cause || error);
          problems.push(`suara ${key}: ${error.message}`);
        }
      }
    })() : Promise.resolve();
    const only = [...draw].sort((a, b) => a - b);
    // the free canvas: the video's characters are designed first, then every scene draws them (s.cast)
    if (only.length && story.canvas === 2 && story.cast.some((c) => !c.code || c.madeFrom !== c.look) && steps.designCast) {
      await setJob(pool, job.id, { progress: 'Mendesain tokoh dan properti…' });
      try {
        const designed = await steps.designCast({ cast: story.cast, style: story.styleSpec || story.style, format: story.format, palette: story.palette, brief: story.brief, artDirection: story.artDirection });
        for (const [i, usage] of designed.usages.entries()) spent += await chargeText({ pool, job, result: textResult(usage), priceText, appendCredit, readBalance, step: `cast${i}` });
        story = await changeStory(pool, job.project_id, (s) => ({ ...s, cast: s.cast.map((c) => designed.cast.find((d) => d.name === c.name && d.look === c.look) || c) })).then((d) => d.story);
      } catch (error) {
        if (!error.status || error.status >= 500) logError('motion cast design failed', error.cause || error);
        problems.push(`desain tokoh/properti: ${error.message}`);
      }
    }
    if (only.length) {
      await setJob(pool, job.id, { progress: `Menggambar 0/${only.length} adegan…` });
      const drawn = await steps.animateStory({
        scenes: story.scenes, only, pace: story.paceSpec || story.pace, style: story.styleSpec || story.style, cast: story.cast, assets: story.assets, format: story.format, sounds: story.sounds,
        canvas: story.canvas, palette: story.palette, caption: story.caption, artDirection: story.artDirection,
        onProgress: (done, total) => setJob(pool, job.id, { progress: `Menggambar ${done}/${total} adegan…` }),
        // each group's scenes go into the project as soon as they are checked, so the preview fills in as it draws
        onScenes: (ready) => changeStory(pool, job.project_id, (s) => ({ ...s, scenes: s.scenes.map((scene, i) => (ready[i] ? { ...scene, code: ready[i].code, codeError: ready[i].codeError, redraw: false } : scene)) })),
      });
      for (const [i, usage] of drawn.usages.entries()) spent += await chargeText({ pool, job, result: textResult(usage), priceText, appendCredit, readBalance, step: `draw${i}` });
      await changeStory(pool, job.project_id, (s) => ({ ...s, scenes: s.scenes.map((scene, i) => (only.includes(i) ? { ...drawn.scenes[i], duration: scene.duration, words: scene.words } : scene)) }));
      const broken = only.filter((i) => drawn.scenes[i].codeError).length;
      if (broken) problems.push(`${broken} adegan belum bisa digambar`);
    }
    await song;
    await effects;
    const made = [needs.voice && 'suara narator', needs.music && 'musik', needs.sounds?.length && `${needs.sounds.length} suara`, only.length && `${only.length} adegan`].filter(Boolean).join(', ');
    await changeStory(pool, job.project_id, (s) => ({
      ...s, pending: null,
      chat: [...s.chat, { role: 'assistant', content: `Selesai dibuat: ${made}.${problems.length ? ` Catatan: ${problems.join('; ')}.` : ''} Putar pratinjaunya, lalu bilang kalau ada yang mau diubah.`, credits: round(spent), ...(problems.length ? { error: false } : {}) }],
    }));
    await setJob(pool, job.id, { status: 'done', progress: '', credits: round(spent), error: problems.length ? problems.join('; ') : null, finished_at: new Date() });
  } catch (error) {
    logError('motion produce failed', error, error.detail || '');
    const message = error.status === 402 || error.status === 400 ? error.message : 'Produksi berhenti di tengah. Yang sudah jadi tetap tersimpan; coba lagi sebentar lagi.';
    await changeStory(pool, job.project_id, (s) => ({ ...s, chat: [...s.chat, { role: 'assistant', content: message, error: true, credits: round(spent) }] })).catch(() => {});
    await setJob(pool, job.id, { status: 'failed', progress: '', error: message, credits: round(spent), finished_at: new Date() });
  }
}

// The step-by-step flow (ideas, then the whole video from an idea).
async function runStorySteps(job, { pool, priceText, appendCredit, readBalance, makeAudio, logError, story }) {
  const input = job.input;
  let spent = 0;
  const charge = async (usage, step) => {
    spent += await chargeText({ pool, job, result: textResult(usage), priceText, appendCredit, readBalance, step });
  };
  const settings = (s) => ({ ...s, topic: input.topic || s.topic, pace: input.pace, style: input.style, sceneCount: input.sceneCount, note: input.note });
  try {
    if (input.type === 'story-ideas') {
      await setJob(pool, job.id, { progress: 'Mencari 5 ide…' });
      const { ideas, usage } = await story.storyIdeas(input);
      await charge(usage, 'ideas');
      await changeStory(pool, job.project_id, (s) => ({ ...settings(s), ideas, idea: null }));
    } else {
      await setJob(pool, job.id, { progress: 'Menulis naskah…' });
      const { script, usage } = await story.storyScript(input);
      await charge(usage, 'script');
      let scenes = script.scenes;
      await changeStory(pool, job.project_id, (s) => ({
        ...settings(s), idea: input.idea, voiceId: input.voiceId, music: input.music,
        title: script.title, seo: script.seo, background: script.background || s.background, scenes, voice: null, musicTrack: null,
        musicPrompt: script.music || '',
      }));

      await setJob(pool, job.id, { progress: 'Merekam suara narator…' });
      const pace = paceOf(input.pace);
      const voiceId = input.voiceId || ELEVENLABS_VOICES[0].id;
      let voice = null;
      const problems = [];
      try {
        const file = await makeAudio({
          pool, workspaceId: job.workspace_id, userId: job.user_id, idempotencyKey: `motion-audio:${job.id}:narration`,
          input: { type: 'voiceover', text: narrationText(scenes, input.pace), voiceId, stability: pace.stability },
        });
        spent += file.credits;
        voice = { url: file.url, seconds: file.seconds };
        scenes = timeScenes(scenes, file.words, file.seconds);
      } catch (error) {
        if (!error.status || error.status >= 500) logError('motion story narration failed', error.cause || error);
        problems.push(`suara narator: ${error.message}`);
      }
      await changeStory(pool, job.project_id, (s) => ({ ...s, scenes, voice }));

      const length = Math.round(scenes.reduce((sum, scene) => sum + scene.duration, 0));
      const song = input.music ? (async () => {
        try {
          const file = await makeAudio({
            pool, workspaceId: job.workspace_id, userId: job.user_id, idempotencyKey: `motion-audio:${job.id}:music`,
            input: { type: 'music', text: script.music || pace.music, durationSeconds: Math.min(300, Math.max(3, length + 1)) },
          });
          spent += file.credits;
          await changeStory(pool, job.project_id, (s) => ({ ...s, musicTrack: { url: file.url, seconds: file.seconds } }));
        } catch (error) {
          if (!error.status || error.status >= 500) logError('motion story music failed', error.cause || error);
          problems.push(`musik: ${error.message}`);
        }
      })() : Promise.resolve();

      await setJob(pool, job.id, { progress: `Menggambar 0/${scenes.length} scene…` });
      const drawn = await story.animateStory({
        scenes, pace: input.pace, style: input.style,
        onProgress: (done, total) => setJob(pool, job.id, { progress: `Menggambar ${done}/${total} scene…` }),
      });
      for (const [i, usage] of drawn.usages.entries()) await charge(usage, `draw${i}`);
      await changeStory(pool, job.project_id, (s) => ({ ...s, scenes: drawn.scenes }));
      await song;
      const broken = drawn.scenes.filter((scene) => scene.codeError).length;
      if (broken) problems.push(`${broken} scene belum bisa digambar`);
      if (problems.length) logError('motion story finished with problems', job.id, problems.join('; '));
      await setJob(pool, job.id, { status: 'done', progress: '', credits: round(spent), error: problems.length ? problems.join('; ') : null, finished_at: new Date() });
      return;
    }
    await setJob(pool, job.id, { status: 'done', progress: '', credits: round(spent), finished_at: new Date() });
  } catch (error) {
    logError('motion story job failed', error, error.detail || '');
    const message = error.status === 402 ? error.message : input.type === 'story-ideas'
      ? 'AI sedang tidak bisa mencari ide. Coba lagi sebentar lagi.'
      : 'Video belum selesai dibuat. Bagian yang sudah jadi tetap tersimpan; coba lagi sebentar lagi.';
    await setJob(pool, job.id, { status: 'failed', progress: '', error: message, credits: round(spent), finished_at: new Date() });
  }
}

// After a worker restart: jobs stuck running are failed (their files and charges are kept), queued ones re-queued.
export async function recoverMotionJobs({ pool, queue, staleMinutes = 15 }) {
  await pool.query(
    `UPDATE motion_jobs SET status = 'failed', error = 'Dihentikan karena worker dimulai ulang.', progress = '', finished_at = now(), updated_at = now()
     WHERE status = 'running' AND updated_at < now() - make_interval(mins => $1)`,
    [staleMinutes],
  );
  const queued = await pool.query("SELECT id FROM motion_jobs WHERE status = 'queued' AND created_at < now() - interval '30 seconds'");
  for (const { id } of queued.rows) await queue.add('run', { jobId: id }, { jobId: id, attempts: 1 });
  return queued.rows.length;
}
