import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'

test('a crashed node retries only when its data content changes', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>')
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
  const React = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { act } = await import('react')
  const { withNodeErrorBoundary } = await import('../components/canvas/node-error-boundary')

  let renders = 0
  const Crashing = (props: { id: string; data: { text: string } }) => {
    renders += 1
    if (props.data.text === 'bad') throw new Error('boom')
    return React.createElement('span', null, props.data.text)
  }
  const Node = withNodeErrorBoundary(Crashing)
  const originalError = console.error
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response(null, { status: 204 })) as typeof fetch
  console.error = () => {}
  const root = createRoot(document.getElementById('root')!)
  try {
    await act(async () => { root.render(React.createElement(Node, { id: 'n1', data: { text: 'bad' } })) })
    const afterCrash = renders
    assert.match(document.body.textContent || '', /This node hit an error/)

    // Same content, new object (what every unrelated canvas update produces).
    await act(async () => { root.render(React.createElement(Node, { id: 'n1', data: { text: 'bad' } })) })
    assert.equal(renders, afterCrash)

    await act(async () => { root.render(React.createElement(Node, { id: 'n1', data: { text: 'fixed' } })) })
    assert.equal(document.body.textContent, 'fixed')
  } finally {
    await act(async () => { root.unmount() })
    console.error = originalError
    globalThis.fetch = originalFetch
  }
})
