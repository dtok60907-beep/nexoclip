import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'

test('a node shows its 3 latest runs as bubbles and the Gallery lists every run', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://canvas.test/canvas/project/p1', pretendToBeVisual: true })
  // Radix Dialog needs the browser's DOM constructors as globals.
  for (const name of Object.getOwnPropertyNames(dom.window)) {
    if (/^(HTML|SVG)\w*Element$|^\w*Event$|^(Node|NodeFilter|Element|MutationObserver|DocumentFragment|Text)$/.test(name) && !(name in globalThis && name !== 'Event' && name !== 'CustomEvent' && name !== 'EventTarget')) {
      ;(globalThis as Record<string, unknown>)[name] = (dom.window as unknown as Record<string, unknown>)[name]
    }
  }
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, CustomEvent: dom.window.CustomEvent,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 0),
    cancelAnimationFrame: (id: number) => clearTimeout(id),
    IS_REACT_ACT_ENVIRONMENT: true,
  })
  const React = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { act } = await import('react')
  const { CanvasCollaborationProvider } = await import('../components/canvas/canvas-collaboration')
  const { GenerationGallery, GenerationGalleryHost } = await import('../components/canvas/generation-gallery')

  const patches: Array<[string, Record<string, unknown>]> = []
  const value = { commands: { patchNodeData: (id: string, patch: Record<string, unknown>) => patches.push([id, patch]) }, persistenceStatus: 'SYNCED', allNodes: [{ id: 'n1' }], allEdges: [], nodes: [], edges: [] } as never
  const data = {
    'gen:g1': { id: 'g1', kind: 'image', status: 'succeeded', outputUrl: '/api/assets/a1/download', startedAt: 1 },
    'gen:g2': { id: 'g2', kind: 'image', status: 'failed', error: 'Content moderation blocked this prompt', startedAt: 2 },
    'gen:g3': { id: 'g3', kind: 'image', status: 'succeeded', outputUrl: '/api/assets/a3/download', startedAt: 3 },
    'gen:g4': { id: 'g4', kind: 'image', status: 'queued', startedAt: 4 },
  }
  const root = createRoot(document.getElementById('root')!)
  try {
    await act(async () => {
      root.render(React.createElement(CanvasCollaborationProvider, { value, children: [
        React.createElement('div', { key: 'node', className: 'relative' }, React.createElement(GenerationGallery, { nodeId: 'n1', data, selected: true })),
        React.createElement(GenerationGalleryHost, { key: 'host', nodes: [{ id: 'n1', data }] }),
      ] }))
    })
    const bubbles = Array.from(document.querySelectorAll('button[aria-label]')).filter((button) => /Generated result|Failed|Still generating/.test(button.getAttribute('aria-label') || ''))
    assert.deepEqual(bubbles.map((button) => button.getAttribute('aria-label')), ['Still generating', 'Generated result', 'Failed: Content moderation blocked this prompt'])

    const galleryButton = Array.from(document.querySelectorAll('button')).find((button) => /Gallery · 4/.test(button.textContent || '')) as HTMLButtonElement
    assert.ok(galleryButton, 'the Gallery button shows the run count')
    await act(async () => { galleryButton.click() })
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    assert.ok(dialog, 'the Gallery opens')
    assert.match(dialog.textContent || '', /4 runs · 2 succeeded · 1 failed/)
    assert.match(dialog.textContent || '', /Content moderation blocked this prompt/)

    const useThis = Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent === 'Use this') as HTMLButtonElement
    await act(async () => { useThis.click() })
    assert.deepEqual(patches, [['n1', { outputUrl: '/api/assets/a3/download' }]])
  } finally {
    await act(async () => { root.unmount() })
  }
})
