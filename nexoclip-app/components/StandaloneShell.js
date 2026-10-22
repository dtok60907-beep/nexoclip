'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import AccountMenu from './AccountMenu';
import JobListPanel from './JobListPanel.js';
import UsageContent from './UsageContent';
import BillingContent, { ENTERPRISE_WHATSAPP_URL } from './BillingContent';
import PricingModal from './PricingModal';
import { PromoBanner, usePlanStatus } from './PlanStatus';
import LowBalanceDialog from './LowBalanceDialog';
import { lowBalanceLevel, nextLowBalanceDialog } from '../src/lib/lowBalance.js';
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

const PENDING_PROMPT_KEY = 'nexoclip_pending_director_prompt';
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

// The header's page title for each tab (sidebar labels where they differ from TABS).
const TAB_TITLES = { home: 'Home', image: 'Image', video: 'Video', cinema: 'World', 'ai-influencer': 'Character', audio: 'Audio', director: 'AI Director', billing: 'Top up', usage: 'Usage', canvas: 'Canvas' };

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
  const [lowBalanceOpen, setLowBalanceOpen] = useState(false);
  const creditLevel = lowBalanceLevel(balance);
  const planStatus = usePlanStatus(authStatus, `${sessionVersion}:${pricingOpen}`);
  const [tourOpen, setTourOpen] = useState(false);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [hasMounted, setHasMounted] = useState(false);

  // Sidebar Collapsed & Mobile Drawer State
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('sidebar_collapsed') === 'true';
    return false;
  });
  const [isMobileOpen, setIsMobileOpen] = useState(false);

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

  // Credits are also spent where the shell does not see it (AI Director chats, voiceovers): check every minute and
  // whenever the user comes back to the tab.
  useEffect(() => {
    if (authStatus !== 'authenticated') return undefined;
    const timer = window.setInterval(refreshBalance, 60_000);
    window.addEventListener('focus', refreshBalance);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refreshBalance); };
  }, [authStatus, refreshBalance]);

  // Running low or out: ask to top up, once per level per session.
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    let seen = null;
    try { seen = window.sessionStorage.getItem('nexoclip_low_balance_seen'); } catch { /* storage blocked */ }
    const next = nextLowBalanceDialog(creditLevel, seen);
    try {
      if (next.seen) window.sessionStorage.setItem('nexoclip_low_balance_seen', next.seen);
      else window.sessionStorage.removeItem('nexoclip_low_balance_seen');
    } catch { /* storage blocked */ }
    if (next.open) setLowBalanceOpen(true);
  }, [authStatus, creditLevel]);

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

  // A brief handed over from the landing page (/studio/director?prompt=…) opens the
  // Director's new-project form with it. It is kept in sessionStorage so it survives
  // signing in with Google, which leaves the page; once the Director has it, it is dropped.
  const pendingPromptFromStorage = useRef(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    const fromUrl = (url.searchParams.get('prompt') || '').trim().slice(0, 2000);
    let prompt = fromUrl;
    try {
      if (fromUrl) window.sessionStorage.setItem(PENDING_PROMPT_KEY, fromUrl);
      else prompt = window.sessionStorage.getItem(PENDING_PROMPT_KEY) || '';
    } catch { /* storage blocked */ }
    if (fromUrl) {
      url.searchParams.delete('prompt');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    } else if (prompt) {
      pendingPromptFromStorage.current = true;
    }
    if (prompt) setStudioPrompt(prompt);
  }, []);
  useEffect(() => {
    if (authStatus !== 'authenticated' || !studioPrompt) return;
    // Back from Google with a brief still waiting: take it to the Director.
    if (pendingPromptFromStorage.current && activeTab !== 'director') {
      pendingPromptFromStorage.current = false;
      handleTabChange('director', studioPrompt);
      return;
    }
    if (activeTab === 'director') {
      try { window.sessionStorage.removeItem(PENDING_PROMPT_KEY); } catch { /* storage blocked */ }
    }
  }, [authStatus, activeTab, studioPrompt, handleTabChange]);

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
    <div className="min-h-screen bg-[#0b0c0a] flex items-center justify-center">
      <div className="animate-spin text-[#d4ff64] text-3xl">◌</div>
    </div>
  );

  return (
    <div
      className="nx-shell"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag Overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-[100] bg-[#d4ff64]/10 backdrop-blur-md border-4 border-dashed border-[#d4ff64]/50 flex items-center justify-center pointer-events-none transition-all duration-300">
          <div className="bg-[#0b0c0a] p-8 rounded-3xl border border-white/10 shadow-2xl flex flex-col items-center gap-4 scale-110 animate-pulse">
            <div className="w-20 h-20 bg-[#d4ff64] rounded-2xl flex items-center justify-center">
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

      {isHeaderVisible && <PromoBanner status={planStatus} onOpen={() => setPricingOpen(true)} />}

      <div className="nx-frame">
        {isMobileOpen && <div className="nx-scrim md:hidden" onClick={() => setIsMobileOpen(false)} />}

        {/* Floating sidebar; folds into an icon rail, and is a drawer on phones. */}
        {isHeaderVisible && !isFullWidthTab && (() => {
          const isCollapsed = isSidebarCollapsed && !isMobileOpen;
          const tabFor = (id) => TABS.find((tab) => tab.id === id);
          const navLink = (id, label, extra = null) => {
            const tab = tabFor(id);
            if (!tab) return null;
            const isActive = activeTab === id;
            return (
              <a key={id} href={`/studio/${id}`} onClick={(event) => handleNavigationItemClick(event, id)}
                aria-current={isActive ? 'page' : undefined} aria-label={label} title={isCollapsed ? label : undefined}
                className={`nx-link${isActive ? ' is-active' : ''}`}>
                <span className="nx-icon">{tab.icon}</span>
                <span className="nx-label">{label}</span>
                {extra}
              </a>
            );
          };
          const group = (label, shortLabel, children) => (
            <div className="nx-group">
              <span className="nx-group-label">{isCollapsed ? shortLabel : label}</span>
              {children}
            </div>
          );
          const sub = planStatus?.subscription;
          const planActive = sub?.status === 'active';
          const daysLeft = planActive ? Math.max(0, Math.ceil((new Date(sub.currentPeriodEnd) - Date.now()) / 86_400_000)) : null;
          return (
            <aside className={`nx-side${isCollapsed ? ' is-collapsed' : ''}${isMobileOpen ? ' is-open' : ''}`}>
              <div className="nx-side-head">
                {isCollapsed
                  ? <Link href="/" aria-label="Nexo Clip home" className="nx-monogram">n</Link>
                  : <Link href="/" aria-label="Nexo Clip home" className="nx-wordmark">nexo<span>clip</span><i>.</i></Link>}
              </div>
              <button type="button" className="nx-fold" onClick={toggleSidebar} aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={isCollapsed ? 'm9 18 6-6-6-6' : 'm15 18-6-6 6-6'} /></svg>
              </button>

              <nav data-tour="studio-nav" aria-label="Studio navigation" className="nx-nav">
                {navLink('home', 'Home')}
                {group('Agent', 'Agent', (() => {
                  const isActive = activeTab === 'director';
                  return (
                    <a href="/studio/director" onClick={(event) => handleNavigationItemClick(event, 'director')}
                      aria-current={isActive ? 'page' : undefined} aria-label="AI Director" title={isCollapsed ? 'AI Director' : undefined}
                      className={`nx-link nx-agent${isActive ? ' is-active' : ''}`}>
                      <span className="nx-agent-icon">{tabFor('director')?.icon}</span>
                      <span className="nx-label"><strong>AI Director</strong><small>Brief → script → video</small></span>
                    </a>
                  );
                })())}
                {group('Create', 'Create', <>
                  {navLink('video', 'Video', <span className="nx-badge">HOT</span>)}
                  {navLink('image', 'Image')}
                  {navLink('cinema', 'World')}
                  {navLink('ai-influencer', 'Character')}
                  {navLink('audio', 'Audio')}
                </>)}
                {group('Workspace', 'Space', <>
                  {navLink('canvas', 'Canvas')}
                  {navLink('usage', 'Usage')}
                </>)}
              </nav>

              {isCollapsed ? (
                <button type="button" className="nx-plus" onClick={() => (authStatus === 'authenticated' ? setPricingOpen(true) : openAuth('login'))}
                  aria-label={authStatus === 'authenticated' ? 'Top up credits' : 'Sign in'} title={authStatus === 'authenticated' ? 'Top up credits' : 'Sign in'}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                </button>
              ) : authStatus === 'authenticated' ? (
                <div className="nx-card">
                  {planActive ? <>
                    <span className="nx-card-kicker">Your plan</span>
                    <strong className="nx-card-title">{sub.name}</strong>
                    <span className={`nx-card-note${daysLeft <= 7 ? ' is-warn' : ''}`}>{daysLeft === 0 ? 'Ends today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}</span>
                  </> : planStatus?.enabled ? <>
                    <span className="nx-card-kicker">No plan yet</span>
                    <strong className="nx-card-title">Monthly credits</strong>
                    <span className="nx-card-note">{planStatus.promo ? `${planStatus.promo.promoPercent}% off your first month` : 'Credits every month for every studio'}</span>
                  </> : <>
                    <span className="nx-card-kicker">Credits</span>
                    <strong className="nx-card-title">{balance !== null ? Number(balance).toLocaleString() : '—'}</strong>
                  </>}
                  <button type="button" data-tour="top-up" className="nx-card-button" onClick={() => setPricingOpen(true)}>
                    {planActive || !planStatus?.enabled ? 'Top up credits' : 'See plans'}
                  </button>
                  <a className="nx-card-link" href={ENTERPRISE_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">Enterprise ↗</a>
                </div>
              ) : (
                <div className="nx-card">
                  <span className="nx-card-kicker">Start creating</span>
                  <strong className="nx-card-title">Sign in to generate</strong>
                  <span className="nx-card-note">Your images and videos are saved to your workspace.</span>
                  <button type="button" className="nx-card-button" onClick={() => openAuth('login')}>Sign in</button>
                  <button type="button" className="nx-card-link w-full" onClick={() => openAuth('register')}>Create an account</button>
                </div>
              )}
            </aside>
          );
        })()}

        <div className="nx-main">
          {isHeaderVisible && (
            <header className="nx-top">
              <div className="nx-title">
                {/* The Director is a full-width workspace without the sidebar; this is its way out. */}
                {isFullWidthTab ? (
                  <button type="button" onClick={() => handleTabChange('home')} aria-label="Back to Studio" className="nx-back">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
                    Studio
                  </button>
                ) : (
                  <button type="button" onClick={() => setIsMobileOpen(!isMobileOpen)} className="nx-burger" aria-label="Open navigation" aria-expanded={isMobileOpen}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10" /></svg>
                  </button>
                )}
                <h1 aria-live="polite">{TAB_TITLES[activeTab] || TABS.find(tab => tab.id === activeTab)?.label || 'Home'}</h1>
              </div>

              <div className="nx-actions">
                <button type="button" data-tour="tour-button" className="nx-round nx-hide-sm" aria-label="Take the Studio tour" title="Take the Studio tour" onClick={() => setTourOpen(true)}>?</button>
                {authStatus !== 'authenticated' ? <>
                  <button type="button" className="nx-text-link" onClick={() => setPricingOpen(true)}>Pricing</button>
                  <a className="nx-text-link" href={ENTERPRISE_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">Enterprise</a>
                  <button type="button" className="nx-text-link" onClick={() => openAuth('login')}>Log in</button>
                  <button type="button" className="nx-cta" onClick={() => openAuth('register')}>Start creating <span aria-hidden="true">↗</span></button>
                </> : <>
                  <button type="button" data-tour="credit-balance" onClick={() => (creditLevel ? setPricingOpen(true) : handleTabChange('usage'))}
                    className={`nx-credits${creditLevel ? ` is-${creditLevel}` : ''}`}
                    aria-label={creditLevel ? 'Credits are running low, top up' : 'View credit usage'}
                    title={creditLevel === 'empty' ? 'You are out of credits. Click to top up.' : creditLevel === 'low' ? 'Your credits are running low. Click to top up.' : undefined}>
                    <i aria-hidden="true">✦</i>
                    <strong>{balance !== null ? Number(balance).toLocaleString() : '—'}</strong>
                    <small>credits</small>
                  </button>
                  <div data-tour="jobs" className="flex"><JobListPanel /></div>
                  <AccountMenu showAdminLink />
                </>}
              </div>
            </header>
          )}

        {/* Studio Content */}
        <div className="suite-content min-w-0 relative overflow-hidden text-white">
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
      </div>

      {/* Global generation activity and notification stack */}
      {authStatus === 'authenticated' && (activeGenerations.length > 0 || notifications.length > 0) && (
        <div
          aria-live="polite"
          aria-label="Generation activity and notifications"
          className="fixed top-20 right-5 z-[200] flex max-h-[calc(100vh-80px)] w-[340px] max-w-[calc(100vw-32px)] flex-col gap-2 overflow-x-hidden overflow-y-auto global-notif-stack pointer-events-none"
          data-testid="global-notification-stack"
        >
          {activeGenerations.map((generation) => (
            <div
              key={generation.tabId}
              role="status"
              data-generation-tab={generation.tabId}
              className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-white/10 bg-[#161915] px-3.5 py-3 text-[13px] text-[#f2eee5] shadow-[0_16px_40px_rgba(0,0,0,0.5)]"
              data-testid="generation-activity"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#d4ff64]/15">
                <span
                  className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#d4ff64]/30 border-t-[#d4ff64]"
                  aria-hidden="true"
                />
              </span>
              <p className="min-w-0 flex-1 font-semibold leading-5">
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
              className="pointer-events-auto flex items-start gap-3 rounded-2xl border bg-[#161915] px-3.5 py-3 text-[13px] text-[#f2eee5] shadow-[0_16px_40px_rgba(0,0,0,0.5)]"
              style={{
                borderColor: notif.type === 'success' ? 'rgba(212,255,100,0.35)' : 'rgba(239,68,68,0.4)',
                animation: 'slideInRight 280ms cubic-bezier(0.16,1,0.3,1) forwards',
              }}
            >
              <span
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                  notif.type === 'success'
                    ? 'border-transparent bg-[#d4ff64] text-[#0b0c0a]'
                    : 'border-red-400/40 bg-red-500/15 text-red-300'
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
                <p className="font-semibold leading-5">
                  {notif.label}
                  <span className="font-normal text-white/50">
                    {notif.type === 'success' ? ' - Generation complete' : ' - Generation failed'}
                  </span>
                </p>
                {notif.type === 'error' && notif.message && (
                  <p className="mt-0.5 line-clamp-2 text-[12px] font-medium leading-4 text-red-300" title={notif.message}>
                    {notif.message}
                  </p>
                )}
                {notif.type === 'success' && (
                  <p className="mt-0.5 text-[12px] leading-4 text-white/50">
                    Your result is ready.
                  </p>
                )}
                {notif.type === 'success' && (
                  <button
                    type="button"
                    onClick={() => handleOpenNotification(notif)}
                    className="mt-1.5 text-[12px] font-bold text-[#d4ff64] transition-colors hover:text-[#e4ff9a]"
                    aria-label={`Open ${notif.label} result`}
                  >
                    Open →
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => dismissNotification(notif.id)}
                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus:ring-1 focus:ring-white/30"
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
      {lowBalanceOpen && creditLevel && <LowBalanceDialog level={creditLevel} balance={balance}
        onTopUp={() => { setLowBalanceOpen(false); setPricingOpen(true); }} onClose={() => setLowBalanceOpen(false)} />}
      <StudioTour open={tourOpen} onClose={() => setTourOpen(false)} activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
}
