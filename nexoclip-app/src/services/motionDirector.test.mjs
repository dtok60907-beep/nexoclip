import test from 'node:test';
import assert from 'node:assert/strict';
import { MOTION_MODEL, normalizePlan, parsePlanJson, planMotion, systemPrompt } from './motionDirector.js';

const env = { BYTEPLUS_API_KEY: 'key', BYTEPLUS_BASE_URL: 'https://ark.example/api/v3/' };

function reply(content, usage = { prompt_tokens: 900, completion_tokens: 200 }) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ choices: [{ message: { content } }], usage }), { status: 200 });
  };
  return { calls, fetchImpl };
}

test('parsePlanJson reads a fenced JSON answer', () => {
  assert.deepEqual(parsePlanJson('```json\n{"styleId":"pop-ceria"}\n```'), { styleId: 'pop-ceria' });
  assert.throws(() => parsePlanJson('no plan here'), /no plan/);
});

test('normalizePlan clamps scenes and falls back on unknown values', () => {
  const plan = normalizePlan({
    styleId: 'not-a-style', format: '4:3',
    scenes: [
      { title: '  Diskon   besar  ', subtitle: 'x'.repeat(200), cta: 'Beli', seconds: 30 },
      { title: '', subtitle: 'dropped' },
      ...Array.from({ length: 16 }, (_, i) => ({ title: `S${i}`, seconds: 1 })),
    ],
  }, { format: '1:1' });
  assert.equal(plan.styleId, 'auto');
  assert.equal(plan.format, '1:1');
  assert.equal(plan.scenes.length, 14);
  assert.deepEqual(plan.scenes[0], { kind: 'text', title: 'Diskon besar', subtitle: 'x'.repeat(90), cta: 'Beli', seconds: 12, vo: '', transition: 'fade', camera: 'push' });
  assert.equal(plan.scenes[1].seconds, 3);
  assert.throws(() => normalizePlan({ scenes: [{ title: '' }] }), /no scenes/);
});

test('planMotion sends the brief, chat and current plan to Seed and returns the plan', async () => {
  const { calls, fetchImpl } = reply('{"message":"Siap","styleId":"neon-game","format":"16:9","scenes":[{"title":"Main sekarang","seconds":4}]}');
  const result = await planMotion({
    brief: 'lebih ceria',
    messages: [{ role: 'user', content: 'promo game' }, { role: 'system', content: 'ignored' }],
    current: { styleId: 'pop-ceria', format: '16:9', scenes: [] },
    env, fetchImpl,
  });
  assert.equal(calls[0].url, 'https://ark.example/api/v3/chat/completions');
  assert.equal(calls[0].body.model, MOTION_MODEL);
  assert.deepEqual(calls[0].body.messages.map((m) => m.role), ['system', 'user', 'user']);
  assert.match(calls[0].body.messages.at(-1).content, /lebih ceria[\s\S]*Current plan/);
  assert.equal(result.plan.styleId, 'neon-game');
  assert.equal(result.plan.scenes[0].seconds, 4);
  assert.equal(result.usage.prompt_tokens, 900);
});

test('planMotion refuses without BytePlus config and reports provider errors', async () => {
  await assert.rejects(planMotion({ brief: 'x', env: {} }), (error) => error.status === 503);
  const fetchImpl = async () => new Response(JSON.stringify({ error: { message: 'bad' } }), { status: 500 });
  await assert.rejects(planMotion({ brief: 'x', env, fetchImpl }), (error) => error.status === 502 && /bad/.test(error.message));
});

test('the prompt carries the craft guide and a scene never runs shorter than its reading time', () => {
  assert.match(systemPrompt(), /CRAFT RULES[\s\S]*STYLE GUIDE/);
  const [scene] = normalizePlan({ scenes: [{ title: 'Diskon 50% semua menu kopi', subtitle: 'Sabtu dan Minggu saja', seconds: 3 }] }).scenes;
  assert.equal(scene.seconds, 5); // 1.2 s + 47 characters / 13 per second, rounded up
});

test('normalizePlan keeps layer scenes, cleans unknown types and animations and times them for reading', () => {
  const plan = normalizePlan({
    scenes: [{
      kind: 'layers', seconds: 3,
      layers: [
        { type: 'heading', text: 'Promo  akhir pekan', entrance: 'words', loop: 'nope' },
        { type: 'price', was: '50.000', now: 35000, entrance: 'teleport', loop: 'pulse', exit: 'zoom-out' },
        { type: 'code', text: 'hemat 30' },
        { type: 'list', items: ['Satu', '', 'Dua', 'Tiga', 'Empat', 'Lima'] },
        { type: 'mystery', text: 'jadi teks' },
        { type: 'text', text: 'enam' },
        { type: 'text', text: 'tujuh, terpotong' },
      ],
    }, { kind: 'layers', layers: [{ type: 'heading', text: '' }] }],
  });
  assert.equal(plan.scenes.length, 1);
  const [scene] = plan.scenes;
  assert.equal(scene.layers.length, 6);
  assert.deepEqual(scene.layers[0], { type: 'heading', entrance: 'words', text: 'Promo akhir pekan' });
  assert.deepEqual(scene.layers[1], { type: 'price', entrance: 'scale', loop: 'pulse', exit: 'zoom-out', was: 50000, now: 35000 });
  assert.equal(scene.layers[2].text, 'HEMAT30');
  assert.deepEqual(scene.layers[3].items, ['Satu', 'Dua', 'Tiga']);
  assert.equal(scene.layers[4].type, 'text');
  assert.ok(scene.seconds > 3);
});

