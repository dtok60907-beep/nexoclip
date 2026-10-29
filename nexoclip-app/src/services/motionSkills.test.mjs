import test from 'node:test';
import assert from 'node:assert/strict';
import { MOTION_SKILLS, pickSkills, skillsPrompt } from './motionSkills.js';
import { systemPrompt } from './motionDirector.js';

const ids = (skills) => skills.map((entry) => entry.id);

test('a request loads the skills its words match, the latest message first, at most two', () => {
  assert.deepEqual(ids(pickSkills('Promo diskon 50% kopi untuk reels')), ['short-form', 'promo']);
  assert.deepEqual(ids(pickSkills('Buatkan animasi 60 detik perjalanan homo sapiens')), ['story']);
  assert.deepEqual(ids(pickSkills('halo')), []);
  // A follow-up keeps the skill of the conversation.
  assert.deepEqual(ids(pickSkills('buatkan music dan vonya', [{ role: 'user', content: 'sejarah homo sapiens' }])), ['story']);
  assert.ok(pickSkills('promo diskon tiktok iklan launching testimoni').length <= 2);
});

test('skills are short enough to send every request and land in the system prompt', () => {
  for (const entry of MOTION_SKILLS) assert.ok(entry.guide.length < 1100, `${entry.id} is ${entry.guide.length} chars`);
  const prompt = systemPrompt(pickSkills('testimoni pelanggan'));
  assert.match(prompt, /SKILLS FOR THIS REQUEST\n\[Testimoni\]/);
  assert.equal(skillsPrompt([]), '');
  assert.doesNotMatch(systemPrompt(), /SKILLS FOR THIS REQUEST/);
});
