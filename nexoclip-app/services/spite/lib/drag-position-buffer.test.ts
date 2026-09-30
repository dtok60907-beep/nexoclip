import assert from 'node:assert/strict'
import test from 'node:test'
import type { NodeChange } from '@xyflow/react'

import { bufferDragChanges, createDragBufferState } from './drag-position-buffer'

const drag = (x: number): NodeChange => ({ type: 'position', id: 'n1', position: { x, y: 0 }, dragging: true })

test('drag frames update the overlay every frame but write at most every 100ms', () => {
  const state = createDragBufferState()
  const writes = [0, 16, 32, 99, 100, 150, 201].map((t, i) => bufferDragChanges(state, [drag(i)], t).durable.length)
  assert.deepEqual(writes, [1, 0, 0, 0, 1, 0, 1])
  assert.deepEqual(state.overlay.get('n1'), { x: 6, y: 0 })
})

test('drop always writes the final position and clears the overlay', () => {
  const state = createDragBufferState()
  bufferDragChanges(state, [drag(1)], 0)
  bufferDragChanges(state, [drag(42)], 10)
  const { durable, overlayChanged } = bufferDragChanges(state, [{ type: 'position', id: 'n1', dragging: false }], 20)
  assert.equal(overlayChanged, true)
  assert.deepEqual(durable, [{ type: 'position', id: 'n1', dragging: false, position: { x: 42, y: 0 } }])
  assert.equal(state.overlay.size, 0)
})

test('non-position changes pass straight through', () => {
  const state = createDragBufferState()
  const remove: NodeChange = { type: 'remove', id: 'n2' }
  assert.deepEqual(bufferDragChanges(state, [remove], 0).durable, [remove])
})
