import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'

test('the eraser deletes a stroke it presses on; without the eraser nothing is deleted', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://canvas.test/canvas/project/p1', pretendToBeVisual: true })
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
  ;(globalThis as Record<string, unknown>).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }
  ;(dom.window as unknown as Record<string, unknown>).ResizeObserver = (globalThis as Record<string, unknown>).ResizeObserver
  const React = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { act } = await import('react')
  const { createRequire } = await import('node:module')
  const { ReactFlow, ReactFlowProvider } = createRequire(__filename)('@xyflow/react') as typeof import('@xyflow/react')
  const { CanvasCollaborationProvider } = await import('../components/canvas/canvas-collaboration')
  const { DrawingNode, ERASER_ATTRIBUTE } = await import('../components/canvas/nodes/drawing-node')

  const deleted: string[] = []
  const commands = { batch: (run: (m: Record<string, (...args: unknown[]) => void>) => void) => run({ deleteNode: (id) => deleted.push(String(id)) }) }
  const value = { commands, persistenceStatus: 'SYNCED', allNodes: [], allEdges: [], nodes: [], edges: [] } as never
  const root = createRoot(document.getElementById('root')!)

  const render = async (eraser: boolean) => {
    await act(async () => {
      root.render(React.createElement(ReactFlowProvider, null,
        React.createElement(CanvasCollaborationProvider, { value, children:
          React.createElement('div', { ...(eraser ? { [ERASER_ATTRIBUTE]: '' } : {}), style: { width: 800, height: 600 } },
            React.createElement(ReactFlow, { nodeTypes: { drawing: DrawingNode }, width: 800, height: 600, edges: [], nodes: [
              { id: 'stroke-1', type: 'drawing', position: { x: 0, y: 0 }, width: 100, height: 40, data: { width: 100, height: 40, path: 'M10 20L90 20', color: '#fff', strokeWidth: 4 } },
            ] })) })))
    })
  }
  const press = async () => {
    const hit = document.querySelector('svg[aria-label="Drawing"] path') as SVGPathElement
    await act(async () => { hit.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, buttons: 1 })) })
  }

  try {
    await render(false)
    await press()
    assert.deepEqual(deleted, [])
    await render(true)
    await press()
    assert.deepEqual(deleted, ['stroke-1'])
  } finally {
    await act(async () => { root.unmount() })
  }
})
