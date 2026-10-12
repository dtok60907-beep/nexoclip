'use client';

import { Fragment, useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import AccountMenu from './AccountMenu';
import JobListPanel from './JobListPanel.js';
import UsageContent from './UsageContent';
import BillingContent, { ENTERPRISE_WHATSAPP_URL } from './BillingContent';
import PricingModal from './PricingModal';
import StudioTour from './tour/StudioTour';
import StudioHome from './StudioHome';
import StudioAuthModal from './saas/StudioAuthModal';
// Default tab is kept static so the first paint of /studio has no loading flash.
import { ImageStudio } from 'studio';

const StudioLoading = () => (
  <div className="h-full w-full bg-black flex items-center justify-center text-white/20">Loading Studio...</div>
);

const ComingSoon = ({ title }) => (
  <div className="h-full w-full bg-[#030303] flex items-center justify-center text-center px-6">
    <div>
      <div className="text-xs uppercase tracking-widest text-white/40 mb-3">Coming Soon</div>
      <h2 className="text-2xl font-semibold text-white mb-2">{title}</h2>
      <p className="text-white/50 max-w-md mx-auto">We&apos;re putting the finishing touches on this studio. Check back soon.</p>
    </div>
  </div>
);

// The rest are lazy-loaded so they only compile/download when their tab is opened.
const studioLazy = (name) => dynamic(() => import('studio').then(mod => mod[name]), {
  ssr: false,
  loading: StudioLoading,
});

const VideoStudio = studioLazy('VideoStudio');
const VibeMotionStudio = studioLazy('VibeMotionStudio');
const CinemaStudio = studioLazy('CinemaStudio');
const AudioStudio = studioLazy('AudioStudio');
const MarketingStudio = studioLazy('MarketingStudio');
const AiInfluencerStudio = studioLazy('AiInfluencerStudio');
const DirectorApp = dynamic(() => import('./director/DirectorApp.js'), { ssr: false, loading: StudioLoading });

const SPITE_URL = process.env.NEXT_PUBLIC_SPITE_URL || '/spite';

const TABS = [
  { id: 'home', label: 'Home', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" /></svg> },
  {
    id: 'image',
    label: 'Image Studio',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
    )
  },
  {
    id: 'video',
    label: 'Video Studio',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="23 7 16 12 23 17 23 7"/>
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
      </svg>
    )
  },
  {
    id: 'audio',
    label: 'Audio Studio',
    hidden: true, // pure-MuAPI, no fallback — see docs/2026-08-24-muapi-dependency-audit.md
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13"/>
        <circle cx="6" cy="18" r="3"/>
        <circle cx="18" cy="16" r="3"/>
      </svg>
    )
  },
  {
    id: 'vibe-motion',
    label: 'Vibe Motion',
    hidden: true, // pure-MuAPI, no fallback — see docs/2026-08-24-muapi-dependency-audit.md
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
      </svg>
    )
  },
  {
    id: 'lipsync',
    label: 'Lip Sync',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="22"/>
      </svg>
    )
  },
  {
    id: 'body-swap',
    label: 'Body Swap',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="8.5" cy="7" r="4"/>
        <polyline points="17 11 19 13 23 9"/>
        <path d="M23 13v-2"/>
      </svg>
    )
  },
  {
    id: 'cinema',
    label: 'Cinema Studio',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
        <line x1="7" y1="2" x2="7" y2="22"/>
        <line x1="17" y1="2" x2="17" y2="22"/>
        <line x1="2" y1="12" x2="22" y2="12"/>
        <line x1="2" y1="7" x2="7" y2="7"/>
        <line x1="2" y1="17" x2="7" y2="17"/>
        <line x1="17" y1="17" x2="22" y2="17"/>
        <line x1="17" y1="7" x2="22" y2="7"/>
      </svg>
    )
  },
  {
    id: 'marketing',
    label: 'Marketing Studio',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        <line x1="8" y1="9" x2="16" y2="9"/>
        <line x1="8" y1="13" x2="14" y2="13"/>
      </svg>
    )
  },
  {
    id: 'canvas',
    label: 'Canvas',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="6" height="6" rx="1"/>
        <rect x="15" y="3" width="6" height="6" rx="1"/>
        <rect x="9" y="15" width="6" height="6" rx="1"/>
        <path d="M6 9v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9"/>
        <path d="M12 13v2"/>
      </svg>
    )
  },
  {
    // AI Director (OpenMontage pipeline): brief -> research -> script -> scene plan -> assets.
    id: 'director',
    label: 'AI Director',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 11h16v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/>
        <path d="m4 11-.8-3.4a1 1 0 0 1 .7-1.2l13.6-3.3a1 1 0 0 1 1.2.7L19.5 7z"/>
        <path d="m8.5 5.6 2.3 3.3M13.6 4.4l2.3 3.3"/>
      </svg>
    )
  },
  {
    id: 'billing',
    label: 'Top Up',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="6" width="20" height="14" rx="2"/>
        <path d="M2 10h20"/>
        <path d="M16 15h2"/>
        <path d="M6 6V4h12v2"/>
      </svg>
    )
  },
  {
    id: 'usage',
    label: 'Usage',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18"/>
        <path d="M7 15l4-4 3 3 5-6"/>
      </svg>
    )
  },
  {
    id: 'ai-influencer',
    label: 'AI Influencer Studio',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
      </svg>
    )
  },
];

