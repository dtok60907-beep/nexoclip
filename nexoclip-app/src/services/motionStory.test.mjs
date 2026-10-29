import test from 'node:test';
import assert from 'node:assert/strict';
import { animateStory, callStoryModel, checkSceneCode, narrationText, spokenWords, storyScript, timeScenes } from './motionStory.js';
import { enqueueMotionJob, runMotionJob, storyInput } from './motionJobs.js';
import { cleanDoc } from './motionProjects.js';

const PROJECT = '33333333-3333-4333-8333-333333333333';
const usage = { inputTokens: 1000, cachedInputTokens: 0, outputTokens: 500, costUsd: null };

test('scene code is run over a few frames: working code passes, loops, network and bad calls do not', () => {
  assert.equal(checkSceneCode('s.ground(); s.group({ x: 360, y: 470, scale: s.pop(0) }, () => s.circle(0, 0, 80, { fill: s.c.orange })); s.sfx("pop", 0.2);', { dur: 2 }), null);
  assert.match(checkSceneCode('while (true) {}'), /terlalu lama/);
  assert.match(checkSceneCode('fetch("https://x")'), /tidak diizinkan/);
  assert.match(checkSceneCode('s.ground(); // the window of the house\n s.nope()'), /s.nope is not a function/);
  assert.match(checkSceneCode('const = 1'), /syntax/);
});

test('the narration is cut back into scenes by its word timings', () => {
  const scenes = [{ text: 'Kamu bilang besok aja,' }, { text: 'padahal kemarin juga.' }];
  const spoken = [{ w: '[calm]', s: 0 }, ...['Kamu', 'bilang', 'besok', 'aja,', 'padahal', 'kemarin', 'juga.'].map((w, i) => ({ w, s: 0.2 + i * 0.4 }))];
  const timed = timeScenes(scenes, spoken, 3.2);
  assert.deepEqual(timed.map((scene) => scene.duration), [1.8, 2]);
  assert.deepEqual(timed[1].words.map((w) => w.s), [0, 0.4, 0.8]);
  assert.equal(narrationText(scenes, 'heboh'), '[excited] Kamu bilang besok aja, padahal kemarin juga.');
  // a reading that split differently still gets lengths, shared out by words
  assert.equal(timeScenes(scenes, spoken.slice(0, 3), 7).length, 2);
});

test('the script keeps the emphasis inside the text and never repeats a camera move', async () => {
  const call = async () => ({ text: '```json\n{"title":"T","scenes":[{"text":"Kamu bilang besok aja,","visual":"kalender","theme":"paper","duration":2,"emphasis":"lusa","camera":"push"},{"text":"padahal kemarin juga.","visual":"kertas","theme":"sky","duration":2,"emphasis":"kemarin","camera":"push"}]}\n```', usage });
  const { script } = await storyScript({ idea: { title: 'T', hook: 'h', angle: 'a', visualStyle: 'v' }, pace: 'normal', style: 'krayon', sceneCount: 2, call });
  assert.equal(script.scenes[0].emphasis, 'bilang');
  assert.notEqual(script.scenes[1].camera, script.scenes[0].camera);
  assert.equal(script.scenes[1].theme, 'paper');
});

test('drawing runs in groups, sends broken scenes back once, and marks what still fails', async () => {
  const scenes = Array.from({ length: 5 }, (_, i) => ({ text: `scene ${i}`, visual: `v${i}`, theme: 'paper', duration: 2, words: [] }));
  const calls = [];
  const call = async ({ user }) => {
    calls.push(user);
    if (user.includes('gagal dijalankan')) return { text: '```js\n// ===== SCENE 2 =====\ns.ground();\n// ===== SCENE 5 =====\ns.nope();\n```', usage };
    if (user.includes('SCENE 5')) return { text: '// ===== SCENE 5 =====\ns.nope();', usage };
    return { text: '// ===== SCENE 1 =====\ns.ground();\n// ===== SCENE 2 =====\nwhile(true){}\n// ===== SCENE 3 =====\ns.ground();\n// ===== SCENE 4 =====\ns.ground();', usage };
  };
  const { scenes: drawn, usages } = await animateStory({ scenes, pace: 'normal', style: 'krayon', call });
  assert.equal(calls.length, 3);
  assert.match(calls[1], /Scene sebelum kelompok ini: v3/);
  assert.equal(usages.length, 3);
  assert.equal(drawn[1].code, 's.ground();');
  assert.equal(drawn[4].code, '');
  assert.match(drawn[4].codeError, /nope/);
});