test('normalizePlan keeps the soundtrack the AI wrote and falls back to a known voice', () => {
  const plan = normalizePlan({
    voiceId: 'made-up', musicPrompt: '  lo-fi   90 BPM  ',
    scenes: [{ kind: 'text', title: 'Kopi baru', vo: 'Pagi ini ada kopi baru yang wajib kamu coba, rasanya lembut banget.', seconds: 3 }],
  });
  assert.equal(plan.voiceId, 'JBFqnCBsd6RMkjVDRZzb');
  assert.equal(plan.musicPrompt, 'lo-fi 90 BPM');
  assert.ok(plan.scenes[0].seconds >= 6, 'the scene lasts as long as its voiceover');
  assert.equal(normalizePlan({ voiceId: 'XrExE9yKIg1WjnnlVkGX', scenes: [{ title: 'x' }] }).voiceId, 'XrExE9yKIg1WjnnlVkGX');
});

test('normalizePlan only asks for audio when the model says so explicitly', () => {
  assert.deepEqual(normalizePlan({ scenes: [{ title: 'x' }] }).generate, { music: false, voiceover: false });
  assert.deepEqual(normalizePlan({ generate: { music: true, voiceover: 'yes' }, scenes: [{ title: 'x' }] }).generate, { music: true, voiceover: false });
});

test('planLongMotion asks for the outline, then one request per chapter that knows how the last one ended', async () => {
  const { planLongMotion } = await import('./motionDirector.js');
  const bodies = [];
  const answers = [
    { message: 'Siap', styleId: 'arsip-kuno', format: '16:9', chapters: [{ title: 'Afrika', summary: 'asal', seconds: 40 }, { title: 'Migrasi', summary: 'keluar', seconds: 40 }] },
    { scenes: [{ kind: 'text', title: 'Asal kita', vo: 'Semua berawal dari Afrika.' }] },
    { scenes: [{ kind: 'text', title: 'Keluar dari Afrika' }, { kind: 'text', title: 'Sampai Asia' }] },
  ];
  const fetchImpl = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(answers[bodies.length - 1]) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) };
  };
  const results = [];
  const { outline } = await planLongMotion({
    brief: 'sejarah homo sapiens 5 menit', seconds: 300, env: { BYTEPLUS_API_KEY: 'k', BYTEPLUS_BASE_URL: 'https://ark' }, fetchImpl,
    onResult: async (result) => results.push(result),
  });
  assert.equal(bodies.length, 3);
  assert.match(bodies[0].messages[0].content, /LONG VIDEO, STEP 1/);
  assert.match(bodies[0].messages.at(-1).content, /Requested length: 300 s/);
  assert.match(bodies[2].messages[0].content, /chapter 2 of 2/);
  assert.match(bodies[2].messages[0].content, /Semua berawal dari Afrika/);
  assert.equal(outline.styleId, 'arsip-kuno');
  assert.deepEqual(results.map((r) => r.kind), ['outline', 'chapter', 'chapter']);
  assert.deepEqual(results[2].scenes.map((s) => s.title), ['Keluar dari Afrika', 'Sampai Asia']);
});

test('broken JSON from the model is repaired, or asked for once more', async () => {
  const { parsePlanJson, planLongMotion } = await import('./motionDirector.js');
  assert.deepEqual(parsePlanJson('{"message": "Hai\nbaris", "chapters": [{"title": "A",},], // komentar\n "styleId": “arsip-kuno”}'),
    { message: 'Hai\nbaris', chapters: [{ title: 'A' }], styleId: 'arsip-kuno' });
  const replies = ['{"message": "x", "chapters": [{"title": "A" "seconds": 40}]}', '{"message": "x", "styleId": "arsip-kuno", "chapters": [{"title": "A", "seconds": 40}]}', '{"scenes": [{"kind": "text", "title": "Satu"}]}'];
  let calls = 0;
  const fetchImpl = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: replies[calls++] }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) });
  const usages = [];
  await planLongMotion({ brief: 'x 5 menit', seconds: 300, env: { BYTEPLUS_API_KEY: 'k', BYTEPLUS_BASE_URL: 'https://ark' }, fetchImpl, onResult: async (r) => usages.push(r.usage.prompt_tokens) });
  assert.equal(calls, 3, 'the broken outline was asked for again');
  assert.deepEqual(usages, [20, 10], 'both outline requests are charged');
});

test('a dropped connection or a busy server is tried again before giving up', async () => {
  const { planMotion, setRetryDelayForTests } = await import('./motionDirector.js');
  setRetryDelayForTests(1);
  let calls = 0;
  const ok = { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"scenes": [{"title": "Halo"}]}' } }], usage: {} }) };
  const fetchImpl = async () => { calls += 1; if (calls === 1) throw new TypeError('fetch failed'); if (calls === 2) return { ok: false, status: 503, json: async () => ({}) }; return ok; };
  const { plan } = await planMotion({ brief: 'x', env: { BYTEPLUS_API_KEY: 'k', BYTEPLUS_BASE_URL: 'https://ark' }, fetchImpl });
  assert.equal(calls, 3);
  assert.equal(plan.scenes[0].title, 'Halo');
  calls = 0;
  await assert.rejects(planMotion({ brief: 'x', env: { BYTEPLUS_API_KEY: 'k', BYTEPLUS_BASE_URL: 'https://ark' }, fetchImpl: async () => { calls += 1; throw new TypeError('fetch failed'); } }), (error) => error.transient === true);
  assert.equal(calls, 3);
});
