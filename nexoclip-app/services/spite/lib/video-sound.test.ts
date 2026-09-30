import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../components/canvas/nodes/video-node.tsx', import.meta.url), 'utf8')

test('video sound defaults on, preserves explicit false, is sent, and exposes no toggle', () => {
  assert.match(source, /useState\(\(data\.enableAudio as boolean \| undefined\) \?\? true\)/)
  // Unset/explicit values resolve through the shared settings helper (covered
  // by generation-settings.test.ts: defaults on, explicit false preserved).
  assert.match(source, /setEnableAudio\(effective\.enableAudio\)/)
  assert.match(source, /generateAudio: currentModel\?\.supportsAudio \? enableAudio : undefined/)
  assert.doesNotMatch(source, /setEnableAudio\(!enableAudio\)/)
  assert.doesNotMatch(source, /SpeakerSlash/)
})
