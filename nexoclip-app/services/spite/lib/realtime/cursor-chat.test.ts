import assert from 'node:assert/strict'
import test from 'node:test'

import { createCursorChatState, isCursorChatTrigger, readCursorChat } from './cursor-chat'

test('an open bubble shows, even while still empty', () => {
  assert.deepEqual(readCursorChat(createCursorChatState('', true, 0), 99_999), { text: '', open: true })
  assert.deepEqual(readCursorChat(createCursorChatState('hey', true, 0), 99_999), { text: 'hey', open: true })
})

test('a closed message lingers for five seconds, then hides', () => {
  const closed = createCursorChatState('look here', false, 1_000)
  assert.deepEqual(readCursorChat(closed, 5_000), { text: 'look here', open: false })
  assert.equal(readCursorChat(closed, 6_001), undefined)
  assert.equal(readCursorChat(createCursorChatState('  ', false, 1_000), 1_500), undefined)
})

test('messages are capped and malformed state is ignored', () => {
  assert.equal(createCursorChatState('x'.repeat(200), true).text.length, 120)
  assert.equal(readCursorChat({ text: 1 }, 0), undefined)
  assert.equal(readCursorChat(null, 0), undefined)
})

test('slash opens cursor chat only outside text fields and without modifiers', () => {
  assert.equal(isCursorChatTrigger({ key: '/' }, { tagName: 'DIV' }), true)
  assert.equal(isCursorChatTrigger({ key: '/' }, { tagName: 'TEXTAREA' }), false)
  assert.equal(isCursorChatTrigger({ key: '/' }, { tagName: 'DIV', isContentEditable: true }), false)
  assert.equal(isCursorChatTrigger({ key: '/', ctrlKey: true }, { tagName: 'DIV' }), false)
  assert.equal(isCursorChatTrigger({ key: 'a' }, { tagName: 'DIV' }), false)
})
