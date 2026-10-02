import assert from 'node:assert/strict'
import test from 'node:test'

import {
  GROUP_HEADER, GROUP_PADDING, GROUP_TYPE, isLockedByGroup, parentsFirst, planDeletion, planDrop, planGroup, planRelease, remapParents, withGroupMembers,
  type GroupableNode,
} from './canvas-groups'

const n = (id: string, x: number, y: number, extra: Partial<GroupableNode> = {}): GroupableNode => ({ id, position: { x, y }, measured: { width: 100, height: 50 }, ...extra })

test('grouping wraps nodes in a padded frame with relative member positions', () => {
  const a = n('a', 100, 200)
  const b = n('b', 300, 400)
  const plan = planGroup([a, b], [a, b], 'g1')!
  assert.deepEqual(plan.frame, { id: 'g1', position: { x: 100 - GROUP_PADDING, y: 200 - GROUP_PADDING - GROUP_HEADER }, width: 300 + GROUP_PADDING * 2, height: 250 + GROUP_PADDING * 2 + GROUP_HEADER })
  assert.deepEqual(plan.members[0], { id: 'a', parentId: 'g1', position: { x: GROUP_PADDING, y: GROUP_PADDING + GROUP_HEADER } })
  assert.equal(planGroup([n('f', 0, 0, { type: GROUP_TYPE })], [], 'g2'), null, 'frames do not nest')
})

test('releasing and deleting a frame keep members at their absolute positions', () => {
  const frame = n('g', 1000, 1000, { type: GROUP_TYPE, measured: { width: 400, height: 300 } })
  const child = n('c', 50, 60, { parentId: 'g' })
  assert.deepEqual(planRelease('g', [frame, child]), [{ id: 'c', parentId: undefined, position: { x: 1050, y: 1060 } }])
  assert.deepEqual(planDeletion(['g'], [frame, child]), { deleteIds: ['g'], release: [{ id: 'c', parentId: undefined, position: { x: 1050, y: 1060 } }] })
  assert.deepEqual(planDeletion(['g'], [frame, child], { withContents: true }), { deleteIds: ['g', 'c'], release: [] })
})

test('dragging a node into or out of a frame changes its parent', () => {
  const frame = n('g', 0, 0, { type: GROUP_TYPE, measured: { width: 500, height: 500 } })
  assert.deepEqual(planDrop(n('a', 100, 100), [frame]), { id: 'a', parentId: 'g', position: { x: 100, y: 100 } })
  assert.deepEqual(planDrop(n('a', 700, 100, { parentId: 'g' }), [frame]), { id: 'a', parentId: undefined, position: { x: 700, y: 100 } })
  assert.equal(planDrop(n('a', 100, 100, { parentId: 'g' }), [frame]), null)
})

test('copying a frame brings its members and repoints them at the copy', () => {
  const all = [n('g', 0, 0, { type: GROUP_TYPE }), n('c', 10, 10, { parentId: 'g' }), n('x', 0, 0)]
  assert.deepEqual(withGroupMembers(['g'], all).sort(), ['c', 'g'])
  const copies = remapParents([{ id: 'c2', parentId: 'g' }, { id: 'd2', parentId: 'gone' }], new Map([['g', 'g2']]), new Set(['g']))
  assert.deepEqual(copies, [{ id: 'c2', parentId: 'g2' }, { id: 'd2' }])
})

test('frames render before their members and lock them', () => {
  const ordered = parentsFirst([{ id: 'c', parentId: 'g' }, { id: 'g' }, { id: 'x' }])
  assert.deepEqual(ordered.map((node) => node.id), ['g', 'c', 'x'])
  const byId = new Map([['g', n('g', 0, 0, { type: GROUP_TYPE, data: { locked: true } })]])
  assert.equal(isLockedByGroup(n('c', 0, 0, { parentId: 'g' }), byId), true)
})
