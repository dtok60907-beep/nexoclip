import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const toolbar = read('../components/canvas/left-toolbar.tsx')
const workspace = read('../components/canvas/canvas-workspace.tsx')
const mention = read('../components/canvas/mention-textarea.tsx')
const jobs = read('../components/canvas/jobs-panel.tsx')

test('dark controls remove Sand and Notes while preserving current features', () => {
  assert.doesNotMatch(toolbar, /--sand-/)
  assert.doesNotMatch(toolbar, /id:\s*'note'/)
  // The removed `note` node type stays gone (LegacyNoteCleanup deletes it);
  // sticky notes are a separate `stickyNote` type.
  assert.doesNotMatch(workspace, /\bNoteNode\b|\bnote:\s*withNodeErrorBoundary/)
  assert.equal(existsSync(new URL('../components/canvas/nodes/note-node.tsx', import.meta.url)), false)
  assert.match(workspace, /stickyNote:\s*withNodeErrorBoundary\(StickyNoteNode\)/)
  assert.match(workspace, /uploadedMediaLabel\(file\.name\)/)
  assert.match(mention, /placeMentionMenu/)

  // Jobs panel must be dark (no Sand vars) and preserve durable ID UX
  assert.doesNotMatch(jobs, /--sand-/)
  assert.match(jobs, /resolveDurableJobId/)
  assert.match(jobs, /shortJobId/)
  assert.match(jobs, /navigator\.clipboard\.writeText\(job\.generationId!\)/)
  assert.match(jobs, /type="button"/)
})
