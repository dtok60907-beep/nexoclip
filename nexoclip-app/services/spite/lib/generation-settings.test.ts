import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveGenerationSettings, settingsForModelChange } from './generation-settings'

test('unset video fields resolve to the model defaults the node will submit', () => {
  const settings = resolveGenerationSettings('video', { modelId: 'seedance-2.5-unfiltered' })
  assert.equal(settings.modelId, 'seedance-2.5-unfiltered')
  assert.equal(settings.resolution, '720p')
  assert.equal(settings.aspectRatio, '16:9')
  assert.equal(settings.duration, '5s')
  assert.equal(settings.enableAudio, true)
})

test('explicit values win and legacy model ids resolve to their current model', () => {
  const settings = resolveGenerationSettings('video', {
    modelId: 'seedance-1.5', resolution: '1080p', aspectRatio: '9:16', duration: '30s', enableAudio: false,
  })
  assert.equal(settings.modelId, 'seedance-2.0')
  assert.deepEqual(
    [settings.resolution, settings.aspectRatio, settings.duration, settings.enableAudio],
    ['1080p', '9:16', '30s', false],
  )
})

test('draft and extend only apply to models that support them', () => {
  assert.equal(resolveGenerationSettings('video', { modelId: 'seedance-2.0', draftMode: true }).draftMode, false)
  assert.equal(resolveGenerationSettings('video', { modelId: 'seedance-2.5', draftMode: true }).draftMode, true)
})

test('changing model keeps supported toggles and resets the rest to model defaults', () => {
  const patch = settingsForModelChange('video', 'seedance-2.0', {
    modelId: 'seedance-2.5', draftMode: true, enableAudio: false, resolution: '480p',
  })
  assert.deepEqual(patch, {
    modelId: 'seedance-2.0', aspectRatio: '16:9', resolution: '720p', duration: '5s',
    enableAudio: false, draftMode: false, extendMode: false, editMode: false, outputFormat: 'mp4', watermark: false,
  })
})

test('Seedance 2.5 offers 4s and auto duration, older models clamp to 5s', () => {
  assert.equal(resolveGenerationSettings('video', { modelId: 'seedance-2.5', duration: '4s' }).duration, '4s')
  assert.equal(resolveGenerationSettings('video', { modelId: 'seedance-2.5', duration: 'auto' }).duration, 'auto')
  assert.equal(resolveGenerationSettings('video', { modelId: 'seedance-2.0', duration: 'auto' }).duration, '5s')
  assert.equal(resolveGenerationSettings('video', { modelId: 'seedance-2.0', duration: '4s' }).duration, '5s')
})

test('edit mode forces auto duration and replaces extend', () => {
  const settings = resolveGenerationSettings('video', { modelId: 'seedance-2.5', editMode: true, extendMode: true, duration: '10s' })
  assert.equal(settings.editMode, true)
  assert.equal(settings.extendMode, false)
  assert.equal(settings.duration, 'auto')
  assert.equal(resolveGenerationSettings('video', { modelId: 'seedance-2.0', editMode: true }).editMode, false)
})

test('mov output and watermark only apply to models that support them', () => {
  assert.equal(resolveGenerationSettings('video', { modelId: 'seedance-2.5', outputFormat: 'mov', watermark: true }).outputFormat, 'mov')
  assert.equal(resolveGenerationSettings('video', { modelId: 'seedance-2.0', outputFormat: 'mov' }).outputFormat, 'mp4')
  assert.equal(resolveGenerationSettings('video', { modelId: 'seedance-2.0', watermark: true }).watermark, false)
})

test('image settings fall back to the image model defaults', () => {
  const settings = resolveGenerationSettings('image', {})
  assert.equal(settings.modelId, 'nano-banana-pro')
  assert.ok(settings.aspectRatio.length > 0)
  assert.equal(settings.enableAudio, false)
})

test('Seedance 2.5 Frame defaults to adaptive and has no omni-only modes', () => {
  const settings = resolveGenerationSettings('video', { modelId: 'seedance-2.5-frame', extendMode: true, editMode: true })
  assert.equal(settings.aspectRatio, 'adaptive')
  assert.equal(settings.extendMode, false)
  assert.equal(settings.editMode, false)
  assert.equal(settings.model?.videoTaskMode, 'frame')
})
