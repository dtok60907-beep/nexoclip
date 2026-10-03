import assert from 'node:assert/strict'
import test from 'node:test'

import { MAX_HISTORY_ENTRIES, queuedHistoryPatch, readGenerationHistory, terminalHistoryPatch } from './generation-history'

test('runs are recorded queued, then succeeded or failed, newest first', () => {
  let data: Record<string, unknown> = {}
  data = { ...data, ...queuedHistoryPatch({ id: 'g1', kind: 'video' }, data, 1).set }
  data = { ...data, ...terminalHistoryPatch({ id: 'g1', kind: 'video', status: 'succeeded' } as never, '/api/assets/a/download', data, 5) }
  data = { ...data, ...queuedHistoryPatch({ id: 'g2', kind: 'video' }, data, 10).set }
  data = { ...data, ...terminalHistoryPatch({ id: 'g2', kind: 'video', status: 'failed', error: { message: 'Moderation' } } as never, undefined, data, 12) }
  data = { ...data, ...queuedHistoryPatch({ id: 'g3', kind: 'video' }, data, 20).set }
  const history = readGenerationHistory(data)
  assert.deepEqual(history.map((entry) => [entry.id, entry.status]), [['g3', 'queued'], ['g2', 'failed'], ['g1', 'succeeded']])
  assert.equal(history[1].error, 'Moderation')
  assert.equal(history[2].outputUrl, '/api/assets/a/download')
  assert.equal(history[2].startedAt, 1, 'the start time survives completion')
})

test('a finished run keeps its first finish time when the status is reported again', () => {
  const data = { ...terminalHistoryPatch({ id: 'g1', kind: 'image', status: 'succeeded' } as never, '/x', {}, 5) }
  assert.deepEqual(terminalHistoryPatch({ id: 'g1', kind: 'image', status: 'succeeded' } as never, '/x', data, 99), data)
})

test('only the newest runs are kept', () => {
  let data: Record<string, unknown> = {}
  for (let i = 0; i < MAX_HISTORY_ENTRIES; i += 1) data = { ...data, ...queuedHistoryPatch({ id: `g${i}`, kind: 'image' }, data, i).set }
  const patch = queuedHistoryPatch({ id: 'new', kind: 'image' }, data, 1000)
  assert.deepEqual(patch.unset, ['gen:g0'])
  assert.equal(terminalHistoryPatch({ id: 'x', kind: 'image', status: 'queued' } as never, undefined, {}), null)
})
