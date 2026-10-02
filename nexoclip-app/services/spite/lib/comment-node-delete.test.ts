import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'

// The old Comment and Note nodes reloaded the page when deleted, which is
// why they were removed. A comment pin must delete only through the
// collaborative node delete: no navigation, no error boundary.
test('deleting a comment pin only deletes the node — no reload, no crash', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://canvas.test/canvas/project/p1' })
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
  const React = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { act } = await import('react')
  const { CanvasCollaborationProvider } = await import('../components/canvas/canvas-collaboration')
  const { withNodeErrorBoundary } = await import('../components/canvas/node-error-boundary')
  const { CommentNode } = await import('../components/canvas/nodes/comment-node')

  const deleted: string[] = []
  const commands = {
    batch: (run: (mutations: Record<string, (...args: unknown[]) => void>) => void) => run({ deleteNode: (nodeId) => deleted.push(String(nodeId)) }),
    patchNodeData: () => {},
  }
  const value = { commands, persistenceStatus: 'SYNCED', allNodes: [], allEdges: [], nodes: [], edges: [] } as never

  const originalFetch = globalThis.fetch
  const originalError = console.error
  globalThis.fetch = (async () => new Response(JSON.stringify({ authenticated: true, user: { id: 'u1', displayName: 'Ana' } }), { status: 200 })) as typeof fetch
  const errors: unknown[] = []
  console.error = (...args: unknown[]) => { errors.push(args) }
  const startUrl = window.location.href

  const Node = withNodeErrorBoundary(CommentNode as never) as unknown as React.ComponentType<Record<string, unknown>>
  const root = createRoot(document.getElementById('root')!)
  try {
    await act(async () => {
      root.render(React.createElement(CanvasCollaborationProvider, { value, children: React.createElement(Node, {
        id: 'n1',
        selected: true,
        data: { createdBy: 'u1', resolved: false, 'c:e1': { id: 'e1', authorId: 'u1', name: 'Ana', text: 'Check this', createdAt: 1 } },
      }) }))
    })
    const pin = document.querySelector('button[aria-label^="Comment by"]') as HTMLButtonElement
    await act(async () => { pin.click() })
    assert.match(document.body.textContent || '', /Check this/)

    for (const button of Array.from(document.querySelectorAll('button'))) {
      assert.equal(button.getAttribute('type'), 'button', `button "${button.textContent || button.getAttribute('aria-label')}" must not submit`)
    }

    const deleteThread = Array.from(document.querySelectorAll('button')).find((button) => /Delete thread/.test(button.textContent || '')) as HTMLButtonElement
    await act(async () => { deleteThread.click() })

    assert.deepEqual(deleted, ['n1'])
    assert.equal(window.location.href, startUrl)
    assert.doesNotMatch(document.body.textContent || '', /This node hit an error/)
    assert.equal(errors.length, 0, `unexpected console errors: ${JSON.stringify(errors).slice(0, 300)}`)
  } finally {
    await act(async () => { root.unmount() })
    globalThis.fetch = originalFetch
    console.error = originalError
  }
})
