import test from 'node:test'
import assert from 'node:assert/strict'
import { getModelById } from './fal-models'

test('exposes three dedicated BytePlus endpoint models as distinct choices', () => {
  const seedance20 = getModelById('seedance-2.0-unfiltered')
  assert.equal(seedance20?.name, 'Seedance 2.0 Unfiltered · Omni')
  assert.equal(seedance20?.providerModel, 'seedance-2.0-unfiltered')
  assert.deepEqual(seedance20?.resolutions, ['720p', '1080p'])
  assert.deepEqual(seedance20?.durations, ['5s', '10s', '15s'])

  const seedance25 = getModelById('seedance-2.5-unfiltered')
  assert.equal(seedance25?.name, 'Seedance 2.5 Unfiltered · Omni')
  assert.equal(seedance25?.providerModel, 'seedance-2.5-unfiltered')

  const seedream = getModelById('seedream-5-pro-unfiltered')
  assert.equal(seedream?.name, 'Seedream 5.0 Pro Unfiltered')
  assert.equal(seedream?.providerModel, 'seedream-5.0-pro-unfiltered')
  assert.deepEqual(seedream?.resolutions, ['1K', '2K'])
})

test('preserves standard BytePlus model routes', () => {
  assert.equal(getModelById('seedance-2.0')?.providerModel, 'dreamina-seedance-2-0-260128')
  assert.equal(getModelById('seedance-2.5')?.providerModel, 'dreamina-seedance-2-5-260628')
  // The Frame variant is the same BytePlus model.
  assert.equal(getModelById('seedance-2.5-frame')?.providerModel, 'dreamina-seedance-2-5-260628')
  assert.equal(getModelById('seedream-5-pro')?.providerModel, 'dola-seedream-5-0-pro-260628')
})
