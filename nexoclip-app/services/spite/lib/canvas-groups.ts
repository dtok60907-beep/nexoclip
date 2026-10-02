// Group frames: a named frame whose members are React Flow sub-flow children
// (`parentId`, positions relative to the frame), so they move with it.
// Groups don't nest: a frame is never a member of another frame.

export const GROUP_TYPE = 'groupFrame'
export const GROUP_PADDING = 32
export const GROUP_HEADER = 36

type Point = { x: number; y: number }
export type GroupableNode = {
  id: string
  type?: string
  position: Point
  parentId?: string
  width?: number
  height?: number
  measured?: { width?: number; height?: number }
  data?: Record<string, unknown>
}

const isGroup = (node: GroupableNode | undefined) => node?.type === GROUP_TYPE

export function nodeSize(node: GroupableNode): { width: number; height: number } {
  return {
    width: node.measured?.width ?? node.width ?? (typeof node.data?.width === 'number' ? node.data.width : 0) ?? 0,
    height: node.measured?.height ?? node.height ?? (typeof node.data?.height === 'number' ? node.data.height : 0) ?? 0,
  }
}

export function absolutePosition(node: GroupableNode, byId: Map<string, GroupableNode>): Point {
  const parent = node.parentId ? byId.get(node.parentId) : undefined
  return parent ? { x: parent.position.x + node.position.x, y: parent.position.y + node.position.y } : node.position
}

// Wrap nodes in a new frame sized to their bounds plus padding.
export function planGroup(nodes: GroupableNode[], allNodes: GroupableNode[], frameId: string) {
  const byId = new Map(allNodes.map((node) => [node.id, node]))
  const members = nodes.filter((node) => !isGroup(node))
  if (members.length === 0) return null
  const rects = members.map((node) => ({ node, at: absolutePosition(node, byId), size: nodeSize(node) }))
  const minX = Math.min(...rects.map((rect) => rect.at.x))
  const minY = Math.min(...rects.map((rect) => rect.at.y))
  const maxX = Math.max(...rects.map((rect) => rect.at.x + rect.size.width))
  const maxY = Math.max(...rects.map((rect) => rect.at.y + rect.size.height))
  const frame = {
    id: frameId,
    position: { x: Math.round(minX - GROUP_PADDING), y: Math.round(minY - GROUP_PADDING - GROUP_HEADER) },
    width: Math.round(maxX - minX + GROUP_PADDING * 2),
    height: Math.round(maxY - minY + GROUP_PADDING * 2 + GROUP_HEADER),
  }
  return {
    frame,
    members: rects.map(({ node, at }) => ({
      id: node.id,
      parentId: frameId,
      position: { x: Math.round(at.x - frame.position.x), y: Math.round(at.y - frame.position.y) },
    })),
  }
}

// Members leave the frame at their current absolute positions.
export function planRelease(frameId: string, allNodes: GroupableNode[]) {
  const byId = new Map(allNodes.map((node) => [node.id, node]))
  return allNodes
    .filter((node) => node.parentId === frameId)
    .map((node) => ({ id: node.id, parentId: undefined, position: absolutePosition(node, byId) }))
}

// Deleting a frame keeps its members (released in place) unless they are
// deleted too. With `withContents`, a frame's members are deleted with it.
export function planDeletion(ids: string[], allNodes: GroupableNode[], { withContents = false } = {}) {
  const deleting = new Set(ids)
  if (withContents) {
    for (const node of allNodes) if (node.parentId && deleting.has(node.parentId)) deleting.add(node.id)
  }
  const release = allNodes
    .filter((node) => isGroup(node) && deleting.has(node.id))
    .flatMap((frame) => planRelease(frame.id, allNodes))
    .filter((change) => !deleting.has(change.id))
  return { deleteIds: [...deleting], release }
}

// After a drag: a node whose centre lands inside a frame joins it; one dragged
// out of every frame leaves its frame. Returns null when nothing changes.
export function planDrop(node: GroupableNode, allNodes: GroupableNode[]) {
  if (isGroup(node)) return null
  const byId = new Map(allNodes.map((candidate) => [candidate.id, candidate]))
  const at = absolutePosition(node, byId)
  const size = nodeSize(node)
  const center = { x: at.x + size.width / 2, y: at.y + size.height / 2 }
  const target = allNodes.find((frame) => {
    if (!isGroup(frame) || frame.id === node.id) return false
    const frameSize = nodeSize(frame)
    return center.x >= frame.position.x && center.x <= frame.position.x + frameSize.width
      && center.y >= frame.position.y && center.y <= frame.position.y + frameSize.height
  })
  const nextParent = target?.id
  if (nextParent === node.parentId) return null
  return {
    id: node.id,
    parentId: nextParent,
    position: target ? { x: Math.round(at.x - target.position.x), y: Math.round(at.y - target.position.y) } : { x: Math.round(at.x), y: Math.round(at.y) },
  }
}

// Copying or duplicating a frame copies its members too.
export function withGroupMembers(ids: string[], allNodes: GroupableNode[]): string[] {
  const selected = new Set(ids)
  for (const node of allNodes) if (node.parentId && selected.has(node.parentId)) selected.add(node.id)
  return [...selected]
}

// Copies point at their copied frame; members copied without their frame
// stay in the original frame only if it still exists.
export function remapParents<T extends { id: string; parentId?: string }>(copies: T[], idMap: Map<string, string>, existingIds: Set<string>): T[] {
  return copies.map((copy) => {
    if (!copy.parentId) return copy
    const mapped = idMap.get(copy.parentId)
    if (mapped) return { ...copy, parentId: mapped }
    if (existingIds.has(copy.parentId)) return copy
    const { parentId: _drop, ...rest } = copy
    return rest as T
  })
}

// React Flow needs a parent before its children in the nodes array.
export function parentsFirst<T extends { id: string; parentId?: string }>(nodes: T[]): T[] {
  const parents = new Set(nodes.map((node) => node.parentId).filter(Boolean))
  if (parents.size === 0) return nodes
  return [...nodes.filter((node) => parents.has(node.id)), ...nodes.filter((node) => !parents.has(node.id))]
}

// A locked frame locks its members.
export function isLockedByGroup(node: GroupableNode, byId: Map<string, GroupableNode>): boolean {
  return Boolean(node.parentId && byId.get(node.parentId)?.data?.locked === true)
}
