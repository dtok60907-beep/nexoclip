'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Building2,
  Check,
  CheckCircle2,
  Coins,
  CreditCard,
  Eye,
  EyeOff,
  KeyRound,
  Layers,
  LogOut,
  Plus,
  Receipt,
  ShieldCheck,
  Sparkles,
  User,
} from 'lucide-react';
import { Highlight, HighlightItem } from './animate-ui/primitives/effects/highlight';
import { SlidingNumber } from './animate-ui/primitives/texts/sliding-number';
import { NxAccountSkeleton, NxInlineSpinner } from './ui/nx-loading';

const WORKSPACE_KEY = 'nexoclip_workspace_id';
const ROLE_LABELS = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

function rememberWorkspace(id) {
  try {
    if (id) window.sessionStorage.setItem(WORKSPACE_KEY, id);
    else window.sessionStorage.removeItem(WORKSPACE_KEY);
  } catch {
    /* storage unavailable */
  }
}

function getInitials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return (
    (parts[0]?.[0] || '?') +
    (parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] || '')
  ).toUpperCase();
}

function formatNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(num);
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const SETTINGS_TABS = [
  { id: 'general', label: 'General', icon: User },
  { id: 'workspaces', label: 'Workspaces', icon: Layers },
  { id: 'security', label: 'Security', icon: ShieldCheck },
  { id: 'billing', label: 'Billing & Credits', icon: CreditCard },
];

