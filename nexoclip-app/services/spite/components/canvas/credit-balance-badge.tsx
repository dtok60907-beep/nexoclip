'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowsClockwise, DiamondsFour } from '@phosphor-icons/react'

type UsageResponse = { balance?: string | number }
type WorkspacesResponse = { workspaces?: Array<{ id?: string }> }

function formatCredits(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)
}

export function CreditBalanceBadge() {
  const [balance, setBalance] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      let workspaceId = window.sessionStorage.getItem('nexoclip_workspace_id')
      if (!workspaceId) {
        const workspacesResponse = await fetch('/api/workspaces', { credentials: 'include' })
        if (!workspacesResponse.ok) throw new Error('Unable to resolve workspace')
        const workspaces = await workspacesResponse.json() as WorkspacesResponse
        workspaceId = workspaces.workspaces?.[0]?.id || null
        if (workspaceId) window.sessionStorage.setItem('nexoclip_workspace_id', workspaceId)
      }
      if (!workspaceId) throw new Error('Workspace unavailable')

      const response = await fetch('/api/usage?scope=me&page=1&pageSize=1', {
        credentials: 'include',
        headers: { 'x-workspace-id': workspaceId },
      })
      if (!response.ok) throw new Error('Credit balance unavailable')
      const payload = await response.json() as UsageResponse
      const next = Number(payload.balance)
      setBalance(Number.isFinite(next) ? next : null)
    } catch {
      setBalance(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const interval = window.setInterval(refresh, 30_000)
    window.addEventListener('focus', refresh)
    window.addEventListener('asset-status-changed', refresh)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('asset-status-changed', refresh)
    }
  }, [refresh])

  return (
    <button
      type="button"
      onClick={() => void refresh()}
      className="group flex h-8 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.05] px-2.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/[0.1]"
      title="Credit balance · click to refresh"
      aria-label="Refresh credit balance"
    >
      <DiamondsFour size={14} weight="fill" className="text-[#c8ff33]" />
      <span>{loading ? '…' : balance === null ? 'Credits unavailable' : `${formatCredits(balance)} credits`}</span>
      <ArrowsClockwise size={10} className="text-slate-500 opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  )
}
