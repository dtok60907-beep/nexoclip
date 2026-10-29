import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPlan, enqueueMotionJob, runMotionJob } from './motionJobs.js';

const PROJECT = '33333333-3333-4333-8333-333333333333';
const ASSET = '/api/assets/22222222-2222-4222-8222-222222222222/download?workspace_id=11111111-1111-4111-8111-111111111111';

// An in-memory stand-in for the two tables the jobs touch.
function fakePool({ balance = 50 } = {}) {
  const state = { project: { id: PROJECT, doc: { scenes: [{ title: 'Lama', seconds: 4 }], chat: [] } }, jobs: new Map(), balance };
  const query = async (sql, params = []) => {
    if (sql.startsWith('UPDATE motion_jobs SET input')) { state.jobs.get(params[0]).input = JSON.parse(params[1]); return { rows: [] }; }
    if (sql.startsWith('SELECT id FROM motion_projects')) return { rows: params[1] === PROJECT ? [{ id: PROJECT }] : [] };
    if (sql.startsWith('SELECT doc FROM motion_projects')) return { rows: [{ doc: state.project.doc }] };
    if (sql.startsWith('UPDATE motion_projects SET doc')) { state.project.doc = JSON.parse(params[1]); return { rows: [] }; }
    if (sql.startsWith('INSERT INTO motion_jobs')) {
      if ([...state.jobs.values()].some((job) => ['queued', 'running'].includes(job.status))) throw Object.assign(new Error('dup'), { code: '23505' });
      state.jobs.set(params[0], { id: params[0], project_id: params[1], workspace_id: params[2], user_id: params[3], input: JSON.parse(params[4]), progress: params[5], status: 'queued', credits: 0 });
      return { rows: [] };
    }
    if (sql.includes("SET status = 'running'")) {
      const job = state.jobs.get(params[0]);
      if (!job || job.status !== 'queued') return { rows: [] };
      job.status = 'running';
      return { rows: [job] };
    }
    if (sql.startsWith('UPDATE motion_jobs SET')) {
      const job = state.jobs.get(params[0]);
      const keys = [...sql.matchAll(/(\w+) = \$(\d+)/g)].map((m) => [m[1], Number(m[2])]);
      for (const [key, index] of keys) job[key] = params[index - 1];
      return { rows: [] };
    }
    if (sql.startsWith('SELECT * FROM motion_jobs')) return { rows: [state.jobs.get(params[1])].filter(Boolean) };
    if (sql.startsWith('SELECT input FROM motion_jobs')) {
      const rows = [...state.jobs.values()].filter((job) => job.id !== params[1] && job.status === 'failed' && job.input.outline).reverse();
      return { rows: rows.slice(0, 1).map((job) => ({ input: job.input })) };
    }
    if (sql.startsWith('SELECT balance')) return { rows: [{ balance: state.balance }] };
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] };
    throw new Error(`unexpected SQL: ${sql}`);
  };
  return { state, query, connect: async () => ({ query, release() {} }) };
}

const planned = {
  message: 'Siap', styleId: 'pop-ceria', format: '9:16', voiceId: 'JBFqnCBsd6RMkjVDRZzb', musicPrompt: 'lo-fi', generate: { music: true, voiceover: true },
  scenes: [{ kind: 'text', title: 'Kopi', vo: 'Kopi baru sudah datang.', seconds: 4 }, { kind: 'text', title: 'Pesan', vo: '', seconds: 3 }],
};

test('enqueue writes the message into the project, queues the job and allows one at a time', async () => {
  const pool = fakePool();
  const added = [];
  const queue = { add: async (...args) => added.push(args) };
  const job = await enqueueMotionJob({ pool, queue, workspaceId: 'ws', projectId: PROJECT, userId: 'u', input: { brief: ' promo ' }, newId: () => 'job-1' });
  assert.equal(job.status, 'queued');
  assert.deepEqual(added[0].slice(0, 2), ['run', { jobId: 'job-1' }]);
  assert.deepEqual(pool.state.project.doc.chat.map((m) => m.content), ['promo']);
  await assert.rejects(enqueueMotionJob({ pool, queue, workspaceId: 'ws', projectId: PROJECT, userId: 'u', input: { brief: 'lagi' }, newId: () => 'job-2' }), /masih mengerjakan/);
  await assert.rejects(enqueueMotionJob({ pool: fakePool({ balance: 0 }), queue, workspaceId: 'ws', projectId: PROJECT, userId: 'u', input: { brief: 'x' } }), /Kredit kamu habis/);
});

