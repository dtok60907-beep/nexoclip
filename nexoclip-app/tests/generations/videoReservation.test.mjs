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

const CANVAS_SEEDANCE_25 = 'byteplus/dreamina-seedance-2-5-260628';
const sourceVideo = ['/api/assets/v/download'];

test('recognizes the Canvas Seedance 2.5 id for draft, edit, and extend', () => {
  assert.equal(validateVideoGenerationInput({ kind: 'video', prompt: 'x', model: CANVAS_SEEDANCE_25, parameters: { draft: true, resolution: '480p', aspectRatio: 'adaptive' } }).parameters.draft, true);
  assert.equal(validateVideoGenerationInput({ kind: 'video', prompt: 'x', model: CANVAS_SEEDANCE_25, parameters: { omniReferenceTaskType: 'extend', aspectRatio: 'adaptive', referenceVideos: sourceVideo } }).parameters.omniReferenceTaskType, 'extend');
});

test('Seedance 2.5 edit requires a source video, adaptive ratio, and auto duration', () => {
  const edit = (parameters) => validateVideoGenerationInput({ kind: 'video', prompt: 'remove the car', model: CANVAS_SEEDANCE_25, parameters: { omniReferenceTaskType: 'edit', ...parameters } });
  assert.equal(edit({ aspectRatio: 'adaptive', duration: -1, referenceVideos: sourceVideo }).parameters.duration, -1);
  assert.throws(() => edit({ aspectRatio: 'adaptive', duration: -1 }), /source video/);
  assert.throws(() => edit({ aspectRatio: '16:9', duration: -1, referenceVideos: sourceVideo }), /adaptive/);
  assert.throws(() => edit({ aspectRatio: 'adaptive', duration: 10, referenceVideos: sourceVideo }), /auto/);
  assert.throws(() => validateVideoGenerationInput({ kind: 'video', prompt: 'x', model: 'bytedance/seedance-2.0', parameters: { omniReferenceTaskType: 'edit', aspectRatio: 'adaptive', referenceVideos: sourceVideo } }), /only supported by Seedance 2\.5/);
});

test('Seedance 2.5 accepts auto duration and 4s, older models do not take auto', () => {
  const run = (model, duration) => validateVideoGenerationInput({ kind: 'video', prompt: 'x', model, parameters: { duration } });
  assert.equal(run(CANVAS_SEEDANCE_25, -1).parameters.duration, -1);
  assert.equal(run(CANVAS_SEEDANCE_25, 4).parameters.duration, 4);
  assert.throws(() => run(CANVAS_SEEDANCE_25, 31), /duration/);
  assert.throws(() => run('bytedance/seedance-2.0', -1), /duration/);
});

test('Seedance 2.5 reference limits are 30 images, 10 videos, 10 audio clips', () => {
  const refs = (count) => Array.from({ length: count }, (_, i) => `/api/assets/a${i}/download`);
  const run = (model, parameters) => validateVideoGenerationInput({ kind: 'video', prompt: 'x', model, parameters });
  assert.equal(run(CANVAS_SEEDANCE_25, { referenceImages: refs(30) }).parameters.referenceImages.length, 30);
  assert.throws(() => run(CANVAS_SEEDANCE_25, { referenceImages: refs(31) }), /too many/);
  assert.throws(() => run('bytedance/seedance-2.0', { referenceImages: refs(11) }), /too many/);
  assert.equal(run(CANVAS_SEEDANCE_25, { referenceAudios: refs(10) }).parameters.referenceAudios.length, 10);
  assert.throws(() => run(CANVAS_SEEDANCE_25, { referenceAudios: refs(11) }), /too many/);
  assert.throws(() => run('bytedance/seedance-2.0', { referenceAudios: refs(1) }), /image or video/);
});

test('Seedance 2.5 first-frame tasks are normalized to adaptive ratio', () => {
  const first = { frameType: 'first_frame', url: '/api/assets/f/download' };
  const frameOnly = validateVideoGenerationInput({ kind: 'video', prompt: 'x', model: CANVAS_SEEDANCE_25, parameters: { aspectRatio: '16:9', frameImages: [first], referenceImages: [first.url] } });
  assert.equal(frameOnly.parameters.aspectRatio, 'adaptive');
  const withReference = validateVideoGenerationInput({ kind: 'video', prompt: 'x', model: CANVAS_SEEDANCE_25, parameters: { aspectRatio: '16:9', frameImages: [first], referenceImages: [first.url, '/api/assets/r/download'] } });
  assert.equal(withReference.parameters.aspectRatio, '16:9');
});

test('mov output and watermark are validated', () => {
  assert.equal(validateVideoGenerationInput({ kind: 'video', prompt: 'x', model: CANVAS_SEEDANCE_25, parameters: { outputFormat: 'mov', watermark: true } }).parameters.outputFormat, 'mov');
  assert.throws(() => validateVideoGenerationInput({ kind: 'video', prompt: 'x', model: CANVAS_SEEDANCE_25, parameters: { outputFormat: 'avi' } }), /output format/);
  assert.throws(() => validateVideoGenerationInput({ kind: 'video', prompt: 'x', model: 'bytedance/seedance-2.0', parameters: { outputFormat: 'mov' } }), /mov/);
  assert.throws(() => validateVideoGenerationInput({ kind: 'video', prompt: 'x', model: CANVAS_SEEDANCE_25, parameters: { watermark: 'yes' } }), /watermark/);
});