const NAVIGATION_CATEGORIES = [
  {
    id: 'images',
    label: 'Images',
    tabIds: ['image', 'cinema', 'ai-influencer'],
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <path d="M21 15l-5-5L5 21"/>
      </svg>
    )
  },
  {
    id: 'video',
    label: 'Video',
    tabIds: ['video', 'vibe-motion', 'lipsync', 'body-swap', 'marketing'],
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="15" height="16" rx="2"/>
        <path d="M17 9l5-3v12l-5-3"/>
        <path d="M8 9l4 3-4 3z"/>
      </svg>
    )
  },
  {
    id: 'audio',
    label: 'Audio',
    tabIds: ['audio'],
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13"/>
        <circle cx="6" cy="18" r="3"/>
        <circle cx="18" cy="16" r="3"/>
      </svg>
    )
  },
  {
    id: 'credits',
    label: 'Credits',
    tabIds: ['billing', 'usage'],
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9"/>
        <path d="M12 7v10M9.5 9.5h3.75a1.75 1.75 0 0 1 0 3.5h-2.5a1.75 1.75 0 0 0 0 3.5H14.5"/>
      </svg>
    )
  }
];

const NOTIFICATIONS_STORAGE_KEY = 'open_gen_notifications_v1';
const MAX_VISIBLE_NOTIFICATIONS = 3;

const loadStoredNotifications = () => {
  if (typeof window === 'undefined') return [];

  try {
    const stored = JSON.parse(window.sessionStorage.getItem(NOTIFICATIONS_STORAGE_KEY) || '[]');
    const now = Date.now();
    return Array.isArray(stored)
      ? stored.filter((notification) => notification.expiresAt > now).slice(0, MAX_VISIBLE_NOTIFICATIONS)
      : [];
  } catch {
    return [];
  }
};

const persistNotifications = (notifications) => {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(
      NOTIFICATIONS_STORAGE_KEY,
      JSON.stringify(notifications),
    );
  } catch {
    // Notification persistence is optional; rendering still works without storage.
  }
};

