'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const WORKSPACE_KEY = 'nexoclip_workspace_id';

function rememberWorkspace(id) {
  try {
    if (id) window.sessionStorage.setItem(WORKSPACE_KEY, id);
    else window.sessionStorage.removeItem(WORKSPACE_KEY);
  } catch { /* storage unavailable */ }
}

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] || '')).toUpperCase();
}

const roleLabel = { owner: 'Pemilik', admin: 'Admin', member: 'Anggota' };

function Spinner({ className = '' }) {
  return <span className={`inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-[#d4ff64] ${className}`} aria-hidden="true" />;
}

function WorkspaceSwitcher({ workspaces, onSwitch, busy }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = workspaces[0];
  useEffect(() => {
    const close = (event) => { if (ref.current && !ref.current.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  if (!current) return null;
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-medium text-white/90 hover:bg-white/[0.05]">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-[#d4ff64] text-[11px] font-bold text-[#10130a]">{initials(current.name)[0]}</span>
        <span className="max-w-[220px] truncate">{current.name}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/45" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-[260px] rounded-xl border border-white/10 bg-[#11141a] p-1 shadow-[0_18px_50px_#000a]">
          {workspaces.map((ws) => (
            <button key={ws.id} type="button" disabled={busy || ws.is_current} onClick={() => { setOpen(false); onSwitch(ws.id); }}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-white/80 hover:bg-white/[0.05] disabled:cursor-default">
              <span className="truncate">{ws.name}</span>
              {ws.is_current || ws.id === current.id ? <span className="text-[10.5px] text-[#d4ff64]">Aktif</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready
  const [workspaces, setWorkspaces] = useState([]);
  const [balance, setBalance] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);

  const loadBalance = useCallback(async (workspaceId) => {
    if (!workspaceId) return setBalance(null);
    try {
      const res = await fetch('/api/usage?scope=me&page=1&pageSize=1', { credentials: 'include', headers: { 'x-workspace-id': workspaceId } });
      setBalance(res.ok ? (await res.json()).balance : null);
    } catch { setBalance(null); }
  }, []);

  const applyWorkspaces = useCallback((list) => {
    setWorkspaces(list);
    // The current workspace comes first; every studio page reads it from here.
    rememberWorkspace(list[0]?.id);
    loadBalance(list[0]?.id);
  }, [loadBalance]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/session', { credentials: 'include' });
        const session = await res.json();
        if (!session.authenticated) {
          if (!cancelled) router.replace('/studio/home?auth=login&next=%2Faccount');
          return;
        }
        const wsRes = await fetch('/api/workspaces', { credentials: 'include', cache: 'no-store' });
        const payload = await wsRes.json().catch(() => ({}));
        if (cancelled) return;
        setUser(session.user || null);
        applyWorkspaces(payload.workspaces || []);
        setStatus('ready');
      } catch {
        if (!cancelled) router.replace('/studio/home?auth=login&next=%2Faccount');
      }
    })();
    return () => { cancelled = true; };
  }, [router, applyWorkspaces]);

  const switchTo = async (workspaceId) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/workspaces/current', {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || 'Gagal mengganti workspace.');
      applyWorkspaces(payload.workspaces || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const createWorkspace = async (event) => {
    event.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName.trim() }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || 'Gagal membuat workspace.');
      applyWorkspaces(payload.workspaces || []);
      setNewName('');
      setCreating(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      if (!response.ok) throw new Error('Gagal logout. Coba lagi.');
    } catch {
      setError('Gagal logout. Coba lagi.');
      setLoggingOut(false);
      return;
    }
    rememberWorkspace(null);
    router.replace('/studio/home');
    setLoggingOut(false);
  }, [router]);

  const name = user?.displayName || user?.email?.split('@')[0] || 'Nexoclip creator';
  const handle = user?.email ? `@${user.email.split('@')[0]}` : '';
  const current = workspaces[0];

  return (
    <main className="min-h-screen bg-[#07090e] text-white">
      <header className="flex h-14 items-center gap-3 px-4 md:px-6">
        <WorkspaceSwitcher workspaces={workspaces} onSwitch={switchTo} busy={busy} />
        <div className="ml-auto flex items-center gap-2">
          {balance !== null && (
            <span className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[12px] text-white/80">
              <span className="mr-1 text-[#d4ff64]">✧</span>{Number(balance).toLocaleString('id-ID')} kredit
            </span>
          )}
          <Link href="/studio" className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-[12px] text-white/70 transition hover:border-white/20 hover:text-white">
            Kembali ke Studio
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1100px] space-y-5 px-4 pb-16 pt-6 md:px-6">
        {status === 'loading' ? (
          <div className="flex items-center gap-3 py-20 text-[13px] text-white/45"><Spinner /> Memuat akun…</div>
        ) : (
          <>
            {/* Profile */}
            <section className="flex flex-col gap-5 rounded-2xl border border-white/[0.08] bg-[#0f1217] p-5 sm:flex-row sm:items-center md:p-6">
              <span className="grid h-24 w-24 flex-none place-items-center rounded-full bg-gradient-to-br from-[#d4ff64] to-[#8de6cc] text-[30px] font-semibold text-[#10130a] shadow-[0_0_40px_#d4ff6422]">
                {initials(name)}
              </span>
              <div className="min-w-0 flex-1">
                <h1 className="font-display truncate text-[26px] font-semibold tracking-[-0.5px] text-white">{name}</h1>
                {handle && <p className="mt-0.5 truncate text-[13px] text-white/40">{handle}</p>}
                <p className="mt-2 text-[12.5px] text-white/50">{user?.email}</p>
              </div>
              <div className="flex flex-none gap-2 self-start">
                <button type="button" onClick={handleLogout} disabled={loggingOut}
                  className="flex items-center gap-2 rounded-lg border border-white/[0.1] px-3 py-2 text-[12px] text-white/75 transition hover:border-red-400/40 hover:text-red-300 disabled:opacity-50">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                  {loggingOut ? 'Keluar…' : 'Keluar'}
                </button>
              </div>
            </section>

            {/* Workspaces */}
            <section className="rounded-2xl border border-white/[0.08] bg-[#0f1217] p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#d4ff64]/10 px-2.5 py-1 text-[11px] font-medium text-[#d4ff64]">✦ Workspace</span>
                  <h2 className="font-display mt-2 text-[22px] font-semibold tracking-[-0.4px]">
                    Pisahkan project dan kredit per <span className="text-[#d4ff64]">workspace</span>
                  </h2>
                  <p className="mt-1.5 max-w-[620px] text-[12.5px] leading-relaxed text-white/50">
                    Setiap workspace punya saldo kredit, aset, dan project sendiri. Workspace yang aktif dipakai di seluruh studio, termasuk AI Director.
                  </p>
                </div>
                {!creating && (
                  <button type="button" onClick={() => setCreating(true)}
                    className="rounded-lg bg-[#d4ff64] px-3.5 py-2 text-[12px] font-semibold text-[#10130a] transition hover:bg-[#e0ff8c]">
                    + Workspace baru
                  </button>
                )}
              </div>

              {creating && (
                <form onSubmit={createWorkspace} className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} placeholder="Nama workspace, mis. Klien Kopi Susu"
                    className="flex-1 rounded-lg border border-white/10 bg-[#0b0e13] px-3 py-2 text-[13px] text-white outline-none placeholder:text-white/30 focus:border-[#d4ff64]/40" />
                  <div className="flex gap-2">
                    <button type="submit" disabled={busy || newName.trim().length < 2}
                      className="flex items-center gap-2 rounded-lg bg-[#d4ff64] px-4 py-2 text-[12px] font-semibold text-[#10130a] hover:bg-[#e0ff8c] disabled:opacity-50">
                      {busy && <Spinner />} Buat
                    </button>
                    <button type="button" onClick={() => { setCreating(false); setNewName(''); }}
                      className="rounded-lg border border-white/10 px-3 py-2 text-[12px] text-white/60 hover:border-white/25">Batal</button>
                  </div>
                </form>
              )}
              {error && <p className="mt-3 text-[12px] text-red-300">{error}</p>}

              <ul className="mt-5 divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.06]">
                {workspaces.map((ws, index) => {
                  const active = index === 0;
                  return (
                    <li key={ws.id} className={`flex items-center gap-3 px-4 py-3 ${active ? 'bg-[#d4ff64]/[0.04]' : ''}`}>
                      <span className={`grid h-9 w-9 flex-none place-items-center rounded-full text-[12px] font-semibold ${active ? 'bg-[#d4ff64] text-[#10130a]' : 'bg-white/[0.06] text-white/70'}`}>
                        {initials(ws.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-white/90">{ws.name}</p>
                        <p className="text-[11px] text-white/40">{roleLabel[ws.role] || ws.role}</p>
                      </div>
                      {active ? (
                        <span className="rounded-full border border-[#d4ff64]/30 px-2.5 py-1 text-[11px] text-[#d4ff64]">Aktif</span>
                      ) : (
                        <button type="button" onClick={() => switchTo(ws.id)} disabled={busy}
                          className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-white/70 hover:border-white/25 hover:text-white disabled:opacity-50">
                          Pakai workspace ini
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Credits of the current workspace */}
            <section className="flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#141a12] via-[#0f1217] to-[#0f1217] p-5 sm:flex-row sm:items-center md:p-6">
              <div className="min-w-0 flex-1">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-white/60">✧ Kredit</span>
                <h2 className="font-display mt-2 text-[22px] font-semibold tracking-[-0.4px]">
                  {balance !== null ? <>{Number(balance).toLocaleString('id-ID')} <span className="text-[#d4ff64]">kredit</span></> : 'Saldo kredit'}
                </h2>
                <p className="mt-1 text-[12.5px] text-white/50">Saldo workspace <span className="text-white/75">{current?.name || '—'}</span>. Kredit dipakai untuk gambar, video, dan AI Director.</p>
              </div>
              <div className="flex flex-none gap-2">
                <Link href="/studio/billing" className="rounded-lg bg-[#d4ff64] px-4 py-2 text-[12px] font-semibold text-[#10130a] hover:bg-[#e0ff8c]">Top up</Link>
                <Link href="/studio/usage" className="rounded-lg border border-white/10 px-3.5 py-2 text-[12px] text-white/70 hover:border-white/25 hover:text-white">Riwayat pemakaian</Link>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
