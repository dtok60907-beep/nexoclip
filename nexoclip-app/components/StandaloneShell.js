'use client';

import { motion } from 'motion/react';
import { NxIcon } from './ui/nx-icon';
import { NxBrandLoader, NxDirectorSkeleton, NxProfileBadgeSkeleton, NxStudioSkeleton } from './ui/nx-loading';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import AccountMenu from './AccountMenu';
import JobListPanel from './JobListPanel.js';
import UsageContent from './UsageContent';
import BillingContent, { ENTERPRISE_WHATSAPP_URL } from './BillingContent';
import SettingsContent from './SettingsContent';
import BrandKitContent from './BrandKitContent';
import BrandAnalyzeToast from './BrandAnalyzeToast';
import PricingModal from './PricingModal';
import { PromoBanner, usePlanStatus } from './PlanStatus';
import LowBalanceDialog from './LowBalanceDialog';
import { lowBalanceLevel, nextLowBalanceDialog } from '../src/lib/lowBalance.js';
import StudioTour from './tour/StudioTour';
import { getFeatureTips } from './tour/featureTips';
import {
  ArrowLeft,
  Building2,
  Check,
  CircleDot,
  Clapperboard,
  Crown,
  Film,
  Image as ImageIcon,
  Images,
  Layers,
  LayoutGrid,
  LayoutTemplate,
  Lightbulb,
  Package,
  Plus,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  UserRound,
  Users,
  Video,
  Workflow,
  X as CloseIcon,
} from 'lucide-react';
import StudioHome from './StudioHome';
import AppsHub from './AppsHub';
import TemplatesHub from './TemplatesHub';
import ProductsLibrary from './ProductsLibrary';
import CreateQuickModal from './CreateQuickModal';
import GetStartedPopover from './GetStartedPopover';
import useDashboardData from './useDashboardData';
import GenerationProject from './GenerationProject';
import ProjectLibrary from './ProjectLibrary';
import WorkspaceOnboarding from './WorkspaceOnboarding';
import WorkspaceLibrary from './WorkspaceLibrary';
import StudioAuthModal from './saas/StudioAuthModal';
import TikTokPublishDialog from './TikTokPublishDialog';
import SocialPublishing from './SocialPublishing';
import MetaAdsManager from './MetaAdsManager';
import IntegrationApps from './IntegrationApps';
// All heavy studio workspaces are lazy-loaded so /studio/home boots instantly without compiling studio bundles.
const createStudioLoader = (label, variant = 'split') => function LazyStudioSkeleton() {
  return <NxStudioSkeleton label={label} variant={variant} />;
};

const DirectorLoading = () => <NxDirectorSkeleton label="Loading AI Creative Marketing" surface="light" variant="full" />;

const ComingSoon = ({ title }) => (
  <div className="h-full w-full bg-white text-[#292733] flex items-center justify-center text-center px-6">
    <div>
      <div className="text-xs uppercase tracking-widest text-slate-500 mb-3">Coming Soon</div>
      <h2 className="text-2xl font-semibold text-slate-900 mb-2">{title}</h2>
      <p className="text-slate-500 max-w-md mx-auto">We&apos;re putting the finishing touches on this studio. Check back soon.</p>
    </div>
  </div>
);

// Lazy-loaded studio workspaces so they only compile/download when their tab is opened.
const studioLazy = (name, label, variant = 'split') => dynamic(() => import('studio').then(mod => mod[name]), {
  ssr: false,
  loading: createStudioLoader(label, variant),
});

const ImageStudio = studioLazy('ImageStudio', 'Loading Image Studio', 'canvas');

const VideoStudio = studioLazy('VideoStudio', 'Loading Video Studio', 'canvas');
const VibeMotionStudio = studioLazy('VibeMotionStudio', 'Loading Vibe Motion', 'canvas');
const CinemaStudio = studioLazy('CinemaStudio', 'Loading Cinema Studio', 'canvas');
const AudioStudio = studioLazy('AudioStudio', 'Loading Audio Studio', 'canvas');
const MarketingStudio = studioLazy('MarketingStudio', 'Loading Marketing Studio', 'canvas');
const AiInfluencerStudio = studioLazy('AiInfluencerStudio', 'Loading AI Influencer Studio', 'split');
const DirectorApp = dynamic(() => import('./marketing/CreativeMarketingApp.js'), { ssr: false, loading: DirectorLoading });
const DotGrid = dynamic(() => import('./ui/DotGrid'), { ssr: false });

const PENDING_PROMPT_KEY = 'nexoclip_pending_director_prompt';
const LANDING_URL = 'https://www.nexoclip.com';


const SPITE_URL = process.env.NEXT_PUBLIC_SPITE_URL || '/spite';

const sidebarIcons = {
  'home': 'home',
  'apps': 'apps',
  'projects': 'projects',
  'media': 'media',
  'director': 'director',
  'canvas': 'canvas',
  'video': 'video',
  'image': 'image',
  'cinema': 'cinema',
  'ai-influencer': 'ai-influencer',
  'publish': 'publish',
  'ads': 'ads',
  'accounts': 'accounts',
  'usage': 'usage',
  'analytics': 'analytics',
  'settings': 'settings',
  'brand-kit': 'settings',
};

