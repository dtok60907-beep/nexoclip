import assert from 'node:assert/strict'
import test from 'node:test'

import { GIVE_UP_AFTER_MS, isHiddenDocument, nextPollDelay } from './generation-poll-schedule'

test('polls every 5s early, then every 10s, and gives up only after 45 minutes', () => {
  assert.equal(nextPollDelay(0), 5_000)
  assert.equal(nextPollDelay(119_000), 5_000)
  assert.equal(nextPollDelay(121_000), 10_000)
  assert.equal(GIVE_UP_AFTER_MS, 45 * 60 * 1000)
})

test('hidden documents do not poll', () => {
  assert.equal(isHiddenDocument({ visibilityState: 'hidden' }), true)
  assert.equal(isHiddenDocument({ visibilityState: 'visible' }), false)
  assert.equal(isHiddenDocument(undefined), false)
})
