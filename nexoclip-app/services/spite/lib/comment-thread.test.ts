import assert from 'node:assert/strict'
import test from 'node:test'

import { addCommentEntry, deleteCommentEntry, editCommentEntry, readCommentData } from './comment-thread'

const ana = { id: 'u1', name: 'Ana' }

test('reads threads, resolved state, and legacy single-text comments', () => {
  assert.deepEqual(readCommentData({}), { thread: [], resolved: false })
  const legacy = readCommentData({ text: 'old note' })
  assert.equal(legacy.thread[0].text, 'old note')
  const read = readCommentData({ 'c:b': { id: 'b', text: 'second', createdAt: 2 }, 'c:a': { id: 'a', text: 'first', createdAt: 1 }, 'c:bad': { bad: true }, label: 'x', resolved: true })
  assert.deepEqual(read.thread.map((entry) => entry.text), ['first', 'second'])
  assert.equal(read.resolved, true)
})

test('replies sent at the same time by two people are both kept', () => {
  const base = readCommentData({})
  const merged = { ...addCommentEntry(base, ana, 'mine', { now: 1, id: 'x' }), ...addCommentEntry(base, { id: 'u2', name: 'Bo' }, 'theirs', { now: 1, id: 'y' }) }
  assert.deepEqual(readCommentData(merged).thread.map((entry) => entry.text), ['mine', 'theirs'])
})

test('adds trimmed replies and rejects empty ones', () => {
  const data = readCommentData({})
  assert.equal(addCommentEntry(data, ana, '   '), null)
  const patch = addCommentEntry(data, ana, '  first  ', { now: 5, id: 'e1' })
  assert.deepEqual(patch, { 'c:e1': { id: 'e1', authorId: 'u1', name: 'Ana', text: 'first', createdAt: 5 } })
})

test('only the author can edit or delete an entry', () => {
  const data = readCommentData({ 'c:e1': { id: 'e1', authorId: 'u1', name: 'Ana', text: 'first', createdAt: 5 } })
  assert.equal(editCommentEntry(data, 'e1', 'u2', 'hijack'), null)
  assert.deepEqual(editCommentEntry(data, 'e1', 'u1', 'fixed', 9), { 'c:e1': { id: 'e1', authorId: 'u1', name: 'Ana', text: 'fixed', createdAt: 5, editedAt: 9 } })
  assert.equal(deleteCommentEntry(data, 'e1', 'u2'), null)
  assert.deepEqual(deleteCommentEntry(data, 'e1', 'u1'), { 'c:e1': undefined })
})
