import test from 'node:test'
import assert from 'node:assert/strict'
import { displayThumbnailUrl, resolveNodeMediaUrl, resolveNodeReferenceUrl } from './node-media'

test('prefixes legacy root-relative media URLs with the configured base path', () => {
  process.env.NEXT_PUBLIC_BASE_PATH = '/spite'
  assert.equal(
    resolveNodeMediaUrl({ outputUrl: '/api/r2-image/generations/result.png' }),
    '/spite/api/r2-image/generations/result.png',
  )
})

test('keeps the complete display URL instead of synthesizing one without workspace context', () => {
  assert.equal(
    resolveNodeMediaUrl({
      outputUrl: '/spite/api/r2-image/uploads/person.png',
      workspaceAssetId: '45f74b7b-3abd-4c9f-85ea-9e05a7d1df75',
    }),
    '/spite/api/r2-image/uploads/person.png',
  )
})

test('leaves already-prefixed and external media URLs unchanged', () => {
  process.env.NEXT_PUBLIC_BASE_PATH = '/spite'
  assert.equal(resolveNodeMediaUrl({ outputUrl: '/spite/api/r2-image/a.png' }), '/spite/api/r2-image/a.png')
  assert.equal(resolveNodeMediaUrl({ outputUrl: 'https://cdn.example/a.png' }), 'https://cdn.example/a.png')
})

test('reference URL points at the trusted workspace asset instead of the legacy upload URL', () => {
  assert.equal(
    resolveNodeReferenceUrl({
      thumbnail: '/canvas/api/r2-image/uploads/person.png',
      workspaceAssetId: '06f46de1-0920-47b8-86d9-506383101200',
    }),
    '/api/assets/06f46de1-0920-47b8-86d9-506383101200/download',
  )
  assert.equal(
    resolveNodeReferenceUrl({ outputUrl: '/api/assets/45f74b7b-3abd-4c9f-85ea-9e05a7d1df75/download?workspace_id=w' }),
    '/api/assets/45f74b7b-3abd-4c9f-85ea-9e05a7d1df75/download?workspace_id=w',
  )
  assert.equal(resolveNodeReferenceUrl({ thumbnail: 'https://cdn.example/a.png' }), 'https://cdn.example/a.png')
})

test('display tiles use the thumbnail variant only for workspace asset downloads', () => {
  assert.equal(displayThumbnailUrl('/api/assets/abc-123/download'), '/api/assets/abc-123/download?variant=thumb')
  assert.equal(displayThumbnailUrl('/api/r2-image/uploads/a.png'), '/api/r2-image/uploads/a.png')
  assert.equal(displayThumbnailUrl('/api/assets/abc-123/download?x=1'), '/api/assets/abc-123/download?x=1')
  assert.equal(displayThumbnailUrl(undefined), undefined)
})

test('blob: previews persisted in shared node data are treated as missing', () => {
  assert.equal(resolveNodeMediaUrl({ thumbnail: 'blob:https://app.nexoclip.com/abc' }), undefined)
  assert.equal(resolveNodeMediaUrl({ thumbnail: 'blob:x', imageUrl: '/api/r2-image/uploads/a.png' }), withBasePathForTest('/api/r2-image/uploads/a.png'))
})

function withBasePathForTest(path: string) {
  return resolveNodeMediaUrl({ thumbnail: path })
}
