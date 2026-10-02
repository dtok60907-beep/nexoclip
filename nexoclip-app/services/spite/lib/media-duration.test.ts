import assert from 'node:assert/strict'
import test from 'node:test'

import { getModelById } from './fal-models'
import { referenceDurationError } from './media-duration'

const seedance25 = getModelById('seedance-2.5')
const seedance20 = getModelById('seedance-2.0')

test('accepts clips inside Seedance limits and skips unreadable ones', () => {
  assert.equal(referenceDurationError({ model: seedance25, editMode: false, videoSeconds: [10, 20, Number.NaN], audioSeconds: [5] }), null)
})

test('edit source videos must be 4–30s, other references 2–30s', () => {
  assert.match(referenceDurationError({ model: seedance25, editMode: true, videoSeconds: [3] , audioSeconds: [] }) ?? '', /@Video1 is 3s.*4–30s/)
  assert.equal(referenceDurationError({ model: seedance25, editMode: false, videoSeconds: [3], audioSeconds: [] }), null)
  assert.match(referenceDurationError({ model: seedance25, editMode: false, videoSeconds: [31], audioSeconds: [] }) ?? '', /2–30s/)
  assert.match(referenceDurationError({ model: seedance25, editMode: false, videoSeconds: [], audioSeconds: [1] }) ?? '', /@Audio1/)
})

test('total length is 30s on Seedance 2.5 and 15s on 2.0', () => {
  assert.match(referenceDurationError({ model: seedance25, editMode: false, videoSeconds: [20, 15], audioSeconds: [] }) ?? '', /35s.*30s/)
  assert.match(referenceDurationError({ model: seedance20, editMode: false, videoSeconds: [10, 10], audioSeconds: [] }) ?? '', /20s.*15s/)
  assert.match(referenceDurationError({ model: seedance25, editMode: false, videoSeconds: [], audioSeconds: [20, 20] }) ?? '', /audio adds up/)
})
