'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import AccountMenu from './AccountMenu';
import JobListPanel from './JobListPanel.js';
import AssetsContent from './AssetsContent';
import UsageContent from './UsageContent';
// Default tab is kept static so the first paint of /studio has no loading flash.
import { ImageStudio } from 'studio';

const StudioLoading = () => (
  <div className="h-full w-full bg-black flex items-center justify-center text-white/20">Loading Studio...</div>
);

// The rest are lazy-loaded so they only compile/download when their tab is opened.
const studioLazy = (name) => dynamic(() => import('studio').then(mod => mod[name]), {
  ssr: false,
  loading: StudioLoading,
});

const VideoStudio = studioLazy('VideoStudio');
const ClippingStudio = studioLazy('ClippingStudio');
const VibeMotionStudio = studioLazy('VibeMotionStudio');
const LipSyncStudio = studioLazy('LipSyncStudio');
const RecastStudio = studioLazy('RecastStudio');
const CinemaStudio = studioLazy('CinemaStudio');
const AudioStudio = studioLazy('AudioStudio');
const MarketingStudio = studioLazy('MarketingStudio');
const WorkflowStudio = studioLazy('WorkflowStudio');
const AiInfluencerStudio = studioLazy('AiInfluencerStudio');

const SPITE_URL = process.env.NEXT_PUBLIC_SPITE_URL || '/spite';