function RailGlyph({ id }) {
  switch (id) {
    case 'team':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" className="nx-rail-svg" aria-hidden="true">
          <path data-tone="fill" d="M5 20V5.5A1.5 1.5 0 0 1 6.5 4h7A1.5 1.5 0 0 1 15 5.5V20" stroke="currentColor" strokeWidth="1.75" />
          <path data-tone="fill" d="M15 10h3.5A1.5 1.5 0 0 1 20 11.5V20" stroke="currentColor" strokeWidth="1.75" />
          <path data-tone="stroke" d="M3 20h18M8.5 8h3M8.5 12h3M8.5 16h3" stroke="currentColor" strokeWidth="1.75" />
        </svg>
      );
    case 'home':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" className="nx-rail-svg" aria-hidden="true">
          <path data-tone="fill" d="M4.5 10.2 12 3.8l7.5 6.4V19a1.8 1.8 0 0 1-1.8 1.8H6.3A1.8 1.8 0 0 1 4.5 19v-8.8Z" stroke="currentColor" strokeWidth="1.75" />
          <path data-tone="stroke" d="M9.8 20.8v-5.3a1.2 1.2 0 0 1 1.2-1.2h2a1.2 1.2 0 0 1 1.2 1.2v5.3" stroke="currentColor" strokeWidth="1.75" />
          <path data-tone="stroke" d="M2.8 10.6 12 3l9.2 7.6" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    case 'create':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" className="nx-rail-svg" aria-hidden="true">
          <circle data-tone="fill" cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.75" />
          <path data-tone="stroke" d="M12 8.2v7.6M8.2 12h7.6" stroke="currentColor" strokeWidth="1.9" />
        </svg>
      );
    case 'director':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" className="nx-rail-svg" aria-hidden="true">
          <path data-tone="fill" d="M6 5.5 17 12 6 18.5V5.5z" stroke="currentColor" strokeWidth="1.75" />
          <path data-tone="stroke" d="M19 4v3.5M17.25 5.75h3.5" stroke="currentColor" strokeWidth="1.85" />
        </svg>
      );
    case 'apps':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" className="nx-rail-svg" aria-hidden="true">
          <rect data-tone="fill" x="3.5" y="3.5" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.75" />
          <rect data-tone="fill" x="13.5" y="3.5" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.75" />
          <rect data-tone="fill" x="3.5" y="13.5" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.75" />
          <rect data-tone="fill" x="13.5" y="13.5" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.75" />
        </svg>
      );
    case 'projects':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" className="nx-rail-svg" aria-hidden="true">
          <path data-tone="fill" d="M3.5 7.5a2 2 0 0 1 2-2h4.1l1.9 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-10z" stroke="currentColor" strokeWidth="1.75" />
        </svg>
      );
    case 'library':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" className="nx-rail-svg" aria-hidden="true">
          <path data-tone="fill" d="M5 7.5A2 2 0 0 1 7 5.5h10a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-11Z" stroke="currentColor" strokeWidth="1.75" />
          <path data-tone="stroke" d="M8.5 5.5V4a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v1.5" stroke="currentColor" strokeWidth="1.65" />
          <path data-tone="stroke" d="M9.5 11.5a2.5 2.5 0 0 0 5 0" stroke="currentColor" strokeWidth="1.75" />
        </svg>
      );
    case 'brand-kit':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" className="nx-rail-svg" aria-hidden="true">
          <path data-tone="fill" d="m11.5 6.8 4.4-1.2a1.5 1.5 0 0 1 1.9 1.1l1.8 7.3a1.5 1.5 0 0 1-1.1 1.8L11.5 17.6" stroke="currentColor" strokeWidth="1.7" />
          <path data-tone="fill" d="M4.5 5.5A1.5 1.5 0 0 1 6 4h4.5A1.5 1.5 0 0 1 12 5.5v13a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5v-13z" stroke="currentColor" strokeWidth="1.75" />
          <circle cx="8.25" cy="16.4" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'accounts':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" className="nx-rail-svg" aria-hidden="true">
          <path data-tone="stroke" d="M9.5 6.5V3.5M14.5 6.5V3.5" stroke="currentColor" strokeWidth="1.8" />
          <path data-tone="fill" d="M7 6.5h10v4a5 5 0 0 1-10 0v-4Z" stroke="currentColor" strokeWidth="1.75" />
          <path data-tone="stroke" d="M12 15.5v4a1.5 1.5 0 0 0 1.5 1.5H16" stroke="currentColor" strokeWidth="1.75" />
        </svg>
      );
    default:
      return <NxIcon name={id} size={17} />;
  }
}
const TABS = [
  { id: 'team', label: 'Workspace', hidden: true, icon: <Building2 size={18} /> },
  { id: 'projects', label: 'Projects', icon: <NxIcon name="projects" size={18} /> },
  { id: 'accounts', label: 'Integrations', icon: <NxIcon name="accounts" size={18} /> },
  { id: 'media', label: 'Media Library', icon: <NxIcon name="media" size={18} /> },
  { id: 'templates', label: 'Templates', icon: <NxIcon name="apps" size={18} /> },
  { id: 'products', label: 'Products', icon: <NxIcon name="projects" size={18} /> },
  { id: 'home', label: 'Home', icon: <NxIcon name="home" size={18} /> },
  { id: 'apps', label: 'Apps', icon: <NxIcon name="apps" size={18} /> },
  { id: 'image', label: 'Image Studio', icon: <NxIcon name="image" size={18} /> },
  { id: 'video', label: 'Video Studio', icon: <NxIcon name="video" size={18} /> },
  { id: 'audio', label: 'Audio Studio', hidden: true, icon: <NxIcon name="audio" size={18} /> },
  { id: 'vibe-motion', label: 'Vibe Motion', hidden: true, icon: <NxIcon name="vibe-motion" size={18} /> },
  { id: 'lipsync', label: 'Lip Sync', icon: <NxIcon name="lipsync" size={18} /> },
  { id: 'body-swap', label: 'Body Swap', icon: <NxIcon name="body-swap" size={18} /> },
  { id: 'cinema', label: 'Cinema Studio', icon: <NxIcon name="cinema" size={18} /> },
  { id: 'marketing', label: 'Marketing Studio', icon: <NxIcon name="marketing" size={18} /> },
  { id: 'canvas', label: 'Canvas', icon: <NxIcon name="canvas" size={18} /> },
  { id: 'director', label: 'AI Creative Marketing', icon: <NxIcon name="director" size={18} /> },
  { id: 'billing', label: 'Top Up', icon: <NxIcon name="billing" size={18} /> },
  { id: 'usage', label: 'Usage', icon: <NxIcon name="usage" size={18} /> },
  { id: 'brand-kit', label: 'Brand Kit', icon: <NxIcon name="settings" size={18} /> },
  { id: 'settings', label: 'Settings', icon: <NxIcon name="settings" size={18} /> },
  { id: 'ads', label: 'Ads Manager', hidden: true, icon: <NxIcon name="ads" size={18} /> },
  { id: 'publish', label: 'Social Publishing', hidden: true, icon: <NxIcon name="publish" size={18} /> },
  { id: 'ai-influencer', label: 'AI Influencer Studio', icon: <NxIcon name="ai-influencer" size={18} /> },
];

// The header's page title for each tab (sidebar labels where they differ from TABS).
const TAB_TITLES = { home: 'Home', apps: 'Apps', image: 'Image', video: 'Video', cinema: 'World', 'ai-influencer': 'Character', audio: 'Audio', director: 'AI Creative Marketing', billing: 'Top up', usage: 'Usage', 'brand-kit': 'Brand Kit', settings: 'Settings', accounts: 'Integration Apps', canvas: 'Canvas' };

const LIBRARY_TAB_IDS = new Set(['templates', 'products', 'media']);

const APPS_EXT_NAV = [
  { id: 'apps', label: 'All Apps', group: 'overview', icon: LayoutGrid },
  { id: 'director', label: 'AI Creative Marketing', group: 'studios', icon: Clapperboard },
  { id: 'canvas', label: 'Canvas Filmmaking', group: 'studios', icon: Workflow },
  { id: 'ai-influencer', label: 'AI Influencer', group: 'classic', icon: UserRound },
  { id: 'video', label: 'Video Studio', group: 'classic', icon: Video },
  { id: 'image', label: 'Image Studio', group: 'classic', icon: ImageIcon },
];

const LIBRARY_EXT_NAV = [
  { id: 'templates', label: 'Templates', group: 'library', icon: LayoutTemplate },
  { id: 'products', label: 'Products', group: 'library', icon: Package },
  { id: 'media', label: 'Media Library', group: 'library', icon: Images },
];

const WORKSPACE_EXT_NAV = [
  { id: 'team', view: 'switch', label: 'Switch Workspace', group: 'workspace', icon: Layers },
  { id: 'team/members', view: 'manage', label: 'Team Members', group: 'workspace', icon: Users },
  { id: 'team/new', view: 'new', label: 'New Workspace', group: 'workspace', icon: Plus },
];

const TAB_URL_SLUG = {
  director: 'marketing',
};

const URL_SLUG_TO_TAB = {
  marketing: 'director',
  director: 'director',
};

const normalizeSlugToTab = (seg) => URL_SLUG_TO_TAB[seg] || seg;

const tabToUrlPath = (destination) => {
  const [tabId, ...rest] = String(destination || '').split('/');
  const mapped = TAB_URL_SLUG[tabId] || tabId;
  return `/studio/${[mapped, ...rest].filter(Boolean).join('/')}`;
};

const parseTeamSubView = (pathValue) => {
  const seg = (pathValue || '').split('/')[3];
  if (seg === 'new') return 'new';
  if (seg === 'members') return 'manage';
  return 'switch';
};

