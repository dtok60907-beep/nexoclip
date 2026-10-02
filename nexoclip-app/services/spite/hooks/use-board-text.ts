'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'

import { useCanvasCollaboration } from '@/components/canvas/canvas-collaboration'
import { useNodeOwnershipLock } from '@/hooks/use-node-ownership-lock'
import { getCanvasRuntimeCapabilities } from '@/lib/canvas-runtime-ui'

export const MAX_BOARD_TEXT_LENGTH = 5000

// Editable text for sticky notes and text labels. Double-click edits while
// holding the node's ownership lock (one editor at a time, like prompts);
// every change syncs through node data, and leaving the editor releases it.
export function useBoardText(id: string, data: Record<string, unknown>, { editOnMount = false } = {}) {
  const params = useParams()
  const projectId = typeof params?.projectId === 'string' ? params.projectId : typeof params?.id === 'string' ? params.id : undefined
  const { patchNodeData, persistenceStatus } = useCanvasCollaboration()
  const { allowDocumentMutation } = getCanvasRuntimeCapabilities(persistenceStatus)
  const nodeLock = useNodeOwnershipLock(projectId, id)
  const stored = typeof data.text === 'string' ? data.text : ''
  const [draft, setDraft] = useState(stored)
  const [editing, setEditing] = useState(false)
  const editingRef = useRef(false)
  const locked = data.locked === true

  // Follow collaborators' edits whenever this client isn't the one typing.
  useEffect(() => {
    if (!editingRef.current) setDraft(stored)
  }, [stored])

  const startEditing = useCallback(async () => {
    if (editingRef.current || !allowDocumentMutation || locked) return
    if (!(await nodeLock.claim())) {
      toast.error(nodeLock.failureMessage())
      return
    }
    editingRef.current = true
    setEditing(true)
  }, [allowDocumentMutation, locked, nodeLock])

  const stopEditing = useCallback(() => {
    if (!editingRef.current) return
    editingRef.current = false
    setEditing(false)
    nodeLock.release()
  }, [nodeLock])

  const change = useCallback((next: string) => {
    const text = next.slice(0, MAX_BOARD_TEXT_LENGTH)
    setDraft(text)
    patchNodeData(id, { text })
  }, [id, patchNodeData])

  const startedRef = useRef(false)
  useEffect(() => {
    if (editOnMount && !startedRef.current) {
      startedRef.current = true
      void startEditing()
    }
  }, [editOnMount, startEditing])

  return { text: editing ? draft : stored, editing, startEditing, stopEditing, change, canEdit: allowDocumentMutation && !locked }
}
