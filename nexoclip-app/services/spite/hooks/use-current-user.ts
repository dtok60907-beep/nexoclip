'use client'

import { useEffect, useState } from 'react'

export type CurrentUser = { id: string; name: string }

// The signed-in user from the main app's session (same origin, root path).
// Fetched once per page and shared by every caller.
let pending: Promise<CurrentUser | null> | null = null

function loadCurrentUser(): Promise<CurrentUser | null> {
  pending ??= fetch('/api/auth/session', { credentials: 'same-origin' })
    .then((response) => (response.ok ? response.json() : null))
    .then((body: { authenticated?: boolean; user?: { id?: unknown; email?: unknown; displayName?: unknown } } | null) => {
      const id = body?.authenticated && typeof body.user?.id === 'string' ? body.user.id : null
      if (!id) return null
      const displayName = typeof body?.user?.displayName === 'string' ? body.user.displayName.trim() : ''
      const email = typeof body?.user?.email === 'string' ? body.user.email : ''
      return { id, name: displayName || email.split('@')[0] || 'Guest' }
    })
    .catch(() => {
      pending = null
      return null
    })
  return pending
}

export function useCurrentUser(): CurrentUser | null {
  const [user, setUser] = useState<CurrentUser | null>(null)
  useEffect(() => {
    let cancelled = false
    void loadCurrentUser().then((value) => { if (!cancelled) setUser(value) })
    return () => { cancelled = true }
  }, [])
  return user
}
