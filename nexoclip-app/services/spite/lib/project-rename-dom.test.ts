import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'

// Renaming saved every keystroke, and an emptied name fell back to
// "Untitled Project", so the last letter could never be deleted.
test('project toolbar keeps scene actions and rename behavior without duplicate credits', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://canvas.test/canvas/project/p1' })
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, self: dom.window, IS_REACT_ACT_ENVIRONMENT: true })
  const React = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { act } = await import('react')
  const { CanvasToolbar } = await import('../components/canvas/canvas-toolbar')
  const { SceneTimeline } = await import('../components/canvas/scene-timeline')
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response('{}', { status: 200 })) as typeof fetch

  const saved: string[] = []
  const switched: string[] = []
  const deleted: string[] = []
  const clickedShots: string[] = []
  let added = 0
  const timeline = React.createElement(SceneTimeline, {
    scenes: [
      { id: 's1', name: 'Scene 1', shots: [{ id: 'shot1', nodeId: 'n1', order: 1, label: 'Shot one', thumbnail: 'thumb.png' }] },
      { id: 's2', name: 'Scene 2', shots: [] },
    ],
    activeSceneId: 's1',
    onSceneChange: (id: string) => switched.push(id),
    onAddScene: () => { added++ },
    onDeleteScene: (id: string) => deleted.push(id),
    onShotClick: (_sceneId: string, shotId: string) => clickedShots.push(shotId),
  })
  const root = createRoot(document.getElementById('root')!)
  const render = (name: string) => act(async () => {
    root.render(React.createElement(CanvasToolbar, { children: timeline, projectName: name, onProjectNameChange: (next: string) => saved.push(next), persistenceStatus: 'SYNCED', projectId: 'p1' }))
  })
  const type = async (input: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    await act(async () => { setter.call(input, value); input.dispatchEvent(new window.Event('input', { bubbles: true })) })
  }
  const nameButton = () => Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'My Film') as HTMLButtonElement

  try {
    await render('My Film')
    const scenes = document.querySelector('[data-tour="scene-timeline"]')!
    assert(nameButton().parentElement!.parentElement!.contains(scenes), 'scenes share the project toolbar')
    assert.equal(document.querySelector('[data-tour="canvas-credits"]'), null)
    assert.equal(document.querySelector('[data-tour="project-chat"]'), null)
    assert.equal(document.querySelector('[data-tour="canvas-tour-button"]'), null)
    await act(async () => { document.querySelector<HTMLImageElement>('[alt="Shot one"]')!.click() })
    assert.deepEqual(clickedShots, ['shot1'])
    await act(async () => { Array.from(scenes.querySelectorAll('span')).find(el => el.textContent === 'Scene 2')!.click() })
    assert.deepEqual(switched, ['s2'])
    await act(async () => { scenes.querySelector<HTMLButtonElement>('[aria-label="Add scene"]')!.click() })
    assert.equal(added, 1)
    await act(async () => { scenes.querySelector<HTMLButtonElement>('[aria-label="Delete Scene 2"]')!.click() })
    assert.deepEqual(deleted, [], 'deleting a scene still requires confirmation')
    await act(async () => { Array.from(document.querySelectorAll('button')).find(el => el.textContent === 'Delete scene')!.click() })
    assert.deepEqual(deleted, ['s2'])
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

test('embedded project toolbar reserves Studio controls and restores its header on unmount', async () => {
  const parent = new JSDOM('<main class="nx-main"><header class="nx-top"><div class="nx-actions"></div><button class="nx-burger"></button></header></main>')
  const dom = new JSDOM('<div id="root"></div>')
  Object.defineProperty(dom.window, 'parent', { value: parent.window })
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
  const originalObserver = globalThis.ResizeObserver
  let disconnected = false
  globalThis.ResizeObserver = class {
    observe() {} unobserve() {} disconnect() { disconnected = true }
  } as unknown as typeof ResizeObserver
  parent.window.document.querySelector('.nx-actions')!.getBoundingClientRect = () => ({ width: 180 } as DOMRect)
  parent.window.document.querySelector('.nx-burger')!.getBoundingClientRect = () => ({ width: 40 } as DOMRect)
  const React = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { act } = React
  const { CanvasToolbar } = await import('../components/canvas/canvas-toolbar')
  const root = createRoot(document.getElementById('root')!)
  try {
    await act(async () => {
      root.render(React.createElement(CanvasToolbar, { children: 'Scenes', projectName: 'Film', onProjectNameChange() {}, persistenceStatus: 'SYNCED', projectId: 'p1' }))
    })
    assert(parent.window.document.querySelector('.nx-main.nx-canvas-editor'))
    const toolbar = document.getElementById('root')!.firstElementChild as HTMLElement
    assert.equal(toolbar.style.paddingRight, '204px')
    assert.equal(toolbar.style.paddingLeft, '64px')
  } finally {
    await act(async () => { root.unmount() })
    globalThis.ResizeObserver = originalObserver
  }
  assert.equal(parent.window.document.querySelector('.nx-main.nx-canvas-editor'), null)
  assert(disconnected)
})
