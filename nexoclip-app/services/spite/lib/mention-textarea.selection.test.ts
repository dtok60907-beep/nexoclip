import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPastedNodes,
  captureCaretOffset,
  serializeEditor,
  serializeRange,
  mentionFoldersStateKey,
  restoreCaretFromOffset,
  shouldPersistRenderedMentionState,
  workspaceAssetIdsForSelection,
} from '../components/canvas/mention-textarea'

test('new mention chips retain canonical workspace asset IDs for the selected legacy items', () => {
  const folder = {
    id: 'folder-1',
    name: 'Nathan',
    type: 'character' as const,
    assets: [
      { id: 'legacy-front', workspaceAssetId: 'asset-front', r2_url: '/front.png', type: 'image' as const },
      { id: 'legacy-side', workspaceAssetId: 'asset-side', r2_url: '/side.png', type: 'image' as const },
      { id: 'legacy-missing', r2_url: '/missing.png', type: 'image' as const },
    ],
  }

  assert.deepEqual(
    workspaceAssetIdsForSelection(folder, new Set(['legacy-front', 'legacy-missing'])),
    ['asset-front'],
  )
})

test('derived canonical chip metadata is persisted even when serialized text is unchanged', () => {
  assert.equal(shouldPersistRenderedMentionState(
    'Use @Nathan',
    [{ folderId: 'folder-1', name: 'Nathan', selectedAssetIds: ['legacy-front'] }],
    'Use @Nathan',
    [{
      folderId: 'folder-1',
      name: 'Nathan',
      selectedAssetIds: ['legacy-front'],
      selectedWorkspaceAssetIds: ['asset-front'],
    }],
  ), true)
})

test('folder state identity changes when canonical asset metadata changes at the same length', () => {
  const folder = {
    id: 'folder-1',
    name: 'Nathan',
    type: 'character' as const,
    assets: [{ id: 'legacy-front', r2_url: '/front.png', type: 'image' as const }],
  }

  assert.notEqual(
    mentionFoldersStateKey([folder]),
    mentionFoldersStateKey([{ ...folder, assets: [{ ...folder.assets[0], workspaceAssetId: 'asset-front' }] }]),
  )
})

let JSDOM: any
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  JSDOM = require('jsdom').JSDOM
} catch (e) {
  JSDOM = null
}

if (!JSDOM) {
  // Can't run DOM-dependent tests in this environment; mark as skipped so
  // CI/test runner output remains clear.
  test.skip('capture and restore collapsed caret across a chip boundary', () => {})
} else {
  // Setup a JSDOM environment for DOM APIs used by the mapping helpers.
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  // @ts-ignore - test runner globals
  global.window = dom.window
  // @ts-ignore
  global.document = dom.window.document
  // @ts-ignore
  global.Node = dom.window.Node

  // Pure mapping tests for caret offset capture/restore. These are best-effort
  // and exercise the serialized offset mapping used during DOM re-renders.

  test('capture and restore collapsed caret across a chip boundary', () => {
  const el = document.createElement('div')
  const before = document.createTextNode('Hello ')
  const chip = document.createElement('span')
  chip.dataset.mention = '1'
  chip.dataset.name = 'Nathan'
  chip.dataset.folderId = 'character-1'
  chip.textContent = 'Nathan'
  const after = document.createTextNode(' world')
  el.appendChild(before)
  el.appendChild(chip)
  el.appendChild(after)

  // Place caret after the 'Hello ' (offset 6)
  const range = document.createRange()
  range.setStart(before, 6)
  range.collapse(true)
  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)

  const offset = captureCaretOffset(el)
  assert.equal(typeof offset, 'number')
  assert.equal(offset, 6)

  // Simulate a DOM re-render that reconstructs the nodes.
  const val = el.textContent || ''
  el.innerHTML = ''
  const b2 = document.createTextNode('Hello ')
  const chip2 = document.createElement('span')
  chip2.dataset.mention = '1'
  chip2.dataset.name = 'Nathan'
  chip2.dataset.folderId = 'character-1'
  chip2.textContent = 'Nathan'
  const a2 = document.createTextNode(' world')
  el.appendChild(b2)
  el.appendChild(chip2)
  el.appendChild(a2)

  // Restore caret
  restoreCaretFromOffset(el, offset!)
  const sel2 = window.getSelection()!
  assert.equal(sel2.rangeCount, 1)
  const r2 = sel2.getRangeAt(0)
  assert.equal(r2.startContainer.nodeType, Node.TEXT_NODE)
  assert.equal(r2.startOffset, 6)
})
}



