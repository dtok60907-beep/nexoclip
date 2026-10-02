import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'

// Sticky notes and text labels must never navigate or crash (the removed
// Notes did, on delete). Render each inside React Flow, edit it, delete it
// through the toolbar, and check nothing but the collaborative delete ran.
test('sticky notes, text labels, group frames, and tables delete without navigating or crashing', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://canvas.test/canvas/project/p1', pretendToBeVisual: true })
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
  ;(globalThis as Record<string, unknown>).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }
  ;(dom.window as unknown as Record<string, unknown>).ResizeObserver = (globalThis as Record<string, unknown>).ResizeObserver
  const React = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { act } = await import('react')
  // Same module instance the components get (tsx loads them as CommonJS);
  // a separate ESM copy would not share React Flow's store.
  const { createRequire } = await import('node:module')
  const { ReactFlow, ReactFlowProvider } = createRequire(__filename)('@xyflow/react') as typeof import('@xyflow/react')
  const { CanvasCollaborationProvider } = await import('../components/canvas/canvas-collaboration')
  const { withNodeErrorBoundary } = await import('../components/canvas/node-error-boundary')
  const { StickyNoteNode } = await import('../components/canvas/nodes/sticky-note-node')
  const { TextLabelNode } = await import('../components/canvas/nodes/text-label-node')
  const { GroupFrameNode } = await import('../components/canvas/nodes/group-frame-node')
  const { TableNode } = await import('../components/canvas/nodes/table-node')
  const nodeTypes = { stickyNote: withNodeErrorBoundary(StickyNoteNode), textLabel: withNodeErrorBoundary(TextLabelNode), groupFrame: withNodeErrorBoundary(GroupFrameNode), tableNode: withNodeErrorBoundary(TableNode) }

  const deleted: string[] = []
  const patches: Array<[string, Record<string, unknown>]> = []
  const commands = {
    batch: (run: (mutations: Record<string, (...args: unknown[]) => void>) => void) => run({ deleteNode: (nodeId) => deleted.push(String(nodeId)) }),
    patchNodeData: (nodeId: string, patch: Record<string, unknown>) => patches.push([nodeId, patch]),
  }
  const value = { commands, persistenceStatus: 'SYNCED', allNodes: [], allEdges: [], nodes: [], edges: [] } as never

  const originalFetch = globalThis.fetch
  const originalError = console.error
  globalThis.fetch = (async (input: RequestInfo | URL) => String(input).includes('auth/session')
    ? new Response(JSON.stringify({ authenticated: true, user: { id: 'u1', displayName: 'Ana' } }), { status: 200 })
    : new Response('{}', { status: 200 })) as typeof fetch
  const errors: unknown[] = []
  console.error = (...args: unknown[]) => { errors.push(args) }
  const startUrl = window.location.href

  const root = createRoot(document.getElementById('root')!)
  try {
    for (const [type, nodeData] of [
      ['stickyNote', { text: 'hello', color: 'yellow' }],
      ['textLabel', { text: 'Title', size: 'l' }],
      ['groupFrame', { label: 'Storyboard', width: 400, height: 300 }],
      ['tableNode', { columnIds: ['c1', 'c2'], rowIds: ['r1'], 'head:c1': 'Shot', 'head:c2': 'Prompt', 'cell:r1:c1': '1' }],
    ] as const) {
      const nodeId = `${type}-1`
      await act(async () => {
        root.render(React.createElement(ReactFlowProvider, null,
          React.createElement(CanvasCollaborationProvider, { value, children:
            React.createElement('div', { style: { width: 800, height: 600 } },
              React.createElement(ReactFlow, { nodeTypes, width: 800, height: 600, nodes: [{ id: nodeId, type, position: { x: 0, y: 0 }, width: 220, height: 200, selected: true, data: nodeData }], edges: [] })) })))
      })
      if (type === 'tableNode') {
        const values = Array.from(document.querySelectorAll('.react-flow textarea')).map((cell) => (cell as HTMLTextAreaElement).value)
        assert.deepEqual(values, ['Shot', 'Prompt', '1', ''])
      } else {
        assert.match(document.body.textContent || '', type === 'stickyNote' ? /hello/ : type === 'textLabel' ? /Title/ : /Storyboard/)
      }
      for (const button of Array.from(document.querySelectorAll('.react-flow button'))) {
        assert.equal(button.getAttribute('type'), 'button', `${type}: button "${button.getAttribute('aria-label') || button.textContent}" must not submit`)
      }
      const deleteButton = Array.from(document.querySelectorAll('button')).find((button) => button.getAttribute('aria-label') === 'Delete' || button.getAttribute('title') === 'Delete') as HTMLButtonElement | undefined
      assert.ok(deleteButton, `${type}: toolbar Delete button is rendered`)
      await act(async () => { deleteButton!.click() })
      assert.deepEqual(deleted.splice(0), [nodeId])
      assert.equal(window.location.href, startUrl)
      assert.doesNotMatch(document.body.textContent || '', /This node hit an error/)
    }
    assert.equal(errors.length, 0, `unexpected console errors: ${JSON.stringify(errors).slice(0, 400)}`)
  } finally {
    await act(async () => { root.unmount() })
    globalThis.fetch = originalFetch
    console.error = originalError
  }
})