test('a job plans, charges the tokens, voices the lines, makes the music and writes it all into the project', async () => {
  const pool = fakePool();
  await enqueueMotionJob({ pool, queue: { add: async () => {} }, workspaceId: 'ws', projectId: PROJECT, userId: 'u', input: { brief: 'promo' }, newId: () => 'job-1' });
  const charges = [];
  const audio = [];
  await runMotionJob('job-1', {
    pool,
    plan: async () => ({ plan: planned, usage: { prompt_tokens: 1000, completion_tokens: 200 }, model: 'm' }),
    priceText: async () => ({ usd: 0.001, credits: 0.4 }),
    appendCredit: async (_pool, entry) => charges.push(entry),
    makeAudio: async (args) => { audio.push(args); return { url: ASSET, seconds: args.input.type === 'music' ? 7 : 5.2, credits: args.input.type === 'music' ? 4 : 1, words: [{ w: 'Kopi', s: 0, e: 0.4 }] }; },
    logError: () => {},
  });
  const job = pool.state.jobs.get('job-1');
  assert.equal(job.status, 'done');
  assert.equal(job.credits, 5.4);
  assert.deepEqual(charges.map((c) => [c.reason, c.idempotencyKey, c.amount]), [['motion_text', 'motion-text:job-1', -0.4]]);
  assert.deepEqual(audio.map((a) => [a.input.type, a.idempotencyKey]), [['voiceover', 'motion-audio:job-1:vo:0'], ['music', 'motion-audio:job-1:music']]);
  const doc = pool.state.project.doc;
  assert.equal(doc.styleId, 'pop-ceria');
  assert.equal(doc.scenes[0].voAudio.words[0].w, 'Kopi');
  assert.equal(doc.scenes[0].seconds, 6, 'the scene grew to fit its voice');
  assert.equal(doc.audio.music.seconds, 7);
  assert.deepEqual(doc.chat.map((m) => m.role), ['user', 'assistant', 'assistant']);
  assert.match(doc.chat[2].content, /suara 1 adegan dan musik 9 dtk/);
});

test('a failed plan marks the job failed and tells the user in the chat, without charging', async () => {
  const pool = fakePool();
  await enqueueMotionJob({ pool, queue: { add: async () => {} }, workspaceId: 'ws', projectId: PROJECT, userId: 'u', input: { brief: 'promo' }, newId: () => 'job-1' });
  const charges = [];
  await runMotionJob('job-1', { pool, plan: async () => { throw new Error('down'); }, appendCredit: async (_p, e) => charges.push(e), logError: () => {} });
  assert.equal(pool.state.jobs.get('job-1').status, 'failed');
  assert.equal(charges.length, 0);
  assert.equal(pool.state.project.doc.chat.at(-1).error, true);
  // Running it again does nothing: it is no longer queued.
  await runMotionJob('job-1', { pool, plan: async () => { throw new Error('should not run'); }, logError: () => {} });
});

test('applyPlan keeps a recording whose line the AI left as it was', () => {
  const doc = { scenes: [{ vo: 'Halo', voAudio: { url: ASSET, seconds: 1, text: 'Halo' } }], audio: { voiceId: 'v', musicPrompt: 'old' } };
  const next = applyPlan(doc, { styleId: 's', format: '1:1', scenes: [{ vo: 'Halo' }, { vo: 'Baru' }], musicPrompt: '' });
  assert.equal(next.scenes[0].voAudio.url, ASSET);
  assert.equal(next.scenes[1].voAudio, undefined);
  assert.equal(next.audio.musicPrompt, 'old');
});

test('an audio job voices only the asked scenes of the saved document, without calling the AI', async () => {
  const pool = fakePool();
  pool.state.project.doc = { scenes: [{ title: 'A', vo: 'Satu', seconds: 4 }, { title: 'B', vo: 'Dua', seconds: 4 }], audio: { voiceId: 'JBFqnCBsd6RMkjVDRZzb', musicPrompt: '' }, chat: [] };
  await enqueueMotionJob({ pool, queue: { add: async () => {} }, workspaceId: 'ws', projectId: PROJECT, userId: 'u', input: { type: 'audio', voiceover: true, music: true, scenes: [1] }, newId: () => 'job-a' });
  assert.equal(pool.state.project.doc.chat.length, 0, 'no user message for a button press');
  const audio = [];
  await runMotionJob('job-a', {
    pool, plan: async () => { throw new Error('no AI for audio jobs'); },
    makeAudio: async (args) => { audio.push(args.input); return { url: ASSET, seconds: 1, credits: 1 }; }, logError: () => {},
  });
  assert.deepEqual(audio.map((a) => a.text), ['Dua']);
  assert.equal(pool.state.jobs.get('job-a').status, 'done');
  assert.match(pool.state.project.doc.chat.at(-1).content, /suara 1 adegan.*Gagal: musik: tulis dulu gaya musiknya/);
  await assert.rejects(enqueueMotionJob({ pool, queue: { add: async () => {} }, workspaceId: 'ws', projectId: PROJECT, userId: 'u', input: { type: 'audio' } }), /Pilih musik atau suara/);
});

