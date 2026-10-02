import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const toolbarSource = readFileSync(
  new URL('../components/canvas/left-toolbar.tsx', import.meta.url),
  'utf8',
)
const assetThumbSource = readFileSync(
  new URL('../components/canvas/asset-thumb.tsx', import.meta.url),
  'utf8',
)
const mentionFoldersSource = readFileSync(
  new URL('../hooks/use-project-folders.ts', import.meta.url),
  'utf8',
)

test('folder data relies on change events instead of five-second polling', () => {
  assert.doesNotMatch(toolbarSource, /refreshInterval:\s*5000/)
  assert.match(toolbarSource, /window\.addEventListener\('folders-changed'/)
  assert.doesNotMatch(mentionFoldersSource, /refreshInterval/)
  assert.match(mentionFoldersSource, /window\.addEventListener\('folders-changed'/)
})

test('every asset panel image preview is lazy and asynchronously decoded', () => {
  // Panel thumbnails render through AssetThumb; any inline <img> left in the
  // toolbar must follow the same rule.
  const sources = toolbarSource + assetThumbSource
  const imageCount = sources.match(/<img\s/g)?.length ?? 0
  const lazyCount = sources.match(/loading="lazy"/g)?.length ?? 0
  const asyncCount = sources.match(/decoding="async"/g)?.length ?? 0

  assert.ok(imageCount > 0)
  assert.equal(lazyCount, imageCount)
  assert.equal(asyncCount, imageCount)
})