const getDefaultExtSidebar = (tabId) => {
  if (tabId === 'team') return 'team';
  if (tabId === 'apps') return 'apps';
  if (LIBRARY_TAB_IDS.has(tabId)) return 'library';
  return null;
};

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
  const pathname = usePathname();
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
    if (initialTab) return normalizeSlugToTab(initialTab);
    const firstSegment = normalizeSlugToTab(slug[0]);
    if (firstSegment && TABS.find(t => t.id === firstSegment)) return firstSegment;
    return 'home';
  };
  
  const apiKey = null;
  const [authStatus, setAuthStatus] = useState('loading');
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authError, setAuthError] = useState('');
  const [pricingModalTab, setPricingModalTab] = useState(null);
  const pricingOpen = pricingModalTab !== null;
  const openPricingModal = useCallback((tab = 'plans') => setPricingModalTab(tab), []);
  const closePricingModal = useCallback(() => setPricingModalTab(null), []);
  const pricingAfterAuth = useRef(null);
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
  const requestPricingAuth = useCallback((tab = 'plans') => {
    pricingAfterAuth.current = tab || pricingModalTab || 'plans';
    setPricingModalTab(null);
    openAuth('login');
  }, [openAuth, pricingModalTab]);
  const finishAuthentication = useCallback(async (result) => {
    const response = await fetch('/api/workspaces', { credentials: 'include', cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load your workspace. Please try signing in again.');
    const payload = await response.json();
    const workspaces = Array.isArray(payload.workspaces) ? payload.workspaces : [];
    const workspace = workspaces[0];
    if (!workspace?.id) throw new Error('No workspace is available for this account.');
    setUserWorkspaces(workspaces);
    window.sessionStorage.setItem('nexoclip_workspace_id', workspace.id);
    window.sessionStorage.setItem('nexoclip_workspace_name', workspace.name);
    setAuthStatus('authenticated');
    setSessionVersion(version => version + 1);
    setAuthOpen(false);
    setAuthError('');
    if (pricingAfterAuth.current) {
      const nextModalTab = pricingAfterAuth.current;
      pricingAfterAuth.current = null;
      setPricingModalTab(nextModalTab);
    }
    if (result?.user?.isPlatformOperator) {
      router.push('/admin/economics');
    } else if (authReturnTo.current && authReturnTo.current !== '/studio/home') {
      const targetPath = authReturnTo.current;
      const match = targetPath.match(/^\/studio\/([^/?#]+)/);
      const matchedTab = match ? normalizeSlugToTab(match[1]) : null;
      if (matchedTab && TABS.some((t) => t.id === matchedTab)) {
        const nextTab = matchedTab;
        if (nextTab === 'image') setImageVisited(true);
        setActiveTab(nextTab);
        window.history.pushState(null, '', tabToUrlPath(nextTab));
      } else {
        router.push(targetPath);
      }
    }
    authReturnTo.current = '/studio/home';
  }, [router]);
  const [activeTab, setActiveTab] = useState(getInitialTab());
  const [teamSubView, setTeamSubView] = useState(() => parseTeamSubView(pathname));
  const [userWorkspaces, setUserWorkspaces] = useState([]);
  const [switchingWorkspaceId, setSwitchingWorkspaceId] = useState(null);
  const [extSidebar, setExtSidebar] = useState(() => getDefaultExtSidebar(getInitialTab()));
  const [extSidebarSearch, setExtSidebarSearch] = useState('');
  const [directorHeroActive, setDirectorHeroActive] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [getStartedOpen, setGetStartedOpen] = useState(false);
  const [imageVisited, setImageVisited] = useState(() => getInitialTab() === 'image');
  const [directorVisited, setDirectorVisited] = useState(() => getInitialTab() === 'director');
  useEffect(() => {
    if (activeTab === 'director') setDirectorVisited(true);
  }, [activeTab]);
  const [homeSelection, setHomeSelection] = useState(null);
  const [studioPrompt, setStudioPrompt] = useState('');
  const [tiktokVideo, setTiktokVideo] = useState(null);

  const [balance, setBalance] = useState(null);
  const [lowBalanceOpen, setLowBalanceOpen] = useState(false);
  const creditLevel = lowBalanceLevel(balance);
  const planStatus = usePlanStatus(authStatus, `${sessionVersion}:${pricingOpen}`);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourMode, setTourMode] = useState('tips');
  const openFeatureTips = useCallback(() => {
    setTourMode('tips');
    setTourOpen(true);
  }, []);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);

  const [hasMounted, setHasMounted] = useState(false);
  const [featureSearch, setFeatureSearch] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const dashboardData = useDashboardData(authStatus);

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
    if (['video', 'cinema', 'ai-influencer'].includes(tabId)) window.dispatchEvent(new Event('nexoclip:project-changed'));
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
      const tabId = normalizeSlugToTab(segments[1] || 'home');
      if (TABS.find(t => t.id === tabId)) {
        if (tabId === 'image') setImageVisited(true);
        if (tabId === 'team') setTeamSubView(parseTeamSubView(path));
        setActiveTab(tabId);
        setExtSidebar(getDefaultExtSidebar(tabId));
        setExtSidebarSearch('');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Canonicalize legacy /studio/director URL to /studio/marketing
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.pathname === '/studio/director') {
      window.history.replaceState(window.history.state, '', `/studio/marketing${window.location.search}${window.location.hash}`);
    }
  }, []);

  // Resolve embedded Canvas iframe URL so /studio/canvas?project=<id>&marketingSeed=... opens the exact project inside Studio
  const resolveCanvasIframeSrc = useCallback(() => {
    if (typeof window === 'undefined') return '/canvas?embedded=canvas';
    const params = new URLSearchParams(window.location.search);
    const projectId = (params.get('project') || '').trim();
    if (projectId && /^[a-zA-Z0-9_-]{4,100}$/.test(projectId)) {
      const fwd = new URLSearchParams({ embedded: 'canvas' });
      for (const key of ['marketingSeed', 'marketingApprovalSeed', 'marketingWorkspace']) {
        const val = params.get(key);
        if (val) fwd.set(key, val);
      }
      return `/canvas/project/${encodeURIComponent(projectId)}?${fwd.toString()}`;
    }
    return '/canvas?embedded=canvas';
  }, []);

  const [canvasIframeSrc, setCanvasIframeSrc] = useState(null);

  useEffect(() => {
    setCanvasIframeSrc(resolveCanvasIframeSrc());
  }, [resolveCanvasIframeSrc, pathname]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'nx-canvas-back') {
        if (window.location.pathname.startsWith('/studio/canvas') && window.location.search) {
          window.history.replaceState(null, '', '/studio/canvas');
        }
        setCanvasIframeSrc('/canvas?embedded=canvas');
      }
    };
    const onPop = () => {
      if (window.location.pathname.startsWith('/studio/canvas')) {
        setCanvasIframeSrc(resolveCanvasIframeSrc());
      }
    };
    window.addEventListener('message', onMessage);
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('popstate', onPop);
    };
  }, [resolveCanvasIframeSrc]);

  useEffect(() => {
    if (pathname?.startsWith('/studio/team')) {
      setTeamSubView(parseTeamSubView(pathname));
    }
  }, [pathname]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('tour') !== '1') return;
    url.searchParams.delete('tour');
    window.history.replaceState(null, '', url.pathname + url.search);
    setTourMode('tour');
    setTourOpen(true);
  }, []);

  const handleTabChange = useCallback((destination, prompt = '') => {
    const [rawTabId, subSegment] = destination.split('/');
    const tabId = normalizeSlugToTab(rawTabId);
    window.history.pushState(null, '', tabToUrlPath(destination));
    if (tabId === 'projects') setSelectedProject(prompt);
    else if (typeof prompt === 'string' && prompt.trim()) setStudioPrompt(prompt.trim());
    if (tabId === 'image') setImageVisited(true);
    if (tabId === 'team') {
      setTeamSubView(subSegment === 'new' ? 'new' : subSegment === 'members' ? 'manage' : 'switch');
    }
    setActiveTab(tabId);
    setExtSidebar(getDefaultExtSidebar(tabId));
    setExtSidebarSearch('');
  }, []);

  // A brief handed over from the landing page (/studio/marketing?prompt=…) opens AI Creative Marketing
  const handleHomeCreate = useCallback(async (tabId, prompt, files, modelId) => {
    if (!requireAuth()) {
      authReturnTo.current = tabToUrlPath(tabId);
      return false;
    }
    if (files.length && !['image', 'video'].includes(tabId)) throw new Error('This studio does not accept references here.');
    // Load the destination before leaving the draft; failures remain recoverable in the composer.
    if (tabId === 'director') await import('./marketing/CreativeMarketingApp.js');
    else await import('studio');
    setStudioPrompt(prompt);
    setHomeSelection({ tabId, modelId });
    setDroppedFiles(files.length ? files : null);
    handleTabChange(tabId, prompt);
    return true;
  }, [handleTabChange, requireAuth]);

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

  const handleRailSectionClick = (event, section) => {
    if (!(event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey)) {
      return;
    }
    event.preventDefault();
    if (section === 'team') {
      if (currentTab === 'team' && extSidebar === 'team') {
        setExtSidebar(null);
      } else {
        setExtSidebarSearch('');
        if (currentTab !== 'team') {
          handleTabChange('team');
        }
        setExtSidebar('team');
      }
      return;
    }
    if (section === 'apps') {
      if (currentTab === 'apps' && extSidebar === 'apps') {
        setExtSidebar(null);
      } else {
        setExtSidebarSearch('');
        if (currentTab !== 'apps') {
          handleTabChange('apps');
        }
        setExtSidebar('apps');
      }
      return;
    }
    if (section === 'library') {
      if (LIBRARY_TAB_IDS.has(currentTab) && extSidebar === 'library') {
        setExtSidebar(null);
      } else {
        setExtSidebarSearch('');
        if (!LIBRARY_TAB_IDS.has(currentTab)) {
          handleTabChange('templates');
        }
        setExtSidebar('library');
      }
    }
  };

  const handleQuickSwitchWorkspace = useCallback(async (workspace) => {
    if (!workspace?.id || switchingWorkspaceId) return;
    const currentId = userWorkspaces[0]?.id || (typeof window !== 'undefined' ? window.sessionStorage.getItem('nexoclip_workspace_id') : null);
    if (workspace.id === currentId) {
      window.sessionStorage.setItem('nexoclip_workspace_id', workspace.id);
      window.sessionStorage.setItem('nexoclip_workspace_name', workspace.name);
      handleTabChange('projects');
      setIsMobileOpen(false);
      return;
    }
    setSwitchingWorkspaceId(workspace.id);
    try {
      const response = await fetch('/api/workspaces/current', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceId: workspace.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Could not switch workspace.');
      const nextActive = payload.workspaces?.[0] || workspace;
      window.sessionStorage.setItem('nexoclip_workspace_id', nextActive.id);
      window.sessionStorage.setItem('nexoclip_workspace_name', nextActive.name);
      window.location.assign('/studio/projects');
    } catch {
      setSwitchingWorkspaceId(null);
    }
  }, [handleTabChange, switchingWorkspaceId, userWorkspaces]);

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
    let expiryTimer;

    const scheduleSessionExpiry = (expiresAt) => {
      const checkExpiry = () => {
        const timestamp = Date.parse(expiresAt);
        if (!Number.isFinite(timestamp)) return;
        const remaining = timestamp - Date.now();
        if (remaining <= 0) {
          window.dispatchEvent(new Event('nexoclip:session-expired'));
          return;
        }
        expiryTimer = window.setTimeout(checkExpiry, Math.min(remaining, 24 * 60 * 60 * 1000));
      };
      checkExpiry();
    };

    async function restoreSaaSSession() {
      try {
        const sessionResponse = await fetch('/api/auth/session', { credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(10000) });
        const session = await sessionResponse.json();
        if (!session.authenticated) {
          window.sessionStorage.removeItem('nexoclip_workspace_id');
          if (!cancelled) setAuthStatus('guest');
          return;
        }
        scheduleSessionExpiry(session.expiresAt);
        const workspaceResponse = await fetch('/api/workspaces', { credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(10000) });
        const workspacePayload = await workspaceResponse.json();
        if (!workspaceResponse.ok) throw new Error('Workspace unavailable');
        const workspaces = Array.isArray(workspacePayload.workspaces) ? workspacePayload.workspaces : [];
        const workspace = workspaces[0];
        if (!workspace?.id) throw new Error('Workspace unavailable');
        if (!cancelled) setUserWorkspaces(workspaces);
        if (workspace?.id && typeof window !== 'undefined') {
          window.sessionStorage.setItem('nexoclip_workspace_id', workspace.id);
          window.sessionStorage.setItem('nexoclip_workspace_name', workspace.name);
        }
        if (!cancelled) setAuthStatus('authenticated');
        if (workspace?.id) void refreshBalance();
      } catch {
        window.sessionStorage.removeItem('nexoclip_workspace_id');
        if (!cancelled) setAuthStatus('guest');
      }
    }

    setHasMounted(true);
    restoreSaaSSession();
    return () => { cancelled = true; window.clearTimeout(expiryTimer); };
  }, [sessionVersion, refreshBalance]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const intent = params.get('auth');
    if (intent === 'login' || intent === 'register') {
      const next = params.get('next');
      authReturnTo.current = next?.startsWith('/') && !next.startsWith('//') && !/[\\\u0000-\u001f\u007f]/.test(next)
        ? next
        : '/studio/home';
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
    const handleExpiredSession = () => {
      authReturnTo.current = window.location.pathname + window.location.search;
      window.sessionStorage.removeItem('nexoclip_workspace_id');
      window.sessionStorage.removeItem('nexoclip_workspace_name');
      setAuthStatus('guest');
      setAuthError('Your session expired. Please sign in again.');
      setBalance(null);
    };
    window.addEventListener('nexoclip:session-expired', handleExpiredSession);
    return () => window.removeEventListener('nexoclip:session-expired', handleExpiredSession);
  }, [openAuth]);

  useEffect(() => {
    const onAuthRequired = () => { setAuthStatus('guest'); openAuth('login'); };
    window.addEventListener('muapi:auth-required', onAuthRequired);
    return () => window.removeEventListener('muapi:auth-required', onAuthRequired);
  }, [openAuth]);

  useEffect(() => {
    if (authStatus === 'guest' && activeTab !== 'home') {
      authReturnTo.current = window.location.pathname + window.location.search;
      openAuth('login', authError);
    }
  }, [authStatus, activeTab, authError, openAuth]);


  // Project cards carry text. Only file drags belong to the media uploader.
  const isFileDrag = (e) => Array.from(e.dataTransfer.types).includes('Files');
  const handleDragOver = useCallback((e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    // Only set to false if we're leaving the container itself, not moving between children
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    if (!e.dataTransfer.files.length) return;
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
    <NxBrandLoader
      fullScreen
      label="Nexoclip Studio"
      sublabel="Preparing your creative workspace"
    />
  );

  const currentTab = activeTab;
  const activeFeatureTip = getFeatureTips(currentTab);
  const showSidebar = authStatus === 'authenticated' && (currentTab === 'home' || isHeaderVisible);
  const isHomeDotGrid = currentTab === 'home' && authStatus === 'authenticated';
  const isDirectorDotGrid = currentTab === 'director' && directorHeroActive;
  const isRedesignedStudioTab = ['image', 'video', 'ai-influencer', 'vibe-motion'].includes(currentTab);
  const isStudioDotGrid = ['image', 'video', 'vibe-motion'].includes(currentTab);
  const showDotGridBg = isHomeDotGrid || isDirectorDotGrid || isStudioDotGrid;
  const isLibraryTab = LIBRARY_TAB_IDS.has(currentTab);
  const showExtSidebar = showSidebar && (extSidebar === 'team' || extSidebar === 'apps' || extSidebar === 'library');
  const sidebarPinnedIds = new Set(['team', 'home', 'apps', 'projects', 'templates', 'products', 'media', 'brand-kit', 'accounts', 'usage', 'billing', 'settings']);
  const showGlobalTopBar = authStatus === 'authenticated' && ['team', 'home', 'apps', 'projects', 'templates', 'products', 'media', 'accounts'].includes(currentTab);
  return (
    <div
      className={`nx-shell${currentTab === 'home' ? ' nx-home-shell' : ''}${isHomeDotGrid ? ' nx-home-authed' : ''}${currentTab === 'brand-kit' ? ' is-brand-kit-tab' : ''}${showExtSidebar ? ' has-ext-sidebar' : ''}${currentTab === 'director' ? ' is-director-tab' : ''}${isRedesignedStudioTab ? ' is-studio-redesign' : ''}${isStudioDotGrid ? ' is-studio-dotgrid' : ''}`}
      onDragOver={currentTab === 'home' ? undefined : handleDragOver}
      onDragEnter={currentTab === 'home' ? undefined : handleDragEnter}
      onDragLeave={currentTab === 'home' ? undefined : handleDragLeave}
      onDrop={currentTab === 'home' ? undefined : handleDrop}
    >
      {authStatus === 'guest' && currentTab === 'home' && (
        <button
          type="button"
          className="fixed right-5 top-5 z-[250] rounded-xl bg-[#5b45f2] px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-[#4935df]"
          onClick={() => openAuth('login')}
        >
          Log in
        </button>
      )}
      {authStatus === 'guest' && currentTab !== 'home' && (
        <button
          type="button"
          className="fixed right-5 top-5 z-[250] rounded-xl bg-[#5b45f2] px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-[#4935df]"
          onClick={() => openAuth('login')}
        >
          Log in
        </button>
      )}
      {/* Drag Overlay */}
      {authStatus === 'authenticated' && isDragging && (
        <div className="fixed inset-0 z-[100] bg-[#5b45f2]/10 backdrop-blur-md border-4 border-dashed border-[#5b45f2]/45 flex items-center justify-center pointer-events-none transition-all duration-300">
          <div className="bg-white p-8 rounded-3xl border border-[#e6e7f0] shadow-[0_24px_60px_rgba(20,20,31,0.16)] flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-[#f2f0ff] text-[#5b45f2] border border-[#ddd7fe] rounded-2xl flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
              </svg>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-lg font-semibold text-[#14141f]">Drop your media here</span>
              <span className="text-sm text-[#5e5e72]">Images, videos, or audio files</span>
            </div>
          </div>
        </div>
      )}


      <div className="nx-frame">
        {showDotGridBg && (
          <div className="nx-home-dotgrid-bg" aria-hidden="true">
            <DotGrid
              baseColor="#d6d3e6"
              activeColor="#5b45f2"
              shape="circle"
              dotSize={4}
              gap={10}
              proximity={105}
              strength={0.3}
              bounce={0}
              tension={1}
              returnDuration={0.3}
              shockRadius={80}
              shockStrength={5}
              swell={0}
              stretch={0.4}
              glow={0.5}
              fade={0}
              opacity={0.72}
              intro={false}
              clickShock={false}
            />
          </div>
        )}
        {showSidebar && isMobileOpen && <div className="nx-scrim md:hidden" onClick={() => setIsMobileOpen(false)} />}

        {/* Floating icon-rail sidebar (becomes a labeled drawer on mobile) */}
        {showSidebar && (() => {
          const tabFor = (id) => TABS.find((tab) => tab.id === id);
          const railLink = (id, label, ariaTitle = label) => {
            const tab = tabFor(id);
            if (!tab || tab.hidden) return null;
            const isActive =
              currentTab === id ||
              (id === 'apps' && !sidebarPinnedIds.has(currentTab));
            return (
              <a
                key={id}
                href={tabToUrlPath(id)}
                onClick={(event) => handleNavigationItemClick(event, id)}
                data-rail-id={id}
                data-tour={id === 'canvas' ? 'canvas-link' : undefined}
                aria-current={isActive ? 'page' : undefined}
                aria-label={ariaTitle}
                title={ariaTitle}
                className={`nx-rail-link${isActive ? ' is-active' : ''}`}
              >
                <span className="nx-rail-icon-wrap" aria-hidden="true">
                  <RailGlyph id={id} />
                </span>
                <span className="nx-rail-label">{label}</span>
              </a>
            );
          };
          const isUsageActive = currentTab === 'usage' || currentTab === 'billing';
          const isSettingsActive = currentTab === 'settings';
          const workspaceName = userWorkspaces[0]?.name || window.sessionStorage.getItem('nexoclip_workspace_name') || 'Workspace';
          return (
            <aside
              aria-label="Studio workspace navigation"
              className={`nx-side nx-icon-rail${isMobileOpen ? ' is-open' : ''}`}
            >
              <div className="nx-rail-head-mobile">
                <a
                  href="/studio/home"
                  onClick={(event) => handleNavigationItemClick(event, 'home')}
                  aria-label="Nexoclip Home"
                  title="Nexoclip Home"
                  className="nx-rail-brand"
                >
                  <span className="nx-rail-brand-mark" aria-hidden="true">
                    <img
                      src="/brand/nexoclip-mark.png"
                      alt=""
                      className="nx-rail-brand-mark-img"
                    />
                  </span>
                  <img
                    src="/brand/nexoclip-lockup.png"
                    alt="nexoclip"
                    className="nx-rail-brand-lockup"
                  />
                </a>
                <button
                  type="button"
                  onClick={() => setIsMobileOpen(false)}
                  aria-label="Close navigation"
                  className="nx-rail-mobile-close"
                >
                  <CloseIcon size={16} />
                </button>
              </div>

              <div className="nx-rail-divider" role="separator" />

              <nav data-tour="studio-nav" aria-label="Studio navigation" className="nx-rail-nav">
                {/* Workspace — opens docked extended sidebar (matching Apps, Library & My Brand) */}
                <a
                  href="/studio/team"
                  onClick={(event) => handleRailSectionClick(event, 'team')}
                  data-rail-id="team"
                  aria-current={currentTab === 'team' ? 'page' : undefined}
                  aria-expanded={extSidebar === 'team'}
                  aria-label={'Workspace: ' + workspaceName}
                  title={'Workspace: ' + workspaceName}
                  className={`nx-rail-link${currentTab === 'team' ? ' is-active' : ''}`}
                >
                  <span className="nx-rail-icon-wrap" aria-hidden="true">
                    <RailGlyph id="team" />
                  </span>
                  <span className="nx-rail-label">
                    <span className="block max-w-[52px] truncate md:max-w-[52px] max-md:max-w-[150px]">{workspaceName}</span>
                  </span>
                </a>
                {extSidebar === 'team' && (
                  <div className="nx-rail-mobile-subnav" aria-label="Workspace submenu">
                    {WORKSPACE_EXT_NAV.map((item) => {
                      const ItemIcon = item.icon;
                      const isSubActive = currentTab === 'team' && teamSubView === item.view;
                      return (
                        <a
                          key={item.id}
                          href={tabToUrlPath(item.id)}
                          onClick={(event) => handleNavigationItemClick(event, item.id)}
                          className={`nx-rail-mobile-subitem${isSubActive ? ' is-active' : ''}`}
                        >
                          <ItemIcon size={14} strokeWidth={1.85} aria-hidden="true" />
                          <span>{item.label}</span>
                        </a>
                      );
                    })}
                  </div>
                )}

                {railLink('home', 'Home', 'Studio Home')}

                {/* Apps — opens docked extended sidebar (matching My Brand behavior, no hover flyout) */}
                <a
                  href="/studio/apps"
                  onClick={(event) => handleRailSectionClick(event, 'apps')}
                  data-rail-id="apps"
                  aria-current={currentTab === 'apps' || !sidebarPinnedIds.has(currentTab) ? 'page' : undefined}
                  aria-expanded={extSidebar === 'apps'}
                  aria-label="Apps & Studios"
                  title="Apps & Studios"
                  className={`nx-rail-link${currentTab === 'apps' || !sidebarPinnedIds.has(currentTab) ? ' is-active' : ''}`}
                >
                  <span className="nx-rail-icon-wrap" aria-hidden="true">
                    <RailGlyph id="apps" />
                  </span>
                  <span className="nx-rail-label">Apps</span>
                </a>
                {extSidebar === 'apps' && (
                  <div className="nx-rail-mobile-subnav" aria-label="Apps submenu">
                    {APPS_EXT_NAV.map((item) => {
                      const ItemIcon = item.icon;
                      return (
                        <a
                          key={item.id}
                          href={tabToUrlPath(item.id)}
                          onClick={(event) => handleNavigationItemClick(event, item.id)}
                          className={`nx-rail-mobile-subitem${currentTab === item.id ? ' is-active' : ''}`}
                        >
                          <ItemIcon size={14} strokeWidth={1.85} aria-hidden="true" />
                          <span>{item.label}</span>
                        </a>
                      );
                    })}
                  </div>
                )}

                {railLink('projects', 'Projects', 'Projects')}
                {railLink('accounts', 'Integrations', 'Integrations')}

                {/* Library — opens docked extended sidebar (matching My Brand behavior, no hover flyout) */}
                <a
                  href="/studio/templates"
                  onClick={(event) => handleRailSectionClick(event, 'library')}
                  data-rail-id="library"
                  aria-current={isLibraryTab ? 'page' : undefined}
                  aria-expanded={extSidebar === 'library'}
                  aria-label="Library (Templates, Products & Media)"
                  title="Library"
                  className={`nx-rail-link${isLibraryTab ? ' is-active' : ''}`}
                >
                  <span className="nx-rail-icon-wrap" aria-hidden="true">
                    <RailGlyph id="library" />
                  </span>
                  <span className="nx-rail-label">Library</span>
                </a>
                {extSidebar === 'library' && (
                  <div className="nx-rail-mobile-subnav" aria-label="Library submenu">
                    {LIBRARY_EXT_NAV.map((item) => {
                      const ItemIcon = item.icon;
                      return (
                        <a
                          key={item.id}
                          href={tabToUrlPath(item.id)}
                          onClick={(event) => handleNavigationItemClick(event, item.id)}
                          className={`nx-rail-mobile-subitem${currentTab === item.id ? ' is-active' : ''}`}
                        >
                          <ItemIcon size={14} strokeWidth={1.85} aria-hidden="true" />
                          <span>{item.label}</span>
                        </a>
                      );
                    })}
                  </div>
                )}

                {railLink('brand-kit', 'My Brand', 'My Brand (Brand Kit)')}
              </nav>

              <div className="nx-rail-bottom">
                <a
                  href="/studio/usage"
                  onClick={(event) => handleNavigationItemClick(event, 'usage')}
                  aria-label="Usage & Billing"
                  title="Usage & Billing"
                  aria-current={isUsageActive ? 'page' : undefined}
                  className={`nx-rail-util is-gem${isUsageActive ? ' is-active' : ''}`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" className="nx-rail-svg" aria-hidden="true">
                    <path data-tone="fill" d="M6 4h12l3 5-9 11L3 9l3-5z" stroke="currentColor" strokeWidth="1.8" />
                    <path data-tone="stroke" d="M3 9h18" stroke="currentColor" strokeWidth="1.7" />
                  </svg>
                  <span className="nx-rail-util-label">Usage &amp; Billing</span>
                </a>

                {currentTab !== 'home' && (
                  <button
                    type="button"
                    data-tour="tour-button"
                    onClick={() => {
                      setIsMobileOpen(false);
                      openFeatureTips();
                    }}
                    aria-label={`Tips for ${activeFeatureTip.title}`}
                    title={`Tips · ${activeFeatureTip.shortTitle}`}
                    className="nx-rail-util is-tips"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" className="nx-rail-svg" aria-hidden="true">
                      <path data-tone="stroke" d="M9 18h6M10 21.5h4" stroke="currentColor" strokeWidth="1.8" />
                      <path data-tone="fill" d="M12 2.5a6.5 6.5 0 0 0-3.8 11.75c.65.48 1.05 1.24 1.05 2.05V17h5.5v-.7c0-.81.4-1.57 1.05-2.05A6.5 6.5 0 0 0 12 2.5Z" stroke="currentColor" strokeWidth="1.8" />
                    </svg>
                    <span className="nx-rail-util-label">Tips · {activeFeatureTip.shortTitle}</span>
                  </button>
                )}

                <a
                  href="/studio/settings"
                  onClick={(event) => handleNavigationItemClick(event, 'settings')}
                  aria-label="Settings"
                  title="Settings"
                  aria-current={isSettingsActive ? 'page' : undefined}
                  className={`nx-rail-util is-settings${isSettingsActive ? ' is-active' : ''}`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" className="nx-rail-svg" aria-hidden="true">
                    <path data-tone="fill" d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" stroke="currentColor" strokeWidth="1.75" />
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
                  </svg>
                  <span className="nx-rail-util-label">Settings</span>
                </a>

                {authStatus === 'loading' && (
                  <div className="nx-rail-account-wrap">
                    <NxProfileBadgeSkeleton sidebar={false} />
                  </div>
                )}

                {authStatus === 'authenticated' && (
                  <AccountMenu
                    showAdminLink
                    rail
                    onUpgrade={() => openPricingModal('plans')}
                    onOpenSettings={() => handleTabChange('settings')}
                  />
                )}
              </div>
            </aside>
          );
        })()}

        {/* Docked Extended Sidebar for Workspace, Apps & Library (matches My Brand .bs-tree panel) */}
        {showExtSidebar && (() => {
          const isTeam = extSidebar === 'team';
          const isApps = extSidebar === 'apps';
          const title = isTeam ? 'Workspace' : isApps ? 'Apps' : 'Library';
          const placeholder = isTeam ? 'Search workspace...' : isApps ? 'Search apps...' : 'Search library...';
          const allItems = isTeam ? WORKSPACE_EXT_NAV : isApps ? APPS_EXT_NAV : LIBRARY_EXT_NAV;
          const query = extSidebarSearch.trim().toLowerCase();
          const filteredItems = query
            ? allItems.filter((item) => item.label.toLowerCase().includes(query))
            : allItems;
          const filteredWorkspaces = isTeam
            ? (query
                ? userWorkspaces.filter((w) => (w.name || '').toLowerCase().includes(query))
                : userWorkspaces)
            : [];
          const activeWorkspaceId = userWorkspaces[0]?.id || window.sessionStorage.getItem('nexoclip_workspace_id');

          return (
            <aside className="bs-tree nx-ext-sidebar" aria-label={`${title} navigation`}>
              <div className="bs-tree-header">
                <button
                  type="button"
                  className="bs-tree-back"
                  onClick={() => setExtSidebar(null)}
                  aria-label={`Collapse ${title} sidebar`}
                  title={`Collapse ${title} sidebar`}
                >
                  <ArrowLeft size={14} strokeWidth={2} />
                </button>
                <h2 className="bs-tree-title">{title}</h2>
              </div>

              <div className="bs-tree-search-wrap">
                <span className="bs-tree-search-icon" aria-hidden="true">
                  <Search size={13.5} strokeWidth={2} />
                </span>
                <input
                  type="search"
                  value={extSidebarSearch}
                  onChange={(event) => setExtSidebarSearch(event.target.value)}
                  placeholder={placeholder}
                  aria-label={placeholder}
                  className="bs-tree-search"
                />
                {extSidebarSearch && (
                  <button
                    type="button"
                    className="bs-tree-search-clear"
                    onClick={() => setExtSidebarSearch('')}
                    aria-label="Clear search"
                  >
                    <CloseIcon size={12} />
                  </button>
                )}
              </div>

              <nav className="bs-tree-nav" aria-label={`${title} pages`}>
                {filteredItems.length === 0 && filteredWorkspaces.length === 0 ? (
                  <p className="nx-ext-sidebar-empty">No matching items</p>
                ) : (
                  <>
                    {filteredItems.map((item, idx) => {
                      const ItemIcon = item.icon;
                      const prevGroup = idx > 0 ? filteredItems[idx - 1].group : item.group;
                      const showDivider = idx > 0 && item.group !== prevGroup;
                      const isActive = isTeam
                        ? currentTab === 'team' && teamSubView === item.view
                        : currentTab === item.id;
                      return (
                        <div key={item.id}>
                          {showDivider && <div className="bs-tree-divider" role="separator" />}
                          <a
                            href={tabToUrlPath(item.id)}
                            onClick={(event) => handleNavigationItemClick(event, item.id)}
                            aria-current={isActive ? 'page' : undefined}
                            className={`bs-tree-item${isActive ? ' is-active' : ''}`}
                          >
                            <ItemIcon size={15} strokeWidth={1.85} aria-hidden="true" />
                            <span className="bs-tree-item-label">{item.label}</span>
                          </a>
                        </div>
                      );
                    })}

                    {isTeam && filteredWorkspaces.length > 0 && (
                      <>
                        {filteredItems.length > 0 && <div className="bs-tree-divider" role="separator" />}
                        <div className="nx-ext-sidebar-section-label">Your Workspaces</div>
                        {filteredWorkspaces.map((ws) => {
                          const isCurrent = ws.id === activeWorkspaceId;
                          const isSwitching = switchingWorkspaceId === ws.id;
                          return (
                            <button
                              key={ws.id}
                              type="button"
                              disabled={Boolean(switchingWorkspaceId)}
                              onClick={() => handleQuickSwitchWorkspace(ws)}
                              className={`bs-tree-item${isCurrent ? ' is-active' : ''}`}
                              title={`${ws.name} (${ws.role})`}
                            >
                              <span className="nx-ext-ws-avatar" aria-hidden="true">
                                {(ws.name || 'W').slice(0, 1).toUpperCase()}
                              </span>
                              <span className="bs-tree-item-label">
                                {isSwitching ? 'Switching…' : ws.name}
                              </span>
                              {isCurrent && (
                                <Check size={13.5} strokeWidth={2.2} className="shrink-0 text-[#5b45f2]" aria-hidden="true" />
                              )}
                            </button>
                          );
                        })}
                      </>
                    )}
                  </>
                )}
              </nav>
            </aside>
          );
        })()}

        <div className="nx-main">
          {(showSidebar || currentTab === 'home') && (
            <div className={`nx-reference-top nx-page-actions${!showGlobalTopBar ? ' is-subpage' : ''}`}>
              {showSidebar && (
                <button type="button" className="nx-burger" onClick={() => setIsMobileOpen(true)} aria-label="Open navigation" aria-expanded={isMobileOpen}>
                  <NxIcon name="menu" size={20} />
                </button>
              )}
              {showGlobalTopBar ? (
                <div className="nx-top-cta-bar">
                  <button
                    type="button"
                    data-get-started-trigger
                    onClick={() => setGetStartedOpen((v) => !v)}
                    className={`nx-top-pill nx-top-pill--starter${getStartedOpen ? ' is-active' : ''}`}
                    aria-expanded={getStartedOpen}
                    aria-label="Get started checklist"
                  >
                    <CircleDot size={15} strokeWidth={2.1} className="nx-top-pill-icon is-accent" aria-hidden="true" />
                    <span>Get started</span>
                  </button>

                  <a
                    href={ENTERPRISE_WHATSAPP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="nx-top-pill"
                    aria-label="Enterprise plans"
                  >
                    <Building2 size={15} strokeWidth={1.9} className="nx-top-pill-icon" aria-hidden="true" />
                    <span>Enterprise</span>
                  </a>

                  <button
                    type="button"
                    onClick={() => openPricingModal('plans')}
                    className="nx-top-pill nx-top-pill--upgrade"
                    aria-label="Upgrade plan"
                  >
                    <Crown size={15} strokeWidth={2} className="nx-top-pill-icon is-gold" aria-hidden="true" />
                    <span>Upgrade</span>
                  </button>

                  {currentTab === 'home' && (
                    <motion.button
                      type="button"
                      data-tour="tour-button"
                      className="nx-top-pill nx-tips-trigger"
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.97 }}
                      transition={{ type: 'spring', stiffness: 450, damping: 28 }}
                      onClick={openFeatureTips}
                      aria-label={`Tips for ${activeFeatureTip.title}`}
                    >
                      <Lightbulb size={15} strokeWidth={2} className="nx-top-pill-icon is-tips" aria-hidden="true" />
                      <span>Tips</span>
                    </motion.button>
                  )}

                  {currentTab === 'home' && authStatus === 'loading' && <NxProfileBadgeSkeleton />}
                  {currentTab === 'home' && authStatus === 'guest' && (
                    <motion.button
                      className="nx-reference-login"
                      type="button"
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.96 }}
                      transition={{ type: 'spring', stiffness: 450, damping: 28 }}
                      onClick={() => openAuth('login')}
                    >
                      Log in
                    </motion.button>
                  )}
                  {currentTab === 'home' && authStatus === 'authenticated' && (
                    <AccountMenu showAdminLink onUpgrade={() => openPricingModal('plans')} onOpenSettings={() => handleTabChange('settings')} />
                  )}
                </div>
              ) : currentTab === 'home' && authStatus === 'guest' ? (
                <button
                  type="button"
                  className="nx-reference-login"
                  onClick={() => openAuth('login')}
                >
                  Log in
                </button>
              ) : (
                <button
                  type="button"
                  data-tour="tour-button"
                  className="nx-tips-trigger is-mobile-subpage md:hidden"
                  onClick={openFeatureTips}
                  aria-label={`Tips for ${activeFeatureTip.title}`}
                >
                  <Lightbulb size={15} strokeWidth={2} aria-hidden="true" />
                  <span>Tips</span>
                </button>
              )}
            </div>
          )}
        {/* Studio Content */}
        <div className={`suite-content min-w-0 relative overflow-hidden${currentTab !== 'home' && currentTab !== 'canvas' && currentTab !== 'director' && !isRedesignedStudioTab ? ' nx-studio-light' : ''}`}>
        {authStatus === 'guest' && currentTab !== 'home' ? (
          <main className="flex min-h-[70vh] flex-col items-center justify-center gap-4 bg-white px-6 text-center">
            <h1 className="text-2xl font-semibold text-[#14141f]">Sign in to continue</h1>
            <p className="max-w-md text-sm text-[#5e5e72]">Please sign in to your Nexoclip account to open this page.</p>
            <button type="button" className="rounded-xl bg-[#5b45f2] px-5 py-2.5 text-sm font-semibold text-white" onClick={() => openAuth('login')}>Log in</button>
          </main>
        ) : <>
        {currentTab === 'home' && <StudioHome onCreate={handleHomeCreate} onNavigate={handleTabChange} authStatus={authStatus} data={dashboardData} initialPrompt={studioPrompt} onPromptConsumed={() => setStudioPrompt('')} />}
        {currentTab === 'team' && authStatus === 'authenticated' && <WorkspaceOnboarding onNavigate={handleNavigationItemClick} view={teamSubView} />}
        {currentTab === 'apps' && <AppsHub onNavigate={handleTabChange} />}
        {currentTab === 'projects' && <ProjectLibrary key={sessionVersion} authStatus={authStatus} onSignIn={() => openAuth('login')} selection={selectedProject} />}
        {currentTab === 'accounts' && <IntegrationApps key={sessionVersion} authStatus={authStatus} onSignIn={() => openAuth('login')} />}
        {currentTab === 'templates' && <TemplatesHub onNavigate={handleTabChange} />}
        {currentTab === 'products' && <ProductsLibrary authStatus={authStatus} onSignIn={() => openAuth('login')} onNavigate={handleTabChange} />}
        {currentTab === 'media' && <WorkspaceLibrary kind="assets" data={dashboardData} authStatus={authStatus} onSignIn={() => openAuth('login')} selection={selectedProject} />}
        {directorVisited && <div className={currentTab === 'director' ? 'h-full w-full' : 'hidden'}><DirectorApp initialBrief={studioPrompt} onHeroChange={setDirectorHeroActive} onNavigate={handleTabChange} /></div>}
        {currentTab === 'billing' && (
          <BillingContent
            workspaceId={typeof window !== 'undefined' ? window.sessionStorage.getItem('nexoclip_workspace_id') : null}
            balance={balance}
            onCompleted={refreshBalance}
            onNavigateUsage={() => handleTabChange('usage')}
            onOpenPlans={() => openPricingModal('plans')}
            onOpenTopUp={() => openPricingModal('topup')}
          />
        )}
        {currentTab === 'settings' && (
          <SettingsContent
            onNewWorkspace={() => handleTabChange('team/new')}
            authStatus={authStatus}
            balance={balance}
            onRequireAuth={() => openAuth('login')}
            onBalanceChange={setBalance}
            onWorkspaceChanged={() => {
              window.location.assign('/studio/projects');
            }}
            onOpenPlans={() => openPricingModal('plans')}
            onOpenTopUp={() => openPricingModal('topup')}
            onNavigateUsage={() => handleTabChange('usage')}
            onNavigateBilling={() => handleTabChange('billing')}
          />
        )}
        {currentTab === 'brand-kit' && (
          <BrandKitContent
            onOpenDirector={(brief) => handleTabChange('director', brief)}
            onNavigate={handleTabChange}
            onBack={() => handleTabChange('home')}
          />
        )}
        {currentTab === 'usage' ? <UsageContent workspaceId={typeof window !== 'undefined' ? window.sessionStorage.getItem('nexoclip_workspace_id') : null} onBalanceChange={setBalance} onTopUp={() => openPricingModal('topup')} onNavigateBilling={() => handleTabChange('billing')} /> : imageVisited && <div className={currentTab === 'image' ? "h-full w-full" : "hidden"}>
          <GenerationProject key={sessionVersion} studio="image" component={ImageStudio} authStatus={authStatus} homeSelection={homeSelection?.tabId === 'image' ? homeSelection : null} initialPrompt={studioPrompt} beforeGenerate={requireAuth} persistScope={undefined} apiKey={apiKey} droppedFiles={currentTab === 'image' ? droppedFiles : null} onFilesHandled={handleFilesHandled} onGenerationStart={makeGenerationStartCallback('image')} onGenerationEnd={makeGenerationEndCallback('image')} onGenerationComplete={makeSuccessCallback('image')} onGenerationError={makeErrorCallback('image')} />
        </div>}
        {currentTab === 'ads' && <MetaAdsManager/>}
        {currentTab === 'publish' && <SocialPublishing/>}
        {currentTab === 'video' && (
          <div className="h-full w-full">
            <GenerationProject key={sessionVersion} studio="video" component={VideoStudio} authStatus={authStatus} homeSelection={homeSelection?.tabId === 'video' ? homeSelection : null} initialPrompt={studioPrompt} beforeGenerate={requireAuth} persistScope={undefined} apiKey={apiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onPublish={(entry) => setTiktokVideo(entry)} onGenerationStart={makeGenerationStartCallback('video')} onGenerationEnd={makeGenerationEndCallback('video')} onGenerationComplete={makeSuccessCallback('video')} onGenerationError={makeErrorCallback('video')} />
          </div>
        )}
        {currentTab === 'vibe-motion' && (
          <div className="h-full w-full">
            <VibeMotionStudio apiKey={apiKey} onGenerationStart={makeGenerationStartCallback('vibe-motion')} onGenerationEnd={makeGenerationEndCallback('vibe-motion')} onGenerationComplete={makeSuccessCallback('vibe-motion')} onGenerationError={makeErrorCallback('vibe-motion')} />
          </div>
        )}
        {currentTab === 'lipsync' && (
          <div className="h-full w-full">
            <ComingSoon title="Lip Sync" />
          </div>
        )}
        {currentTab === 'body-swap' && (
          <div className="h-full w-full">
            <ComingSoon title="Body Swap" />
          </div>
        )}
        {currentTab === 'cinema' && (
          <div className="h-full w-full">
            <GenerationProject key={sessionVersion} studio="cinema" component={CinemaStudio} authStatus={authStatus} initialPrompt={studioPrompt} beforeGenerate={requireAuth} persistScope={undefined} apiKey={apiKey} onGenerationStart={makeGenerationStartCallback('cinema')} onGenerationEnd={makeGenerationEndCallback('cinema')} onGenerationComplete={makeSuccessCallback('cinema')} onGenerationError={makeErrorCallback('cinema')} />
          </div>
        )}
        {currentTab === 'audio' && (
          <div className="h-full w-full">
            <AudioStudio apiKey={apiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationStart={makeGenerationStartCallback('audio')} onGenerationEnd={makeGenerationEndCallback('audio')} onGenerationComplete={makeSuccessCallback('audio')} onGenerationError={makeErrorCallback('audio')} />
          </div>
        )}
        {currentTab === 'marketing' && (
          <div className="h-full w-full">
            <MarketingStudio beforeGenerate={requireAuth} persistScope={undefined} apiKey={apiKey} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationStart={makeGenerationStartCallback('marketing')} onGenerationEnd={makeGenerationEndCallback('marketing')} onGenerationComplete={makeSuccessCallback('marketing')} onGenerationError={makeErrorCallback('marketing')} />
          </div>
        )}
        {currentTab === 'canvas' && (
          <div data-tour="canvas-frame" className="h-full w-full bg-black">
            {canvasIframeSrc ? (
              <iframe
                title="Canvas"
                src={canvasIframeSrc}
                className="h-full w-full border-0"
                allow="clipboard-read; clipboard-write"
              />
            ) : null}
          </div>
        )}
        {currentTab === 'ai-influencer' && (
          <div className="h-full w-full">
            <GenerationProject key={sessionVersion} studio="ai-influencer" component={AiInfluencerStudio} authStatus={authStatus}
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
      {tiktokVideo && <TikTokPublishDialog video={tiktokVideo} onClose={() => setTiktokVideo(null)} />}
      <PricingModal
        open={pricingOpen}
        initialTab={pricingModalTab || 'plans'}
        workspaceId={typeof window !== 'undefined' ? window.sessionStorage.getItem('nexoclip_workspace_id') : null}
        balance={balance}
        onCompleted={refreshBalance}
        onRequireAuth={requestPricingAuth}
        onClose={closePricingModal}
      />
      {!showSidebar && currentTab !== 'home' && (
        <motion.button
          type="button"
          data-tour="tour-button"
          onClick={openFeatureTips}
          aria-label={`Tips for ${activeFeatureTip.title}`}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.97 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          className={`nx-floating-tips-pill${currentTab === 'canvas' ? ' is-canvas' : ''}`}
        >
          <span className="nx-floating-tips-icon" aria-hidden="true">
            <Lightbulb size={15} strokeWidth={2.1} />
          </span>
          <span className="nx-floating-tips-text">
            <span className="nx-floating-tips-kicker">Tips</span>
            <span className="nx-floating-tips-sep" aria-hidden="true">·</span>
            <span className="nx-floating-tips-feature">{activeFeatureTip.shortTitle}</span>
          </span>
        </motion.button>
      )}

      {lowBalanceOpen && creditLevel && <LowBalanceDialog level={creditLevel} balance={balance}
        onTopUp={() => { setLowBalanceOpen(false); openPricingModal('topup'); }} onClose={() => setLowBalanceOpen(false)} />}
      <CreateQuickModal open={createModalOpen} onClose={() => setCreateModalOpen(false)} onSelect={handleTabChange} />
      <GetStartedPopover open={getStartedOpen} onClose={() => setGetStartedOpen(false)} onNavigate={handleTabChange} />
      <StudioTour open={tourOpen} mode={tourMode} onClose={() => setTourOpen(false)} activeTab={activeTab} onTabChange={handleTabChange} />
      <BrandAnalyzeToast currentTab={currentTab} onOpenBrandKit={() => handleTabChange('brand-kit')} />
    </div>
  );
}
