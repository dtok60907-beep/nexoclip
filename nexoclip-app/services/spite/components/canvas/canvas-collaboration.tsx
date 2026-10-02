'use client'

import { createContext, useContext, useMemo, useRef } from 'react'
import type { Edge, Node } from '@xyflow/react'

import type { UseRealtimeCanvasResult } from '@/hooks/use-realtime-canvas'
import type { NodeWriteOptions } from '@/lib/realtime/react-flow-binding'
import {
  createInvocationTimeRuntimeControls,
  type CanvasRuntimeControls,
} from '@/lib/canvas-runtime-ui'
import { GROUP_TYPE, planDeletion, planGroup, planRelease, type GroupableNode } from '@/lib/canvas-groups'

type BatchMutations = Parameters<Parameters<UseRealtimeCanvasResult['commands']['batch']>[0]>[0]

export function groupNodesWithCommands(
  commands: Pick<UseRealtimeCanvasResult['commands'], 'batch'>,
  allNodesInput: readonly unknown[],
  nodeIds: string[],
): string | null {
  const allNodes = allNodesInput as GroupableNode[]
  const chosen = allNodes.filter((node) => nodeIds.includes(node.id))
  const frameId = `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  const plan = planGroup(chosen, allNodes, frameId)
  if (!plan) return null
  const sceneId = chosen[0]?.data?.sceneId
  commands.batch(({ createNode, patchNode }: BatchMutations) => {
    createNode({
      id: frameId,
      type: GROUP_TYPE,
      position: plan.frame.position,
      data: { label: 'Group', color: 'blue', width: plan.frame.width, height: plan.frame.height, ...(typeof sceneId === 'string' ? { sceneId } : {}) },
    } as never)
    for (const member of plan.members) patchNode(member.id, { parentId: member.parentId, position: member.position } as never)
  })
  return frameId
}

export function ungroupNodesWithCommands(
  commands: Pick<UseRealtimeCanvasResult['commands'], 'batch'>,
  allNodesInput: readonly unknown[],
  frameIds: string[],
): void {
  const allNodes = allNodesInput as GroupableNode[]
  const frames = frameIds.filter((frameId) => allNodes.some((node) => node.id === frameId && node.type === GROUP_TYPE))
  if (frames.length === 0) return
  commands.batch(({ patchNode, deleteNode }: BatchMutations) => {
    for (const frameId of frames) {
      for (const change of planRelease(frameId, allNodes)) patchNode(change.id, { parentId: undefined, position: change.position } as never)
      deleteNode(frameId)
    }
  })
}

// Group-aware delete shared by every delete path: deleting a group frame
// releases its members in place unless `withContents` deletes them too.
export function deleteNodesWithGroups(
  commands: Pick<UseRealtimeCanvasResult['commands'], 'batch'>,
  allNodes: readonly unknown[],
  nodeIds: string[],
  options: { withContents?: boolean } = {},
): void {
  if (nodeIds.length === 0) return
  const plan = planDeletion(nodeIds, allNodes as GroupableNode[], options)
  commands.batch(({ patchNode, deleteNode }: BatchMutations) => {
    for (const change of plan.release) patchNode(change.id, { parentId: undefined, position: change.position } as never)
    for (const nodeId of plan.deleteIds) deleteNode(nodeId)
  })
}

type NodeDataPatch = Record<string, unknown>
type NodeDataUpdater = Parameters<UseRealtimeCanvasResult['commands']['updateNodeData']>[1]
type NodePatch = Parameters<UseRealtimeCanvasResult['commands']['patchNode']>[1]

type CanvasCollaborationValue = UseRealtimeCanvasResult & {
  addNodes: (nodes: Node[]) => void
  addEdges: (edges: Edge[]) => void
  deleteNodes: (nodeIds: string[], options?: { withContents?: boolean }) => void
  // Wrap nodes in a new group frame; returns its id, or null when nothing groups.
  groupNodes: (nodeIds: string[]) => string | null
  // Release a frame's members in place and remove the frame.
  ungroupNodes: (frameIds: string[]) => void
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
    deleteNodes(nodeIds, options) {
      deleteNodesWithGroups(runtimeValue.commands, runtimeValue.allNodes ?? [], nodeIds, options)
    },
    groupNodes(nodeIds) {
      return groupNodesWithCommands(runtimeValue.commands, runtimeValue.allNodes ?? [], nodeIds)
    },
    ungroupNodes(frameIds) {
      ungroupNodesWithCommands(runtimeValue.commands, runtimeValue.allNodes ?? [], frameIds)
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
