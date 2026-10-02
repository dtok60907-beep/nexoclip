import assert from 'node:assert/strict'
import test from 'node:test'
import type { Node, NodeChange } from '@xyflow/react'

import { recordMeasurements, withMeasurements, type Measured } from './node-measurements'

const node = (id: string, extra: Partial<Node> = {}): Node => ({ id, position: { x: 0, y: 0 }, data: {}, ...extra })

test('records sizes from dimension changes and forgets removed nodes', () => {
  const store = new Map<string, Measured>()
  recordMeasurements(store, [{ type: 'dimensions', id: 'a', dimensions: { width: 300, height: 200 } } as NodeChange])
  const first = store.get('a')
  assert.deepEqual(first, { width: 300, height: 200 })
  recordMeasurements(store, [{ type: 'dimensions', id: 'a', dimensions: { width: 300, height: 200 } } as NodeChange])
  assert.equal(store.get('a'), first, 'an unchanged size keeps its object')
  recordMeasurements(store, [{ type: 'dimensions', id: 'a', dimensions: { width: 0, height: 0 } } as NodeChange])
  assert.equal(store.get('a'), first, 'a zero size (unmounted) is ignored')
  recordMeasurements(store, [{ type: 'remove', id: 'a' } as NodeChange])
  assert.equal(store.has('a'), false)
})

test('a rebuilt document node gets its remembered size back', () => {
  const store = new Map<string, Measured>([['a', { width: 300, height: 200 }]])
  const cache = new WeakMap()
  const documentNode = node('a')
  const decorated = withMeasurements(documentNode, store, cache)
  assert.deepEqual(decorated.measured, { width: 300, height: 200 })
  assert.equal(withMeasurements(documentNode, store, cache), decorated, 'same source object → same decorated object')
  assert.equal(withMeasurements(node('b'), store, cache).measured, undefined, 'unknown nodes are left alone')
})

test('a dragged node is marked dragging and keeps its size', () => {
  const store = new Map<string, Measured>([['a', { width: 300, height: 200 }]])
  const decorated = withMeasurements(node('a', { position: { x: 5, y: 5 } }), store, new WeakMap(), true)
  assert.equal(decorated.dragging, true)
  assert.deepEqual(decorated.measured, { width: 300, height: 200 })
})

test('a node that already carries a size is returned unchanged', () => {
  const store = new Map<string, Measured>([['a', { width: 1, height: 1 }]])
  const measuredNode = node('a', { measured: { width: 300, height: 200 } })
  assert.equal(withMeasurements(measuredNode, store, new WeakMap()), measuredNode)
})
