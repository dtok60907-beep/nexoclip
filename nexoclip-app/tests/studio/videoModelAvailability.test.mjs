import test from 'node:test';
import assert from 'node:assert/strict';
import { t2vModels, i2vModels, v2vModels, unavailableVideoModelIds } from '../../packages/studio/src/models.js';

const videoPickers = { t2vModels, i2vModels, v2vModels };

test('Studio video pickers expose only Seedance models with server-side pricing', () => {
  for (const [picker, models] of Object.entries(videoPickers)) {
    assert.ok(models.every((model) => /seedance-2[.-](0|5)|seedance-v2\.0|seedance-1-5-pro|seedance-1-0-pro/i.test(model.id)), `${picker} contains an unpriced model: ${models.map((model) => model.id).join(', ')}`);
  }
  assert.ok(t2vModels.length > 0, 'text-to-video must retain priced Seedance choices');
  assert.ok(i2vModels.length > 0, 'image-to-video must retain priced Seedance choices');
  assert.equal([...t2vModels, ...i2vModels, ...v2vModels].some((model) => /^(veo|sora|kling|hailuo|wan|grok|happyhorse|runway)/i.test(model.id)), false);
  for (const id of ['veo', 'sora', 'kling', 'hailuo', 'wan', 'grok', 'happy-horse', 'runway']) {
    assert.ok(unavailableVideoModelIds.some((hiddenId) => hiddenId.includes(id)), `expected hidden model family ${id}`);
  }
});
