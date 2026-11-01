import test from 'node:test';
import assert from 'node:assert/strict';
import { openRouterT2VModels, openRouterI2VModels, OPENROUTER_VIDEO_MODEL_MAP, getDurationsForModel, getDurationsForI2VModel, getMaxImagesForI2VModel } from '../../packages/studio/src/models.js';

test('every direct Seedance Studio variant exposes each supported second', () => {
  for (const [models, durations] of [[openRouterT2VModels, getDurationsForModel], [openRouterI2VModels, getDurationsForI2VModel]]) {
    for (const model of models) {
      const provider = OPENROUTER_VIDEO_MODEL_MAP[model.id];
      const is25 = provider === 'bytedance/seedance-2.5' || provider === 'ep-20260904190604-p8pjl';
      if (!is25 && !/seedance-2\.0/.test(provider)) continue;
      assert.deepEqual(durations(model.id), Array.from({ length: (is25 ? 30 : 15) - 3 }, (_, i) => i + 4), model.id);
    }
  }
  assert.equal(getMaxImagesForI2VModel('seedance-2.5-omni-reference'), 30);
  for (const id of ['seedance-2-mini-image-to-video', 'seedance-v2.0-i2v', 'seedance-2-image-to-video-fast']) assert.equal(getMaxImagesForI2VModel(id), 9);
});
