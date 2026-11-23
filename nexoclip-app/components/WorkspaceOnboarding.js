'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  Check,
  Copy,
  Crown,
  FolderKanban,
  Layers,
  Link2,
  Mail,
  Palette,
  Plus,
  Search,
  Shield,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';

async function api(path, body, method = 'POST') {
  const response = await fetch(
    path,
    body
      ? { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      : { cache: 'no-store' },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed.');
  return result;
}

const team = (body) => api('/api/workspaces/team', body);

function enter(workspace, path) {
  sessionStorage.setItem('nexoclip_workspace_id', workspace.id);
  sessionStorage.setItem('nexoclip_workspace_name', workspace.name);
  location.assign(path);
}

const primaryBtnClass =
  'inline-flex h-[36px] items-center justify-center gap-1.5 rounded-full border border-[#dfe0ea] bg-[#f4f4f7] px-4 text-[13px] font-semibold text-[#14141f] transition hover:border-[#cfd0de] hover:bg-[#e9e9f0] disabled:cursor-not-allowed disabled:opacity-50';

const secondaryBtnClass =
  'inline-flex h-[36px] items-center justify-center gap-1.5 rounded-full border border-[#e4e5ef] bg-white px-4 text-[13px] font-medium text-[#3c3d4e] transition hover:border-[#cfd0de] hover:bg-[#f4f4f7] hover:text-[#14141f] disabled:cursor-not-allowed disabled:opacity-50';

const smallBtnClass =
  'inline-flex h-[30px] items-center justify-center gap-1 rounded-full border border-[#e4e5ef] bg-white px-3 text-[12px] font-medium text-[#3c3d4e] transition hover:border-[#cfd0de] hover:bg-[#f4f4f7] hover:text-[#14141f] disabled:cursor-not-allowed disabled:opacity-50';

const inputClass =
  'h-[38px] w-full rounded-[10px] border border-[#e5e5ee] bg-white px-3.5 text-[13.5px] text-[#14141f] placeholder:text-[#9a9aa8] outline-none transition focus:border-[#5b45f2] focus:ring-2 focus:ring-[#5b45f2]/10';

function RoleBadge({ role }) {
  const normalized = (role || 'member').toLowerCase();
  if (normalized === 'owner') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[#ddd7fe] bg-[#f5f3ff] px-2.5 py-0.5 text-[11px] font-semibold text-[#5b45f2]">
        <Crown size={11} strokeWidth={2.1} aria-hidden="true" />
        Owner
      </span>
    );
  }
  if (normalized === 'admin') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[#dbeafe] bg-[#eff6ff] px-2.5 py-0.5 text-[11px] font-semibold text-[#2563eb]">
        <Shield size={11} strokeWidth={2.1} aria-hidden="true" />
        Admin
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#e6e7ef] bg-[#f6f6fa] px-2.5 py-0.5 text-[11px] font-medium text-[#5c5d70]">
      Member
    </span>
  );
}

const VIEW_TABS = [
  { id: 'switch', route: 'team', label: 'Workspaces', icon: Layers },
  { id: 'manage', route: 'team/members', label: 'Team Members', icon: Users },
  { id: 'new', route: 'team/new', label: 'New Workspace', icon: Plus },
];

export default function WorkspaceOnboarding({ join = false, view = 'switch', onNavigate }) {
  const [spaces, setSpaces] = useState([]);
  const [members, setMembers] = useState([]);
  const [invite, setInvite] = useState(null);
  const [user, setUser] = useState(null);
  const [busy, setBusy] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState('');
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [signup, setSignup] = useState(false);
  const [search, setSearch] = useState('');
  const [draftName, setDraftName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);
  const [switchingId, setSwitchingId] = useState(null);

  const active = spaces[0];
  const manager = ['admin', 'owner'].includes(active?.role);

  async function membersFor(w) {
    setMembers(
      ['admin', 'owner'].includes(w?.role)
        ? (await team({ action: 'list', workspaceId: w.id })).members || []
        : [],
    );
  }

  async function run(fn) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    setSearch('');
    setConfirmRemoveId(null);
    setError('');
    run(async () => {
      const session = await api('/api/auth/session');
      setUser(session.user || null);
      if (join) {
        setInvite(await team({ action: 'preview', token: location.hash.slice(1) }));
        setHydrated(true);
        return;
      }
      if (!session.authenticated) {
        location.replace('/studio/home');
        return;
      }
      const { workspaces } = await api('/api/workspaces');
      setSpaces(workspaces || []);
      if (view === 'manage') await membersFor(workspaces?.[0]);
      setHydrated(true);
    });
  }, [join, view]);

  function submit(fn) {
    return (e) => {
      e.preventDefault();
      const values = Object.fromEntries(new FormData(e.currentTarget));
      run(() => fn(values));
    };
  }

  const manage = (action, member, role) =>
    run(async () => {
      await team({ action, workspaceId: active.id, userId: member.id, role });
      setConfirmRemoveId(null);
      await membersFor(active);
    });

  const handleCopyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      // Fallback: user can still click/select the readonly input
    }
  };

  const handleSelectWorkspace = (workspace) => {
    setSwitchingId(workspace.id);
    run(async () => {
      if (workspace.id === active?.id) {
        enter(workspace, '/studio/projects');
        return;
      }
      const { workspaces } = await api('/api/workspaces/current', { workspaceId: workspace.id }, 'PUT');
      enter(workspaces[0], '/studio/projects');
    }).finally(() => setSwitchingId(null));
  };

  const filteredSpaces = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return spaces;
    return spaces.filter(
      (w) =>
        (w.name || '').toLowerCase().includes(q) ||
        (w.role || '').toLowerCase().includes(q),
    );
  }, [spaces, search]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        (m.email || '').toLowerCase().includes(q) ||
        (m.role || '').toLowerCase().includes(q),
    );
  }, [members, search]);

  /* ── STANDALONE INVITATION PAGE (/join) ── */
  if (join) {
    const emailMismatch =
      user && invite && user.email?.toLowerCase() !== invite.email?.toLowerCase();

    return (
      <main className="min-h-screen w-full bg-[#fafafc] text-[#14141f] flex flex-col">
        <div className="border-b border-[#ececf3] bg-white px-5 py-3.5 md:px-8">
          <div className="mx-auto flex max-w-[960px] items-center justify-between gap-3">
            <a
              href="/studio/home"
              onClick={(event) => onNavigate?.(event, 'home')}
              aria-label="NexoClip Home"
              className="inline-flex items-center"
            >
              <img src="/brand/nexoclip-lockup.png" width="108" alt="NexoClip" className="h-auto" />
            </a>
            <a href="/studio/home" className={secondaryBtnClass}>
              <ArrowLeft size={14} strokeWidth={2} />
              <span>Studio</span>
            </a>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-4 py-12">
          <section className="w-full max-w-[460px] rounded-2xl border border-[#e6e7ef] bg-white p-6 md:p-7 shadow-[0_8px_30px_rgba(20,20,31,0.05)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[#7b7c8e]">
                  Workspace Invitation
                </p>
                <h1 className="mt-1 text-[22px] font-semibold tracking-[-0.025em] text-[#14141f]">
                  {invite?.name || 'Join workspace'}
                </h1>
              </div>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#ddd7fe] bg-[#f5f3ff] text-[16px] font-semibold text-[#5b45f2]">
                {(invite?.name || 'W').slice(0, 1).toUpperCase()}
              </span>
            </div>

            {error && (
              <p
                role="alert"
                className="mt-4 rounded-xl border border-[#fecdd3] bg-[#fff1f2] px-3.5 py-2.5 text-[13px] text-[#be123c]"
              >
                {error}
              </p>
            )}

            {!hydrated && busy ? (
              <div className="mt-5 space-y-3">
                <div className="nx-skel h-4 w-3/4" />
                <div className="nx-skel h-10 w-full" />
                <div className="nx-skel h-9 w-full rounded-full" />
              </div>
            ) : invite ? (
              <form
                className="mt-5 grid gap-4"
                onSubmit={submit(async ({ password }) => {
                  const token = location.hash.slice(1);
                  if (!user && signup) {
                    await api('/api/auth/register', {
                      email: invite.email,
                      password,
                      inviteToken: token,
                    });
                  } else {
                    if (!user) await api('/api/auth/login', { email: invite.email, password });
                    await team({ action: 'accept', token });
                  }
                  enter(invite, '/studio/home');
                })}
              >
                <div className="rounded-xl border border-[#ececf3] bg-[#fafafc] p-3.5 text-[13px] leading-relaxed text-[#4f5062]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>Invited as</span>
                    <RoleBadge role={invite.role} />
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-[#6d6e80]">
                    <Mail size={13.5} className="shrink-0 text-[#8a8b9d]" />
                    <span className="truncate font-medium text-[#2c2d3c]">{invite.email}</span>
                  </p>
                </div>

                {emailMismatch ? (
                  <p className="rounded-xl border border-[#fde68a] bg-[#fffbeb] px-3.5 py-2.5 text-[13px] text-[#92400e]">
                    You are currently signed in as <strong>{user.email}</strong>. Sign in with{' '}
                    <strong>{invite.email}</strong> to accept this invitation.
                  </p>
                ) : (
                  <>
                    {!user && (
                      <div className="grid gap-3">
                        <label className="grid gap-1.5">
                          <span className="text-[12.5px] font-medium text-[#3c3d4e]">Password</span>
                          <input
                            className={inputClass}
                            type="password"
                            name="password"
                            placeholder={signup ? 'Create a password (min. 12 characters)' : 'Enter your password'}
                            autoComplete={signup ? 'new-password' : 'current-password'}
                            minLength={signup ? 12 : 1}
                            required
                          />
                        </label>
                        <button
                          type="button"
                          className="w-fit text-left text-[12.5px] font-medium text-[#5b45f2] hover:underline"
                          onClick={() => setSignup(!signup)}
                        >
                          {signup
                            ? 'Already have an account? Sign in'
                            : "Don\u2019t have an account? Sign up"}
                        </button>
                      </div>
                    )}

                    <button type="submit" disabled={busy} className={`${primaryBtnClass} w-full`}>
                      {busy
                        ? 'Processing…'
                        : user
                          ? 'Join Workspace'
                          : signup
                            ? 'Sign up and join'
                            : 'Sign in and join'}
                    </button>
                  </>
                )}
              </form>
            ) : (
              !error && (
                <p className="mt-4 text-[13px] text-[#6d6e80]">
                  This invitation link is invalid or has expired.
                </p>
              )
            )}
          </section>
        </div>
      </main>
    );
  }

  /* ── STUDIO WORKSPACE PAGES (/studio/team, /studio/team/members, /studio/team/new) ── */
  const pageTitle =
    view === 'new' ? 'New Workspace' : view === 'manage' ? 'Team Members' : 'Workspaces';

  const pageSubtitle =
    view === 'new'
      ? 'Create a dedicated workspace with its own projects, brand kit, products, and team permissions.'
      : view === 'manage'
        ? `Invite teammates and manage roles for ${active?.name || 'your active workspace'}.`
        : 'Switch between workspaces or manage team collaboration across your studios.';

  const showSearch = view === 'switch' || (view === 'manage' && manager);
  const searchPlaceholder =
    view === 'manage' ? 'Search members by email…' : 'Search workspaces…';

  return (
    <main className="h-full w-full overflow-y-auto bg-white text-[#14141f]">
      <div className="mx-auto max-w-[1040px] px-5 py-7 pb-16 md:px-8">
        {/* Page Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.03em] text-[#14141f]">
                {pageTitle}
              </h1>
              {active && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e6e7ef] bg-[#fafafc] px-2.5 py-1 text-[11.5px] font-medium text-[#4f5062]">
                  <Building2 size={12} className="text-[#7b7c8e]" aria-hidden="true" />
                  <span className="max-w-[180px] truncate">{active.name}</span>
                </span>
              )}
            </div>
            <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-[#6d6e80]">
              {pageSubtitle}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {view === 'manage' && (
              <a
                href="/studio/home"
                onClick={(event) => onNavigate?.(event, 'home')}
                className={secondaryBtnClass}
              >
                <span>Open Studio</span>
                <ArrowUpRight size={14} strokeWidth={2} />
              </a>
            )}
            {view !== 'new' && manager && (
              <a
                href="/studio/team/new"
                onClick={(event) => onNavigate?.(event, 'team/new')}
                className={primaryBtnClass}
              >
                <Plus size={15} strokeWidth={2.2} />
                <span>New Workspace</span>
              </a>
            )}
            {view === 'new' && (
              <a
                href="/studio/team"
                onClick={(event) => onNavigate?.(event, 'team')}
                className={secondaryBtnClass}
              >
                <ArrowLeft size={14} strokeWidth={2} />
                <span>Back to Workspaces</span>
              </a>
            )}
          </div>
        </div>

        {/* All-Apps Pill Toolbar Navigation */}
        <div className="nx-apps-toolbar mt-6 mb-6">
          <div className="nx-apps-toolbar-left">
            <nav className="nx-apps-pill-bar" aria-label="Workspace sections">
              {VIEW_TABS.map((tab) => {
                const TabIcon = tab.icon;
                const isActive = view === tab.id;
                return (
                  <a
                    key={tab.id}
                    href={`/studio/${tab.route}`}
                    onClick={(event) => onNavigate?.(event, tab.route)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`nx-apps-pill-tab inline-flex items-center gap-1.5 no-underline${isActive ? ' is-active' : ''}`}
                  >
                    <TabIcon size={13.5} strokeWidth={2} aria-hidden="true" />
                    <span>{tab.label}</span>
                    {tab.id === 'switch' && hydrated && spaces.length > 0 && (
                      <span className="ml-0.5 text-[11px] opacity-65">{spaces.length}</span>
                    )}
                    {tab.id === 'manage' && hydrated && view === 'manage' && members.length > 0 && (
                      <span className="ml-0.5 text-[11px] opacity-65">{members.length}</span>
                    )}
                  </a>
                );
              })}
            </nav>

            {showSearch && (
              <div className="nx-apps-inline-search">
                <Search className="nx-apps-inline-search-icon w-3.5 h-3.5" aria-hidden="true" />
                <label htmlFor="nx-team-search" className="nx-reference-sr">
                  {searchPlaceholder}
                </label>
                <input
                  id="nx-team-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="nx-apps-inline-search-input"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="nx-apps-inline-search-clear"
                    aria-label="Clear search"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div
            role="alert"
            className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-[#fecdd3] bg-[#fff1f2] px-4 py-3 text-[13px] text-[#be123c]"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError('')}
              className="rounded-md p-1 text-[#be123c]/70 hover:bg-[#ffe4e6] hover:text-[#be123c]"
              aria-label="Dismiss error"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Loading Skeleton */}
        {!hydrated ? (
          view === 'switch' ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-[#ececf3] bg-white p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="nx-skel h-11 w-11 rounded-xl" />
                    <div className="nx-skel h-5 w-16 rounded-full" />
                  </div>
                  <div className="nx-skel h-4 w-2/3" />
                  <div className="nx-skel h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-[#ececf3] bg-white p-6 space-y-4">
              <div className="nx-skel h-5 w-44" />
              <div className="nx-skel h-10 w-full" />
              <div className="nx-skel h-10 w-full" />
            </div>
          )
        ) : (
          user && (
            <>
              {/* ── VIEW 1: SWITCH WORKSPACE (/studio/team) ── */}
              {view === 'switch' && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredSpaces.map((w) => {
                    const isActive = w.id === active?.id;
                    const isSwitching = switchingId === w.id;
                    return (
                      <button
                        type="button"
                        key={w.id}
                        disabled={busy}
                        onClick={() => handleSelectWorkspace(w)}
                        className={`group flex flex-col justify-between rounded-2xl border p-5 text-left transition ${
                          isActive
                            ? 'border-[#d6d0fc] bg-[#fcfbff] shadow-[0_2px_12px_rgba(91,69,242,0.06)] hover:border-[#bfb5fa]'
                            : 'border-[#e6e7ef] bg-white hover:border-[#cfd0de] hover:bg-[#fafafc]'
                        } disabled:opacity-60`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-3">
                            <span
                              className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border text-[15px] font-semibold ${
                                isActive
                                  ? 'border-[#ddd7fe] bg-[#f2f0ff] text-[#5b45f2]'
                                  : 'border-[#e6e7ef] bg-[#f7f7fb] text-[#3c3d4e] group-hover:bg-white'
                              }`}
                            >
                              {(w.name || 'W').slice(0, 1).toUpperCase()}
                            </span>

                            {isActive ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#bbf7d0] bg-[#f0fdf4] px-2.5 py-0.5 text-[11px] font-semibold text-[#15803d]">
                                <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-transparent text-[#8a8b9d] transition group-hover:border-[#e4e5ef] group-hover:bg-white group-hover:text-[#14141f]">
                                <ArrowUpRight size={14} strokeWidth={2} />
                              </span>
                            )}
                          </div>

                          <h2 className="mt-4 truncate text-[15.5px] font-semibold tracking-[-0.015em] text-[#14141f]">
                            {w.name}
                          </h2>

                          <div className="mt-2 flex items-center gap-2">
                            <RoleBadge role={w.role} />
                          </div>
                        </div>

                        <div className="mt-5 flex items-center justify-between border-t border-[#f0f0f6] pt-3.5 text-[12px] font-medium text-[#6d6e80] group-hover:text-[#14141f]">
                          <span>
                            {isSwitching
                              ? 'Opening workspace…'
                              : isActive
                                ? 'Open projects'
                                : 'Switch & open projects'}
                          </span>
                          <ArrowUpRight
                            size={13.5}
                            className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                          />
                        </div>
                      </button>
                    );
                  })}

                  {manager && !search.trim() && (
                    <a
                      href="/studio/team/new"
                      onClick={(event) => onNavigate?.(event, 'team/new')}
                      className="group flex min-h-[188px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#dcdde8] bg-[#fafafc] p-6 text-center transition hover:border-[#bfc1d2] hover:bg-[#f4f4f8]"
                    >
                      <span className="grid h-11 w-11 place-items-center rounded-xl border border-[#e5e5ee] bg-white text-[#5c5d70] transition group-hover:border-[#cfd0de] group-hover:text-[#14141f]">
                        <Plus size={19} strokeWidth={2} />
                      </span>
                      <span className="mt-3 text-[14px] font-semibold text-[#14141f]">
                        Create New Workspace
                      </span>
                      <span className="mt-1 max-w-[200px] text-[12px] leading-relaxed text-[#7b7c8e]">
                        Separate projects, brand kits, and members per brand or client.
                      </span>
                    </a>
                  )}

                  {filteredSpaces.length === 0 && (
                    <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#e4e5ef] bg-[#fafafc] px-6 py-14 text-center">
                      <span className="grid h-12 w-12 place-items-center rounded-xl border border-[#e5e5ee] bg-white text-[#5c5d70]">
                        <Building2 size={21} strokeWidth={1.8} />
                      </span>
                      <h2 className="mt-4 text-[15px] font-semibold text-[#14141f]">
                        No matching workspaces
                      </h2>
                      <p className="mt-1 text-[13px] text-[#6d6e80]">
                        Try a different search keyword or clear your filter.
                      </p>
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        className={`${secondaryBtnClass} mt-4`}
                      >
                        Clear search
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── PERMISSION GATE FOR NON-MANAGERS ── */}
              {view !== 'switch' && !manager && (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#e4e5ef] bg-[#fafafc] px-6 py-16 text-center">
                  <span className="grid h-12 w-12 place-items-center rounded-xl border border-[#e5e5ee] bg-white text-[#5c5d70]">
                    <Shield size={21} strokeWidth={1.8} />
                  </span>
                  <h2 className="mt-4 text-[16px] font-semibold text-[#14141f]">
                    Admin access required
                  </h2>
                  <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-[#6d6e80]">
                    Only workspace owners and admins can manage team members or create new
                    workspaces. Switch to a workspace where you have admin permissions.
                  </p>
                  <a
                    href="/studio/team"
                    onClick={(event) => onNavigate?.(event, 'team')}
                    className={`${primaryBtnClass} mt-5`}
                  >
                    <ArrowLeft size={14} strokeWidth={2} />
                    <span>Back to Workspaces</span>
                  </a>
                </div>
              )}

              {/* ── VIEW 2: TEAM MEMBERS (/studio/team/members) ── */}
              {view === 'manage' && manager && (
                <div className="grid gap-6">
                  {/* Invite Member Card */}
                  <section className="rounded-2xl border border-[#e6e7ef] bg-[#fafafc] p-5 md:p-6">
                    <div className="flex items-start gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#e5e5ee] bg-white text-[#4f5062]">
                        <UserPlus size={16} strokeWidth={1.9} />
                      </span>
                      <div>
                        <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-[#14141f]">
                          Invite a Teammate
                        </h2>
                        <p className="mt-0.5 text-[12.5px] text-[#6d6e80]">
                          Generate a private invite link for <strong>{active?.name}</strong>. Links
                          stay valid for 7 days.
                        </p>
                      </div>
                    </div>

                    <form
                      className="mt-4 grid gap-2.5 sm:grid-cols-[1fr_150px_auto]"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const email = inviteEmail.trim();
                        if (!email) return;
                        run(async () => {
                          setLink('');
                          setCopied(false);
                          const { token } = await team({
                            email,
                            role: inviteRole,
                            action: 'invite',
                            workspaceId: active.id,
                          });
                          setLink(`${location.origin}/join#${token}`);
                          setInviteEmail('');
                        });
                      }}
                    >
                      <input
                        className={inputClass}
                        required
                        type="email"
                        name="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="colleague@company.com"
                        aria-label="Member email"
                      />
                      <select
                        className={inputClass}
                        name="role"
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value)}
                        aria-label="Member role"
                      >
                        <option value="member">Member</option>
                        {active.role === 'owner' && <option value="admin">Admin</option>}
                      </select>
                      <button type="submit" disabled={busy} className={`${primaryBtnClass} h-[38px]`}>
                        <Link2 size={14} strokeWidth={2} />
                        <span>{busy ? 'Creating…' : 'Create Invite Link'}</span>
                      </button>
                    </form>

                    {link && (
                      <div className="mt-4 rounded-xl border border-[#e4e5ef] bg-white p-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[12px] font-medium text-[#3c3d4e]">
                            Share this invite link with the recipient
                          </span>
                          <span className="rounded-full border border-[#e6e7ef] bg-[#f6f6fa] px-2 py-0.5 text-[11px] font-medium text-[#6d6e80]">
                            Valid for 7 days
                          </span>
                        </div>
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                          <input
                            className="h-[34px] flex-1 rounded-lg border border-[#e8e9f2] bg-[#fafafc] px-3 font-mono text-[12px] text-[#3c3d4e] outline-none"
                            readOnly
                            value={link}
                            aria-label="Generated invite link"
                            onFocus={(e) => e.target.select()}
                          />
                          <button
                            type="button"
                            onClick={handleCopyLink}
                            className={`${primaryBtnClass} h-[34px] shrink-0 px-3.5 text-[12.5px]`}
                          >
                            {copied ? (
                              <>
                                <Check size={13.5} strokeWidth={2.2} className="text-[#15803d]" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy size={13.5} strokeWidth={2} />
                                <span>Copy Link</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </section>

                  {/* Members Directory Card */}
                  <section className="overflow-hidden rounded-2xl border border-[#e6e7ef] bg-white">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f0f0f6] px-5 py-4">
                      <div className="flex items-center gap-2">
                        <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-[#14141f]">
                          Workspace Members
                        </h2>
                        <span className="inline-flex h-5 min-w-[22px] items-center justify-center rounded-full border border-[#e6e7ef] bg-[#f6f6fa] px-1.5 text-[11px] font-semibold text-[#5c5d70]">
                          {members.length}
                        </span>
                      </div>
                      <span className="text-[12px] text-[#7b7c8e]">
                        {active?.role === 'owner'
                          ? 'You can promote, demote, or remove members'
                          : 'Admins can invite and remove members'}
                      </span>
                    </div>

                    {filteredMembers.length === 0 ? (
                      <div className="px-6 py-12 text-center">
                        <p className="text-[14px] font-medium text-[#14141f]">
                          {search ? 'No matching members' : 'No team members yet'}
                        </p>
                        <p className="mt-1 text-[12.5px] text-[#6d6e80]">
                          {search
                            ? 'Try a different email or role filter.'
                            : 'Create an invite link above to add your first teammate.'}
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-[#f0f0f6]">
                        {filteredMembers.map((m) => {
                          const isSelf =
                            m.email?.toLowerCase() === user?.email?.toLowerCase();
                          const canChangeRole =
                            active.role === 'owner' && m.role !== 'owner';
                          const canRemove =
                            m.role === 'member' ||
                            (active.role === 'owner' && m.role === 'admin');
                          const confirming = confirmRemoveId === m.id;

                          return (
                            <div
                              key={m.id}
                              className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 transition hover:bg-[#fafafc]"
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#e6e7ef] bg-[#f6f6fa] text-[13px] font-semibold text-[#3c3d4e]">
                                  {(m.email || 'U').slice(0, 1).toUpperCase()}
                                </span>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="truncate text-[13.5px] font-medium text-[#14141f]">
                                      {m.email}
                                    </span>
                                    {isSelf && (
                                      <span className="rounded-full border border-[#e6e7ef] bg-white px-2 py-0.5 text-[10.5px] font-medium text-[#6d6e80]">
                                        You
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-1">
                                    <RoleBadge role={m.role} />
                                  </div>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                {canChangeRole && !confirming && (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    className={smallBtnClass}
                                    onClick={() =>
                                      manage('role', m, m.role === 'member' ? 'admin' : 'member')
                                    }
                                  >
                                    Make {m.role === 'member' ? 'Admin' : 'Member'}
                                  </button>
                                )}

                                {canRemove && !confirming && (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => setConfirmRemoveId(m.id)}
                                    className="inline-flex h-[30px] items-center gap-1 rounded-full border border-[#e4e5ef] bg-white px-3 text-[12px] font-medium text-[#6d6e80] transition hover:border-[#fecdd3] hover:bg-[#fff1f2] hover:text-[#be123c] disabled:opacity-50"
                                  >
                                    <Trash2 size={12.5} strokeWidth={1.9} />
                                    <span>Remove</span>
                                  </button>
                                )}

                                {canRemove && confirming && (
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => manage('remove', m)}
                                      className="inline-flex h-[30px] items-center gap-1 rounded-full border border-[#fecdd3] bg-[#fff1f2] px-3 text-[12px] font-semibold text-[#be123c] transition hover:bg-[#ffe4e6] disabled:opacity-50"
                                    >
                                      Confirm remove
                                    </button>
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => setConfirmRemoveId(null)}
                                      className={smallBtnClass}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </div>
              )}

              {/* ── VIEW 3: NEW WORKSPACE (/studio/team/new) ── */}
              {view === 'new' && manager && (
                <div className="max-w-[680px]">
                  <form
                    className="rounded-2xl border border-[#e6e7ef] bg-white p-6 md:p-7"
                    onSubmit={submit(async ({ name }) => {
                      const { workspace } = await api('/api/workspaces', { name: name.trim() });
                      enter(workspace, '/studio/team/members');
                    })}
                  >
                    {/* Live Workspace Preview Header */}
                    <div className="flex items-center gap-3.5 rounded-xl border border-[#ececf3] bg-[#fafafc] p-4">
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-[#ddd7fe] bg-[#f2f0ff] text-[18px] font-semibold text-[#5b45f2]">
                        {(draftName.trim() || 'W').slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-[15px] font-semibold text-[#14141f]">
                            {draftName.trim() || 'Untitled Workspace'}
                          </span>
                          <RoleBadge role="owner" />
                        </div>
                        <p className="mt-0.5 text-[12px] text-[#7b7c8e]">
                          Live workspace preview · You will be assigned as Owner
                        </p>
                      </div>
                    </div>

                    <div className="mt-6">
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor="nx-new-ws-name"
                          className="text-[13px] font-semibold text-[#14141f]"
                        >
                          Workspace name
                        </label>
                        <span className="text-[11.5px] text-[#8a8b9d]">
                          {draftName.length}/60
                        </span>
                      </div>
                      <input
                        id="nx-new-ws-name"
                        autoFocus
                        required
                        name="name"
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        minLength={2}
                        maxLength={60}
                        placeholder="e.g. Kopi Pagi Studio or Acme Creative"
                        className={`${inputClass} mt-2`}
                      />
                      <p className="mt-1.5 text-[12px] text-[#7b7c8e]">
                        Use a brand, agency, or client name so teammates can recognize it quickly.
                      </p>
                    </div>

                    {/* Included Workspace Features */}
                    <div className="mt-6 grid gap-2.5 sm:grid-cols-3">
                      <div className="rounded-xl border border-[#ececf3] bg-[#fafafc] p-3">
                        <FolderKanban size={15} className="text-[#5c5d70]" aria-hidden="true" />
                        <p className="mt-2 text-[12.5px] font-semibold text-[#14141f]">
                          Isolated Projects
                        </p>
                        <p className="mt-0.5 text-[11.5px] leading-snug text-[#7b7c8e]">
                          Separate projects, products, and media library.
                        </p>
                      </div>
                      <div className="rounded-xl border border-[#ececf3] bg-[#fafafc] p-3">
                        <Palette size={15} className="text-[#5c5d70]" aria-hidden="true" />
                        <p className="mt-2 text-[12.5px] font-semibold text-[#14141f]">
                          Dedicated Brand Kit
                        </p>
                        <p className="mt-0.5 text-[11.5px] leading-snug text-[#7b7c8e]">
                          Keep logos, brand voice, and styles consistent.
                        </p>
                      </div>
                      <div className="rounded-xl border border-[#ececf3] bg-[#fafafc] p-3">
                        <Users size={15} className="text-[#5c5d70]" aria-hidden="true" />
                        <p className="mt-2 text-[12.5px] font-semibold text-[#14141f]">
                          Team Permissions
                        </p>
                        <p className="mt-0.5 text-[11.5px] leading-snug text-[#7b7c8e]">
                          Invite collaborators as Admin or Member anytime.
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 flex flex-wrap items-center justify-end gap-2.5 border-t border-[#f0f0f6] pt-5">
                      <a
                        href="/studio/team"
                        onClick={(event) => onNavigate?.(event, 'team')}
                        className={secondaryBtnClass}
                      >
                        Cancel
                      </a>
                      <button
                        type="submit"
                        disabled={busy || draftName.trim().length < 2}
                        className={primaryBtnClass}
                      >
                        <Plus size={15} strokeWidth={2.2} />
                        <span>{busy ? 'Creating…' : 'Create Workspace'}</span>
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </>
          )
        )}
      </div>
    </main>
  );
}
