import assert from 'node:assert/strict'
import test from 'node:test'

import { buildNextShotPrompt, createLastFrameMention, lastFrameFolderName } from './next-shot'

const at = new Date(2026, 9, 4, 9, 5, 7)

test('the next shot prompt opens on the last frame and keeps the previous references', () => {
  const frame = { folderId: 'f-frame', name: 'End of Shot 1 090507', selectedAssetIds: ['a9'] }
  const hero = { folderId: 'f-hero', name: 'Hero', selectedAssetIds: ['a1'] }
  const result = buildNextShotPrompt('@Hero walks into the crowd', [hero], frame)
  assert.equal(result.text, 'Start this shot exactly on @End-of-Shot-1-090507 (the last frame of the previous shot) and continue from there.\n\n@Hero walks into the crowd')
  assert.deepEqual(result.mentions, [frame, hero])
  assert.equal(buildNextShotPrompt('  ', [], frame).text.includes('\n'), false)
})

test('the folder name is short, labeled, and time-stamped', () => {
  assert.equal(lastFrameFolderName('PRIMARY REFERENCE', at), 'End of PRIMARY REFERENCE 090507')
  assert.equal(lastFrameFolderName('', at), 'End of shot 090507')
  assert.equal(lastFrameFolderName('x'.repeat(40), at), `End of ${'x'.repeat(24)} 090507`)
})

test('the last frame is registered and filed in a new General folder', async () => {
  const calls: Array<{ url: string; body?: Record<string, unknown> }> = []
  const fetchFn = async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (url.includes('/api/assets/by-url')) return new Response('null', { status: 200 })
    if (url.endsWith('/api/assets')) return new Response(JSON.stringify({ id: 'legacy-1' }), { status: 200 })
    return new Response(JSON.stringify({ success: true, id: 'folder-1' }), { status: 200 })
  }
  const mention = await createLastFrameMention({
    projectId: 'p1',
    lastFrameUrl: '/api/assets/8ceba098-0cba-4b29-8b05-4a03520194b4/download?workspace_id=w1',
    sourceLabel: 'Shot 1',
    fetchFn,
    now: at,
  })
  assert.deepEqual(mention, {
    folderId: 'folder-1',
    name: 'End of Shot 1 090507',
    selectedAssetIds: ['legacy-1'],
    selectedWorkspaceAssetIds: ['8ceba098-0cba-4b29-8b05-4a03520194b4'],
  })
  const folder = calls.find((call) => call.url.endsWith('/api/folders'))!
  assert.equal(folder.body?.type, 'general')
  assert.deepEqual(folder.body?.assetIds, ['legacy-1'])
  assert.deepEqual(folder.body?.workspaceAssetIds, { 'legacy-1': '8ceba098-0cba-4b29-8b05-4a03520194b4' })
  assert.equal(folder.body?.projectId, 'p1')
})

test('a failed folder create surfaces the server error', async () => {
  const fetchFn = async (url: string) => url.includes('by-url')
    ? new Response(JSON.stringify({ id: 'legacy-1' }), { status: 200 })
    : new Response(JSON.stringify({ error: 'At least one asset is required' }), { status: 400 })
  await assert.rejects(
    createLastFrameMention({ projectId: 'p1', lastFrameUrl: '/x.png', sourceLabel: 's', fetchFn, now: at }),
    /At least one asset is required/,
  )
})
