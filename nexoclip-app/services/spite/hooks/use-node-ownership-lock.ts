'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { withBasePath } from '@/lib/base-path'
import { getOrCreateDeviceHint } from '@/lib/realtime/presence'
import { describeLockFailure } from '@/lib/lock-messages'

export function useNodeOwnershipLock(projectId: string | undefined, nodeId: string) {
  const participantId = useRef<string | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [isOwned, setIsOwned] = useState(false)
  const owned = useRef(false)

  const lastFailure = useRef<string | null>(null)
  const request = useCallback(async (action: 'claim' | 'heartbeat' | 'release') => {
    if (!projectId) return false
    // One identity per browser (not per tab): generating from any of your own
    // tabs must not be blocked by another tab holding the same node.
    participantId.current ??= getOrCreateDeviceHint()
    let response: Response
    try {
      response = await fetch(withBasePath(`/api/projects/${encodeURIComponent(projectId)}/prompt-editor-lock`), {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, nodeId, participantId: participantId.current }),
      })
    } catch {
      lastFailure.current = describeLockFailure(0)
      return false
    }
    if (response.ok) return true
    const body = await response.json().catch(() => ({})) as { holder?: unknown }
    lastFailure.current = describeLockFailure(response.status, body.holder)
    return false
  }, [nodeId, projectId])

  const claim = useCallback(async () => {
    if (owned.current) return true
    owned.current = await request('claim')
    setIsOwned(owned.current)
    if (!owned.current) setError(lastFailure.current || describeLockFailure(500))
    else window.dispatchEvent(new CustomEvent('canvas-node-active', { detail: nodeId }))
    return owned.current
  }, [nodeId, request])

  const release = useCallback(() => {
    if (!owned.current) return
    owned.current = false
    setIsOwned(false)
    void request('release')
  }, [request])

  useEffect(() => {
    const handleActiveNode = (event: Event) => {
      if ((event as CustomEvent<string | null>).detail !== nodeId) release()
    }
    window.addEventListener('canvas-node-active', handleActiveNode)
    return () => {
      window.removeEventListener('canvas-node-active', handleActiveNode)
      release()
    }
  }, [nodeId, release])
  useEffect(() => {
    const timer = window.setInterval(() => { if (owned.current) void request('heartbeat').then((ok) => { if (!ok) { owned.current = false; setIsOwned(false); setError('Lock node berakhir.') } }) }, 5_000)
    return () => window.clearInterval(timer)
  }, [request])

  // Read synchronously right after a failed claim: `error` is React state and
  // is still the previous value inside the same handler.
  const failureMessage = useCallback(() => lastFailure.current || describeLockFailure(500), [])

  return { claim, release, owned: isOwned, error, failureMessage, clearError: () => setError(null) }
}
