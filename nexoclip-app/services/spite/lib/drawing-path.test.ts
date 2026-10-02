import assert from 'node:assert/strict'
import test from 'node:test'

import { STROKE_PADDING, buildDrawingNode, simplifyStroke, strokeToPath } from './drawing-path'

test('a straight line simplifies to its two ends; a corner keeps its corner', () => {
  const line = Array.from({ length: 50 }, (_, i) => ({ x: i, y: i * 0.01 }))
  assert.equal(simplifyStroke(line).length, 2)
  const corner = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }]
  assert.deepEqual(simplifyStroke(corner), corner)
})

test('paths are drawn as smooth curves', () => {
  assert.equal(strokeToPath([{ x: 0, y: 0 }, { x: 10, y: 0 }]), 'M0 0L10 0')
  assert.match(strokeToPath([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }]), /^M0 0Q10 10 15 5L20 0$/)
})

test('a stroke becomes a node at its padded top-left with a relative path', () => {
  const node = buildDrawingNode([{ x: 100, y: 200 }, { x: 160, y: 200 }], 4)!
  const pad = STROKE_PADDING + 2
  assert.deepEqual(node.position, { x: 100 - pad, y: 200 - pad })
  assert.equal(node.width, 60 + pad * 2)
  assert.equal(node.path, `M${pad} ${pad}L${60 + pad} ${pad}`)
  assert.equal(buildDrawingNode([], 4), null)
})
