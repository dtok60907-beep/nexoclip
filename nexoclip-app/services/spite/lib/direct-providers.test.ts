import test from 'node:test'
import assert from 'node:assert/strict'
import { getImageModels, getVideoModels } from './fal-models'
import { withBasePath } from './base-path'

test('exposes only the requested direct model families', () => {
  assert.ok(getImageModels().length > 0)
  assert.ok(getImageModels().every((model) => ['google', 'openai', 'byteplus'].includes(model.provider)))
  assert.deepEqual(getVideoModels().map((model) => model.name), [
    'Wan 3.0 · Omni',
    'Wan 3.0 · Frame',
    'Wan 3.0 Pro · Omni',
    'Wan 3.0 Pro · Frame',
    'Wan 3.0 Prime · Omni',
    'Wan 3.0 Prime · Frame',
    'Wan 3.0 Prime Pro · Omni',
    'Wan 3.0 Prime Pro · Frame',
    'Berry 1.0 · Omni',
    'Berry 1.0 · Frame',
    'Berry 1.0 Pro · Omni',
    'Berry 1.0 Pro · Frame',
    'Berry 1.0 Turbo · Omni',
    'Berry 1.0 Turbo · Frame',
    'Berry 1.0 Turbo Pro · Omni',
    'Berry 1.0 Turbo Pro · Frame',
    'Seedance 2.0 · Omni',
    'Seedance 2.0 · Frame',
    'Seedance 2.0 Fast · Omni',
    'Seedance 2.0 Fast · Frame',
    'Seedance 2.0 Mini · Omni',
    'Seedance 2.0 Mini · Frame',
    'Seedance 2.0 Unfiltered · Omni',
    'Seedance 2.0 Unfiltered · Frame',
    'Seedance 2.5 · Omni',
    'Seedance 2.5 · Frame',
    'Seedance 2.5 Unfiltered · Omni',
    'Seedance 2.5 Unfiltered · Frame',
  ])
  assert.ok(getVideoModels().every((model) => ['byteplus', 'mulerouter'].includes(model.provider)))
})

test('base path does not duplicate /spite', () => {
  assert.equal(withBasePath('/api/generate/status', '/spite'), '/spite/api/generate/status')
  assert.equal(withBasePath('/spite/api/generate/status', '/spite'), '/spite/api/generate/status')
})
