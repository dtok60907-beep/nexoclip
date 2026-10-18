import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const nextConfig = readFileSync(new URL('../next.config.mjs', import.meta.url), 'utf8')
const uploadRoute = readFileSync(new URL('../app/api/r2-upload/route.ts', import.meta.url), 'utf8')
const workspace = readFileSync(new URL('../components/canvas/canvas-workspace.tsx', import.meta.url), 'utf8')

test('middleware lets uploads through up to the upload route cap (videos over 10 MB used to be cut off)', () => {
  assert.match(nextConfig, /middlewareClientMaxBodySize: '200mb'/)
  assert.match(uploadRoute, /MAX_UPLOAD_BYTES = 200 \* 1024 \* 1024/)
})

test('pasting onto the canvas accepts copied video and audio files, not only images', () => {
  const onPaste = workspace.slice(workspace.indexOf('function onPaste('), workspace.indexOf("window.addEventListener('paste', onPaste)"))
  assert.match(onPaste, /\(image\|video\|audio\)/)
  assert.match(onPaste, /clipboardData\?\.files/)
})
