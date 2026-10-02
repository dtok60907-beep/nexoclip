import test from 'node:test'
import assert from 'node:assert/strict'
import { getImageModels, getVideoModels } from './fal-models'
import { withBasePath } from './base-path'

test('exposes only the requested direct model families', () => {
  assert.ok(getImageModels().length > 0)
  assert.ok(getImageModels().every((model) => ['google', 'openai', 'byteplus'].includes(model.provider)))
  assert.deepEqual(getVideoModels().map((model) => model.name), [
    'Seedance 2.0 · Omni',
    'Seedance 2.0 · Frame',
    'Seedance 2.0 Unfiltered · Omni',
    'Seedance 2.0 Unfiltered · Frame',
    'Seedance 2.5 · Omni',
    'Seedance 2.5 · Frame',
    'Seedance 2.5 Unfiltered · Omni',
    'Seedance 2.5 Unfiltered · Frame',
  ])
  assert.ok(getVideoModels().every((model) => model.provider === 'byteplus'))
})

test('base path does not duplicate /spite', () => {
  assert.equal(withBasePath('/api/generate/status', '/spite'), '/spite/api/generate/status')
  assert.equal(withBasePath('/spite/api/generate/status', '/spite'), '/spite/api/generate/status')
})
