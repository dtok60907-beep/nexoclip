import assert from 'node:assert/strict'
import test from 'node:test'

import { MAX_FONT_SIZE, MIN_FONT_SIZE, readFontSize, scaleTextLabel } from './text-label-size'

test('font size comes from a custom size, else the preset', () => {
  assert.equal(readFontSize({}), 20)
  assert.equal(readFontSize({ size: 'xl' }), 48)
  assert.equal(readFontSize({ size: 'xl', fontSize: 70 }), 70)
  assert.equal(readFontSize({ fontSize: 9999 }), MAX_FONT_SIZE)
})

test('dragging the corner scales font and fixed width together, zoom-aware', () => {
  assert.deepEqual(scaleTextLabel({ fontSize: 20, renderedWidth: 100 }, 100, 1), { fontSize: 40 })
  assert.deepEqual(scaleTextLabel({ fontSize: 20, renderedWidth: 100, width: 100 }, 200, 2), { fontSize: 40, width: 200 })
  assert.equal(scaleTextLabel({ fontSize: 20, renderedWidth: 100 }, -1000, 1).fontSize, MIN_FONT_SIZE)
})
