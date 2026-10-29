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
import { ELEVENLABS_VOICES } from './elevenlabsAudio.js';

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
export async function enqueueMotionJob({ pool, queue, workspaceId, projectId, userId, input, readBalance = readCreditBalance, newId = randomUUID }) {
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
  const { usd, credits } = await priceText(usage);
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
}) {
  const claimed = await pool.query(
    "UPDATE motion_jobs SET status = 'running', progress = CASE WHEN input->>'type' = 'audio' THEN 'Menyiapkan audio…' ELSE 'Menyusun adegan…' END, updated_at = now() WHERE id = $1 AND status = 'queued' RETURNING *",
    [jobId],
  );
  const job = claimed.rows[0];
  if (!job) return; // already run, or gone with its project
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
