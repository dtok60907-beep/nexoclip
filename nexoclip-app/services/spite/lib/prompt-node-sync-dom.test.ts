import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'

// A prompt whose data has no `mentions` used to set a fresh [] on every sync,
// re-run the sync effect, and crash the canvas with React error #185.
test('a prompt node without stored mentions renders without an update loop', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://canvas.test/canvas/project/p1', pretendToBeVisual: true })
  for (const name of Object.getOwnPropertyNames(dom.window)) {
    if (/^(HTML|SVG)\w*Element$|^\w*Event$|^(Node|NodeFilter|Element|MutationObserver|DocumentFragment|Text)$/.test(name) && !(name in globalThis && name !== 'Event' && name !== 'CustomEvent' && name !== 'EventTarget')) {
      ;(globalThis as Record<string, unknown>)[name] = (dom.window as unknown as Record<string, unknown>)[name]
    }
  }
  Object.assign(globalThis, {
    self: dom.window, window: dom.window, document: dom.window.document, CustomEvent: dom.window.CustomEvent,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 0),
    cancelAnimationFrame: (id: number) => clearTimeout(id),
    IS_REACT_ACT_ENVIRONMENT: true,
  })
  ;(globalThis as Record<string, unknown>).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }
  ;(dom.window as unknown as Record<string, unknown>).ResizeObserver = (globalThis as Record<string, unknown>).ResizeObserver
  const React = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { act } = await import('react')
  const { createRequire } = await import('node:module')
  const req = createRequire(__filename)
  const { ReactFlow, ReactFlowProvider } = req('@xyflow/react') as typeof import('@xyflow/react')
  const { PathParamsContext } = req('next/dist/shared/lib/hooks-client-context.shared-runtime')
  const { CanvasCollaborationProvider } = await import('../components/canvas/canvas-collaboration')
  const { PromptNode } = await import('../components/canvas/nodes/prompt-node')

  const node = { id: 'prompt-1', type: 'prompt', position: { x: 0, y: 0 }, width: 320, height: 300, data: { label: 'Prompt', text: 'A girl on stage' } }
  const value = { commands: { patchNodeData() {}, updateNodeData() {} }, persistenceStatus: 'SYNCED', allNodes: [node], allEdges: [], nodes: [node], edges: [] } as never
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response('[]', { status: 200 })) as typeof fetch
  const errors: unknown[] = []
  const originalError = console.error
  console.error = (...args: unknown[]) => { errors.push(args) }
  const root = createRoot(document.getElementById('root')!)
  try {
    await act(async () => {
      root.render(React.createElement(PathParamsContext.Provider, { value: { id: 'p1' } },
        React.createElement(ReactFlowProvider, null,
          React.createElement(CanvasCollaborationProvider, { value, children:
            React.createElement('div', { style: { width: 800, height: 600 } },
              React.createElement(ReactFlow, { nodeTypes: { prompt: PromptNode }, width: 800, height: 600, nodes: [node], edges: [] })) }))))
    })
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)) })
    assert.match(document.body.textContent || '', /A girl on stage/)
    assert.equal(errors.filter((args) => /Maximum update depth|#185/.test(String((args as unknown[])[0]))).length, 0, JSON.stringify(errors).slice(0, 300))
  } finally {
    await act(async () => { root.unmount() })
    globalThis.fetch = originalFetch
    console.error = originalError
  }
})
