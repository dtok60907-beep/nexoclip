'use client'

import { useReactFlow, type Node } from '@xyflow/react'

import {
  type PresencePoint,
  type RemotePresencePeer,
} from '@/lib/realtime/presence'

type ViewportLike = {
  x: number
  y: number
  zoom: number
}

type RealtimePresenceProps = {
  peers: RemotePresencePeer[]
  nodes: Node[]
  viewport: ViewportLike
}

const FALLBACK_NODE_WIDTH = 240
const FALLBACK_NODE_HEIGHT = 120

export function RealtimePresenceOverlay({ peers, nodes, viewport }: RealtimePresenceProps) {
  // Nodes coming from the shared document carry no rendered size (it is
  // ephemeral and never synced), so every highlight used the small fallback
  // box. React Flow's internal node has the measured size.
  const { getInternalNode } = useReactFlow()
  const nodeById = new Map(nodes.map((node) => {
    const measured = node.measured ?? getInternalNode(node.id)?.measured
    return [node.id, measured ? { ...node, measured } : node] as const
  }))

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {peers.map((peer) => (
        <PresencePeerLayer key={peer.clientId} peer={peer} nodeById={nodeById} viewport={viewport} />
      ))}
    </div>
  )
}

function PresencePeerLayer({
  peer,
  nodeById,
  viewport,
}: {
  peer: RemotePresencePeer
  nodeById: Map<string, Node>
  viewport: ViewportLike
}) {
  return (
    <>
      {peer.selection.nodeIds.map((nodeId) => {
        const node = nodeById.get(nodeId)
        if (!node) {
          return null
        }

        const rect = screenRectForNode(node, viewport)
        return (
          <div
            key={`selection-${peer.clientId}-${nodeId}`}
            className="absolute rounded-2xl border-2 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]"
            style={{
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              borderColor: peer.color.cursor,
              background: peer.color.selection,
            }}
          />
        )
      })}

      {peer.editing && renderNodeHint(peer, nodeById.get(peer.editing.nodeId), viewport, 'is editing')}
      {peer.lock && renderNodeHint(peer, nodeById.get(peer.lock.nodeId), viewport, 'is moving this')}
      {peer.cursor && <PresenceCursor peer={peer} cursor={peer.cursor} viewport={viewport} />}
    </>
  )
}

function PresenceCursor({
  peer,
  cursor,
  viewport,
}: {
  peer: RemotePresencePeer
  cursor: PresencePoint
  viewport: ViewportLike
}) {
  const screenPoint = flowPointToScreen(cursor, viewport)

  return (
    <div
      className="absolute"
      style={{
        left: screenPoint.x,
        top: screenPoint.y,
        transform: 'translate(8px, 8px)',
      }}
    >
      <div className="relative flex items-start gap-2">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path
            d="M2 2L13.5 8.5L8.5 9.6L10.8 16L8.1 17L5.9 10.6L2 14.2V2Z"
            fill={peer.color.cursor}
            stroke={peer.color.cursorMuted}
            strokeWidth="1"
          />
        </svg>
        <div
          className="rounded-full border px-2 py-1 text-[11px] font-medium shadow-lg backdrop-blur-sm"
          style={{
            color: peer.color.text,
            background: peer.color.label,
            borderColor: peer.color.cursor,
          }}
        >
          {peer.name}
        </div>
      </div>
    </div>
  )
}

function renderNodeHint(
  peer: RemotePresencePeer,
  node: Node | undefined,
  viewport: ViewportLike,
  suffix: string,
) {
  if (!node) {
    return null
  }

  const rect = screenRectForNode(node, viewport)
  return (
    <div
      key={`${peer.clientId}-${node.id}-${suffix}`}
      className="absolute"
      style={{
        left: rect.left,
        top: rect.top,
        transform: 'translateY(-125%)',
      }}
    >
      <div
        className="rounded-full border px-2 py-1 text-[11px] font-medium shadow-lg backdrop-blur-sm"
        style={{
          color: peer.color.text,
          background: peer.color.label,
          borderColor: peer.color.cursor,
        }}
      >
        {peer.name} {suffix}
      </div>
    </div>
  )
}

function screenRectForNode(node: Node, viewport: ViewportLike) {
  const width = node.measured?.width ?? node.width ?? FALLBACK_NODE_WIDTH
  const height = node.measured?.height ?? node.height ?? FALLBACK_NODE_HEIGHT
  const topLeft = flowPointToScreen(node.position, viewport)

  return {
    left: topLeft.x,
    top: topLeft.y,
    width: width * viewport.zoom,
    height: height * viewport.zoom,
  }
}

function flowPointToScreen(point: PresencePoint, viewport: ViewportLike) {
  return {
    x: point.x * viewport.zoom + viewport.x,
    y: point.y * viewport.zoom + viewport.y,
  }
}