const TABS = [
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
    hidden: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13"/>
        <circle cx="6" cy="18" r="3"/>
        <circle cx="18" cy="16" r="3"/>
      </svg>
    )
  },
  {
    id: 'clipping',
    label: 'AI Clipping',
    hidden: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="6" r="3"/>
        <circle cx="6" cy="18" r="3"/>
        <line x1="20" y1="4" x2="8.12" y2="15.88"/>
        <line x1="14.47" y1="14.47" x2="20" y2="20"/>
        <line x1="8.12" y1="8.12" x2="12" y2="12"/>
      </svg>
    )
  },
  {
    id: 'vibe-motion',
    label: 'Vibe Motion',
    hidden: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
      </svg>
    )
  },
  {
    id: 'lipsync',
    label: 'Lip Sync',
    hidden: true,
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
    hidden: true,
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
    hidden: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        <line x1="8" y1="9" x2="16" y2="9"/>
        <line x1="8" y1="13" x2="14" y2="13"/>
      </svg>
    )
  },
  {
    id: 'workflows',
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
    id: 'usage',
    label: 'Usage',
    icon: null,
  },
  {
    id: 'ai-influencer',
    label: 'AI Influencer Studio',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
      </svg>
    )
  }
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
    tabIds: ['video', 'clipping', 'vibe-motion', 'lipsync', 'body-swap', 'marketing'],
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
    if (idFromParams || slug.includes('workflow')) return 'workflows';
    if (initialTab) return initialTab;
    const firstSegment = slug[0];
    if (firstSegment && TABS.find(t => t.id === firstSegment)) return firstSegment;
    return 'image';
  };
  
  const apiKey = null;
  const [authStatus, setAuthStatus] = useState('loading');
  const [activeTab, setActiveTab] = useState(getInitialTab());

  const [balance, setBalance] = useState(null);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [hasMounted, setHasMounted] = useState(false);
  const [showVadooBanner, setShowVadooBanner] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('vadoo_banner_dismissed') !== '1';
    return true;
  });

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
      const tabId = segments[1] || 'image';
      if (TABS.find(t => t.id === tabId)) {
        setActiveTab(tabId);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleTabChange = useCallback((tabId) => {
    window.history.pushState(null, '', `/studio/${tabId}`);
    setActiveTab(tabId);
  }, []);

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
    const isEditingWorkflow = (activeTab === 'workflows' || !!idFromParams) && urlWorkflowId;

    if (isEditingWorkflow) {
      setIsHeaderVisible(false);
    } else {
      setIsHeaderVisible(true);
    }
  }, [activeTab, urlWorkflowId, idFromParams]);

  // Global builder CSS cleanup when switching away from Workflows tab
  useEffect(() => {
    const fromBuilder = sessionStorage.getItem("fromWorkflowBuilder");

    if (fromBuilder && activeTab !== 'workflows') {
      sessionStorage.removeItem("fromWorkflowBuilder");
      window.location.reload();
    }
  }, [activeTab]);


  useEffect(() => {
    let cancelled = false;

    async function restoreSaaSSession() {
      try {
        const sessionResponse = await fetch('/api/auth/session', { credentials: 'include' });
        const session = await sessionResponse.json();
        if (!session.authenticated) {
          if (!cancelled) router.replace('/login');
          return;
        }
        const workspaceResponse = await fetch('/api/workspaces', { credentials: 'include' });
        const workspacePayload = await workspaceResponse.json();
        const workspace = workspacePayload.workspaces?.[0];
        if (workspace?.id && typeof window !== 'undefined') {
          window.sessionStorage.setItem('nexoclip_workspace_id', workspace.id);
          await refreshBalance();
        }
        if (!cancelled) setAuthStatus('authenticated');
      } catch {
        if (!cancelled) router.replace('/login');
      }
    }

    setHasMounted(true);
    restoreSaaSSession();
    return () => { cancelled = true; };
  }, [router, refreshBalance]);


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

  if (authStatus === 'loading') {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="animate-spin text-[#22d3ee] text-3xl">◌</div>
      </div>
    );
  }

  if (authStatus !== 'authenticated') return null;

  return (
    <div 
      className="nexoclip-studio-shell h-screen bg-[#FFF6DE] flex flex-col overflow-hidden text-[#110C2A] relative"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag Overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-[100] bg-[#A175FF]/10 backdrop-blur-md border-4 border-dashed border-[#A175FF]/50 flex items-center justify-center pointer-events-none transition-all duration-300">
          <div className="bg-white/90 p-8 rounded-[32px] border border-white shadow-2xl flex flex-col items-center gap-4 scale-110 animate-pulse">
            <div className="w-20 h-20 bg-[#A175FF] rounded-[24px] flex items-center justify-center">
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

      {/* Vadoo promo banner */}
      {showVadooBanner && (
        <div className="flex-shrink-0 w-full bg-indigo-600 flex items-center justify-center px-4 py-2 gap-3 relative z-50">
          <a
            href="https://vadoo.tv"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] font-bold text-white hover:opacity-80 transition-opacity text-center"
          >
            Unrestricted AI Images &amp; Videos → Auto-Publish as YouTube Shorts &amp; TikToks, Earn ↗
          </a>
          <button
            onClick={() => {
              setShowVadooBanner(false);
              localStorage.setItem('vadoo_banner_dismissed', '1');
            }}
            className="absolute right-3 text-white/60 hover:text-white transition-colors text-lg leading-none"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      {isHeaderVisible && (
        <header className="flex-shrink-0 h-16 border-b border-[#110C2A]/[0.08] flex items-center justify-between px-4 bg-[#FFF6DE]/90 backdrop-blur-xl z-50 gap-4">
          {/* Left: Mobile menu toggle + Logo + Desktop Sidebar Toggle */}
          <div className="flex items-center gap-3">
            {/* Mobile drawer toggle */}
            <button
              onClick={() => setIsMobileOpen(!isMobileOpen)}
              className="md:hidden p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors"
              aria-label="Toggle Navigation Menu"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            {/* Desktop Sidebar Toggle Button (Single Toggle Button) */}
            <div className="hidden md:block relative group">
              <button
                onClick={toggleSidebar}
                className="flex items-center justify-center w-9 h-9 rounded-full bg-[#110C2A]/[0.05] hover:bg-[#A175FF]/15 text-[#110C2A]/60 hover:text-[#110C2A] transition-colors border border-[#110C2A]/[0.08]"
                aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={`transition-transform duration-300 ${isSidebarCollapsed ? 'rotate-180' : ''}`}
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M9 3v18" />
                  <path d="M14 9l-3 3 3 3" />
                </svg>
              </button>
              {/* Custom Tooltip */}
              <div className="absolute left-0 top-full mt-2 px-2.5 py-1 bg-[#121215]/95 backdrop-blur-md text-white text-[11px] font-medium rounded-md shadow-2xl border border-white/15 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 whitespace-nowrap">
                {isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              </div>
            </div>

            {/* Logo & Title */}
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-[#A175FF] rounded-[14px] flex items-center justify-center shadow-lg shadow-[#A175FF]/25">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
              </div>
              <span className="text-sm font-bold tracking-tight hidden sm:block text-white">
                Nexoclip
              </span>
            </div>
          </div>

          {/* Active Tab Breadcrumb Badge */}
          <div className="hidden lg:flex items-center gap-2 px-4 py-2 rounded-full bg-white/70 border border-[#110C2A]/[0.08] text-xs text-[#110C2A]/60 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22d3ee]" />
            <span className="font-medium text-white/80">
              {TABS.find(t => t.id === activeTab)?.label || 'Studio'}
            </span>
          </div>

          {/* Right: Actions */}
          <div className="flex-shrink-0 flex items-center gap-3">
            <button onClick={() => handleTabChange('usage')} className="flex items-center gap-2.5 bg-white/5 px-3 py-1.5 rounded-full border border-white/5 transition-colors hover:bg-white/10" aria-label="View credit usage">
              <span className="text-[#A175FF]">◈</span>
              <span className="text-xs font-bold text-[#110C2A]/90">{balance !== null ? `${Number(balance).toLocaleString()} credits` : 'Credits unavailable'}</span>
            </button>

            <JobListPanel />
            <AccountMenu />
          </div>
        </header>
      )}

      {/* Main Body Layout: Left Sidebar + Studio Content Area */}
      <div className="flex-1 min-h-0 flex relative overflow-hidden">
        {/* Mobile Backdrop Overlay */}
        {isMobileOpen && (
          <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 md:hidden animate-fade-in"
            onClick={() => setIsMobileOpen(false)}
          />
        )}

        {/* Left Sidebar Navigation */}
        {isHeaderVisible && (
          <aside
            className={`
              fixed top-16 bottom-0 left-0 md:static md:h-full z-30 bg-[#FCEED1]/95 backdrop-blur-xl border-r border-[#110C2A]/[0.08] flex flex-col transition-all duration-300 ease-in-out flex-shrink-0 select-none
              ${isMobileOpen ? 'translate-x-0 w-60 z-50' : '-translate-x-full md:translate-x-0'}
              ${isSidebarCollapsed ? 'md:w-16' : 'md:w-52'}
            `}
          >
            <nav aria-label="Studio navigation" className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none py-3 px-2">
              {(() => {
                const isCollapsed = isSidebarCollapsed && !isMobileOpen;

                // One row = one studio. Shared between the grouped list and the footer links.
                const renderStudioItem = (tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <a
                      key={tab.id}
                      href={`/studio/${tab.id}`}
                      onClick={(event) => handleNavigationItemClick(event, tab.id)}
                      aria-current={isActive ? 'page' : undefined}
                      aria-label={tab.label}
                      title={isCollapsed ? tab.label : undefined}
                      className={`
                        group relative flex items-center rounded-lg transition-colors duration-150
                        ${isCollapsed ? 'h-10 w-10 justify-center mx-auto' : 'gap-3 px-2.5 py-2 text-[13px] font-medium'}
                        ${isActive
                          ? 'bg-white/[0.07] text-[#22d3ee]'
                          : 'text-white/55 hover:text-white hover:bg-white/[0.04]'
                        }
                      `}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-[#22d3ee]" aria-hidden="true" />
                      )}
                      <span className={`flex-shrink-0 ${isActive ? 'text-[#22d3ee]' : 'text-white/45 group-hover:text-white/80'}`}>
                        {tab.icon}
                      </span>
                      {!isCollapsed && <span className="truncate">{tab.label}</span>}
                    </a>
                  );
                };

                return (
                  <>
                    <div className={`space-y-0.5 ${isCollapsed ? 'mb-1' : 'mb-3 pb-3 border-b border-white/[0.06]'}`}>
                      {(() => {
                        const canvasTab = TABS.find((item) => item.id === 'workflows');
                        if (!canvasTab) return null;
                        return (
                          <a
                            href={SPITE_URL}
                            aria-label={canvasTab.label}
                            title={isCollapsed ? canvasTab.label : undefined}
                            className={`
                              group relative flex items-center rounded-lg text-white/55 transition-colors duration-150 hover:bg-white/[0.04] hover:text-white
                              ${isCollapsed ? 'h-10 w-10 justify-center mx-auto' : 'gap-3 px-2.5 py-2 text-[13px] font-medium'}
                            `}
                          >
                            <span className="flex-shrink-0 text-white/45 group-hover:text-white/80">
                              {canvasTab.icon}
                            </span>
                            {!isCollapsed && <span className="truncate">{canvasTab.label}</span>}
                          </a>
                        );
                      })()}
                    </div>

                    <a
                      href="/studio/assets"
                      onClick={(event) => handleNavigationItemClick(event, 'assets')}
                      aria-label="Assets"
                      title={isCollapsed ? 'Assets' : undefined}
                      className={`group relative mb-3 flex items-center rounded-lg border-b border-white/[0.06] pb-3 text-white/55 transition-colors duration-150 hover:bg-white/[0.04] hover:text-white ${
                        isCollapsed ? 'h-10 w-10 justify-center mx-auto' : 'gap-3 px-2.5 py-2 text-[13px] font-medium'
                      }`}
                    >
                      <span className="flex-shrink-0 text-white/45 group-hover:text-cyan-300">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <path d="m21 15-5-5L5 21" />
                        </svg>
                      </span>
                      {!isCollapsed && <span className="truncate">Assets</span>}
                    </a>

                    {NAVIGATION_CATEGORIES.map((category) => {
                      const visibleTabs = category.tabIds
                        .map((tabId) => TABS.find((item) => item.id === tabId))
                        .filter((tab) => tab && !tab.hidden);
                      if (visibleTabs.length === 0) return null;
                      return (
                        <div key={category.id} className={isCollapsed ? 'mb-1' : 'mb-4'}>
                          {!isCollapsed && (
                            <p className="px-2.5 mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">
                              {category.label}
                            </p>
                          )}
                          <div className="space-y-0.5">
                            {visibleTabs.map((tab) => renderStudioItem(tab))}
                          </div>
                        </div>
                      );
                    })}
                  </>
                );
              })()}
            </nav>
          </aside>
        )}

        {/* Studio Content */}
        <div className="flex-1 min-h-0 h-full relative overflow-hidden bg-[#FCEED1]">
        {activeTab === 'usage' ? <UsageContent workspaceId={typeof window !== 'undefined' ? window.sessionStorage.getItem('nexoclip_workspace_id') : null} onBalanceChange={setBalance} /> : activeTab === 'assets' ? <div className="h-full w-full overflow-auto"><AssetsContent /></div> : <div className={activeTab === 'image' ? "h-full w-full" : "hidden"}>
          <ImageStudio apiKey={apiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationStart={makeGenerationStartCallback('image')} onGenerationEnd={makeGenerationEndCallback('image')} onGenerationComplete={makeSuccessCallback('image')} onGenerationError={makeErrorCallback('image')} />
        </div>}
        {activeTab === 'video' && (
          <div className="h-full w-full">
            <VideoStudio apiKey={apiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationStart={makeGenerationStartCallback('video')} onGenerationEnd={makeGenerationEndCallback('video')} onGenerationComplete={makeSuccessCallback('video')} onGenerationError={makeErrorCallback('video')} />
          </div>
        )}
        {activeTab === 'clipping' && (
          <div className="h-full w-full">
            <ClippingStudio apiKey={apiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationStart={makeGenerationStartCallback('clipping')} onGenerationEnd={makeGenerationEndCallback('clipping')} onGenerationComplete={makeSuccessCallback('clipping')} onGenerationError={makeErrorCallback('clipping')} />
          </div>
        )}
        {activeTab === 'vibe-motion' && (
          <div className="h-full w-full">
            <VibeMotionStudio apiKey={apiKey} onGenerationStart={makeGenerationStartCallback('vibe-motion')} onGenerationEnd={makeGenerationEndCallback('vibe-motion')} onGenerationComplete={makeSuccessCallback('vibe-motion')} onGenerationError={makeErrorCallback('vibe-motion')} />
          </div>
        )}
        {activeTab === 'lipsync' && (
          <div className="h-full w-full">
            <LipSyncStudio apiKey={apiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationStart={makeGenerationStartCallback('lipsync')} onGenerationEnd={makeGenerationEndCallback('lipsync')} onGenerationComplete={makeSuccessCallback('lipsync')} onGenerationError={makeErrorCallback('lipsync')} />
          </div>
        )}
        {activeTab === 'body-swap' && (
          <div className="h-full w-full">
            <RecastStudio apiKey={apiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationStart={makeGenerationStartCallback('body-swap')} onGenerationEnd={makeGenerationEndCallback('body-swap')} onGenerationComplete={makeSuccessCallback('body-swap')} onGenerationError={makeErrorCallback('body-swap')} />
          </div>
        )}
        {activeTab === 'cinema' && (
          <div className="h-full w-full">
            <CinemaStudio apiKey={apiKey} onGenerationStart={makeGenerationStartCallback('cinema')} onGenerationEnd={makeGenerationEndCallback('cinema')} onGenerationComplete={makeSuccessCallback('cinema')} onGenerationError={makeErrorCallback('cinema')} />
          </div>
        )}
        {activeTab === 'audio' && (
          <div className="h-full w-full">
            <AudioStudio apiKey={apiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationStart={makeGenerationStartCallback('audio')} onGenerationEnd={makeGenerationEndCallback('audio')} onGenerationComplete={makeSuccessCallback('audio')} onGenerationError={makeErrorCallback('audio')} />
          </div>
        )}
        {activeTab === 'marketing' && (
          <div className="h-full w-full">
            <MarketingStudio apiKey={apiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationStart={makeGenerationStartCallback('marketing')} onGenerationEnd={makeGenerationEndCallback('marketing')} onGenerationComplete={makeSuccessCallback('marketing')} onGenerationError={makeErrorCallback('marketing')} />
          </div>
        )}
        {activeTab === 'workflows' && (
          <div className="h-full w-full">
            <WorkflowStudio
              apiKey={apiKey}
              isHeaderVisible={isHeaderVisible}
              onToggleHeader={setIsHeaderVisible}
              onGenerationStart={makeGenerationStartCallback('workflows')}
              onGenerationEnd={makeGenerationEndCallback('workflows')}
              onGenerationComplete={makeSuccessCallback('workflows')}
              onGenerationError={makeErrorCallback('workflows')}
            />
          </div>
        )}
        {activeTab === 'ai-influencer' && (
          <div className="h-full w-full">
            <AiInfluencerStudio
              apiKey={apiKey}
              onGenerationStart={makeGenerationStartCallback('ai-influencer')}
              onGenerationEnd={makeGenerationEndCallback('ai-influencer')}
              onGenerationComplete={makeSuccessCallback('ai-influencer')}
              onGenerationError={makeErrorCallback('ai-influencer')}
            />
          </div>
        )}
      </div>
    </div>

      {/* Global generation activity and notification stack */}
      {(activeGenerations.length > 0 || notifications.length > 0) && (
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

    </div>
  );
}
