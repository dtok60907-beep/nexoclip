import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'

test('the canvas loader shows while loading and is removed after it fades out', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://canvas.test/' })
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
  const React = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { act } = await import('react')
  const { CanvasLoadingScreen } = await import('../components/canvas/canvas-loading-screen')
  const root = createRoot(document.getElementById('root')!)
  try {
    await act(async () => { root.render(React.createElement(CanvasLoadingScreen, { ready: false })) })
    const status = document.querySelector('[role="status"]') as HTMLElement
    assert.match(status.textContent || '', /Membuka canvas/)
    assert.equal(status.getAttribute('aria-busy'), 'true')

    await act(async () => { root.render(React.createElement(CanvasLoadingScreen, { ready: true })) })
    assert.equal((document.querySelector('[role="status"]') as HTMLElement).style.opacity, '0', 'fades out')
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 400)) })
    assert.equal(document.querySelector('[role="status"]'), null, 'removed after the fade')
  } finally {
    await act(async () => { root.unmount() })
  }
})
