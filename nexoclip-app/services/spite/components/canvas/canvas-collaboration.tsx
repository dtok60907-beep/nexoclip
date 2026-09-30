'use client'

import { createContext, useContext, useMemo, useRef } from 'react'
import type { Edge, Node } from '@xyflow/react'

import type { UseRealtimeCanvasResult } from '@/hooks/use-realtime-canvas'
import type { NodeWriteOptions } from '@/lib/realtime/react-flow-binding'
import {
  createInvocationTimeRuntimeControls,
  type CanvasRuntimeControls,
} from '@/lib/canvas-runtime-ui'

type NodeDataPatch = Record<string, unknown>
type NodeDataUpdater = Parameters<UseRealtimeCanvasResult['commands']['updateNodeData']>[1]
type NodePatch = Parameters<UseRealtimeCanvasResult['commands']['patchNode']>[1]

type CanvasCollaborationValue = UseRealtimeCanvasResult & {
  addNodes: (nodes: Node[]) => void
  addEdges: (edges: Edge[]) => void
  deleteNodes: (nodeIds: string[]) => void
  deleteEdges: (edgeIds: string[]) => void
  patchNodes: (patches: Array<{ id: string; patch: NodePatch }>) => void
  patchNodeData: (nodeId: string, patch: NodeDataPatch, options?: NodeWriteOptions) => void
  updateNodeData: (nodeId: string, updater: NodeDataUpdater, options?: NodeWriteOptions) => void
  replaceShot: (nodeId: string, shotId: string) => void
  createNextShot: (nodeId: string) => string | null
}

const CanvasCollaborationContext = createContext<CanvasCollaborationValue | null>(null)

export function CanvasCollaborationProvider({
  value,
  children,
}: {
  value: UseRealtimeCanvasResult
  children: React.ReactNode
}) {
  const runtimeStatusRef = useRef(value.persistenceStatus)
  runtimeStatusRef.current = value.persistenceStatus

  const runtimeControlsRef = useRef<CanvasRuntimeControls>({
    commands: value.commands,
    undo: value.undo,
    redo: value.redo,
  })
  runtimeControlsRef.current = {
    commands: value.commands,
    undo: value.undo,
    redo: value.redo,
  }

  const guardedRuntimeControls = useMemo(
    () => createInvocationTimeRuntimeControls(runtimeControlsRef, runtimeStatusRef),
    [],
  )

  const runtimeValue = {
    ...value,
    commands: guardedRuntimeControls.commands,
    undo: guardedRuntimeControls.undo,
    redo: guardedRuntimeControls.redo,
  }

  const findNode = (nodeId: string) => runtimeValue.allNodes.find((node) => node.id === nodeId) as Node | undefined

  const collaborationValue: CanvasCollaborationValue = {
    ...runtimeValue,
    addNodes(nodes) {
      if (nodes.length === 0) return
      runtimeValue.commands.batch(({ createNode }) => {
        for (const node of nodes) {
          createNode(node as any)
        }
      })
    },
    addEdges(edges) {
      if (edges.length === 0) return
      runtimeValue.commands.batch(({ createEdge }) => {
        for (const edge of edges) {
          createEdge(edge as any)
        }
      })
    },
    deleteNodes(nodeIds) {
      if (nodeIds.length === 0) return
      runtimeValue.commands.batch(({ deleteNode }) => {
        for (const nodeId of nodeIds) {
          deleteNode(nodeId)
        }
      })
    },
    deleteEdges(edgeIds) {
      if (edgeIds.length === 0) return
      runtimeValue.commands.batch(({ deleteEdge }) => {
        for (const edgeId of edgeIds) {
          deleteEdge(edgeId)
        }
      })
    },
    patchNodes(patches) {
      if (patches.length === 0) return
      runtimeValue.commands.batch(({ patchNode }) => {
        for (const entry of patches) {
          patchNode(entry.id, entry.patch)
        }
      })
    },
    patchNodeData(nodeId, patch, options) {
      if (!findNode(nodeId)) return
      runtimeValue.commands.patchNodeData(nodeId, patch, options)
    },
    updateNodeData(nodeId, updater, options) {
      if (!findNode(nodeId)) return
      runtimeValue.commands.updateNodeData(nodeId, updater, options)
    },
    replaceShot(nodeId, shotId) {
      if (!findNode(nodeId)) return
      runtimeValue.commands.replaceShot(nodeId, shotId)
    },
    createNextShot(nodeId) {
      if (!findNode(nodeId)) return null
      return runtimeValue.commands.createNextShot(nodeId)
    },
  }

  return (
    <CanvasCollaborationContext.Provider value={collaborationValue}>
      {children}
    </CanvasCollaborationContext.Provider>
  )
}

export function useCanvasCollaboration(): CanvasCollaborationValue {
  const value = useContext(CanvasCollaborationContext)
  if (!value) {
    throw new Error('useCanvasCollaboration must be used within CanvasCollaborationProvider')
  }
  return value
}
