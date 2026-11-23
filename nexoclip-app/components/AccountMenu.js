'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { NxSkeleton } from './ui/nx-loading';

// Header & sidebar account control: avatar button + dropdown (Account, Log out).
// Self-contained — fetches the session and handles logout on its own so it can
// drop into any header (Studio shell, Icon Rail, AI Storyboard, …).
export default function AccountMenu({ admin = false, showAdminLink = false, sidebar = false, rail = false, onUpgrade = null, onOpenSettings = null }) {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const [user, setUser] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
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
      } finally {
        if (!cancelled) setLoadingSession(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onProfileUpdated = (event) => {
      const nextDisplayName = event?.detail?.displayName;
      if (typeof nextDisplayName === 'string') {
        setUser((prev) => (prev ? { ...prev, displayName: nextDisplayName } : prev));
      }
    };
    window.addEventListener('nexoclip:profile-updated', onProfileUpdated);
    return () => window.removeEventListener('nexoclip:profile-updated', onProfileUpdated);
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

  const popoverPositionClass = rail
    ? 'nx-rail-account-popover'
    : 'absolute right-0 top-[calc(100%+8px)] z-50 w-56 origin-top-right overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-700 shadow-lg';

  return (
    <div ref={wrapRef} className={`relative${rail ? ' nx-rail-account-wrap' : ''}`} onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}>
      <motion.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        title={rail ? name : undefined}
        whileHover={prefersReducedMotion ? undefined : { scale: 1.03 }}
        whileTap={prefersReducedMotion ? undefined : { scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 440, damping: 28 }}
        className={
          rail
            ? 'nx-rail-avatar-trigger'
            : 'nx-account-trigger flex items-center gap-2 rounded-full border border-zinc-200/90 bg-white p-1.5 text-zinc-600 transition-colors hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-500'
        }
      >
        {loadingSession ? (
          rail ? (
            <NxSkeleton variant="circle" width={30} height={30} />
          ) : (
            <>
              <NxSkeleton variant="circle" width={32} height={32} />
              {sidebar && <NxSkeleton width={96} height={12} />}
            </>
          )
        ) : rail ? (
          <>
            <span className="nx-rail-avatar-circle">{initial}</span>
            <span className="nx-rail-avatar-mobile-name">{name}</span>
          </>
        ) : (
          <>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-zinc-100 text-sm font-semibold text-zinc-800">
              {initial}
            </span>
            {sidebar && <span className="nx-profile-name">{name}</span>}
          </>
        )}
        {!rail && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="account-menu-popover"
            role="menu"
            initial={prefersReducedMotion ? false : { opacity: 0, y: rail ? 4 : -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, y: rail ? 2 : -4, scale: 0.97 }}
            transition={
              prefersReducedMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 440, damping: 30 }
            }
            className={popoverPositionClass}
          >
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="truncate text-[13px] font-semibold text-slate-800">{user?.displayName || 'Nexoclip user'}</p>
              {user?.email && <p className="truncate text-[11px] text-slate-500">{user.email}</p>}
            </div>
            {!admin && onUpgrade && (
              <button
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); onUpgrade(); }}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] font-medium text-zinc-900 transition-colors hover:bg-zinc-100"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" />
                </svg>
                Upgrade plan
              </button>
            )}
            {!admin && (
              <a
                href="/studio/billing"
                role="menuitem"
                className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="2" y="5" width="20" height="14" rx="2" />
                  <line x1="2" y1="10" x2="22" y2="10" />
                </svg>
                Billing & credits
              </a>
            )}
            {!admin && (
              <a
                href="/studio/settings"
                role="menuitem"
                onClick={(event) => {
                  if (onOpenSettings && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
                    event.preventDefault();
                    setOpen(false);
                    onOpenSettings();
                  }
                }}
                className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                Account & settings
              </a>
            )}
            {showAdminLink && user?.isPlatformOperator === true && (
              <a href="/admin" role="menuitem" className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-violet-700 transition-colors hover:bg-violet-50">
                Open Admin console ↗
              </a>
            )}
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
