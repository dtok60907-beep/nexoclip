import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCastCode, checkSceneCode, designCast } from './motionStory.js';
import { castPrompt, animatePrompt } from './motionStoryPrompts.js';
import { splitCast } from '../../components/motion/draw/sketch.js';
import { cleanStory } from '../../components/motion/draw/story.js';
import { captionBand } from '../../components/motion/draw/layout.js';

const castCode = '// moves: action walk\nconst sw = o.action === "walk" ? Math.sin(o.t * 8) * 0.5 : 0;\ns.group({ y: -40, rotate: sw }, () => s.rect(-5, 0, 10, 40, { fill: "#333" }));\ns.circle(0, -100, 20, { fill: "#f4c7a1" });';

test('new stories are drawn on the free canvas; older drawn ones keep their themed backgrounds', () => {
  assert.equal(cleanStory({}).canvas, 2);
  assert.equal(cleanStory({ scenes: [{ text: 'a', code: 's.ground();' }] }).canvas, 1);
  assert.equal(cleanStory({ canvas: 2, scenes: [{ text: 'a', code: 's.ground();' }] }).canvas, 2);
  const band = captionBand('9:16', 'top');
  assert.ok(band.top < band.bottom && band.safe[1] >= band.bottom);
});

test('scene code may draw its own backdrop and the designed cast; unknown cast names are refused', () => {
  const cast = [{ name: 'Rani', look: 'x', code: castCode }];
  const code = 's.backdrop((s, ctx) => { ctx.fillStyle = "#123456"; ctx.fillRect(0, 0, s.W, s.H); });\ns.cast("Rani", s.cx, s.groundY, 300, { action: "walk" });';
  assert.equal(checkSceneCode(code, { cast }), null);
  assert.match(checkSceneCode('s.cast("Budi", 1, 1, 100);', { cast }), /cast "Budi"/);
  assert.equal(checkCastCode(castCode), null);
  assert.match(checkCastCode('window.x = 1;'), /tidak diizinkan/);
});

test('characters are designed once from their looks and kept while the look stays the same', async () => {
  const calls = [];
  const call = async (prompt) => { calls.push(prompt); return { text: `\`\`\`js\n// ===== CAST Rani =====\n${castCode}\n\`\`\``, usage: { inputTokens: 1, outputTokens: 1 } }; };
  const { cast, usages } = await designCast({ cast: [{ name: 'Rani', look: 'gadis kurir, jaket oranye' }, { name: 'Pak Tua', look: 'tua', code: castCode, madeFrom: 'tua' }], style: 'flat', call });
  assert.equal(calls.length, 1);
  assert.match(calls[0].user, /Rani: gadis kurir/);
  assert.doesNotMatch(calls[0].user, /Pak Tua/);
  assert.equal(usages.length, 1);
  assert.equal(cast[0].madeFrom, 'gadis kurir, jaket oranye');
  assert.equal(cast[0].moves, 'action walk');
  assert.deepEqual(Object.keys(splitCast(`// ===== CAST Si Merah =====\nx();`)), ['Si Merah']);
  assert.match(castPrompt({ cast: [{ name: 'A', look: 'b' }], style: 'flat' }).system, /CAST Nama/);
  assert.match(animatePrompt({ scenes: [], numbers: [], before: '', pace: 'normal', style: 'flat', canvas: 2 }).system, /s\.backdrop/);
  assert.doesNotMatch(animatePrompt({ scenes: [], numbers: [], before: '', pace: 'normal', style: 'flat', canvas: 1 }).system, /s\.backdrop/);
});

test('props and the art direction are planned, designed with the cast, and drawn with s.prop', async () => {
  const { runAgentTurn } = await import('./motionAgent.js');
  const steps = [[{ id: '1', name: 'update_plan', arguments: JSON.stringify({ art_direction: 'bentuk bulat lembut, bayangan datar ungu', cast: [{ name: 'Rani', look: 'perempuan 25 tahun' }], props: [{ name: 'Motor', look: 'skuter oranye' }] }) }], []];
  let n = 0;
  const call = async () => { const toolCalls = steps[n++] || []; return { text: toolCalls.length ? '' : 'oke', toolCalls, usage: { inputTokens: 1, outputTokens: 1 } }; };
  const turn = await runAgentTurn({ story: cleanStory({}), message: 'x', call });
  assert.equal(turn.story.artDirection, 'bentuk bulat lembut, bayangan datar ungu');
  assert.deepEqual(turn.story.cast.map((c) => [c.name, c.kind]), [['Rani', 'character'], ['Motor', 'prop']]);
  const prompt = castPrompt({ cast: turn.story.cast, style: 'flat', artDirection: turn.story.artDirection });
  assert.match(prompt.user, /PROP Motor: skuter oranye/);
  assert.match(prompt.system, /Laki-laki dan perempuan HARUS jelas beda/);
  assert.match(prompt.system, /bentuk bulat lembut/);
  const propCode = 's.rect(-50, -20, 100, 40, { fill: "#f80" });';
  assert.equal(checkSceneCode('s.prop("Motor", s.cx, s.cy, 200, { state: "on" });', { cast: [{ name: 'Motor', kind: 'prop', look: 'x', code: propCode }] }), null);
  assert.match(checkSceneCode('s.prop("Mobil", 1, 1, 100);', { cast: [] }), /prop "Mobil"/);
});
