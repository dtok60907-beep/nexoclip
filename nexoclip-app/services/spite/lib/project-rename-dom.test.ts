import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'

// Renaming saved every keystroke, and an emptied name fell back to
// "Untitled Project", so the last letter could never be deleted.
test('renaming edits a draft: clearing it is allowed, and only the final name is saved', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://canvas.test/canvas/project/p1' })
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, self: dom.window, IS_REACT_ACT_ENVIRONMENT: true })
  const React = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { act } = await import('react')
  const { CanvasToolbar } = await import('../components/canvas/canvas-toolbar')
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response('{}', { status: 200 })) as typeof fetch

  const saved: string[] = []
  const root = createRoot(document.getElementById('root')!)
  const render = (name: string) => act(async () => {
    root.render(React.createElement(CanvasToolbar, { projectName: name, onProjectNameChange: (next: string) => saved.push(next), persistenceStatus: 'SYNCED', projectId: 'p1' }))
  })
  const type = async (input: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    await act(async () => { setter.call(input, value); input.dispatchEvent(new window.Event('input', { bubbles: true })) })
  }
  const nameButton = () => Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'My Film') as HTMLButtonElement

  try {
    await render('My Film')
    await act(async () => { nameButton().click() })
    const input = document.querySelector('input[aria-label="Project name"]') as HTMLInputElement
    await type(input, '')
    assert.equal(input.value, '', 'the field can be emptied')
    await type(input, 'Trailer')
    assert.deepEqual(saved, [], 'nothing is saved while typing')
    await act(async () => { input.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true })) })
    assert.deepEqual(saved, ['Trailer'])

    await render('My Film')
    await act(async () => { nameButton().click() })
    const again = document.querySelector('input[aria-label="Project name"]') as HTMLInputElement
    await type(again, '')
    await act(async () => { again.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true })) })
    assert.deepEqual(saved, ['Trailer'], 'an empty name is not saved')
    assert.ok(nameButton(), 'the previous name is shown again')
  } finally {
    await act(async () => { root.unmount() })
    globalThis.fetch = originalFetch
  }
})