test('a long request is written chapter by chapter, each request charged on its own key', async () => {
  const { targetSeconds } = await import('./motionDirector.js');
  assert.equal(targetSeconds('animasi cerita homo sapiens 5 menit'), 300);
  assert.equal(targetSeconds('video 2,5 menit'), 150);
  assert.equal(targetSeconds('1 menit 30 detik'), 90);
  assert.equal(targetSeconds('promo kopi'), 0);

  const pool = fakePool();
  await enqueueMotionJob({ pool, queue: { add: async () => {} }, workspaceId: 'ws', projectId: PROJECT, userId: 'u', input: { brief: 'cerita homo sapiens 5 menit' }, newId: () => 'job-l' });
  const charges = [];
  const progress = [];
  const scene = (title) => ({ kind: 'text', title, subtitle: '', cta: '', vo: '', seconds: 5, transition: 'fade', camera: 'push' });
  await runMotionJob('job-l', {
    pool,
    plan: async () => { throw new Error('short planner must not run'); },
    planLong: async ({ onStep, onResult }) => {
      const outline = { message: 'Siap', styleId: 'arsip-kuno', format: '16:9', voiceId: 'JBFqnCBsd6RMkjVDRZzb', musicPrompt: 'orchestral', generate: { music: false, voiceover: false }, chapters: [{ title: 'Afrika', summary: '', seconds: 45 }, { title: 'Migrasi', summary: '', seconds: 45 }] };
      await onStep({ kind: 'outline' });
      progress.push(pool.state.jobs.get('job-l').progress);
      await onResult({ kind: 'outline', usage: {}, outline });
      for (const [index, titles] of [['A1', 'A2'], ['M1', 'M2', 'M3']].entries()) {
        await onStep({ kind: 'chapter', index, total: 2, title: outline.chapters[index].title });
        progress.push(pool.state.jobs.get('job-l').progress);
        await onResult({ kind: 'chapter', index, usage: {}, scenes: titles.map(scene) });
      }
      return { outline, skills: ['Cerita / sejarah'] };
    },
    priceText: async () => ({ usd: 0.001, credits: 0.3 }),
    appendCredit: async (_pool, entry) => charges.push(entry.idempotencyKey),
    logError: () => {},
  });
  assert.deepEqual(progress, ['Menyusun kerangka cerita…', 'Menulis bab 1/2: Afrika…', 'Menulis bab 2/2: Migrasi…']);
  assert.deepEqual(charges, ['motion-text:job-l:outline', 'motion-text:job-l:chapter0', 'motion-text:job-l:chapter1']);
  const doc = pool.state.project.doc;
  assert.deepEqual(doc.scenes.map((s) => s.title), ['A1', 'A2', 'M1', 'M2', 'M3']);
  assert.equal(doc.styleId, 'arsip-kuno');
  assert.match(doc.chat.at(-1).content, /Selesai: 2 bab, 5 adegan, 0:25/);
  assert.equal(pool.state.jobs.get('job-l').status, 'done');
});