export default function SettingsContent({
  standalone = false,
  authStatus = null,
  balance: externalBalance = null,
  onRequireAuth = null,
  onBalanceChange = null,
  onNewWorkspace,
  onWorkspaceChanged = null,
  onOpenPlans = null,
  onOpenTopUp = null,
  onNavigateUsage = null,
  onNavigateBilling = null,
}) {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();

  const [activeSection, setActiveSection] = useState('general');
  const [status, setStatus] = useState('loading'); // loading | ready | guest
  const [user, setUser] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [balance, setBalance] = useState(externalBalance);
  const [subData, setSubData] = useState(null);

  // General / Profile form
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [profileTouched, setProfileTouched] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState(null); // { tone, text }

  // Workspaces state
  const [wsBusyId, setWsBusyId] = useState(null);
  const [wsCreating, setWsCreating] = useState(false);
  const [wsOpenCreate, setWsOpenCreate] = useState(false);
  const [wsNewName, setWsNewName] = useState('');
  const [wsFeedback, setWsFeedback] = useState(null);

  // Security / Change password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [pwTouched, setPwTouched] = useState({ current: false, next: false, confirm: false });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwFeedback, setPwFeedback] = useState(null);

  // Logout state
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  useEffect(() => {
    if (externalBalance !== null && externalBalance !== undefined) {
      setBalance(externalBalance);
    }
  }, [externalBalance]);

  const loadWorkspaceBilling = useCallback(
    async (workspaceId) => {
      if (!workspaceId) {
        setBalance(null);
        setSubData(null);
        return;
      }
      const headers = { 'x-workspace-id': workspaceId };
      try {
        const [usageRes, subRes] = await Promise.all([
          fetch('/api/usage?scope=me&page=1&pageSize=1', {
            credentials: 'include',
            cache: 'no-store',
            headers,
          }),
          fetch('/api/billing/subscription', {
            credentials: 'include',
            cache: 'no-store',
            headers,
          }),
        ]);
        if (usageRes.ok) {
          const usageJson = await usageRes.json().catch(() => ({}));
          const nextBal = usageJson?.balance ?? null;
          setBalance(nextBal);
          onBalanceChange?.(nextBal);
        }
        if (subRes.ok) {
          const subJson = await subRes.json().catch(() => null);
          setSubData(subJson);
        }
      } catch {
        /* keep previous readout if transient error */
      }
    },
    [onBalanceChange],
  );

  const applyWorkspaces = useCallback(
    (list) => {
      const safeList = Array.isArray(list) ? list : [];
      setWorkspaces(safeList);
      const currentId = safeList[0]?.id || null;
      rememberWorkspace(currentId);
      loadWorkspaceBilling(currentId);
    },
    [loadWorkspaceBilling],
  );

  useEffect(() => {
    if (authStatus === 'guest') {
      setStatus('guest');
      setUser(null);
      setWorkspaces([]);
      return undefined;
    }

    let cancelled = false;
    setStatus('loading');

    (async () => {
      try {
        const res = await fetch('/api/auth/session', {
          credentials: 'include',
          cache: 'no-store',
        });
        const session = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (!session?.authenticated) {
          if (standalone) {
            router.replace('/studio/home?auth=login&next=%2Faccount');
            return;
          }
          setStatus('guest');
          return;
        }

        const wsRes = await fetch('/api/workspaces', {
          credentials: 'include',
          cache: 'no-store',
        });
        const wsPayload = await wsRes.json().catch(() => ({}));
        if (cancelled) return;

        const nextUser = session.user || null;
        setUser(nextUser);
        setDisplayNameInput(nextUser?.displayName || '');
        applyWorkspaces(wsPayload.workspaces || []);
        setStatus('ready');
      } catch {
        if (cancelled) return;
        if (standalone) {
          router.replace('/studio/home?auth=login&next=%2Faccount');
          return;
        }
        setStatus('guest');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authStatus, standalone, router, applyWorkspaces]);

  const currentWorkspace = workspaces[0] || null;
  const resolvedName =
    user?.displayName || user?.email?.split('@')[0] || 'NexoClip Creator';
  const currentRoleLabel =
    ROLE_LABELS[currentWorkspace?.role] || currentWorkspace?.role || 'Member';

  const trimmedName = displayNameInput.trim();
  const profileDirty = trimmedName !== String(user?.displayName || '').trim();
  const profileNameError =
    profileTouched && trimmedName.length < 2
      ? 'Display name must be at least 2 characters.'
      : trimmedName.length > 80
        ? 'Display name must be 80 characters or fewer.'
        : '';

  const handleSaveProfile = async (event) => {
    event.preventDefault();
    setProfileTouched(true);
    setProfileFeedback(null);
    if (trimmedName.length < 2 || trimmedName.length > 80) return;

    setProfileSaving(true);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: trimmedName }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || 'Could not update display name.');
      const nextDisplayName = payload.user?.displayName || trimmedName;
      setUser((prev) => (prev ? { ...prev, displayName: nextDisplayName } : prev));
      setDisplayNameInput(nextDisplayName);
      setProfileTouched(false);
      setProfileFeedback({ tone: 'success', text: 'Profile updated.' });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('nexoclip:profile-updated', {
            detail: { displayName: nextDisplayName },
          }),
        );
      }
    } catch (err) {
      setProfileFeedback({
        tone: 'error',
        text: err.message || 'Could not update display name.',
      });
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSwitchWorkspace = async (workspaceId) => {
    setWsBusyId(workspaceId);
    setWsFeedback(null);
    try {
      const res = await fetch('/api/workspaces/current', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || 'Could not switch workspace.');
      const nextList = payload.workspaces || [];
      applyWorkspaces(nextList);
      onWorkspaceChanged?.(nextList[0] || null);
      setWsFeedback({
        tone: 'success',
        text: `Switched active workspace to ${nextList[0]?.name || 'selected workspace'}.`,
      });
    } catch (err) {
      setWsFeedback({
        tone: 'error',
        text: err.message || 'Could not switch workspace.',
      });
    } finally {
      setWsBusyId(null);
    }
  };

  const handleCreateWorkspace = async (event) => {
    event.preventDefault();
    const clean = wsNewName.trim();
    if (clean.length < 2) {
      setWsFeedback({
        tone: 'error',
        text: 'Workspace name must be at least 2 characters.',
      });
      return;
    }
    setWsCreating(true);
    setWsFeedback(null);
    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: clean }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || 'Could not create workspace.');
      const nextList = payload.workspaces || [];
      applyWorkspaces(nextList);
      onWorkspaceChanged?.(nextList[0] || null);
      setWsNewName('');
      setWsOpenCreate(false);
      setWsFeedback({
        tone: 'success',
        text: `Workspace "${clean}" created and set as active.`,
      });
    } catch (err) {
      setWsFeedback({
        tone: 'error',
        text: err.message || 'Could not create workspace.',
      });
    } finally {
      setWsCreating(false);
    }
  };

  const pwLengthMet = newPassword.length >= 12;
  const pwMatches = confirmPassword.length > 0 && newPassword === confirmPassword;
  const pwDifferent = currentPassword.length > 0 && newPassword !== currentPassword;

  const pwFieldErrors = useMemo(() => {
    const errors = {};
    if (pwTouched.current && !currentPassword) {
      errors.current = 'Enter your current password.';
    }
    if (pwTouched.next && newPassword.length < 12) {
      errors.next = 'New password must be at least 12 characters.';
    }
    if (pwTouched.confirm && confirmPassword !== newPassword) {
      errors.confirm = 'Passwords do not match.';
    }
    return errors;
  }, [pwTouched, currentPassword, newPassword, confirmPassword]);

  const handleChangePassword = async (event) => {
    event.preventDefault();
    setPwTouched({ current: true, next: true, confirm: true });
    setPwFeedback(null);

    if (!currentPassword || newPassword.length < 12 || confirmPassword !== newPassword) {
      return;
    }

    setPwSaving(true);
    try {
      const res = await fetch('/api/auth/password/change', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          password: newPassword,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || 'Could not update password.');

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwTouched({ current: false, next: false, confirm: false });
      setPwFeedback({
        tone: 'success',
        text: 'Password updated. All active sessions have been signed out for security — please sign in again.',
      });

      rememberWorkspace(null);
      window.setTimeout(() => {
        if (standalone) {
          router.replace('/studio/home?auth=login&next=%2Fstudio%2Fsettings');
        } else {
          window.dispatchEvent(new Event('nexoclip:auth-logout'));
          onRequireAuth?.();
        }
      }, 1500);
    } catch (err) {
      setPwFeedback({
        tone: 'error',
        text: err.message || 'Could not update password.',
      });
    } finally {
      setPwSaving(false);
    }
  };

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    setLogoutError('');
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Logout failed. Please try again.');
      rememberWorkspace(null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('nexoclip:auth-logout'));
      }
      router.replace('/studio/home');
    } catch (err) {
      setLogoutError(err.message || 'Logout failed. Please try again.');
    } finally {
      setLoggingOut(false);
    }
  }, [router]);

  const activeSub = subData?.subscription || null;
  const subActive = Boolean(
    activeSub &&
      activeSub.status === 'active' &&
      new Date(activeSub.currentPeriodEnd) > new Date(),
  );
  const activePlan = useMemo(() => {
    if (!activeSub || !Array.isArray(subData?.plans)) return null;
    return subData.plans.find((plan) => plan.code === activeSub.planCode) || null;
  }, [activeSub, subData]);

  const handleOpenUsage = () => {
    if (onNavigateUsage) onNavigateUsage();
    else router.push('/studio/usage');
  };

  const handleOpenBilling = () => {
    if (onNavigateBilling) onNavigateBilling();
    else router.push('/studio/billing');
  };

  const handleTriggerTopUp = () => {
    if (onOpenTopUp) onOpenTopUp();
    else router.push('/studio/billing');
  };

  const handleTriggerPlans = () => {
    if (onOpenPlans) onOpenPlans();
    else router.push('/studio/billing');
  };

  const panelMotionProps = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -4 },
        transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
      };

  return (
    <main className={`nx-set-page${standalone ? ' is-standalone' : ''}`}>
      {standalone && (
        <header className="nx-set-standalone-bar">
          <div className="nx-set-standalone-bar-inner">
            <Link href="/studio/home" className="nx-set-brand-link">
              <span className="nx-set-brand-mark" aria-hidden="true">
                N
              </span>
              <span>NexoClip Studio</span>
            </Link>

            <div className="flex items-center gap-2.5">
              {currentWorkspace && (
                <span className="nx-set-badge is-neutral hidden sm:inline-flex">
                  <Building2 size={12} aria-hidden="true" />
                  <span className="max-w-[160px] truncate">{currentWorkspace.name}</span>
                </span>
              )}
              <Link href="/studio/home" className="nx-set-btn-secondary">
                <ArrowLeft size={14} aria-hidden="true" />
                <span>Back to Studio</span>
              </Link>
            </div>
          </div>
        </header>
      )}

      <div className="nx-set-container">
        {status === 'loading' ? (
          <NxAccountSkeleton />
        ) : status === 'guest' ? (
          <section className="nx-set-card nx-set-guest-card">
            <span className="nx-set-guest-icon" aria-hidden="true">
              <User size={24} />
            </span>
            <div>
              <h1 className="nx-set-title" style={{ fontSize: 22 }}>
                Sign in to manage Settings
              </h1>
              <p className="nx-set-card-sub" style={{ marginTop: 8, maxWidth: 360 }}>
                Access your profile, switch workspaces, update your password, and manage studio
                credits from one place.
              </p>
            </div>
            <motion.button
              type="button"
              className="nx-set-btn-primary"
              whileHover={prefersReducedMotion ? undefined : { y: -1 }}
              whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 460, damping: 28 }}
              onClick={() =>
                onRequireAuth
                  ? onRequireAuth()
                  : router.replace('/studio/home?auth=login&next=%2Fstudio%2Fsettings')
              }
            >
              Sign in to NexoClip
            </motion.button>
          </section>
        ) : (
          <>
            {/* Compact Settings Header */}
            <motion.header
              data-tour="settings-header"
              className="nx-set-header"
              initial={prefersReducedMotion ? false : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="min-w-0">
                <h1 className="nx-set-title">Settings</h1>
                <p className="nx-set-subtitle">
                  <span>
                    Workspace: <strong>{currentWorkspace?.name || 'Personal'}</strong>
                  </span>
                  {balance !== null && balance !== undefined && (
                    <>
                      <span className="nx-ub-dot" aria-hidden="true" />
                      <span>
                        <strong>
                          <SlidingNumber value={Number(balance) || 0} formatter={formatNumber} />
                        </strong>{' '}
                        credits available
                      </span>
                    </>
                  )}
                  {user?.email && (
                    <>
                      <span className="nx-ub-dot" aria-hidden="true" />
                      <span>{user.email}</span>
                    </>
                  )}
                </p>
              </div>

              <div className="nx-set-header-actions">
                <motion.button
                  type="button"
                  onClick={handleTriggerTopUp}
                  className="nx-ub-cta-btn"
                  whileHover={prefersReducedMotion ? undefined : { y: -1 }}
                  whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 460, damping: 28 }}
                >
                  <span className="nx-ub-cta-icon" aria-hidden="true">
                    <Plus size={13} strokeWidth={2.5} />
                  </span>
                  <span>Top up credits</span>
                </motion.button>

                <motion.button
                  type="button"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="nx-set-btn-danger"
                  whileHover={prefersReducedMotion ? undefined : { y: -1 }}
                  whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 460, damping: 28 }}
                >
                  {loggingOut ? (
                    <NxInlineSpinner size={14} />
                  ) : (
                    <LogOut size={14} aria-hidden="true" />
                  )}
                  <span>{loggingOut ? 'Logging out…' : 'Log out'}</span>
                </motion.button>
              </div>
            </motion.header>

            {logoutError && (
              <div className="nx-set-banner is-error mb-4" role="alert">
                <AlertCircle size={15} aria-hidden="true" />
                <span>{logoutError}</span>
              </div>
            )}

            {/* Animate UI Segmented Section Switcher */}
            <div data-tour="settings-tabs" className="nx-set-tabs-row">
              <Highlight
                value={activeSection}
                className="nx-set-tabs"
                highlightClassName="nx-set-tab-pill"
              >
                {SETTINGS_TABS.map((tab) => {
                  const Icon = tab.icon;
                  const active = activeSection === tab.id;
                  return (
                    <HighlightItem key={tab.id} value={tab.id}>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={active}
                        className={`nx-set-tab-btn${active ? ' is-active' : ''}`}
                        onClick={() => setActiveSection(tab.id)}
                      >
                        <Icon size={14} aria-hidden="true" />
                        <span>{tab.label}</span>
                        {tab.id === 'workspaces' && workspaces.length > 0 && (
                          <span className="nx-set-tab-count">{workspaces.length}</span>
                        )}
                      </button>
                    </HighlightItem>
                  );
                })}
              </Highlight>
            </div>

            <AnimatePresence mode="wait">
              {/* 1. GENERAL / PROFILE */}
              {activeSection === 'general' && (
                <motion.div
                  key="general"
                  className="nx-set-stack"
                  {...panelMotionProps}
                >
                  <section data-tour="settings-panel" className="nx-set-card">
                    <div className="nx-set-card-head">
                      <div>
                        <h2 className="nx-set-card-title">Profile &amp; identity</h2>
                        <p className="nx-set-card-sub">
                          Your display name appears across workspaces, projects, and the Studio account
                          menu.
                        </p>
                      </div>
                      <span className="nx-set-badge is-violet">{currentRoleLabel}</span>
                    </div>

                    <form onSubmit={handleSaveProfile} noValidate>
                      <div className="nx-set-card-body">
                        <div className="nx-set-identity">
                          <span className="nx-set-avatar" aria-hidden="true">
                            {getInitials(resolvedName)}
                          </span>
                          <div className="nx-set-identity-meta">
                            <div className="nx-set-identity-name-row">
                              <h3 className="nx-set-identity-name">{resolvedName}</h3>
                              {user?.isPlatformOperator && (
                                <span className="nx-set-badge is-neutral">Operator</span>
                              )}
                            </div>
                            <p className="nx-set-identity-email">{user?.email || '—'}</p>
                          </div>
                        </div>

                        <div className="nx-set-form-grid">
                          <div className="nx-set-field">
                            <label htmlFor="nx-settings-display-name" className="nx-set-label">
                              <span>Display name</span>
                              <span className="nx-set-label-hint">Required</span>
                            </label>
                            <input
                              id="nx-settings-display-name"
                              type="text"
                              value={displayNameInput}
                              onChange={(event) => {
                                setDisplayNameInput(event.target.value);
                                if (profileFeedback) setProfileFeedback(null);
                              }}
                              onBlur={() => setProfileTouched(true)}
                              maxLength={80}
                              placeholder="Enter your display name"
                              aria-invalid={Boolean(profileNameError)}
                              aria-describedby="nx-settings-display-name-help"
                              className={`nx-set-input${profileNameError ? ' is-invalid' : ''}`}
                            />
                            {profileNameError ? (
                              <p
                                id="nx-settings-display-name-help"
                                className="nx-set-field-error"
                                role="alert"
                              >
                                {profileNameError}
                              </p>
                            ) : (
                              <p id="nx-settings-display-name-help" className="nx-set-helper">
                                Shown on your profile badge and shared workspace activity.
                              </p>
                            )}
                          </div>

                          <div className="nx-set-field">
                            <label htmlFor="nx-settings-email" className="nx-set-label">
                              <span>Email address</span>
                              <span className="nx-set-label-hint">Sign-in identity</span>
                            </label>
                            <input
                              id="nx-settings-email"
                              type="email"
                              value={user?.email || ''}
                              readOnly
                              disabled
                              className="nx-set-input"
                            />
                            <p className="nx-set-helper">
                              Email addresses are tied to authentication and cannot be edited here.
                            </p>
                          </div>
                        </div>

                        {profileFeedback && (
                          <div
                            className={`nx-set-banner mt-4 ${
                              profileFeedback.tone === 'error' ? 'is-error' : 'is-success'
                            }`}
                            role={profileFeedback.tone === 'error' ? 'alert' : 'status'}
                          >
                            {profileFeedback.tone === 'error' ? (
                              <AlertCircle size={15} aria-hidden="true" />
                            ) : (
                              <CheckCircle2 size={15} aria-hidden="true" />
                            )}
                            <span>{profileFeedback.text}</span>
                          </div>
                        )}
                      </div>

                      <div className="nx-set-card-footer">
                        <span className="nx-set-helper">
                          Changes sync immediately to your active session.
                        </span>
                        <div className="flex items-center gap-2">
                          {profileDirty && (
                            <button
                              type="button"
                              className="nx-set-btn-secondary"
                              disabled={profileSaving}
                              onClick={() => {
                                setDisplayNameInput(user?.displayName || '');
                                setProfileTouched(false);
                                setProfileFeedback(null);
                              }}
                            >
                              Reset
                            </button>
                          )}
                          <motion.button
                            type="submit"
                            className="nx-set-btn-primary"
                            disabled={profileSaving || !profileDirty || Boolean(profileNameError)}
                            whileHover={prefersReducedMotion ? undefined : { y: -1 }}
                            whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
                            transition={{ type: 'spring', stiffness: 460, damping: 28 }}
                          >
                            {profileSaving ? (
                              <>
                                <NxInlineSpinner size={14} />
                                <span>Saving…</span>
                              </>
                            ) : (
                              <>
                                <Check size={14} aria-hidden="true" />
                                <span>Save changes</span>
                              </>
                            )}
                          </motion.button>
                        </div>
                      </div>
                    </form>
                  </section>

                  <section data-tour="settings-panel" className="nx-set-card">
                    <div className="nx-set-row">
                      <div className="nx-set-row-info">
                        <p className="nx-set-row-title">Active browser session</p>
                        <p className="nx-set-row-desc">
                          Signed in as <strong>{user?.email || 'your account'}</strong> on workspace{' '}
                          <strong>{currentWorkspace?.name || 'Personal'}</strong>.
                        </p>
                      </div>
                      <span className="nx-set-badge is-emerald">
                        <CheckCircle2 size={12} aria-hidden="true" />
                        Active
                      </span>
                    </div>

                    <div className="nx-set-row">
                      <div className="nx-set-row-info">
                        <p className="nx-set-row-title">Sign out</p>
                        <p className="nx-set-row-desc">
                          End this session on the current device and return to Studio Home.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleLogout}
                        disabled={loggingOut}
                        className="nx-set-btn-danger"
                      >
                        {loggingOut ? (
                          <NxInlineSpinner size={14} />
                        ) : (
                          <LogOut size={14} aria-hidden="true" />
                        )}
                        <span>{loggingOut ? 'Logging out…' : 'Log out'}</span>
                      </button>
                    </div>
                  </section>
                </motion.div>
              )}

              {/* 2. WORKSPACES */}
              {activeSection === 'workspaces' && (
                <motion.div
                  key="workspaces"
                  className="nx-set-stack"
                  {...panelMotionProps}
                >
                  <section data-tour="settings-panel" className="nx-set-card">
                    <div className="nx-set-card-head">
                      <div>
                        <h2 className="nx-set-card-title">Workspaces</h2>
                        <p className="nx-set-card-sub">
                          Each workspace keeps its own credit balance, projects, and media library
                          across every Studio tool and AI Director.
                        </p>
                      </div>
                      {['owner', 'admin'].includes(currentWorkspace?.role) && !wsOpenCreate && (
                        <motion.button
                          type="button"
                          className="nx-set-btn-primary"
                          whileHover={prefersReducedMotion ? undefined : { y: -1 }}
                          whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
                          transition={{ type: 'spring', stiffness: 460, damping: 28 }}
                          onClick={() => {
                            if (onNewWorkspace) onNewWorkspace();
                            else router.push('/studio/team/new');
                            setWsFeedback(null);
                          }}
                        >
                          <Plus size={14} aria-hidden="true" />
                          <span>New workspace</span>
                        </motion.button>
                      )}
                    </div>

                    <AnimatePresence initial={false}>
                      {['owner', 'admin'].includes(currentWorkspace?.role) && wsOpenCreate && (
                        <motion.div
                          key="ws-create-bar"
                          className="nx-set-ws-create-bar"
                          initial={prefersReducedMotion ? false : { opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={prefersReducedMotion ? undefined : { opacity: 0, y: -6 }}
                          transition={{ duration: 0.16 }}
                        >
                          <form onSubmit={handleCreateWorkspace} className="nx-set-ws-create-form">
                            <div className="nx-set-field">
                              <label htmlFor="nx-new-workspace-name" className="nx-set-label">
                                <span>Workspace name</span>
                                <span className="nx-set-label-hint">2–60 characters</span>
                              </label>
                              <input
                                id="nx-new-workspace-name"
                                autoFocus
                                type="text"
                                maxLength={60}
                                value={wsNewName}
                                onChange={(event) => setWsNewName(event.target.value)}
                                placeholder="e.g. Brand Campaign Q3"
                                className="nx-set-input"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <motion.button
                                type="submit"
                                className="nx-set-btn-primary"
                                disabled={wsCreating || wsNewName.trim().length < 2}
                                whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
                              >
                                {wsCreating ? (
                                  <>
                                    <NxInlineSpinner size={14} />
                                    <span>Creating…</span>
                                  </>
                                ) : (
                                  <span>Create workspace</span>
                                )}
                              </motion.button>
                              <button
                                type="button"
                                className="nx-set-btn-secondary"
                                disabled={wsCreating}
                                onClick={() => {
                                  setWsOpenCreate(false);
                                  setWsNewName('');
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {wsFeedback && (
                      <div className="px-6 pt-4">
                        <div
                          className={`nx-set-banner ${
                            wsFeedback.tone === 'error' ? 'is-error' : 'is-success'
                          }`}
                          role={wsFeedback.tone === 'error' ? 'alert' : 'status'}
                        >
                          {wsFeedback.tone === 'error' ? (
                            <AlertCircle size={15} aria-hidden="true" />
                          ) : (
                            <CheckCircle2 size={15} aria-hidden="true" />
                          )}
                          <span>{wsFeedback.text}</span>
                        </div>
                      </div>
                    )}

                    {workspaces.length === 0 ? (
                      <div className="nx-set-card-body">
                        <p className="nx-set-helper">
                          No workspaces found yet. Create one to organize your projects and credits.
                        </p>
                      </div>
                    ) : (
                      <ul className="nx-set-ws-list">
                        {workspaces.map((ws, index) => {
                          const isCurrent = index === 0 || ws.is_current;
                          const switchingThis = wsBusyId === ws.id;
                          return (
                            <li
                              key={ws.id}
                              className={`nx-set-ws-item${isCurrent ? ' is-active' : ''}`}
                            >
                              <span className="nx-set-ws-avatar" aria-hidden="true">
                                {getInitials(ws.name)}
                              </span>
                              <div className="nx-set-ws-meta">
                                <p className="nx-set-ws-name">
                                  <span className="truncate">{ws.name}</span>
                                  <span className="nx-set-badge is-neutral">
                                    {ROLE_LABELS[ws.role] || ws.role || 'Member'}
                                  </span>
                                </p>
                                <p className="nx-set-ws-sub">
                                  {isCurrent
                                    ? 'Currently active across Studio & AI Director'
                                    : 'Separate credit balance, projects, and media assets'}
                                </p>
                              </div>

                              {isCurrent ? (
                                <span className="nx-set-badge is-violet">
                                  <Check size={12} aria-hidden="true" />
                                  Active
                                </span>
                              ) : (
                                <motion.button
                                  type="button"
                                  className="nx-set-btn-secondary"
                                  disabled={Boolean(wsBusyId)}
                                  whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
                                  onClick={() => handleSwitchWorkspace(ws.id)}
                                >
                                  {switchingThis ? (
                                    <>
                                      <NxInlineSpinner size={14} />
                                      <span>Switching…</span>
                                    </>
                                  ) : (
                                    <span>Switch</span>
                                  )}
                                </motion.button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                </motion.div>
              )}

              {/* 3. SECURITY */}
              {activeSection === 'security' && (
                <motion.div
                  key="security"
                  className="nx-set-stack"
                  {...panelMotionProps}
                >
                  <section data-tour="settings-panel" className="nx-set-card">
                    <div className="nx-set-card-head">
                      <div>
                        <h2 className="nx-set-card-title">Change password</h2>
                        <p className="nx-set-card-sub">
                          Use a strong password of at least 12 characters. Updating your password
                          signs out active sessions across devices.
                        </p>
                      </div>
                      <span className="nx-set-badge is-neutral">
                        <KeyRound size={12} aria-hidden="true" />
                        Password auth
                      </span>
                    </div>

                    <form onSubmit={handleChangePassword} noValidate>
                      <div className="nx-set-card-body">
                        <div className="nx-set-form-grid">
                          <div className="nx-set-field is-full">
                            <label htmlFor="nx-pw-current" className="nx-set-label">
                              <span>Current password</span>
                              <span className="nx-set-label-hint">Required</span>
                            </label>
                            <div className="nx-set-input-wrap">
                              <input
                                id="nx-pw-current"
                                type={showCurrentPw ? 'text' : 'password'}
                                autoComplete="current-password"
                                value={currentPassword}
                                onChange={(event) => {
                                  setCurrentPassword(event.target.value);
                                  if (pwFeedback) setPwFeedback(null);
                                }}
                                onBlur={() =>
                                  setPwTouched((prev) => ({ ...prev, current: true }))
                                }
                                placeholder="Enter current password"
                                aria-invalid={Boolean(pwFieldErrors.current)}
                                className={`nx-set-input has-trailing${
                                  pwFieldErrors.current ? ' is-invalid' : ''
                                }`}
                              />
                              <button
                                type="button"
                                className="nx-set-input-action"
                                aria-label={
                                  showCurrentPw ? 'Hide current password' : 'Show current password'
                                }
                                onClick={() => setShowCurrentPw((v) => !v)}
                              >
                                {showCurrentPw ? <EyeOff size={15} /> : <Eye size={15} />}
                              </button>
                            </div>
                            {pwFieldErrors.current && (
                              <p className="nx-set-field-error" role="alert">
                                {pwFieldErrors.current}
                              </p>
                            )}
                          </div>

                          <div className="nx-set-field">
                            <label htmlFor="nx-pw-new" className="nx-set-label">
                              <span>New password</span>
                              <span className="nx-set-label-hint">Min. 12 characters</span>
                            </label>
                            <div className="nx-set-input-wrap">
                              <input
                                id="nx-pw-new"
                                type={showNewPw ? 'text' : 'password'}
                                autoComplete="new-password"
                                value={newPassword}
                                onChange={(event) => {
                                  setNewPassword(event.target.value);
                                  if (pwFeedback) setPwFeedback(null);
                                }}
                                onBlur={() => setPwTouched((prev) => ({ ...prev, next: true }))}
                                placeholder="At least 12 characters"
                                aria-invalid={Boolean(pwFieldErrors.next)}
                                className={`nx-set-input has-trailing${
                                  pwFieldErrors.next ? ' is-invalid' : ''
                                }`}
                              />
                              <button
                                type="button"
                                className="nx-set-input-action"
                                aria-label={showNewPw ? 'Hide new password' : 'Show new password'}
                                onClick={() => setShowNewPw((v) => !v)}
                              >
                                {showNewPw ? <EyeOff size={15} /> : <Eye size={15} />}
                              </button>
                            </div>
                            {pwFieldErrors.next && (
                              <p className="nx-set-field-error" role="alert">
                                {pwFieldErrors.next}
                              </p>
                            )}
                          </div>

                          <div className="nx-set-field">
                            <label htmlFor="nx-pw-confirm" className="nx-set-label">
                              <span>Confirm new password</span>
                              <span className="nx-set-label-hint">Required</span>
                            </label>
                            <div className="nx-set-input-wrap">
                              <input
                                id="nx-pw-confirm"
                                type={showConfirmPw ? 'text' : 'password'}
                                autoComplete="new-password"
                                value={confirmPassword}
                                onChange={(event) => {
                                  setConfirmPassword(event.target.value);
                                  if (pwFeedback) setPwFeedback(null);
                                }}
                                onBlur={() =>
                                  setPwTouched((prev) => ({ ...prev, confirm: true }))
                                }
                                placeholder="Re-enter new password"
                                aria-invalid={Boolean(pwFieldErrors.confirm)}
                                className={`nx-set-input has-trailing${
                                  pwFieldErrors.confirm ? ' is-invalid' : ''
                                }`}
                              />
                              <button
                                type="button"
                                className="nx-set-input-action"
                                aria-label={
                                  showConfirmPw
                                    ? 'Hide password confirmation'
                                    : 'Show password confirmation'
                                }
                                onClick={() => setShowConfirmPw((v) => !v)}
                              >
                                {showConfirmPw ? <EyeOff size={15} /> : <Eye size={15} />}
                              </button>
                            </div>
                            {pwFieldErrors.confirm && (
                              <p className="nx-set-field-error" role="alert">
                                {pwFieldErrors.confirm}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="nx-set-checks" aria-live="polite">
                          <span className={`nx-set-check-chip${pwLengthMet ? ' is-met' : ''}`}>
                            <Check size={12} aria-hidden="true" />
                            <span>At least 12 characters ({newPassword.length}/12)</span>
                          </span>
                          <span className={`nx-set-check-chip${pwMatches ? ' is-met' : ''}`}>
                            <Check size={12} aria-hidden="true" />
                            <span>Confirmation matches</span>
                          </span>
                          {newPassword.length > 0 && currentPassword.length > 0 && (
                            <span className={`nx-set-check-chip${pwDifferent ? ' is-met' : ''}`}>
                              <Check size={12} aria-hidden="true" />
                              <span>Different from current</span>
                            </span>
                          )}
                        </div>

                        {pwFeedback && (
                          <div
                            className={`nx-set-banner mt-4 ${
                              pwFeedback.tone === 'error' ? 'is-error' : 'is-success'
                            }`}
                            role={pwFeedback.tone === 'error' ? 'alert' : 'status'}
                          >
                            {pwFeedback.tone === 'error' ? (
                              <AlertCircle size={15} aria-hidden="true" />
                            ) : (
                              <CheckCircle2 size={15} aria-hidden="true" />
                            )}
                            <span>{pwFeedback.text}</span>
                          </div>
                        )}
                      </div>

                      <div className="nx-set-card-footer">
                        <span className="nx-set-helper">
                          Signed up with Google? Use Forgot Password on the sign-in screen to set a
                          password first.
                        </span>
                        <motion.button
                          type="submit"
                          className="nx-set-btn-primary"
                          disabled={
                            pwSaving || !currentPassword || !pwLengthMet || !pwMatches
                          }
                          whileHover={prefersReducedMotion ? undefined : { y: -1 }}
                          whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
                          transition={{ type: 'spring', stiffness: 460, damping: 28 }}
                        >
                          {pwSaving ? (
                            <>
                              <NxInlineSpinner size={14} />
                              <span>Updating…</span>
                            </>
                          ) : (
                            <span>Update password</span>
                          )}
                        </motion.button>
                      </div>
                    </form>
                  </section>
                </motion.div>
              )}

              {/* 4. BILLING & CREDITS */}
              {activeSection === 'billing' && (
                <motion.div
                  key="billing"
                  className="nx-set-stack"
                  {...panelMotionProps}
                >
                  <div className="nx-set-billing-grid">
                    {/* Credit balance card */}
                    <section className="nx-set-card flex flex-col justify-between">
                      <div className="nx-set-card-body">
                        <div className="flex items-center justify-between gap-2">
                          <p className="nx-set-metric-label">Workspace credits</p>
                          <span className="nx-set-badge is-violet">
                            <Coins size={12} aria-hidden="true" />
                            {currentWorkspace?.name || 'Active workspace'}
                          </span>
                        </div>

                        <p className="nx-set-metric-value">
                          {balance !== null && balance !== undefined ? (
                            <SlidingNumber value={Number(balance) || 0} formatter={formatNumber} />
                          ) : (
                            '—'
                          )}
                          <span className="nx-set-metric-unit">credits</span>
                        </p>

                        <p className="nx-set-card-sub" style={{ marginTop: 10 }}>
                          Shared across Image Studio, Video Studio, Cinema, Motion, and AI Director
                          in this workspace.
                        </p>
                      </div>

                      <div className="nx-set-card-footer">
                        <motion.button
                          type="button"
                          onClick={handleTriggerTopUp}
                          className="nx-set-btn-primary"
                          whileHover={prefersReducedMotion ? undefined : { y: -1 }}
                          whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
                          transition={{ type: 'spring', stiffness: 460, damping: 28 }}
                        >
                          <Plus size={14} aria-hidden="true" />
                          <span>Top up credits</span>
                        </motion.button>
                      </div>
                    </section>

                    {/* Active plan card */}
                    <section className="nx-set-card flex flex-col justify-between">
                      <div className="nx-set-card-body">
                        <div className="flex items-center justify-between gap-2">
                          <p className="nx-set-metric-label">Current plan</p>
                          <span
                            className={`nx-set-badge ${subActive ? 'is-emerald' : 'is-neutral'}`}
                          >
                            {subActive ? 'Active' : 'Pay-as-you-go'}
                          </span>
                        </div>

                        <p className="nx-set-metric-value" style={{ fontSize: 26 }}>
                          {subActive
                            ? activePlan?.name || activeSub?.planCode || 'Subscribed'
                            : 'Free / Top-Up'}
                        </p>

                        <p className="nx-set-card-sub" style={{ marginTop: 10 }}>
                          {subActive
                            ? `Active until ${formatDate(activeSub.currentPeriodEnd)} · ${formatNumber(
                                activePlan?.monthlyCredits || 0,
                              )} monthly credits included.`
                            : 'No recurring subscription yet. Compare plans for monthly credit bundles or top up anytime.'}
                        </p>
                      </div>

                      <div className="nx-set-card-footer">
                        <motion.button
                          type="button"
                          onClick={handleTriggerPlans}
                          className="nx-set-btn-secondary"
                          whileHover={prefersReducedMotion ? undefined : { y: -1 }}
                          whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
                          transition={{ type: 'spring', stiffness: 460, damping: 28 }}
                        >
                          <Sparkles size={14} aria-hidden="true" />
                          <span>{subActive ? 'Manage plan' : 'View plans'}</span>
                        </motion.button>
                      </div>
                    </section>
                  </div>

                  {/* Quick navigation to Usage & Payment History */}
                  <div className="nx-set-shortcuts">
                    <motion.button
                      type="button"
                      onClick={handleOpenUsage}
                      className="nx-set-shortcut-card"
                      whileHover={prefersReducedMotion ? undefined : { y: -2 }}
                      whileTap={prefersReducedMotion ? undefined : { scale: 0.99 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <span className="nx-set-shortcut-icon" aria-hidden="true">
                          <BarChart3 size={18} />
                        </span>
                        <div className="min-w-0">
                          <p className="nx-set-row-title">Usage Analytics</p>
                          <p className="nx-set-row-desc">
                            Inspect credit trends, completion rates, and generation logs
                          </p>
                        </div>
                      </div>
                      <ArrowUpRight size={16} className="shrink-0 text-zinc-400" aria-hidden="true" />
                    </motion.button>

                    <motion.button
                      type="button"
                      onClick={handleOpenBilling}
                      className="nx-set-shortcut-card"
                      whileHover={prefersReducedMotion ? undefined : { y: -2 }}
                      whileTap={prefersReducedMotion ? undefined : { scale: 0.99 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <span className="nx-set-shortcut-icon" aria-hidden="true">
                          <Receipt size={18} />
                        </span>
                        <div className="min-w-0">
                          <p className="nx-set-row-title">Payment History</p>
                          <p className="nx-set-row-desc">
                            View past invoices, top-up receipts, and pending QRIS/VA orders
                          </p>
                        </div>
                      </div>
                      <ArrowUpRight size={16} className="shrink-0 text-zinc-400" aria-hidden="true" />
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </main>
  );
}
