import type { NodeChange, XYPosition } from '@xyflow/react'

// React Flow reports a position change every frame of a drag (~60/s). Each
// one used to be a Yjs write: a network update to every collaborator and a
// rebuild of the whole canvas snapshot. While dragging, positions now live in
// a local overlay (so the drag stays smooth) and reach the document at most
// every DRAG_WRITE_INTERVAL_MS (so collaborators still see it move); the drop
// position is always written.
export const DRAG_WRITE_INTERVAL_MS = 100

export type DragBufferState = {
  overlay: Map<string, XYPosition>
  lastWriteAt: Map<string, number>
}

export function createDragBufferState(): DragBufferState {
  return { overlay: new Map(), lastWriteAt: new Map() }
}

// Splits changes into those to write now and updates the overlay in place.
// Returns whether the overlay changed (so the caller re-renders).
export function bufferDragChanges(
  state: DragBufferState,
  changes: NodeChange[],
  now: number,
): { durable: NodeChange[]; overlayChanged: boolean } {
  const durable: NodeChange[] = []
  let overlayChanged = false
  for (const change of changes) {
    if (change.type !== 'position') {
      durable.push(change)
      continue
    }
    if (change.dragging && change.position) {
      state.overlay.set(change.id, change.position)
      overlayChanged = true
      const last = state.lastWriteAt.get(change.id)
      if (last === undefined || now - last >= DRAG_WRITE_INTERVAL_MS) {
        state.lastWriteAt.set(change.id, now)
        durable.push(change)
      }
      continue
    }
    // Drag end (dragging: false) or a programmatic move: write the final
    // position, falling back to the last overlay position if React Flow
    // omits it on drop.
    const position = change.position ?? state.overlay.get(change.id)
    if (state.overlay.delete(change.id)) overlayChanged = true
    state.lastWriteAt.delete(change.id)
    durable.push(position ? { ...change, position } : change)
  }
  return { durable, overlayChanged }
}