test('on a long video a message revises the scenes it names, makes the sound it asks for, or explains', async () => {
  const { sceneRange, soundWanted } = await import('./motionJobs.js');
  assert.deepEqual(sceneRange('adegan 12-15 lebih dramatis', 50), [11, 15]);
  assert.deepEqual(sceneRange('adegan 3', 50), [2, 3]);
  assert.deepEqual(sceneRange('adegan 1 sampai 40', 50), [0, 14]);
  assert.equal(sceneRange('lebih dramatis', 50), null);
  assert.deepEqual(soundWanted('buatkan music dan vonya'), { music: true, voiceover: true });
  assert.equal(soundWanted('lebih dramatis'), null);

  const long = () => {
    const pool = fakePool();
    pool.state.project.doc = { styleId: 'arsip-kuno', format: '16:9', scenes: Array.from({ length: 20 }, (_, i) => ({ kind: 'text', title: `S${i + 1}`, vo: `Baris ${i + 1}`, seconds: 5 })), audio: { voiceId: 'JBFqnCBsd6RMkjVDRZzb', musicPrompt: 'orchestral' }, chat: [] };
    return pool;
  };
  const run = async (pool, brief, extra = {}) => {
    await enqueueMotionJob({ pool, queue: { add: async () => {} }, workspaceId: 'ws', projectId: PROJECT, userId: 'u', input: { brief }, newId: () => `job-${brief}` });
    await runMotionJob(`job-${brief}`, { pool, priceText: async () => ({ usd: 0, credits: 0 }), appendCredit: async () => {}, logError: () => {}, ...extra });
    return pool.state.project.doc;
  };

  let seen = null;
  const revised = await run(long(), 'adegan 3-4 lebih dramatis', {
    plan: async (input) => { seen = input.current.scenes.map((s) => s.title); return { plan: { styleId: 'arsip-kuno', format: '16:9', scenes: [{ kind: 'text', title: 'Baru', vo: '', seconds: 5 }], generate: {} }, usage: {}, model: 'm' }; },
  });
  assert.deepEqual(seen, ['S3', 'S4']);
  assert.deepEqual(revised.scenes.slice(0, 4).map((s) => s.title), ['S1', 'S2', 'Baru', 'S5']);
  assert.equal(revised.scenes.length, 19);

  const voiced = [];
  await run(long(), 'buatkan musik dan vonya', {
    plan: async () => { throw new Error('no AI for a sound-only message'); },
    makeAudio: async (args) => { voiced.push(args.input.type); return { url: ASSET, seconds: 1, credits: 0 }; },
  });
  assert.equal(voiced.filter((t) => t === 'voiceover').length, 20);
  assert.equal(voiced.filter((t) => t === 'music').length, 1);

  const explained = await run(long(), 'lebih dramatis', { plan: async () => { throw new Error('must not replace a long video'); } });
  assert.equal(explained.scenes.length, 20);
  assert.match(explained.chat.at(-1).content, /Video ini punya 20 adegan/);
});

test('a long video that stops on a dropped connection says where, and "lanjutkan" writes the rest', async () => {
  const pool = fakePool();
  await enqueueMotionJob({ pool, queue: { add: async () => {} }, workspaceId: 'ws', projectId: PROJECT, userId: 'u', input: { brief: 'cerita 5 menit' }, newId: () => 'job-1' });
  const outline = { message: 'Siap', styleId: 'arsip-kuno', format: '16:9', voiceId: 'JBFqnCBsd6RMkjVDRZzb', musicPrompt: '', generate: {}, chapters: [{ title: 'A', seconds: 40 }, { title: 'B', seconds: 40 }, { title: 'C', seconds: 40 }] };
  const scene = (title) => ({ kind: 'text', title, subtitle: '', cta: '', vo: '', seconds: 5, transition: 'fade', camera: 'push' });
  const quiet = { priceText: async () => ({ usd: 0, credits: 0 }), appendCredit: async () => {}, logError: () => {} };
  await runMotionJob('job-1', { pool, ...quiet, planLong: async ({ onStep, onResult }) => {
    await onStep({ kind: 'outline' });
    await onResult({ kind: 'outline', usage: {}, outline });
    await onStep({ kind: 'chapter', index: 0, total: 3, title: 'A' });
    await onResult({ kind: 'chapter', index: 0, usage: {}, scenes: [scene('A1')] });
    throw Object.assign(new Error('Koneksi ke AI terputus.'), { transient: true });
  } });
  assert.equal(pool.state.jobs.get('job-1').status, 'failed');
  assert.match(pool.state.project.doc.chat.at(-1).content, /Berhenti di bab 2 dari 3 karena koneksi ke AI terputus.*lanjutkan/);

  await enqueueMotionJob({ pool, queue: { add: async () => {} }, workspaceId: 'ws', projectId: PROJECT, userId: 'u', input: { brief: 'lanjutkan' }, newId: () => 'job-2' });
  let resumed = null;
  await runMotionJob('job-2', { pool, ...quiet, planLong: async ({ brief, resume, onStep, onResult }) => {
    resumed = { brief, start: resume.start, previous: resume.previous.map((s) => s.title), total: resume.total };
    for (const index of [1, 2]) {
      await onStep({ kind: 'chapter', index, total: 3, title: outline.chapters[index].title });
      await onResult({ kind: 'chapter', index, usage: {}, scenes: [scene(`${outline.chapters[index].title}1`)] });
    }
    return { outline, skills: [] };
  } });
  assert.deepEqual(resumed, { brief: 'cerita 5 menit', start: 1, previous: ['A1'], total: 1 });
  assert.deepEqual(pool.state.project.doc.scenes.map((s) => s.title), ['A1', 'B1', 'C1']);
  assert.equal(pool.state.jobs.get('job-2').status, 'done');
});