test('the model call marks the system prompt for caching and reads the cost back', async () => {
  let sent;
  const fetchImpl = async (url, init) => {
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.0012 } }), { status: 200 });
  };
  const result = await callStoryModel({ system: 'S', user: 'U', env: { OPENROUTER_API_KEY: 'k' }, fetchImpl });
  assert.equal(sent.model, 'anthropic/claude-sonnet-5.5');
  assert.deepEqual(sent.messages[0].content[0].cache_control, { type: 'ephemeral' });
  assert.equal(result.usage.costUsd, 0.0012);
});

test('a story document survives the project cleaner', () => {
  const doc = cleanDoc({ kind: 'story', story: { topic: 'disiplin', pace: 'heboh', scenes: [{ text: 'a', camera: 'nope', code: 's.ground();' }] } });
  assert.equal(doc.kind, 'story');
  assert.equal(doc.story.pace, 'heboh');
  assert.equal(doc.story.scenes[0].camera, 'push');
  assert.throws(() => storyInput({ type: 'story-make', idea: {} }), /Pilih dulu/);
});

function fakePool({ balance = 500 } = {}) {
  const state = { project: { id: PROJECT, doc: { kind: 'story', story: {} } }, jobs: new Map(), balance, credits: [] };
  const query = async (sql, params = []) => {
    if (sql.startsWith('SELECT id FROM motion_projects')) return { rows: [{ id: PROJECT }] };
    if (sql.startsWith('SELECT doc FROM motion_projects')) return { rows: [{ doc: state.project.doc }] };
    if (sql.startsWith('UPDATE motion_projects SET doc')) { state.project.doc = JSON.parse(params[1]); return { rows: [] }; }
    if (sql.startsWith('INSERT INTO motion_jobs')) {
      state.jobs.set(params[0], { id: params[0], project_id: params[1], workspace_id: params[2], user_id: params[3], input: JSON.parse(params[4]), status: 'queued', credits: 0 });
      return { rows: [] };
    }
    if (sql.includes("SET status = 'running'")) { const job = state.jobs.get(params[0]); job.status = 'running'; return { rows: [job] }; }
    if (sql.startsWith('UPDATE motion_jobs SET')) {
      const job = state.jobs.get(params[0]);
      for (const [, key, index] of sql.matchAll(/(\w+) = \$(\d+)/g)) job[key] = params[Number(index) - 1];
      return { rows: [] };
    }
    if (sql.startsWith('SELECT * FROM motion_jobs')) return { rows: [state.jobs.get(params[1])].filter(Boolean) };
    if (sql.startsWith('SELECT balance')) return { rows: [{ balance: state.balance }] };
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] };
    throw new Error(`unexpected SQL: ${sql}`);
  };
  return { state, query, connect: async () => ({ query, release() {} }) };
}

