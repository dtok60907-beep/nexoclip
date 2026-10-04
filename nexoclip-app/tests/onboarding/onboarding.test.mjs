import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOnboardingAnswers, recommendTool } from '../../src/lib/onboarding/options.js';
import { createOnboardingService } from '../../src/services/onboardingService.js';
import { getAuthRequest } from '../../src/lib/saas/authForm.js';

test('keeps only known onboarding choices and trims the brand name', () => {
  const answers = normalizeOnboardingAnswers({
    role: 'seller',
    category: 'not-a-category',
    goals: ['product-video', 'product-video', 'hack', 'influencer'],
    platforms: 'tiktok',
    experience: 'some',
    teamSize: 'solo',
    source: 'tiktok',
    brandName: `  ${'x'.repeat(100)}  `,
    isAdmin: true,
  });
  assert.deepEqual(Object.keys(answers).sort(), ['brandName', 'experience', 'goals', 'role', 'source', 'teamSize']);
  assert.deepEqual(answers.goals, ['product-video', 'influencer']);
  assert.equal(answers.brandName.length, 80);
  assert.equal(answers.category, undefined);
});

test('recommends the tool most chosen goals point to, defaulting to Video Studio', () => {
  assert.equal(recommendTool([]), 'video');
  assert.equal(recommendTool(['product-photo']), 'image');
  assert.equal(recommendTool(['product-video', 'ugc', 'product-photo']), 'video');
  assert.equal(recommendTool(['campaign']), 'canvas');
});

function fakePool() {
  const rows = new Map();
  return {
    rows,
    async query(text, values) {
      if (text.startsWith('SELECT')) return { rows: rows.has(values[0]) ? [rows.get(values[0])] : [] };
      const row = { user_id: values[0], status: values[1], answers: JSON.parse(values[2]), completed_at: new Date() };
      rows.set(values[0], row);
      return { rows: [row] };
    },
  };
}

test('reports no onboarding until it is saved, then stores normalized answers', async () => {
  const pool = fakePool();
  const service = createOnboardingService({ pool });
  assert.equal((await service.get('u1')).status, null);
  const saved = await service.save('u1', { status: 'completed', answers: { role: 'agency', goals: ['canvas-typo', 'campaign'] } });
  assert.equal(saved.status, 'completed');
  assert.deepEqual(saved.answers, { role: 'agency', goals: ['campaign'] });
  assert.equal((await service.get('u1')).status, 'completed');
});

test('rejects an unknown onboarding status', async () => {
  const service = createOnboardingService({ pool: fakePool() });
  await assert.rejects(() => service.save('u1', { status: 'admin' }), (error) => error.status === 400);
});

test('register requests carry the display name; login requests do not', () => {
  const values = { email: ' rina@example.com ', password: 'a-long-password!', displayName: ' Rina ' };
  assert.deepEqual(JSON.parse(getAuthRequest('register', values).options.body), { email: 'rina@example.com', password: 'a-long-password!', displayName: 'Rina' });
  assert.deepEqual(JSON.parse(getAuthRequest('login', values).options.body), { email: 'rina@example.com', password: 'a-long-password!' });
});
