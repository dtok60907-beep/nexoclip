'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// Header account control: avatar button + dropdown (Account, Log out).
// Self-contained — fetches the session and handles logout on its own so it can
// drop into any header (Studio shell, AI Storyboard, …).
export default function AccountMenu({ admin = false, showAdminLink = false, sidebar = false }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
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
    setLogoutError('');
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      if (!response.ok) throw new Error('Logout failed. Please try again.');
      if (typeof window !== 'undefined') window.sessionStorage.removeItem('nexoclip_workspace_id');
      setUser(null);
      setOpen(false);
      window.dispatchEvent(new Event('nexoclip:auth-logout'));
      router.replace('/studio/home');
    } catch {
      setLogoutError('Logout failed. Please try again.');
    } finally {
      setLoggingOut(false);
    }
  }, [router]);

  const name = user?.displayName || user?.email || 'Account';
  const initial = (name || '?').trim().charAt(0).toUpperCase();

  return (
    <div ref={wrapRef} className="relative" onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="nx-account-trigger flex items-center gap-2 rounded-full border border-violet-100 bg-white p-1.5 text-slate-600 transition-colors hover:bg-violet-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700">
          {initial}
        </span>
        {sidebar && <span className="nx-profile-name">{name}</span>}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 overflow-hidden rounded-xl border border-violet-100 bg-white text-slate-700 shadow-lg"
        >
          <div className="border-b border-violet-100 px-4 py-3">
            <p className="truncate text-[13px] font-semibold text-slate-800">{user?.displayName || 'Nexoclip user'}</p>
            {user?.email && <p className="truncate text-[11px] text-slate-500">{user.email}</p>}
          </div>
          {!admin && <a href="/studio/billing" role="menuitem" className="block px-4 py-2.5 text-[13px] text-slate-600">Billing & credits</a>}
          {!admin && <a
            href="/account"
            role="menuitem"
            className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-slate-600 transition-colors hover:bg-violet-50 hover:text-slate-800"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            Account
          </a>}
          {showAdminLink && user?.isPlatformOperator === true && <a href="/admin" role="menuitem" className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-violet-700 transition-colors hover:bg-violet-50">Buka Admin console ↗</a>}
          {logoutError && <p className="px-4 pt-2 text-[11px] text-red-600" role="alert">{logoutError}</p>}
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-50"
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
