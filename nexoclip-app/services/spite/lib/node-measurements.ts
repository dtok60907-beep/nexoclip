import type { Node, NodeChange } from '@xyflow/react'

// The realtime document drops React Flow's ephemeral `measured` field, so a
// node object rebuilt from it arrives unmeasured. React Flow then renders that
// node with `visibility: hidden` and resets its handle bounds until it
// re-measures it — on every drag frame, which flickered the node and its
// edges. Remember the last measured size per node and put it back.

export type Measured = { width: number; height: number }

// Records sizes from `dimensions` changes. A size object is replaced only
// when it actually changes, so it can be compared by identity.
export function recordMeasurements(store: Map<string, Measured>, changes: NodeChange[]): void {
  for (const change of changes) {
    if (change.type === 'remove') {
      store.delete(change.id)
      continue
    }
    if (change.type !== 'dimensions' || !change.dimensions) continue
    const { width, height } = change.dimensions
    if (!(width > 0 && height > 0)) continue
    const previous = store.get(change.id)
    if (previous?.width === width && previous?.height === height) continue
    store.set(change.id, { width, height })
  }
}

type Decorated = { measured: Measured; dragging: boolean; node: Node }
export type MeasurementCache = WeakMap<object, Decorated>
export const createMeasurementCache = (): MeasurementCache => new WeakMap()

// Returns `node` with its remembered size (and `dragging` while it is being
// dragged). The decorated copy is cached per source object, so an unchanged
// node keeps the same identity across renders.
export function withMeasurements(
  node: Node,
  store: Map<string, Measured>,
  cache: MeasurementCache,
  dragging = false,
): Node {
  if (node.measured?.width && node.measured?.height && !dragging) return node
  const measured = store.get(node.id)
  if (!measured && !dragging) return node
  const cached = cache.get(node)
  if (cached && cached.measured === measured && cached.dragging === dragging) return cached.node
  const decorated: Node = {
    ...node,
    ...(measured && !(node.measured?.width && node.measured?.height) ? { measured } : {}),
    ...(dragging ? { dragging: true } : {}),
  }
  if (measured) cache.set(node, { measured, dragging, node: decorated })
  return decorated
}
