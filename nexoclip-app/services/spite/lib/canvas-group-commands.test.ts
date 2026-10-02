import assert from 'node:assert/strict'
import test from 'node:test'

import { deleteNodesWithGroups, groupNodesWithCommands, ungroupNodesWithCommands } from '../components/canvas/canvas-collaboration'

function recorder() {
  const log: Array<[string, ...unknown[]]> = []
  const commands = {
    batch: (run: (mutations: Record<string, (...args: unknown[]) => void>) => void) => run({
      createNode: (node) => log.push(['create', node]),
      patchNode: (id, patch) => log.push(['patch', id, patch]),
      deleteNode: (id) => log.push(['delete', id]),
    }),
  }
  return { log, commands: commands as never }
}

const frame = { id: 'g', type: 'groupFrame', position: { x: 100, y: 100 }, data: { width: 400, height: 300 } }
const child = { id: 'c', type: 'prompt', position: { x: 20, y: 50 }, parentId: 'g', measured: { width: 100, height: 40 }, data: {} }

test('deleting a frame releases its members in place before removing it', () => {
  const { log, commands } = recorder()
  deleteNodesWithGroups(commands, [frame, child], ['g'])
  assert.deepEqual(log, [['patch', 'c', { parentId: undefined, position: { x: 120, y: 150 } }], ['delete', 'g']])
})

test('delete with contents removes the frame and its members', () => {
  const { log, commands } = recorder()
  deleteNodesWithGroups(commands, [frame, child], ['g'], { withContents: true })
  assert.deepEqual(log, [['delete', 'g'], ['delete', 'c']])
})

test('grouping creates a frame and moves the nodes into it; ungrouping undoes it', () => {
  const { log, commands } = recorder()
  const a = { id: 'a', position: { x: 0, y: 0 }, measured: { width: 100, height: 50 }, data: { sceneId: 's2' } }
  const b = { id: 'b', position: { x: 200, y: 100 }, measured: { width: 100, height: 50 }, data: { sceneId: 's2' } }
  const frameId = groupNodesWithCommands(commands, [a, b], ['a', 'b'])!
  const created = log[0][1] as { id: string; type: string; data: Record<string, unknown> }
  assert.equal(created.id, frameId)
  assert.equal(created.type, 'groupFrame')
  assert.equal(created.data.sceneId, 's2')
  assert.deepEqual(log.slice(1).map((entry) => [entry[0], entry[1], (entry[2] as { parentId: string }).parentId]), [['patch', 'a', frameId], ['patch', 'b', frameId]])

  const second = recorder()
  ungroupNodesWithCommands(second.commands, [frame, child], ['g'])
  assert.deepEqual(second.log, [['patch', 'c', { parentId: undefined, position: { x: 120, y: 150 } }], ['delete', 'g']])
})
