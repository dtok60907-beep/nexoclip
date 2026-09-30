import assert from 'node:assert/strict'
import test from 'node:test'

import { describeLockFailure } from './lock-messages'

test('lock failures name the real cause instead of always blaming another user', () => {
  assert.match(describeLockFailure(409, 'self'), /tab lain kamu/)
  assert.match(describeLockFailure(409, 'other'), /user lain/)
  assert.match(describeLockFailure(401), /Sesi login habis/)
  assert.match(describeLockFailure(0), /Koneksi terputus/)
  assert.match(describeLockFailure(503), /Server kunci/)
  assert.doesNotMatch(describeLockFailure(503), /user lain/)
})
