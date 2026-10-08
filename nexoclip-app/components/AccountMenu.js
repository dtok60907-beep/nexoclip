'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// Header account control: avatar button + dropdown (Account, Log out).
// Self-contained — fetches the session and handles logout on its own so it can
// drop into any header (Studio shell, AI Storyboard, …).
export default function AccountMenu({ admin = false, showAdminLink = false }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' });
        const session = await res.json();
        if (!cancelled && session.authenticated) setUser(session.user || null);
      } catch {
        // Leave user null; the menu still offers Log out.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // Sign out locally even if the request fails.
    } finally {
      if (typeof window !== 'undefined') window.sessionStorage.removeItem('nexoclip_workspace_id');
      router.replace('/login');
    }
  }, [router]);

  const name = user?.displayName || user?.email || 'Account';
  const initial = (name || '?').trim().charAt(0).toUpperCase();

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 py-1 pl-1 pr-1.5 transition-colors hover:border-white/20 hover:bg-white/10"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full border border-white/[0.08] bg-gradient-to-br from-[#22d3ee]/30 to-purple-500/20 text-[11px] font-bold text-[#22d3ee]">
          {initial}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-white/50 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 overflow-hidden rounded-xl border border-white/[0.08] bg-[#0d0d0f] shadow-[0_12px_40px_rgba(0,0,0,0.6)]"
        >
          <div className="border-b border-white/[0.06] px-4 py-3">
            <p className="truncate text-[13px] font-semibold text-white">{user?.displayName || 'Nexoclip user'}</p>
            {user?.email && <p className="truncate text-[11px] text-white/40">{user.email}</p>}
          </div>
          {!admin && <a
            href="/account"
            role="menuitem"
            className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-white/75 transition-colors hover:bg-white/[0.05] hover:text-white"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            Account
          </a>}
          {showAdminLink && user?.isPlatformOperator === true && <a href="/admin" role="menuitem" className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-cyan-200 transition-colors hover:bg-white/[0.05]">Buka Admin console ↗</a>}
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-50"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {loggingOut ? 'Logging out…' : 'Log out'}
          </button>
        </div>
      )}
    </div>
  );
}
