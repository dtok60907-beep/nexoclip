import assert from 'node:assert/strict'
import test from 'node:test'
import * as Y from 'yjs'

import { appendChatMessage, countUnread, deleteChatMessage, readChat } from './chat'

test('messages are appended in order and trimmed', () => {
  const doc = new Y.Doc()
  appendChatMessage(doc, { authorId: 'u1', name: 'Ana', text: '  hello  ' }, { now: 1, id: 'm1' })
  appendChatMessage(doc, { authorId: 'u2', name: '', text: 'hi' }, { now: 2, id: 'm2' })
  assert.deepEqual(readChat(doc).map((m) => [m.id, m.name, m.text]), [['m1', 'Ana', 'hello'], ['m2', 'Guest', 'hi']])
})

test('empty messages are rejected and long ones are cut', () => {
  const doc = new Y.Doc()
  assert.equal(appendChatMessage(doc, { authorId: 'u1', name: 'Ana', text: '   ' }), null)
  const long = appendChatMessage(doc, { authorId: 'u1', name: 'Ana', text: 'x'.repeat(2500) })
  assert.equal(long?.text.length, 2000)
})

test('only the newest messages are kept', () => {
  const doc = new Y.Doc()
  for (let i = 0; i < 5; i += 1) appendChatMessage(doc, { authorId: 'u1', name: 'Ana', text: `m${i}` }, { now: i, id: `m${i}`, max: 3 })
  assert.deepEqual(readChat(doc).map((m) => m.text), ['m2', 'm3', 'm4'])
})

test('a message can only be deleted by its author', () => {
  const doc = new Y.Doc()
  appendChatMessage(doc, { authorId: 'u1', name: 'Ana', text: 'mine' }, { id: 'm1' })
  assert.equal(deleteChatMessage(doc, 'm1', 'u2'), false)
  assert.equal(readChat(doc).length, 1)
  assert.equal(deleteChatMessage(doc, 'm1', 'u1'), true)
  assert.equal(readChat(doc).length, 0)
})

test('chat syncs between documents and is not part of the canvas maps', () => {
  const a = new Y.Doc()
  const b = new Y.Doc()
  a.on('update', (update: Uint8Array) => Y.applyUpdate(b, update))
  appendChatMessage(a, { authorId: 'u1', name: 'Ana', text: 'sync me' }, { id: 'm1' })
  assert.equal(readChat(b)[0]?.text, 'sync me')
  assert.equal(b.getMap('nodes').size, 0)
})

test('unread counts only newer messages from others', () => {
  const messages = [
    { id: '1', authorId: 'me', name: 'Me', text: 'a', createdAt: 10 },
    { id: '2', authorId: 'u2', name: 'B', text: 'b', createdAt: 5 },
    { id: '3', authorId: 'u2', name: 'B', text: 'c', createdAt: 20 },
  ]
  assert.equal(countUnread(messages, 8, 'me'), 1)
})