if (JSDOM) {
  const folder = {
    id: 'folder-alur1', name: 'alur1', type: 'location' as const,
    assets: [{ id: 'legacy-a1', workspaceAssetId: 'ws-a1', r2_url: '/a1.png', type: 'image' as const }],
  }
  const chipFor = (name: string, folderId: string) => {
    const chip = document.createElement('span')
    chip.dataset.mention = '1'
    chip.dataset.name = name
    chip.dataset.folderId = folderId
    chip.textContent = name
    return chip
  }

  test('serializer keeps line breaks and chips inside browser-created <div> lines', () => {
    const el = document.createElement('div')
    el.appendChild(document.createTextNode('Shot 1'))
    const line2 = document.createElement('div')
    line2.appendChild(document.createTextNode('Dewi near '))
    line2.appendChild(chipFor('alur1', 'folder-alur1'))
    line2.appendChild(document.createTextNode('\u00a0now'))
    el.appendChild(line2)
    const empty = document.createElement('div')
    empty.appendChild(document.createElement('br'))
    el.appendChild(empty)
    const line4 = document.createElement('div')
    line4.textContent = 'Shot 2'
    el.appendChild(line4)

    const { text, mentions } = serializeEditor(el)
    assert.equal(text, 'Shot 1\nDewi near @alur1 now\n\nShot 2')
    assert.deepEqual(mentions.map((m) => m.folderId), ['folder-alur1'])
  })

  test('pasted text becomes flat text, <br> line breaks and chips for known folders', () => {
    const nodes = buildPastedNodes(document, 'Line one @alur1 end\r\nLine two @unknown', [folder])
    const el = document.createElement('div')
    nodes.forEach((node) => el.appendChild(node))
    assert.equal(el.querySelectorAll('div').length, 0)
    assert.equal(el.querySelectorAll('br').length, 1)
    const chip = el.querySelector('[data-mention="1"]') as HTMLElement
    assert.equal(chip.dataset.folderId, 'folder-alur1')
    assert.equal(chip.dataset.workspaceAssetIds, 'ws-a1')
    assert.equal(serializeEditor(el).text, 'Line one @alur1 end\nLine two @unknown')
  })
}


if (JSDOM) {
  test('copied chips round-trip into identical chips on paste, keeping their image selection', () => {
    const source = document.createElement('div')
    source.appendChild(document.createTextNode('Show '))
    const chip = document.createElement('span')
    chip.dataset.mention = '1'
    chip.dataset.name = 'Dewi'
    chip.dataset.folderId = 'folder-dewi'
    chip.dataset.assetIds = 'legacy-front'
    chip.dataset.workspaceAssetIds = 'ws-front'
    chip.textContent = 'Dewi'
    source.appendChild(chip)
    source.appendChild(document.createTextNode(' walking'))
    document.body.appendChild(source)

    const range = document.createRange()
    range.selectNodeContents(source)
    const copied = serializeRange(range)
    assert.equal(copied.text, 'Show @Dewi walking')

    const folders = [{
      id: 'folder-dewi', name: 'Dewi', type: 'character' as const,
      assets: [
        { id: 'legacy-front', workspaceAssetId: 'ws-front', r2_url: '/f.png', type: 'image' as const },
        { id: 'legacy-side', workspaceAssetId: 'ws-side', r2_url: '/s.png', type: 'image' as const },
      ],
    }]
    const target = document.createElement('div')
    buildPastedNodes(document, copied.text, folders, copied.mentions).forEach((node) => target.appendChild(node))
    const pasted = target.querySelector('[data-mention="1"]') as HTMLElement
    assert.equal(pasted.dataset.folderId, 'folder-dewi')
    assert.equal(pasted.dataset.assetIds, 'legacy-front')
    assert.equal(pasted.dataset.workspaceAssetIds, 'ws-front')
    assert.deepEqual(serializeEditor(target), copied)
    source.remove()
  })
}
