import assert from 'node:assert/strict'
import test from 'node:test'

import { fitMediaNodeSize, shouldAutoSizeMediaNode } from './media-node-size'

const bounds = { minWidth: 180, minHeight: 96, maxWidth: 900, maxHeight: 900 }

test('landscape and portrait media keep their aspect ratio under the label footer', () => {
  assert.deepEqual(fitMediaNodeSize(1920, 1080, bounds), { width: 320, height: 216 })
  assert.deepEqual(fitMediaNodeSize(1080, 1920, bounds), { width: 320, height: 605 })
})

test('media too tall for the frame narrows the node instead of cropping', () => {
  const size = fitMediaNodeSize(1000, 4000, bounds)!
  assert.equal(size.height, 900)
  assert.equal(size.width, 216)
})

test('unknown dimensions are ignored', () => {
  assert.equal(fitMediaNodeSize(0, 100, bounds), null)
})

test('a node auto-sizes until it is resized by hand, and refits when its media changes', () => {
  assert.equal(shouldAutoSizeMediaNode({}, 'a.png'), true)
  assert.equal(shouldAutoSizeMediaNode({ width: 320, height: 605, autoSizedFor: 'a.png' }, 'a.png'), false)
  assert.equal(shouldAutoSizeMediaNode({ width: 320, height: 605, autoSizedFor: 'a.png' }, 'b.png'), true)
  assert.equal(shouldAutoSizeMediaNode({ width: 500, height: 300, autoSizedFor: null }, 'b.png'), false)
})