export default function StandaloneShell({ initialTab, children }) {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug || []; 
  const idFromParams = params?.id;
  const tabFromParams = params?.tab;

  // Helper to extract workflow details precisely from either route structure
  const getWorkflowInfo = useCallback(() => {
    if (idFromParams) {
        return { id: idFromParams, tab: tabFromParams || null };
    }
    const wfIndex = slug.findIndex(s => s === 'workflows' || s === 'workflow');
    if (wfIndex === -1) return { id: null, tab: null };
    return {
      id: slug[wfIndex + 1] || null,
      tab: slug[wfIndex + 2] || null
    };
  }, [slug, idFromParams, tabFromParams]);

  const { id: urlWorkflowId } = getWorkflowInfo();

  // Initialize activeTab from URL slug/params or default to 'image'
  const getInitialTab = () => {
    if (idFromParams || slug.includes('workflow') || slug.includes('canvas')) return 'canvas';
    if (initialTab) return initialTab;
    const firstSegment = slug[0];
    if (firstSegment && TABS.find(t => t.id === firstSegment)) return firstSegment;
    return 'home';
  };
  
  const apiKey = null;
  const [authStatus, setAuthStatus] = useState('loading');
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authError, setAuthError] = useState('');
  const [pricingOpen, setPricingOpen] = useState(false);
  const pricingAfterAuth = useRef(false);
  const [sessionVersion, setSessionVersion] = useState(0);
  const authReturnTo = useRef('/studio/home');
  const openAuth = useCallback((mode = 'login', error = '') => {
    setAuthMode(mode);
    setAuthError(error);
    setAuthOpen(true);
  }, []);
  const requireAuth = useCallback(() => {
    if (authStatus === 'authenticated') return true;
    openAuth('login');
    return false;
  }, [authStatus, openAuth]);
  const requestPricingAuth = useCallback(() => {
    pricingAfterAuth.current = true;
    setPricingOpen(false);
    openAuth('login');
  }, [openAuth]);
  const finishAuthentication = useCallback(async (result) => {
    const response = await fetch('/api/workspaces', { credentials: 'include', cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load your workspace. Please try signing in again.');
    const payload = await response.json();
    const workspace = payload.workspaces?.[0];
    if (!workspace?.id) throw new Error('No workspace is available for this account.');
    window.sessionStorage.setItem('nexoclip_workspace_id', workspace.id);
    setAuthStatus('authenticated');
    setSessionVersion(version => version + 1);
    setAuthOpen(false);
    if (pricingAfterAuth.current) {
      pricingAfterAuth.current = false;
      setPricingOpen(true);
    }
    if (result?.user?.isPlatformOperator) router.push('/admin/economics');
    else if (authReturnTo.current !== '/studio/home') router.push(authReturnTo.current);
    authReturnTo.current = '/studio/home';
  }, [router]);
  const [activeTab, setActiveTab] = useState(getInitialTab());
  const [imageVisited, setImageVisited] = useState(() => getInitialTab() === 'image');
  const [studioPrompt, setStudioPrompt] = useState('');
  // Tabs that take the whole width: no sidebar, a back button in the header instead.
  const isFullWidthTab = activeTab === 'director';

  const [balance, setBalance] = useState(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [hasMounted, setHasMounted] = useState(false);

  // Sidebar Collapsed & Mobile Drawer State
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('sidebar_collapsed') === 'true';
    return false;
  });
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [collapsedNavSections, setCollapsedNavSections] = useState({});

  const toggleSidebar = useCallback(() => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', next ? 'true' : 'false');
      return next;
    });
  }, []);

  // Drag and Drop State
  const [isDragging, setIsDragging] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState(null);

  // Global generation notifications remain mounted while users switch studios.
  const [notifications, setNotifications] = useState([]);
  const [notificationsHydrated, setNotificationsHydrated] = useState(false);
  const [generationCounts, setGenerationCounts] = useState({});

  useEffect(() => {
    setNotifications(loadStoredNotifications());
    setNotificationsHydrated(true);
  }, []);

  const pushNotification = useCallback((notif) => {
    const now = Date.now();
    const id = `notif-${Date.now()}-${Math.random()}`;
    const ttl = 12000;
    const entry = { ...notif, id, expiresAt: now + ttl };
    setNotifications((previous) => {
      const next = [
        ...previous.filter((notification) => notification.expiresAt > now),
        entry,
      ].slice(-MAX_VISIBLE_NOTIFICATIONS);
      persistNotifications(next);
      return next;
    });
  }, []);

  const dismissNotification = useCallback((id) => {
    setNotifications((previous) => {
      const next = previous.filter((notification) => notification.id !== id);
      persistNotifications(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!notificationsHydrated) return;

    persistNotifications(notifications);
  }, [notifications, notificationsHydrated]);

  useEffect(() => {
    if (notifications.length === 0) return undefined;

    const nextExpiry = Math.min(...notifications.map((notification) => notification.expiresAt));
    const timer = window.setTimeout(() => {
      const now = Date.now();
      setNotifications((previous) => previous.filter((notification) => notification.expiresAt > now));
    }, Math.max(0, nextExpiry - Date.now()));

    return () => window.clearTimeout(timer);
  }, [notifications]);

  const refreshBalance = useCallback(async () => {
    const workspaceId = window.sessionStorage.getItem('nexoclip_workspace_id');
    if (!workspaceId) return;
    try {
      const response = await fetch('/api/usage?scope=me&page=1&pageSize=1', { credentials: 'include', headers: { 'x-workspace-id': workspaceId } });
      if (response.ok) setBalance((await response.json()).balance);
    } catch { setBalance(null); }
  }, []);

  const makeSuccessCallback = useCallback((tabId) => (data) => {
    refreshBalance();
    const tab = TABS.find(t => t.id === tabId);
    pushNotification({
      type: 'success',
      tabId,
      label: tab?.label || tabId,
      resultUrl: data?.url || null,
    });
  }, [pushNotification, refreshBalance]);

  const makeErrorCallback = useCallback((tabId) => (message) => {
    refreshBalance();
    const tab = TABS.find(t => t.id === tabId);
    pushNotification({ type: 'error', tabId, label: tab?.label || tabId, message });
  }, [pushNotification, refreshBalance]);

  const makeGenerationStartCallback = useCallback((tabId) => () => {
    setGenerationCounts((previous) => ({
      ...previous,
      [tabId]: (previous[tabId] || 0) + 1,
    }));
  }, []);

  const makeGenerationEndCallback = useCallback((tabId) => () => {
    setGenerationCounts((previous) => {
      const currentCount = previous[tabId] || 0;
      if (currentCount <= 1) {
        const next = { ...previous };
        delete next[tabId];
        return next;
      }

      return {
        ...previous,
        [tabId]: currentCount - 1,
      };
    });
  }, []);

  const activeGenerations = TABS
    .filter((tab) => generationCounts[tab.id] > 0)
    .map((tab) => ({
      tabId: tab.id,
      label: tab.label,
      count: generationCounts[tab.id],
    }));

  // Popstate event listener to sync tab state with URL on back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      const segments = path.split('/').filter(Boolean);
      const tabId = segments[1] || 'home';
      if (TABS.find(t => t.id === tabId)) {
        if (tabId === 'image') setImageVisited(true);
        setActiveTab(tabId);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('tour') !== '1') return;
    url.searchParams.delete('tour');
    window.history.replaceState(null, '', url.pathname + url.search);
    setTourOpen(true);
  }, []);

  const handleTabChange = useCallback((tabId, prompt = '') => {
    if (['billing', 'usage', 'canvas', 'director'].includes(tabId) && !requireAuth()) return;
    if (tabId === 'canvas') {
      window.location.assign('/canvas');
      return;
    }
    window.history.pushState(null, '', `/studio/${tabId}`);
    if (typeof prompt === 'string' && prompt.trim()) setStudioPrompt(prompt.trim());
    if (tabId === 'image') setImageVisited(true);
    setActiveTab(tabId);
  }, [requireAuth]);

  const handleOpenNotification = useCallback((notification) => {
    handleTabChange(notification.tabId);
    dismissNotification(notification.id);
  }, [dismissNotification, handleTabChange]);

  const handleTabClick = (e, tabId) => {
    if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      handleTabChange(tabId);
      return true;
    }
    return false;
  };

  const handleNavigationItemClick = (event, tabId) => {
    if (handleTabClick(event, tabId)) {
      setIsMobileOpen(false);
    }
  };

  // Auto-hide header when inside a specific workflow view
  useEffect(() => {
    const isEditingWorkflow = (activeTab === 'canvas' || !!idFromParams) && urlWorkflowId;

    if (isEditingWorkflow) {
      setIsHeaderVisible(false);
    } else {
      setIsHeaderVisible(true);
    }
  }, [activeTab, urlWorkflowId, idFromParams]);

  // Global builder CSS cleanup when switching away from Workflows tab
  useEffect(() => {
    const fromBuilder = sessionStorage.getItem("fromWorkflowBuilder");

    if (fromBuilder && activeTab !== 'canvas') {
      sessionStorage.removeItem("fromWorkflowBuilder");
      window.location.reload();
    }
  }, [activeTab]);


  useEffect(() => {
    let cancelled = false;

    async function restoreSaaSSession() {
      try {
        const sessionResponse = await fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' });
        const session = await sessionResponse.json();
        if (!session.authenticated) {
          window.sessionStorage.removeItem('nexoclip_workspace_id');
          if (!cancelled) setAuthStatus('guest');
          return;
        }
        const workspaceResponse = await fetch('/api/workspaces', { credentials: 'include' });
        const workspacePayload = await workspaceResponse.json();
        if (!workspaceResponse.ok) throw new Error('Workspace unavailable');
        const workspace = workspacePayload.workspaces?.[0];
        if (workspace?.id && typeof window !== 'undefined') {
          window.sessionStorage.setItem('nexoclip_workspace_id', workspace.id);
          await refreshBalance();
        }
        if (!cancelled) setAuthStatus('authenticated');
      } catch {
        window.sessionStorage.removeItem('nexoclip_workspace_id');
        if (!cancelled) setAuthStatus('guest');
      }
    }

    setHasMounted(true);
    restoreSaaSSession();
    return () => { cancelled = true; };
  }, [sessionVersion, refreshBalance]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const intent = params.get('auth');
    if (intent === 'login' || intent === 'register') {
      const next = params.get('next');
      authReturnTo.current = next?.startsWith('/') && !next.startsWith('//') && !/[\\\u0000-\u001f\u007f]/.test(next)
        ? next
        : intent === 'register' ? '/onboarding' : '/studio/home';
      const errors = {
        google: 'Google sign-in did not complete. Please try again.',
        google_state: 'Your Google sign-in expired. Please try again.',
        google_unconfigured: 'Google sign-in is unavailable right now. Use your email instead.',
      };
      openAuth(intent, errors[params.get('error')] || '');
      params.delete('auth');
      params.delete('next');
      params.delete('error');
      const query = params.toString();
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    }
  }, [openAuth]);

  useEffect(() => {
    const handleLogout = () => {
      setAuthStatus('guest');
      setAuthOpen(false);
      setAuthError('');
      setBalance(null);
      setActiveTab('home');
      setSessionVersion(version => version + 1);
    };
    window.addEventListener('nexoclip:auth-logout', handleLogout);
    return () => window.removeEventListener('nexoclip:auth-logout', handleLogout);
  }, []);

  useEffect(() => {
    const onAuthRequired = () => { setAuthStatus('guest'); openAuth('login'); };
    window.addEventListener('muapi:auth-required', onAuthRequired);
    return () => window.removeEventListener('muapi:auth-required', onAuthRequired);
  }, [openAuth]);


  // Drag and Drop Handlers
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if we're leaving the container itself, not moving between children
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setDroppedFiles(files);
    }
  }, []);

  const handleFilesHandled = useCallback(() => {
    setDroppedFiles(null);
  }, []);

  if (!hasMounted) return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center">
      <div className="animate-spin text-[#22d3ee] text-3xl">◌</div>
    </div>
  );

  return (
    <div 
      className="suite-shell suite-shell-split h-screen bg-[#030303] flex flex-col overflow-hidden text-white relative"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag Overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-[100] bg-[#22d3ee]/10 backdrop-blur-md border-4 border-dashed border-[#22d3ee]/50 flex items-center justify-center pointer-events-none transition-all duration-300">
          <div className="bg-[#0a0a0a] p-8 rounded-3xl border border-white/10 shadow-2xl flex flex-col items-center gap-4 scale-110 animate-pulse">
            <div className="w-20 h-20 bg-[#22d3ee] rounded-2xl flex items-center justify-center">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
              </svg>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-xl font-bold text-white">Drop your media here</span>
              <span className="text-sm text-white/40">Images, videos, or audio files</span>
            </div>
          </div>
        </div>
      )}


      {/* Header */}
      {isHeaderVisible && (
        <header className="suite-topbar flex-shrink-0 h-14 border-b border-white/[0.05] flex items-center justify-between px-4 bg-[#0a0a0b]/80 backdrop-blur-md z-50 gap-4">
          {/* Left: Mobile menu toggle + Logo + Desktop Sidebar Toggle */}
          <div className="flex items-center gap-3">
            {/* The Director is a full-width workspace without the sidebar; this is its way out. */}
            {isFullWidthTab ? (
              <button type="button" onClick={() => handleTabChange('home')} aria-label="Kembali ke Studio" title="Kembali ke Studio"
                className="flex h-9 items-center gap-1.5 rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-2.5 text-[12px] text-white/70 transition-colors hover:border-white/20 hover:text-white">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
                Studio
              </button>
            ) : (
            /* Mobile drawer toggle */
            <button
              onClick={() => setIsMobileOpen(!isMobileOpen)}
              className="suite-icon-button md:hidden"
              aria-label="Toggle Navigation Menu"
              aria-expanded={isMobileOpen}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            )}

            {/* Logo & Title */}
            <Link href="/" aria-label="Nexoclip home" className="suite-brand suite-mobile-brand">
              <span className="suite-brand-mark" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4.5 7.5h8a4 4 0 0 1 4 4v5m-9 0a4 4 0 0 1 0-8m10 0a4 4 0 0 1 0 8h-8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/><path d="m14 4 3 3-3 3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
              <span className="suite-brand-word">nexo<span>clip</span><small>CREATIVE STUDIO</small></span>
            </Link>
          </div>

          <div className="suite-header-breadcrumb" aria-live="polite"><span className="suite-header-status-dot" /><strong>Nexo Studio</strong><span className="suite-header-separator">/</span><span>{activeTab === 'home' ? 'Dashboard' : TABS.find(tab => tab.id === activeTab)?.label || 'Dashboard'}</span></div>

          {/* Right: Actions */}
          <div className="suite-header-actions">
            {authStatus !== 'authenticated' ? <>
              <button type="button" className="suite-header-help" aria-label="Studio help" title="Studio help" onClick={() => setTourOpen(true)}>?</button>
              <button type="button" data-tour="top-up" className="suite-header-link" onClick={() => setPricingOpen(true)}>Pricing</button>
              <a className="suite-header-link" href={ENTERPRISE_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">Enterprise</a>
              <button onClick={() => openAuth('login')} className="suite-login">Log in</button>
              <button onClick={() => openAuth('login')} className="suite-primary suite-header-cta"><span>Start creating</span><span aria-hidden="true">↗</span></button>
            </> : <>
            <button type="button" className="suite-header-help" aria-label="Studio help" title="Studio help" onClick={() => setTourOpen(true)}>?</button>
            <button type="button" data-tour="top-up" className="suite-header-link" onClick={() => setPricingOpen(true)}>Pricing</button>
            <a className="suite-header-link" href={ENTERPRISE_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">Enterprise</a>
            <button data-tour="credit-balance" onClick={() => handleTabChange('usage')} className="suite-credit-pill" aria-label="View credit usage">
              <span className="suite-credit-gem">✧</span>
              <span><strong>{balance !== null ? Number(balance).toLocaleString() : '—'}</strong><small>credits</small></span>
            </button>

            <div data-tour="jobs" className="flex"><JobListPanel /></div>
            <button
              type="button"
              data-tour="tour-button"
              onClick={() => setTourOpen(true)}
              className="suite-icon-button suite-help-button"
              aria-label="Take the Studio tour"
              title="Take the Studio tour"
            >
              ?
            </button>
            <AccountMenu showAdminLink />
            </>}
          </div>
        </header>
      )}

      {/* Main Body Layout: Left Sidebar + Studio Content Area */}
      <div className="suite-body flex-1 min-h-0 flex relative overflow-hidden">
        {/* Mobile Backdrop Overlay */}
        {isMobileOpen && (
          <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 md:hidden animate-fade-in"
            onClick={() => setIsMobileOpen(false)}
          />
        )}

        {/* Left Sidebar Navigation */}
        {isHeaderVisible && !isFullWidthTab && (
          <aside
            className={`
              suite-sidebar fixed top-[68px] bottom-0 left-0 md:static md:h-full z-30 bg-[#0a0a0b]/95 backdrop-blur-md border-r border-white/[0.06] flex flex-col transition-all duration-300 ease-in-out flex-shrink-0 select-none
              ${isSidebarCollapsed && !isMobileOpen ? 'suite-sidebar-collapsed' : ''}
              ${isMobileOpen ? 'translate-x-0 w-60 z-50' : '-translate-x-[calc(100%+24px)] md:translate-x-0'}
              ${isSidebarCollapsed ? 'md:w-16' : 'md:w-52'}
            `}
          >
            <div className="suite-sidebar-top">
              <Link href="/" aria-label="Nexoclip home" className="suite-brand">
                <span className="suite-brand-mark" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4.5 7.5h8a4 4 0 0 1 4 4v5m-9 0a4 4 0 0 1 0-8m10 0a4 4 0 0 1 0 8h-8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/><path d="m14 4 3 3-3 3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
                <span className="suite-brand-word">nexo<span>clip</span></span>
              </Link>
              <span className="suite-free-badge">Free</span>
              <button type="button" className="suite-sidebar-collapse" onClick={toggleSidebar} aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="m14 9-3 3 3 3"/></svg>
              </button>
            </div>
            <button type="button" className="suite-project-switcher" onClick={() => authStatus === 'authenticated' ? router.push('/account') : openAuth('login')} aria-label="Personal project, open workspace">
              <span className="suite-project-avatar">{authStatus === 'authenticated' ? 'N' : 'P'}</span>
              <span><strong>Personal project</strong><small>{authStatus === 'authenticated' ? 'Your workspace' : 'Your creative space'}</small></span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
            </button>
            <nav data-tour="studio-nav" aria-label="Studio navigation" className="suite-side-nav flex-1 overflow-y-auto overflow-x-hidden scrollbar-none py-3 px-2">
              {(() => {
                const isCollapsed = isSidebarCollapsed && !isMobileOpen;
                const tabFor = (id) => TABS.find((tab) => tab.id === id);
                const renderStudioItem = (tab, label = tab?.label) => {
                  if (!tab) return null;
                  const isActive = activeTab === tab.id;
                  return (
                    <a
                      key={tab.id}
                      href={`/studio/${tab.id}`}
                      onClick={(event) => handleNavigationItemClick(event, tab.id)}
                      aria-current={isActive ? 'page' : undefined}
                      aria-label={label}
                      title={isCollapsed ? label : undefined}
                      className={`
                        group relative flex items-center rounded-lg transition-colors duration-150
                        ${isCollapsed ? 'suite-nav-link suite-nav-link-collapsed h-10 w-10 justify-center mx-auto' : 'suite-nav-link gap-3 px-2.5 py-2 text-[13px] font-medium'}
                        ${isActive
                          ? 'is-active bg-white/[0.07] text-[#22d3ee]'
                          : 'text-white/55 hover:text-white hover:bg-white/[0.04]'
                        }
                      `}
                    >
                      {isActive && (
                        <span className="suite-active-marker absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-[#22d3ee]" aria-hidden="true" />
                      )}
                      <span className={`flex-shrink-0 ${isActive ? 'text-[#22d3ee]' : 'text-white/45 group-hover:text-white/80'}`}>
                        {tab.icon}
                      </span>
                      {!isCollapsed && <><span className="truncate flex-1">{label}</span>{tab.id === 'video' && <span className="suite-nav-badge">HOT</span>}</>}
                    </a>
                  );
                };
                const renderAgentItem = (id, label, description, icon) => {
                  const tab = tabFor(id);
                  const isActive = activeTab === id;
                  return <a key={id} href={`/studio/${id}`} onClick={event => handleNavigationItemClick(event, id)} aria-current={isActive ? 'page' : undefined} aria-label={label} title={isCollapsed ? label : undefined} className={`suite-agent-link ${isActive ? 'is-active' : ''} ${isCollapsed ? 'is-compact' : ''}`}>
                    <span className={`suite-agent-icon ${icon}`}>{tab?.icon}</span>{!isCollapsed && <span className="suite-agent-copy"><strong>{label}</strong><small>{description}</small></span>}
                  </a>;
                };
                const renderSectionTitle = (label, section) => !isCollapsed && <button type="button" className="suite-reference-nav-title" aria-expanded={!collapsedNavSections[section]} onClick={() => setCollapsedNavSections(current => ({ ...current, [section]: !current[section] }))}><span>{label}</span><svg className={collapsedNavSections[section] ? 'is-collapsed' : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg></button>;
                const toolItems = [
                  ['video', 'Video'], ['image', 'Image'], ['cinema', 'World'], ['ai-influencer', 'Character'], ['audio', 'Audio'],
                ];

                return (
                  <>
                    <div className="suite-reference-home">{renderStudioItem(tabFor('home'), 'Home')}</div>
                    <section className="suite-reference-nav-section">{renderSectionTitle('Agents', 'agents')}
                      {!collapsedNavSections.agents && <>{renderAgentItem('director', 'Director Mode', 'Brief → script → video', 'suite-agent-director')}</>}
                    </section>
                    <section className="suite-reference-nav-section">{renderSectionTitle('Tools', 'tools')}
                      {!collapsedNavSections.tools && <>
                      <div className="suite-tool-grid">{toolItems.map(([id, label]) => <Fragment key={id}>{renderStudioItem(tabFor(id), label)}</Fragment>)}
                        {!isCollapsed && <button type="button" className="suite-tool-shortcut" title="MCP / CLI setup coming soon" disabled aria-disabled="true"><span>↗</span><span>MCP / CLI</span><small>10% Off</small></button>}
                      </div>
                      </>}
                    </section>
                    <section className="suite-reference-nav-section suite-pinned-section">{renderSectionTitle('Pinned Tools', 'pinned')}
                      {!collapsedNavSections.pinned && renderStudioItem(tabFor('canvas'), 'Canvas')}
                    </section>
                  </>
                );
              })()}
            </nav>
            {!(isSidebarCollapsed && !isMobileOpen) && <div className="suite-sidebar-account">
              <button type="button" onClick={() => authStatus === 'authenticated' ? router.push('/account') : openAuth('login')} className="suite-sidebar-user-button">
                <span className="suite-sidebar-user-avatar">{authStatus === 'authenticated' ? 'N' : 'G'}</span><span><strong>{authStatus === 'authenticated' ? 'Nexoclip Member' : 'Guest Creator'}</strong><small>{authStatus === 'authenticated' ? 'Personal workspace' : 'Free workspace'}</small></span>
              </button>
              <button type="button" className="suite-sidebar-settings" onClick={() => authStatus === 'authenticated' ? router.push('/account') : openAuth('login')} aria-label="Settings" title="Settings"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.5.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.8l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.5-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.5.9l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1 0 1.7Z"/></svg></button>
            </div>}
          </aside>
        )}

        {/* Studio Content */}
        <div className="suite-content flex-1 min-w-0 min-h-0 h-full relative overflow-hidden bg-[#030303] text-white">
        {activeTab === 'home' && <StudioHome onNavigate={handleTabChange} />}
        {authStatus !== 'loading' && <>
        {['billing', 'usage'].includes(activeTab) && authStatus !== 'authenticated' && <div className="suite-private"><h2>Your creative workspace</h2><p>Sign in to view your credits and usage.</p><button className="suite-primary" onClick={() => openAuth('login')}>Sign in</button></div>}
        {activeTab === 'director' && (authStatus === 'authenticated'
          ? <div className="h-full w-full"><DirectorApp initialBrief={studioPrompt} /></div>
          : <div className="suite-private"><h2>AI Director</h2><p>Sign in to plan and produce videos with the Director.</p><button className="suite-primary" onClick={() => openAuth('login')}>Sign in</button></div>)}
        {activeTab === 'billing' && authStatus === 'authenticated' && <BillingContent workspaceId={typeof window !== 'undefined' ? window.sessionStorage.getItem('nexoclip_workspace_id') : null} balance={balance} onCompleted={refreshBalance} />}
        {activeTab === 'usage' && authStatus === 'authenticated' ? <UsageContent workspaceId={typeof window !== 'undefined' ? window.sessionStorage.getItem('nexoclip_workspace_id') : null} onBalanceChange={setBalance} onTopUp={() => handleTabChange('billing')} /> : imageVisited && <div className={activeTab === 'image' ? "h-full w-full" : "hidden"}>
          <ImageStudio initialPrompt={studioPrompt} beforeGenerate={requireAuth} persistScope={authStatus === 'authenticated' ? undefined : 'public-guest'} apiKey={apiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationStart={makeGenerationStartCallback('image')} onGenerationEnd={makeGenerationEndCallback('image')} onGenerationComplete={makeSuccessCallback('image')} onGenerationError={makeErrorCallback('image')} />
        </div>}
        {activeTab === 'video' && (
          <div className="h-full w-full">
            <VideoStudio initialPrompt={studioPrompt} beforeGenerate={requireAuth} persistScope={authStatus === 'authenticated' ? undefined : 'public-guest'} apiKey={apiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationStart={makeGenerationStartCallback('video')} onGenerationEnd={makeGenerationEndCallback('video')} onGenerationComplete={makeSuccessCallback('video')} onGenerationError={makeErrorCallback('video')} />
          </div>
        )}
        {activeTab === 'vibe-motion' && (
          <div className="h-full w-full">
            <VibeMotionStudio apiKey={apiKey} onGenerationStart={makeGenerationStartCallback('vibe-motion')} onGenerationEnd={makeGenerationEndCallback('vibe-motion')} onGenerationComplete={makeSuccessCallback('vibe-motion')} onGenerationError={makeErrorCallback('vibe-motion')} />
          </div>
        )}
        {activeTab === 'lipsync' && (
          <div className="h-full w-full">
            <ComingSoon title="Lip Sync" />
          </div>
        )}
        {activeTab === 'body-swap' && (
          <div className="h-full w-full">
            <ComingSoon title="Body Swap" />
          </div>
        )}
        {activeTab === 'cinema' && (
          <div className="h-full w-full">
            <CinemaStudio initialPrompt={studioPrompt} beforeGenerate={requireAuth} persistScope={authStatus === 'authenticated' ? undefined : 'public-guest'} apiKey={apiKey} onGenerationStart={makeGenerationStartCallback('cinema')} onGenerationEnd={makeGenerationEndCallback('cinema')} onGenerationComplete={makeSuccessCallback('cinema')} onGenerationError={makeErrorCallback('cinema')} />
          </div>
        )}
        {activeTab === 'audio' && (
          <div className="h-full w-full">
            <AudioStudio apiKey={apiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationStart={makeGenerationStartCallback('audio')} onGenerationEnd={makeGenerationEndCallback('audio')} onGenerationComplete={makeSuccessCallback('audio')} onGenerationError={makeErrorCallback('audio')} />
          </div>
        )}
        {activeTab === 'marketing' && (
          <div className="h-full w-full">
            <MarketingStudio beforeGenerate={requireAuth} persistScope={authStatus === 'authenticated' ? undefined : 'public-guest'} apiKey={apiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationStart={makeGenerationStartCallback('marketing')} onGenerationEnd={makeGenerationEndCallback('marketing')} onGenerationComplete={makeSuccessCallback('marketing')} onGenerationError={makeErrorCallback('marketing')} />
          </div>
        )}
        {activeTab === 'canvas' && (
          <div className="h-full w-full bg-black">
            <iframe
              title="Canvas"
              src="/canvas?embedded=canvas"
              className="h-full w-full border-0"
              allow="clipboard-read; clipboard-write"
            />
          </div>
        )}
        {activeTab === 'ai-influencer' && (
          <div className="h-full w-full">
            <AiInfluencerStudio
              beforeGenerate={requireAuth}
              apiKey={apiKey}
              onGenerationStart={makeGenerationStartCallback('ai-influencer')}
              onGenerationEnd={makeGenerationEndCallback('ai-influencer')}
              onGenerationComplete={makeSuccessCallback('ai-influencer')}
              onGenerationError={makeErrorCallback('ai-influencer')}
            />
          </div>
        )}
        </>}
      </div>
    </div>

      {/* Global generation activity and notification stack */}
      {authStatus === 'authenticated' && (activeGenerations.length > 0 || notifications.length > 0) && (
        <div
          aria-live="polite"
          aria-label="Generation activity and notifications"
          className="fixed top-16 right-5 z-[200] flex max-h-[calc(100vh-80px)] w-[340px] max-w-[calc(100vw-32px)] flex-col gap-2 overflow-x-hidden overflow-y-auto global-notif-stack pointer-events-none"
          data-testid="global-notification-stack"
        >
          {activeGenerations.map((generation) => (
            <div
              key={generation.tabId}
              role="status"
              data-generation-tab={generation.tabId}
              className="pointer-events-auto flex items-center gap-3 rounded-xl border border-cyan-500/40 bg-white px-3.5 py-3 text-[13px] text-zinc-900 shadow-[0_10px_30px_rgba(0,0,0,0.15)]"
              data-testid="generation-activity"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-cyan-400/40 bg-cyan-50">
                <span
                  className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-cyan-600/30 border-t-cyan-600"
                  aria-hidden="true"
                />
              </span>
              <p className="min-w-0 flex-1 font-semibold leading-5 text-zinc-900">
                {generation.label} is generating
                {generation.count > 1 ? ` (${generation.count})` : ''}
              </p>
            </div>
          ))}

          {notifications.map((notif) => (
            <div
              key={notif.id}
              role={notif.type === 'error' ? 'alert' : 'status'}
              data-notification-type={notif.type}
              data-notification-tab={notif.tabId}
              className="pointer-events-auto flex items-start gap-3 rounded-xl border bg-white px-3.5 py-3 text-[13px] text-zinc-900 shadow-[0_10px_30px_rgba(0,0,0,0.15)]"
              style={{
                borderColor: notif.type === 'success' ? 'rgba(6,182,212,0.4)' : 'rgba(239,68,68,0.4)',
                animation: 'slideInRight 280ms cubic-bezier(0.16,1,0.3,1) forwards',
              }}
            >
              <span
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                  notif.type === 'success'
                    ? 'border-cyan-400/40 bg-cyan-50 text-cyan-600'
                    : 'border-red-400/40 bg-red-50 text-red-600'
                }`}
              >
                {notif.type === 'success' ? (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m5 12 4 4L19 6" />
                  </svg>
                ) : (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v6" />
                    <path d="M12 17h.01" />
                  </svg>
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-5 text-zinc-900">
                  {notif.label}
                  <span className="font-normal text-zinc-500">
                    {notif.type === 'success' ? ' - Generation complete' : ' - Generation failed'}
                  </span>
                </p>
                {notif.type === 'error' && notif.message && (
                  <p className="mt-0.5 line-clamp-2 text-[12px] font-medium leading-4 text-red-600" title={notif.message}>
                    {notif.message}
                  </p>
                )}
                {notif.type === 'success' && (
                  <p className="mt-0.5 text-[12px] leading-4 text-zinc-500">
                    Your result is ready.
                  </p>
                )}
                {notif.type === 'success' && (
                  <button
                    type="button"
                    onClick={() => handleOpenNotification(notif)}
                    className="mt-1.5 text-[11px] font-bold text-cyan-600 transition-colors hover:text-cyan-700"
                    aria-label={`Open ${notif.label} result`}
                  >
                    Open →
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => dismissNotification(notif.id)}
                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-300"
                aria-label="Dismiss notification"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Keyframe for toast slide-in & scrollbar suppression */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(110%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        .global-notif-stack::-webkit-scrollbar {
          display: none;
        }
        .global-notif-stack {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>

      {authOpen && <StudioAuthModal initialMode={authMode} initialError={authError} onClose={() => setAuthOpen(false)} onAuthenticated={finishAuthentication} />}
      {pricingOpen && <PricingModal
        workspaceId={typeof window !== 'undefined' ? window.sessionStorage.getItem('nexoclip_workspace_id') : null}
        balance={balance}
        onCompleted={refreshBalance}
        onRequireAuth={requestPricingAuth}
        onClose={() => setPricingOpen(false)}
      />}
      <StudioTour open={tourOpen} onClose={() => setTourOpen(false)} activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
}