test('a whole video: script, one narration that sets the scene lengths, music and drawings, all charged', async () => {
  const pool = fakePool();
  const idea = { title: 'Mesin', hook: 'Kamu bilang besok aja', angle: 'mulai kecil', visualStyle: 'krayon' };
  await assert.rejects(enqueueMotionJob({ pool, queue: { add: async () => {} }, workspaceId: 'ws', projectId: PROJECT, userId: 'u', input: { type: 'story-make', idea }, estimate: async () => 900 }), /butuh sekitar 900/);
  await enqueueMotionJob({ pool, queue: { add: async () => {} }, workspaceId: 'ws', projectId: PROJECT, userId: 'u', input: { type: 'story-make', idea, pace: 'semangat', topic: 'disiplin' }, newId: () => 'job-1', estimate: async () => 90 });
  const charged = [];
  const audio = [];
  await runMotionJob('job-1', {
    pool,
    priceText: async () => ({ usd: 0.01, credits: 2 }),
    appendCredit: async (_, entry) => charged.push(entry.idempotencyKey),
    readBalance: async () => 500,
    makeAudio: async ({ input }) => {
      audio.push(input);
      return input.type === 'voiceover'
        ? { url: '/voice', seconds: 3, credits: 1, words: ['Kamu', 'bilang', 'besok', 'aja,', 'padahal', 'kemarin', 'juga.'].map((w, i) => ({ w, s: i * 0.4 })) }
        : { url: '/music', seconds: 4, credits: 3 };
    },
    story: {
      storyScript: async () => ({ script: { title: 'Nyalain', seo: null, background: null, scenes: [
        { text: 'Kamu bilang besok aja,', visual: 'kalender', theme: 'paper', duration: 2, emphasis: 'besok', camera: 'push', words: [], code: '' },
        { text: 'padahal kemarin juga.', visual: 'kertas', theme: 'night', duration: 2, emphasis: 'kemarin', camera: 'pull', words: [], code: '' },
      ] }, usage }),
      animateStory: async ({ scenes }) => ({ scenes: scenes.map((scene) => ({ ...scene, code: 's.ground();' })), usages: [usage, usage] }),
    },
    logError: () => {},
  });
  const job = pool.state.jobs.get('job-1');
  assert.equal(job.status, 'done');
  const story = pool.state.project.doc.story;
  assert.equal(story.title, 'Nyalain');
  assert.equal(story.voice.url, '/voice');
  assert.equal(story.musicTrack.url, '/music');
  assert.deepEqual(story.scenes.map((scene) => scene.duration), [1.6, 2]);
  assert.ok(story.scenes.every((scene) => scene.code));
  assert.equal(audio[0].stability, 0.5);
  assert.match(audio[0].text, /^\[determined\] Kamu bilang/);
  assert.deepEqual(charged, ['motion-text:job-1:script', 'motion-text:job-1:draw0', 'motion-text:job-1:draw1']);
  assert.equal(job.credits, 10);
});

test('the narrator reads the spoken version (tags, capitals, pauses) and captions still line up', () => {
  const scenes = [
    { text: 'Kamu bilang besok aja,', say: '[low, steady voice] Kamu bilang BESOK aja...' },
    { text: 'padahal kemarin juga.', say: 'padahal kemarin juga bilang gitu.' }, // changed words: read the text instead
  ];
  assert.equal(narrationText(scenes, 'normal'), '[low, steady voice] Kamu bilang BESOK aja... padahal kemarin juga.');
  assert.deepEqual(spokenWords(['[low,', 'steady', 'voice]', 'Kamu', '—', 'BESOK']), ['Kamu', 'BESOK']);
  const spoken = ['[low,', 'steady', 'voice]', 'Kamu', 'bilang', 'BESOK', 'aja...', 'padahal', 'kemarin', 'juga.'].map((w, i) => ({ w, s: i * 0.3 }));
  const timed = timeScenes(scenes, spoken, 4);
  assert.deepEqual(timed[0].words.map((w) => w.w), ['Kamu', 'bilang', 'besok', 'aja,']);
  assert.equal(timed[1].words[0].s, 0);
});

test('a streamed answer is put back together: text as it comes, tool calls by index, the cost', async () => {
  const events = [
    { choices: [{ delta: { content: 'Halo ' } }] },
    { choices: [{ delta: { content: 'dunia', tool_calls: [{ index: 0, id: 't1', function: { name: 'show_', arguments: '{"kind"' } }] } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'card', arguments: ':"brief"}' } }] }, finish_reason: 'tool_calls' }] },
    { choices: [], usage: { prompt_tokens: 5, completion_tokens: 3, cost: 0.002 } },
  ];
  const body = new ReadableStream({ start(c) { for (const e of events) c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(e)}\n\n`)); c.enqueue(new TextEncoder().encode('data: [DONE]\n\n')); c.close(); } });
  const seen = [];
  const result = await callStoryModel({ system: 'S', user: 'U', env: { OPENROUTER_API_KEY: 'k' }, onText: (t) => { seen.push(t); }, fetchImpl: async () => new Response(body, { status: 200 }) });
  assert.deepEqual(seen, ['Halo ', 'Halo dunia']);
  assert.deepEqual(result.toolCalls, [{ id: 't1', name: 'show_card', arguments: '{"kind":"brief"}' }]);
  assert.equal(result.usage.costUsd, 0.002);
});
