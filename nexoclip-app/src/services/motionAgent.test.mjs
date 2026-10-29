import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_TOOLS, productionNeeds, runAgentTurn } from './motionAgent.js';
import { cleanStory } from '../../components/motion/draw/story.js';

const usage = { inputTokens: 10, cachedInputTokens: 0, outputTokens: 10, costUsd: null };
const callOf = (steps) => {
  let n = 0;
  const seen = [];
  const call = async ({ messages, tools }) => {
    seen.push({ messages: [...messages], tools });
    const step = steps[n++];
    if (!step) return { text: 'Selesai.', toolCalls: [], message: { role: 'assistant', content: 'Selesai.' }, usage };
    const toolCalls = step.map(([name, args], i) => ({ id: `c${n}${i}`, name, arguments: JSON.stringify(args) }));
    return { text: '', toolCalls, message: { role: 'assistant', content: null, tool_calls: toolCalls }, usage };
  };
  return { call, seen };
};

test('a turn plans, proposes ideas and answers; tools run against a copy of the story', async () => {
  const { call, seen } = callOf([[
    ['update_plan', { brief: 'Edukasi Homo sapiens', kind: 'edukasi sejarah', style: { preset: 'kapur', look: 'kapur di dinding gua' }, pace: { preset: 'normal', words: [4, 9] }, cast: [{ name: 'Ira', look: 'person: skin brown, hair black curly' }], looks: { gua: { top: '#3b2a1e', bottom: '#1a120c', pattern: 'grain' } } }],
    ['propose_ideas', { ideas: [{ title: 'Api pertama', hook: 'Bayangkan malam tanpa api.', angle: 'Api mengubah segalanya.', visualStyle: 'kapur' }] }],
  ]]);
  const story = cleanStory({});
  const turn = await runAgentTurn({ story, message: 'video Homo sapiens', call });
  assert.equal(turn.reply, 'Selesai.');
  assert.equal(turn.ideas.length, 1);
  assert.equal(turn.story.kind, 'edukasi sejarah');
  assert.equal(turn.story.styleSpec.preset, 'kapur');
  assert.equal(turn.story.cast[0].name, 'Ira');
  assert.equal(story.kind, '', 'the original story is not touched');
  assert.equal(seen[0].tools.length, AGENT_TOOLS.length);
  assert.match(seen[0].messages.at(-1).content, /Keadaan video sekarang/);
  assert.equal(seen[1].messages.filter((m) => m.role === 'tool').length, 2);
});

test('script, edits and the production request: only changed scenes are drawn again', async () => {
  const scene = (n) => ({ text: `Ini kalimat nomor ${n}.`, say: `Ini kalimat nomor ${n}.`, visual: `benda ${n}`, theme: 'paper', camera: 'push', emphasis: 'kalimat' });
  const { call } = callOf([[['write_script', { title: 'Uji', scenes: [scene(1), scene(2), scene(3)] }], ['produce', { note: 'pertama' }]]]);
  const turn = await runAgentTurn({ story: cleanStory({}), message: 'tulis', call, estimate: async ({ needs }) => ({ credits: needs.draw.length * 10, breakdown: { draw: needs.draw.length * 10, voice: 0, music: 0 } }) });
  assert.equal(turn.story.scenes.length, 3);
  assert.notEqual(turn.story.scenes[1].camera, turn.story.scenes[0].camera, 'cameras vary');
  assert.deepEqual(turn.story.pending.what, ['voice', 'music', 'draw']);
  assert.equal(turn.story.pending.credits, 30);

  const made = cleanStory({ ...turn.story, pending: null, scenes: turn.story.scenes.map((s) => ({ ...s, code: 's.ground();', redraw: false })) });
  made.voice = { url: '/v', seconds: 5 };
  made.voiceText = 'x';
  const { call: edit } = callOf([[['edit_scenes', { changes: [{ scene: 2, visual: 'api unggun' }], remove: [3] }], ['produce', {}]]]);
  const next = await runAgentTurn({ story: made, message: 'adegan 2 jadi api unggun, hapus 3', call: edit, estimate: async () => ({ credits: 5, breakdown: null }) });
  assert.equal(next.story.scenes.length, 2);
  assert.equal(next.story.scenes[1].visual, 'api unggun');
  assert.deepEqual(productionNeeds(next.story).draw, [1]);
});
