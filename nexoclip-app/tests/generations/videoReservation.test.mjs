import test from 'node:test';
import assert from 'node:assert/strict';

const { validateVideoGenerationInput } = await import('../../src/services/generationService.js');

test('validates a durable SaaS video request and preserves provider parameters', () => {
  assert.deepEqual(validateVideoGenerationInput({
    kind: 'video', prompt: 'A fox runs', model: 'bytedance/seedance-2.0',
    parameters: { aspectRatio: '9:16', duration: 5, resolution: '720p', seed: 42, referenceImages: ['/api/assets/a/download'] },
  }), {
    kind: 'video', prompt: 'A fox runs', model: 'bytedance/seedance-2.0',
    parameters: { aspectRatio: '9:16', duration: 5, resolution: '720p', seed: 42, referenceImages: ['/api/assets/a/download'] },
  });
});

test('accepts owned legacy Canvas references only for the signed internal bridge', () => {
  const input = {
    kind: 'video', prompt: 'Nathan walks', model: 'bytedance/seedance-2.0',
    parameters: {
      referenceImages: ['/spite/api/r2-image/uploads/nathan.png'],
      frameImages: [{ frameType: 'first_frame', url: '/api/r2-image/uploads/start.png' }],
    },
  };

  assert.throws(() => validateVideoGenerationInput(input), /tenant asset references/i);
  assert.deepEqual(validateVideoGenerationInput(input, { allowLegacyCanvasReferences: true }).parameters, input.parameters);
});

test('preserves a validated Canvas project trust scope', () => {
  const canvasProjectId = '11111111-1111-4111-8111-111111111111';
  const result = validateVideoGenerationInput({
    kind: 'video', prompt: 'A fox runs', model: 'bytedance/seedance-2.5',
    parameters: { canvasProjectId },
  });

  assert.equal(result.parameters.canvasProjectId, canvasProjectId);
  assert.throws(() => validateVideoGenerationInput({
    kind: 'video', prompt: 'A fox runs', model: 'bytedance/seedance-2.5',
    parameters: { canvasProjectId: 'not-a-project-id' },
  }), /Canvas project id is invalid/);
});

test('rejects unsafe video reference URLs', () => {
  assert.throws(() => validateVideoGenerationInput({ kind: 'video', prompt: 'x', model: 'bytedance/seedance-2.0', parameters: { referenceVideos: ['https://untrusted.example/video.mp4'] } }), /reference/i);
  assert.throws(() => validateVideoGenerationInput({ kind: 'video', prompt: 'x', model: 'bytedance/seedance-2.0', parameters: { referenceVideos: ['https://untrusted.example/video.mp4'] } }, { allowLegacyCanvasReferences: true }), /reference/i);
});
