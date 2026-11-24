'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  Home,
  Menu,
  MessageSquare,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Trash2,
  TrendingUp,
  User,
  Volume2,
  X,
} from 'lucide-react';

const DEFAULT_FALLBACK_KIT = {
  brandName: 'Nexo Clip',
  about: 'AI creative studio for ad images, videos, UGC, and visual storytelling.',
  category: 'AI video and image generation SaaS (creative studio)',
  mission: 'Great content should not be expensive.',
  positioning: 'Help small brands create as much content as big brands with 29 AI models in one credit balance: Seedance, Kling 3.0 Pro, Wan 3.0, Veo 3, Nano Banana, GPT Image, Flux, Seedream, Hailuo, and ElevenLabs.',
  headline: 'Your ideas. Turned into real video.',
  slogans: ['Space for big ideas. A studio to bring them to life.', 'Great content should not be expensive.', 'Made for your imagination.'],
  language: 'English, friendly, direct, concise, creative, and empowering.',
  pronunciation: 'NEK-so KLIP',
  tone: 'Friendly, direct, concise, creative, and empowering.',
  audience: [
    'TikTok Shop, Shopee, and affiliate sellers — need high-volume product videos; lead with AI UGC Video.',
    'SMB owners — high production costs and no in-house studio/team; lead with product photos turned into ad videos.',
    'Creators, filmmakers, and agencies — regular content production; lead with AI Director, AI Video Canvas, and Enterprise.',
  ],
  products: [
    'AI Director — turn a brief into concept, script, shot list, images, and video.',
    'AI Video Canvas — node board for prompts, references, images, and video.',
    'Video Studio — turn text or photos into up to 1080p video.',
    'AI UGC Video — virtual creators presenting natural product reviews.',
  ],
  sellingPoints: [
    'Videos without talent, studio, or editor.',
    '29 AI models, one shared credit balance.',
    'Natural conversational workflow.',
    'Credit cost shown before generating; failed runs are automatically refunded.',
    'Watermark-free commercial output on paid plans.',
    'Flexible local & card payments.',
  ],
  claimsToAvoid: [
    'Do not promise a free plan.',
    'Do not cite unconfirmed legacy pricing.',
    'Do not guarantee identical outputs; results depend on reference photos, prompts, and models.',
  ],
  disclaimer: 'Results may vary depending on reference photos, prompts, and selected models. Some platforms require AI-generated content disclosure.',
  competitors: ['HeyGen', 'Synthesia', 'Captions', 'Opus Clip'],
  plans: [
    'Starter — 1,200 credits/month.',
    'Creator — 2,800 credits/month; most popular.',
    'Pro — 6,500 credits/month.',
    'Enterprise — custom pricing.',
    'Annual: pay for 10 months and get 12 months. No auto-renew.',
    'Top-up packs: 1,200 / 2,800 / 6,500 credits; top-up credits never expire.',
  ],
  phone: '+62 851-8316-2659',
  email: 'support@nexoclip.com',
  website: 'https://nexoclip.com',
  app: 'https://app.nexoclip.com',
  instagram: '@nexoclip.official',
  tiktok: '@nexoclip.com',
  youtube: '@nexoclipyt',
  address: 'Jl. Raya Boulevard Permata Medang No.8, Medang, Pagedangan, Kabupaten Tangerang, Banten 15835',
  legalEntity: 'PT Smart Digitech Indonesia, Tangerang Regency, Banten',
  colors: [
    { name: 'Background', hex: '#0B0C0A' },
    { name: 'Panel', hex: '#111412' },
    { name: 'Panel raised', hex: '#151714' },
    { name: 'Panel border', hex: '#1D201B' },
    { name: 'Lime accent', hex: '#D4FF64' },
    { name: 'Warm off-white', hex: '#F2EEE5' },
    { name: 'Light text', hex: '#F2F3ED' },
    { name: 'Muted text', hex: '#A8AEA5' },
    { name: 'Orange highlight', hex: '#FF5A1F' },
    { name: 'WhatsApp', hex: '#25D366' },
  ],
  fonts: ['Clash Display — heading', 'Plus Jakarta Sans — body', 'Monospace — labels'],
  bannerColor: '#D4FF64',
  logoDataUrl: '',
  logoNote: 'Site icon; the header wordmark is "nexoclip". Use the icon as a compact mark and the lockup on light or dark backgrounds.',
  glossary: [
    'Credits, generate, concept, script, shot list, canvas.',
    'Products: AI Director, AI Video Canvas, Video Studio, AI UGC Video, AI Influencer.',
  ],
  deals: [
    'Annual: 2 months free (pay for 10 months to get 12 months, no promo code needed).',
    'Top-up credits never expire.',
  ],
  compareAgainst: 'Compare on multi-model flexibility (29 AI models in one credit balance), transparent credit pricing, and full end-to-end storytelling.',
  leadWith: 'Lead with AI UGC Video for sellers & SMBs; Video Studio for product ads; AI Director & AI Video Canvas for creators & agencies.',
  avatars: [],
  voices: [],
  customPages: [],
};

const EMPTY_KIT = {
  brandName: '',
  about: '',
  category: '',
  mission: '',
  positioning: '',
  headline: '',
  slogans: [],
  language: '',
  pronunciation: '',
  tone: '',
  audience: [],
  products: [],
  sellingPoints: [],
  claimsToAvoid: [],
  disclaimer: '',
  competitors: [],
  plans: [],
  phone: '',
  email: '',
  website: '',
  app: '',
  instagram: '',
  tiktok: '',
  youtube: '',
  address: '',
  legalEntity: '',
  colors: [],
  fonts: [],
  bannerColor: '#D4FF64',
  logoDataUrl: '',
  logoNote: '',
  glossary: [],
  deals: [],
  compareAgainst: '',
  leadWith: '',
  avatars: [],
  voices: [],
  customPages: [],
};

function workspaceId() {
  try {
    return window.sessionStorage.getItem('nexoclip_workspace_id');
  } catch {
    return null;
  }
}

function normalizeKit(raw) {
  const source = raw && typeof raw === 'object' ? raw : EMPTY_KIT;
  return {
    ...EMPTY_KIT,
    ...source,
    slogans: Array.isArray(source.slogans) ? source.slogans : [],
    audience: Array.isArray(source.audience) ? source.audience : [],
    products: Array.isArray(source.products) ? source.products : [],
    sellingPoints: Array.isArray(source.sellingPoints) ? source.sellingPoints : [],
    claimsToAvoid: Array.isArray(source.claimsToAvoid) ? source.claimsToAvoid : [],
    competitors: Array.isArray(source.competitors) ? source.competitors : [],
    plans: Array.isArray(source.plans) ? source.plans : [],
    fonts: Array.isArray(source.fonts) ? source.fonts : [],
    colors: Array.isArray(source.colors) ? source.colors : [],
    bannerColor: typeof source.bannerColor === 'string' && /^#[0-9a-f]{6}$/i.test(source.bannerColor) ? source.bannerColor : '#D4FF64',
    logoDataUrl: typeof source.logoDataUrl === 'string' ? source.logoDataUrl : '',
    logoNote: typeof source.logoNote === 'string' ? source.logoNote : '',
    glossary: Array.isArray(source.glossary) ? source.glossary : [],
    deals: Array.isArray(source.deals) ? source.deals : [],
    compareAgainst: typeof source.compareAgainst === 'string' ? source.compareAgainst : '',
    leadWith: typeof source.leadWith === 'string' ? source.leadWith : '',
    avatars: Array.isArray(source.avatars) ? source.avatars : [],
    voices: Array.isArray(source.voices) ? source.voices : [],
    customPages: Array.isArray(source.customPages) ? source.customPages : [],
  };
}

function resolveProductThumb(name) {
  const lower = String(name || '').toLowerCase();
  if (lower.includes('director')) return '/brand-setup/thumb-ai-director.png';
  if (lower.includes('ugc')) return '/brand-setup/thumb-video-ugc.png';
  if (lower.includes('video studio')) return '/brand-setup/thumb-video-studio.png';
  return null;
}

function NexoLogoSvg({ src, brandName }) {
  return src ? (
    <img
      src={src}
      alt={`${brandName || 'Brand'} Logo`}
      className="bs-logo-img"
    />
  ) : <Sparkles className="bs-logo-img" aria-label={`${brandName || 'Brand'} logo placeholder`} />;
}

function BrandKitTreeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.5 5.5A1.5 1.5 0 0 1 6 4h4.2a1.5 1.5 0 0 1 1.5 1.5v13a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5v-13z" />
      <path d="m11.7 7 4.3-1.2a1.5 1.5 0 0 1 1.8 1.1l1.7 7.2a1.5 1.5 0 0 1-1 1.8l-6.8 1.9" />
    </svg>
  );
}

function AvatarsTreeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="4.5" width="15" height="15" rx="2.5" />
      <circle cx="11" cy="10" r="2.4" />
      <path d="M7.2 16.5a4 4 0 0 1 7.6 0" />
      <path d="M19.5 4v4M17.5 6h4" />
    </svg>
  );
}

function VoicesTreeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <line x1="4" y1="10" x2="4" y2="14" />
      <line x1="8" y1="7" x2="8" y2="17" />
      <line x1="12" y1="4.5" x2="12" y2="19.5" />
      <line x1="16" y1="7.5" x2="16" y2="16.5" />
      <line x1="20" y1="10" x2="20" y2="14" />
    </svg>
  );
}

function AutoTextarea({ value, onChange, onKeyDown, placeholder, className = 'bs-inline-textarea', ariaLabel, inputRef }) {
  const localRef = useRef(null);
  const ref = inputRef || localRef;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value, ref]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={className}
    />
  );
}

function EditableBulletList({ items, onChange, placeholder, itemLabel, focusIndex, onFocusHandled }) {
  const itemRefs = useRef([]);

  useEffect(() => {
    if (focusIndex !== null && focusIndex !== undefined && itemRefs.current[focusIndex]) {
      itemRefs.current[focusIndex].focus();
      onFocusHandled?.();
    }
  }, [focusIndex, items.length, onFocusHandled]);

  const updateItem = (index, nextVal) => {
    const next = [...items];
    next[index] = nextVal;
    onChange(next);
  };

  const removeItem = (index) => {
    const next = items.filter((_, i) => i !== index);
    onChange(next);
  };

  const handleKeyDown = (event, index) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const next = [...items];
      next.splice(index + 1, 0, '');
      onChange(next);
      setTimeout(() => itemRefs.current[index + 1]?.focus(), 16);
    } else if (event.key === 'Backspace' && !items[index] && items.length > 0) {
      event.preventDefault();
      removeItem(index);
      setTimeout(() => itemRefs.current[Math.max(0, index - 1)]?.focus(), 16);
    }
  };

  if (!items.length) {
    return (
      <div className="bs-bullet-list">
        <div className="bs-bullet-row">
          <span className="bs-bullet-dot" aria-hidden="true" />
          <div className="bs-bullet-field">
            <input
              type="text"
              value=""
              placeholder={placeholder}
              aria-label={itemLabel}
              onChange={(event) => onChange([event.target.value])}
              className="bs-inline-text"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bs-bullet-list">
      {items.map((item, index) => (
        <div key={index} className="bs-bullet-row">
          <span className="bs-bullet-dot" aria-hidden="true" />
          <div className="bs-bullet-field">
            <AutoTextarea
              inputRef={{
                get current() {
                  return itemRefs.current[index];
                },
                set current(node) {
                  itemRefs.current[index] = node;
                },
              }}
              value={item}
              placeholder={placeholder}
              ariaLabel={`${itemLabel} ${index + 1}`}
              onChange={(event) => updateItem(index, event.target.value)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            />
          </div>
          <button
            type="button"
            className="bs-row-remove"
            onClick={() => removeItem(index)}
            aria-label={`Remove ${itemLabel} ${index + 1}`}
            title="Remove item"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

export default function BrandKitContent({ onOpenDirector, onBack }) {
  const [kit, setKit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [manualSetupStarted, setManualSetupStarted] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusError, setStatusError] = useState('');

  const [activePageId, setActivePageId] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false);
  const [openBrandKitRow, setOpenBrandKitRow] = useState(null);
  const [flashProductIdx, setFlashProductIdx] = useState(null);
  const [confirmErase, setConfirmErase] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState('');
  const [focusTarget, setFocusTarget] = useState({ section: null, index: null });

  const mainScrollRef = useRef(null);
  const cardRefs = useRef({});
  const [catalog, setCatalog] = useState([]);
  const [catalogError, setCatalogError] = useState('');
  const catalogWorkspace = workspaceId();
  useEffect(() => {
    if (!catalogWorkspace) return;
    let controller;
    const refresh = async () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        const response = await fetch('/api/products', {
          headers: { 'x-workspace-id': catalogWorkspace }, cache: 'no-store', signal: request.signal,
        });
        if (!response.ok) throw new Error('Failed to load product catalog.');
        const data = await response.json();
        if (!request.signal.aborted) { setCatalog(data.products); setCatalogError(''); }
      } catch (err) { if (!request.signal.aborted) setCatalogError(err.message); }
    };
    setCatalog([]);
    refresh();
    window.addEventListener('focus', refresh);
    return () => { controller?.abort(); window.removeEventListener('focus', refresh); };
  }, [catalogWorkspace]);
  const avatarInputRefs = useRef([]);
  const voiceInputRefs = useRef([]);
  const customTitleRefs = useRef({});
  const fabWrapRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const id = workspaceId();
    if (!id) {
      setLoading(false);
      setStatusError('Select a workspace to open Brand Kit.');
      return;
    }
    fetch('/api/workspaces/brand-kit', {
      headers: { 'x-workspace-id': id },
      credentials: 'include',
      cache: 'no-store',
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to load Brand Kit.');
        if (!cancelled) {
          setKit(normalizeKit(result.brandKit));
          setDirty(false);
        }
      })
      .catch((error) => {
        if (!cancelled) setStatusError(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateKit = useCallback((updater) => {
    setKit((prev) => {
      if (!prev) return prev;
      return typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
    });
    setDirty(true);
    setStatusMessage('');
    setStatusError('');
  }, []);

  const setField = useCallback((key, value) => {
    updateKit((prev) => ({ ...prev, [key]: value }));
  }, [updateKit]);

  const handleSave = useCallback(async () => {
    const id = workspaceId();
    if (!id || !kit || saving) return;
    setSaving(true);
    setStatusMessage('');
    setStatusError('');
    try {
      const response = await fetch('/api/workspaces/brand-kit', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-workspace-id': id },
        body: JSON.stringify({ brandKit: kit }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to save Brand Kit.');
      setKit(normalizeKit(result.brandKit));
      setDirty(false);
      setStatusMessage('Saved');
    } catch (error) {
      setStatusError(error.message || 'Failed to save Brand Kit.');
    } finally {
      setSaving(false);
    }
  }, [kit, saving]);

  // Ctrl/Cmd + S saves Brand Kit directly
  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSave]);

  // Close AI Director brief popover on outside click
  useEffect(() => {
    if (!briefOpen) return undefined;
    const onDown = (event) => {
      if (fabWrapRef.current && !fabWrapRef.current.contains(event.target)) {
        setBriefOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [briefOpen]);

  const parsedProducts = useMemo(() => catalog.map((product, index) => ({
    id: product.id, index, name: product.name, description: product.advantages || '',
    thumb: product.media?.find(item => item.kind === 'image')?.url || resolveProductThumb(product.name),
    letter: product.name.charAt(0).toUpperCase(),
  })), [catalog]);

  const navItems = useMemo(() => {
    if (!kit) return [];
    const base = [
      { id: 'overview', group: 1, label: 'Overview', icon: <Home size={15} strokeWidth={1.8} /> },
      { id: 'brand-kit', group: 1, label: 'Brand Kit', count: 6, icon: <BrandKitTreeIcon /> },
      { id: 'audience', group: 2, label: 'Audience', icon: <User size={15} strokeWidth={1.8} /> },
      { id: 'messaging', group: 2, label: 'Messaging', icon: <MessageSquare size={15} strokeWidth={1.8} /> },
      { id: 'competitors', group: 2, label: 'Competitors', icon: <TrendingUp size={15} strokeWidth={1.8} /> },
      { id: 'products', group: 3, label: 'Products', count: catalog.length, icon: <ShoppingBag size={15} strokeWidth={1.8} /> },
      { id: 'avatars', group: 3, label: 'Avatars', count: kit.avatars.length || null, icon: <AvatarsTreeIcon /> },
      { id: 'voices', group: 3, label: 'Voices', count: kit.voices.length || null, icon: <VoicesTreeIcon /> },
      { id: 'offers-and-pricing', group: 3, label: 'Offers and pricing', icon: <Bookmark size={15} strokeWidth={1.8} /> },
    ];
    const custom = (kit.customPages || []).map((page) => ({
      id: page.id,
      group: 4,
      label: page.title || 'Untitled page',
      icon: <FileText size={15} strokeWidth={1.8} />,
    }));
    return [...base, ...custom];
  }, [kit, catalog.length]);

  // Live search match check per card
  const visibleMap = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!kit || !q) return null;
    const has = (...parts) => parts.flat().some((val) => String(val || '').toLowerCase().includes(q));
    const map = {
      overview: has(
        'overview', kit.brandName, kit.about, kit.category, kit.mission, kit.positioning, kit.headline,
        kit.legalEntity, kit.phone, kit.email, kit.website, kit.app, kit.instagram, kit.tiktok, kit.youtube, kit.address,
      ),
      'brand-kit': has(
        'brand kit', 'logo', 'colors', 'typography', 'pronunciation', 'language', 'slogans',
        kit.logoNote, kit.pronunciation, kit.language, kit.headline, kit.slogans, kit.fonts,
        kit.colors.map((c) => `${c.name} ${c.hex}`),
      ),
      audience: has('audience', kit.audience),
      messaging: has('messaging', kit.sellingPoints, kit.tone, kit.claimsToAvoid, kit.disclaimer, kit.glossary),
      competitors: has('competitors', kit.competitors, kit.compareAgainst),
      products: has('products', parsedProducts.map(p => p.name + ' ' + p.description), kit.leadWith),
      avatars: has('avatars', kit.avatars.map((a) => `${a.name} ${a.description}`)),
      voices: has('voices', kit.voices.map((v) => `${v.name} ${v.description}`)),
      'offers-and-pricing': has('offers', 'pricing', 'plans', kit.plans, kit.deals),
    };
    (kit.customPages || []).forEach((p) => {
      map[p.id] = has(p.title, p.subtitle, p.items);
    });
    return map;
  }, [kit, parsedProducts, searchQuery]);

  // Scroll-spy syncing left tree & breadcrumb
  useEffect(() => {
    const container = mainScrollRef.current;
    if (!container || !kit) return undefined;
    const onScroll = () => {
      const containerTop = container.getBoundingClientRect().top;
      let current = navItems[0]?.id || 'overview';
      for (const item of navItems) {
        const el = cardRefs.current[item.id];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top - containerTop <= 130) current = item.id;
      }
      setActivePageId(current);
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [kit, navItems]);

  const scrollToCard = useCallback((id) => {
    setActivePageId(id);
    setMobileTreeOpen(false);
    const el = cardRefs.current[id];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const jumpToProduct = useCallback((productIndex) => {
    scrollToCard('products');
    setFlashProductIdx(productIndex);
    setTimeout(() => setFlashProductIdx(null), 1500);
  }, [scrollToCard]);

  const copyText = useCallback((key, text) => {
    if (!text) return;
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((prev) => (prev === key ? '' : prev)), 1500);
  }, []);

  const directorBrief = useMemo(() => {
    if (!kit) return '';
    return [
      kit.brandName ? `Create content for ${kit.brandName}.` : '',
      kit.about,
      kit.headline ? `Headline: ${kit.headline}` : '',
      kit.audience.length ? `Audience: ${kit.audience.join(' | ')}` : '',
      kit.language || kit.tone ? `Language & Tone: ${[kit.language, kit.tone].filter(Boolean).join(' — ')}` : '',
      kit.sellingPoints.length ? `Key selling points: ${kit.sellingPoints.join(' · ')}` : '',
      kit.claimsToAvoid.length ? `Claims to avoid: ${kit.claimsToAvoid.join(' · ')}` : '',
      kit.disclaimer,
    ].filter(Boolean).join('\n\n');
  }, [kit]);

  const addAvatarRow = () => {
    const nextIdx = kit.avatars.length;
    const entry = { id: `avatar-${Date.now()}`, name: '', description: '', tag: 'UGC' };
    setField('avatars', [...kit.avatars, entry]);
    setTimeout(() => avatarInputRefs.current[nextIdx]?.focus(), 20);
  };

  const addVoiceRow = () => {
    const nextIdx = kit.voices.length;
    const entry = { id: `voice-${Date.now()}`, name: '', description: '', tag: 'English' };
    setField('voices', [...kit.voices, entry]);
    setTimeout(() => voiceInputRefs.current[nextIdx]?.focus(), 20);
  };

  const addCustomPage = () => {
    const id = `custom-${Date.now()}`;
    const newPage = { id, title: 'New Brand Page', subtitle: '', items: [''] };
    updateKit((prev) => ({ ...prev, customPages: [...(prev.customPages || []), newPage] }));
    setSearchQuery('');
    setMobileTreeOpen(false);
    setTimeout(() => {
      cardRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      customTitleRefs.current[id]?.focus();
      customTitleRefs.current[id]?.select();
    }, 40);
  };

  const handleEraseAll = () => {
    setKit({ ...EMPTY_KIT });
    setDirty(true);
    setConfirmErase(false);
    setStatusMessage('All pages cleared — click Save to apply');
  };

  const handleRestoreDefaults = () => {
    setKit(normalizeKit(DEFAULT_FALLBACK_KIT));
    setDirty(true);
    setStatusMessage('Nexo Clip sample loaded — click Save to apply');
  };

  const activeNavLabel = navItems.find((n) => n.id === activePageId)?.label || 'Overview';
  const matchCount = visibleMap ? Object.values(visibleMap).filter(Boolean).length : null;
  const isCardVisible = (id) => (!visibleMap ? true : Boolean(visibleMap[id]));

  if (loading) {
    return (
      <main className="grid min-h-[100svh] place-items-center bg-[#fbfafc]" role="status" aria-label="Loading My Brand">
        <span className="h-7 w-7 animate-spin rounded-full border-2 border-[#e7e6f0] border-t-[#5b45f2]" />
      </main>
    );
  }

  if (!kit) {
    return (
      <div className="bs-root items-center justify-center p-8 text-sm text-[#6E6E7A]">
        {statusError || 'Brand Kit is unavailable.'}
      </div>
    );
  }

  const brandKitSummaryRows = [
    {
      id: 'logo',
      title: 'Logo',
      desc: kit.logoNote || 'Add logo usage guidelines and brand banner color.',
      tile: (
        <div className="bs-bk-tile">
          <div className="bs-bk-tile-logo-inner"><NexoLogoSvg src={kit.logoDataUrl} brandName={kit.brandName} /></div>
        </div>
      ),
    },
    {
      id: 'colors',
      title: 'Colors',
      desc: kit.colors.length
        ? kit.colors.map((c) => `${c.name}: ${c.hex}`).join(' · ')
        : 'No brand colors yet. Click to add HEX swatches.',
      tile: (
        <div className="bs-bk-tile bs-bk-tile-colors">
          {(kit.colors.length ? kit.colors.slice(0, 4) : [{ hex: '#0B0C0A' }, { hex: '#D4FF64' }]).map((c, idx) => (
            <span
              key={`${c.hex}-${idx}`}
              className="bs-bk-color-strip"
              style={{ flex: idx === 0 ? 1.3 : 1, backgroundColor: c.hex }}
            />
          ))}
        </div>
      ),
    },
    {
      id: 'typography',
      title: 'Typography',
      desc: kit.fonts.length ? kit.fonts.join(' · ') : 'No brand typography added yet.',
      tile: <div className="bs-bk-tile bs-bk-tile-typo">Aa</div>,
    },
    {
      id: 'pronunciation',
      title: 'Pronunciation',
      desc: kit.pronunciation ? `"${kit.brandName || 'Brand'}" is said ${kit.pronunciation}.` : 'Click to add brand pronunciation.',
      tile: (
        <div className="bs-bk-tile bs-bk-tile-icon">
          <Volume2 size={22} strokeWidth={1.7} />
        </div>
      ),
    },
    {
      id: 'language',
      title: 'Language',
      desc: kit.language || 'Click to set brand language and voice register.',
      tile: (
        <div className="bs-bk-tile bs-bk-tile-icon">
          <Globe size={22} strokeWidth={1.7} />
        </div>
      ),
    },
    {
      id: 'slogans',
      title: 'Name and slogans',
      desc: [kit.headline, ...kit.slogans].filter(Boolean).map((s) => `"${s}"`).join(' · ') || 'Click to add brand headline and slogans.',
      tile: (
        <div className="bs-bk-tile bs-bk-tile-typo" style={{ fontFamily: 'inherit', fontSize: 22, fontWeight: 500, color: '#9A9AA6' }}>
          T
        </div>
      ),
    },
  ];

  const hasBrandProfile = Boolean(
    kit.brandName || kit.about || kit.website || kit.category || kit.mission || kit.positioning || kit.headline ||
    kit.language || kit.tone || kit.logoDataUrl || kit.colors.length || kit.fonts.length || kit.audience.length || kit.sellingPoints.length
  );
  const isBrandEmpty = !hasBrandProfile && catalog.length === 0 && kit.audience.length === 0 && kit.sellingPoints.length === 0;

  if (!loading && !hasBrandProfile && !manualSetupStarted) {
    return (
      <main className="flex min-h-[100svh] items-center justify-center bg-[#fbfafc] px-5 py-12 text-[#171821]">
        <section className="w-full max-w-[932px]">
          <div className="mx-auto max-w-[700px] text-center">
            <h1 className="mb-2 text-[26px] font-semibold tracking-[-0.04em] sm:text-[29px]">Set up your brand</h1>
            <p className="mx-auto mb-6 max-w-[570px] text-[14px] leading-6 text-[#81859a]">
              Isi informasi brand secara manual. Brand Kit akan jadi acuan untuk konten yang kamu buat di Nexoclip.
            </p>
            <button
              type="button"
              onClick={() => setManualSetupStarted(true)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#5b45f2] px-5 text-[13px] font-semibold text-white shadow-[0_8px_20px_-8px_rgba(91,69,242,0.5)] transition hover:bg-[#4731d8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b45f2] focus-visible:ring-offset-2"
            >
              Mulai isi Brand Kit
            </button>
          </div>

          <div className="mt-16 sm:mt-[68px]">
            <div className="mb-3 flex items-center justify-between text-[13px] text-[#85899d]">
              <span>What you&apos;ll get</span>
              <span className="flex gap-1.5" aria-hidden="true">
                <span className="grid h-8 w-8 place-items-center rounded-full border border-[#e5e5ed] text-[#bcc0cc]"><ArrowLeft size={14} /></span>
                <span className="grid h-8 w-8 place-items-center rounded-full border border-[#e5e5ed] text-[#656a7b]"><ArrowRight size={14} /></span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="flex h-[112px] flex-col items-center justify-center rounded-xl bg-[#eeedff] px-4 text-center">
                <span className="font-serif text-[27px] italic text-[#6158ff]">Your brand</span>
                <span className="mt-1 text-[10px] text-[#85899d]">A clear overview of what you offer.</span>
              </div>
              <div className="flex h-[112px] items-center justify-center gap-3 rounded-xl bg-[#eeedff] px-3">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-white text-[#6158ff]"><Sparkles size={22} /></span>
                <span><span className="mb-2 flex gap-1"><i className="h-4 w-4 rounded-md bg-[#6158ff]" /><i className="h-4 w-4 rounded-md bg-[#aaa5ff]" /><i className="h-4 w-4 rounded-md bg-[#20212a]" /></span><span className="font-serif text-[13px]">Aa Bb Cc</span></span>
              </div>
              <div className="flex h-[112px] items-center justify-center rounded-xl bg-[#eeedff] px-3">
                <span className="rounded-full bg-white px-3 py-2 text-[11px] text-[#454756]">Your target audience</span>
              </div>
              <div className="flex h-[112px] flex-col items-center justify-center rounded-xl bg-[#eeedff] px-4 text-center">
                <span className="font-serif text-[16px] italic text-[#6158ff]">Your brand voice</span>
                <span className="mt-2 rounded-full bg-white px-2.5 py-1 text-[10px] text-[#777b8c]">Tone &amp; messaging</span>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3 text-[11px] text-[#606474] sm:grid-cols-4">
              {['Overview', 'Brand kit', 'Audience', 'Messaging'].map((label) => <span key={label}>{label}</span>)}
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="bs-root">
      <div
        className={`bs-tree-scrim${mobileTreeOpen ? ' is-open' : ''}`}
        onClick={() => setMobileTreeOpen(false)}
        aria-hidden="true"
      />

      {/* LEFT MY BRAND TREE PANEL */}
      <aside className={`bs-tree${mobileTreeOpen ? ' is-open' : ''}`} aria-label="My Brand navigation">
        <div className="bs-tree-header">
          <button
            type="button"
            className="bs-tree-back"
            onClick={() => (onBack ? onBack() : setMobileTreeOpen(false))}
            aria-label="Back to Studio Home"
            title="Back to Studio"
          >
            <ArrowLeft size={14} strokeWidth={2} />
          </button>
          <h1 className="bs-tree-title">My Brand</h1>
        </div>

        <div className="bs-tree-search-wrap">
          <span className="bs-tree-search-icon" aria-hidden="true">
            <Search size={13.5} strokeWidth={2} />
          </span>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search your brand..."
            aria-label="Search your brand"
            className="bs-tree-search"
          />
          {searchQuery && (
            <button
              type="button"
              className="bs-tree-search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <nav className="bs-tree-nav" aria-label="Brand pages">
          {navItems.map((item, idx) => {
            const prevGroup = idx > 0 ? navItems[idx - 1].group : item.group;
            const showDivider = idx > 0 && item.group !== prevGroup;
            const isActive = activePageId === item.id;
            const hiddenBySearch = visibleMap && !visibleMap[item.id];
            return (
              <div key={item.id}>
                {showDivider && <div className="bs-tree-divider" role="separator" />}
                <button
                  type="button"
                  onClick={() => scrollToCard(item.id)}
                  style={hiddenBySearch ? { opacity: 0.4 } : undefined}
                  className={`bs-tree-item${isActive ? ' is-active' : ''}`}
                >
                  {item.icon}
                  <span className="bs-tree-item-label">{item.label}</span>
                  {item.count !== null && item.count !== undefined && (
                    <span className="bs-tree-item-count">{item.count}</span>
                  )}
                </button>
              </div>
            );
          })}
        </nav>

        <div className="bs-tree-footer">
          <button type="button" className="bs-tree-footer-btn" onClick={addCustomPage}>
            <Plus size={14} strokeWidth={2} />
            <span>Add page</span>
          </button>
          <button
            type="button"
            className="bs-tree-footer-btn is-danger"
            onClick={() => setConfirmErase((v) => !v)}
          >
            <Trash2 size={13.5} strokeWidth={1.85} />
            <span>Erase all pages</span>
          </button>

          {confirmErase && (
            <div className="bs-erase-confirm" role="alert">
              <p>Clear all Brand Kit content for this workspace?</p>
              <div className="bs-erase-confirm-actions">
                <button type="button" className="bs-erase-cancel" onClick={() => setConfirmErase(false)}>
                  Cancel
                </button>
                <button type="button" className="bs-erase-do" onClick={handleEraseAll}>
                  Clear all
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* MAIN INLINE-EDITABLE DOCUMENT FEED */}
      <div className="bs-main" ref={mainScrollRef}>
        <header className="bs-topbar">
          <div className="bs-crumb-left">
            <button
              type="button"
              className="bs-tree-mobile-toggle"
              onClick={() => setMobileTreeOpen(true)}
              aria-label="Open My Brand pages"
            >
              <Menu size={14} />
              <span>Pages</span>
            </button>
            <span className="bs-crumb-root">My Brand</span>
            <span className="bs-crumb-sep" aria-hidden="true">/</span>
            <span className="bs-crumb-current">{activeNavLabel}</span>
          </div>

          <div className="bs-topbar-right">
            {matchCount !== null && (
              <span className="bs-save-status">
                {matchCount} matches
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{ border: 0, background: 'transparent', color: '#5D50F6', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                >
                  Clear
                </button>
              </span>
            )}

            {statusError ? (
              <span role="alert" className="bs-save-status is-error">
                <span className="bs-status-dot" />
                {statusError}
              </span>
            ) : statusMessage ? (
              <span role="status" className="bs-save-status is-saved">
                <Check size={13} />
                {statusMessage}
              </span>
            ) : dirty ? (
              <span className="bs-save-status is-dirty">
                <span className="bs-status-dot" />
                Unsaved changes
              </span>
            ) : null}

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className={`bs-save-btn${dirty ? ' is-dirty' : ''}`}
              title="Save Brand Kit (Ctrl/Cmd + S)"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </header>

        <main className="bs-feed">
          {isBrandEmpty && (
            <div className="bs-card">
              <div className="bs-card-body flex flex-wrap items-center justify-between gap-3 py-5">
                <p className="m-0 text-[13px] text-[#6E6E7A]">
                  Brand Kit kamu masih kosong. Isi manual atau gunakan profil contoh.
                </p>
                <button type="button" className="bs-btn-add" onClick={handleRestoreDefaults}>
                  Gunakan contoh Nexo Clip
                </button>
              </div>
            </div>
          )}

          {/* 1. OVERVIEW CARD */}
          {isCardVisible('overview') && (
            <section
              ref={(el) => { cardRefs.current.overview = el; }}
              id="brand-page-overview"
              data-tour="brandkit-header"
              className="bs-card"
            >
              <div className="bs-banner" style={{ backgroundColor: kit.bannerColor || '#D4FF64' }}>
                <label className="bs-banner-color-pick" title="Change banner color">
                  <input
                    type="color"
                    value={kit.bannerColor || '#D4FF64'}
                    onChange={(event) => setField('bannerColor', event.target.value.toUpperCase())}
                    aria-label="Overview banner color"
                  />
                  <span>Banner</span>
                </label>
                <div className="bs-logo-badge">
                  <NexoLogoSvg src={kit.logoDataUrl} brandName={kit.brandName} />
                </div>
              </div>

              <div className="bs-card-body">
                <div className="bs-card-head">
                  <h2 className="bs-card-title">Overview</h2>
                  <button
                    type="button"
                    className="bs-btn-add"
                    onClick={() => {
                      const nextIdx = kit.sellingPoints.length;
                      setField('sellingPoints', [...kit.sellingPoints, '']);
                      setFocusTarget({ section: 'overview-positioning', index: nextIdx });
                    }}
                  >
                    <Plus size={13} strokeWidth={2.2} />
                    <span>Add</span>
                  </button>
                </div>

                <AutoTextarea
                  value={kit.about}
                  onChange={(event) => setField('about', event.target.value)}
                  placeholder="Short summary of your brand, category, and key strengths…"
                  ariaLabel="Brand overview summary"
                  className="bs-inline-textarea is-subtitle"
                />

                <div className="bs-section">
                  <div className="bs-section-head">
                    <h3 className="bs-section-title">About</h3>
                  </div>
                  <div className="bs-kv-list">
                    <div className="bs-kv-row">
                      <span className="bs-kv-label">Brand</span>
                      <div className="bs-kv-value">
                        <input
                          type="text"
                          value={kit.brandName}
                          onChange={(event) => setField('brandName', event.target.value)}
                          placeholder="Brand name"
                          aria-label="Brand name"
                          className="bs-inline-text"
                        />
                      </div>
                    </div>
                    <div className="bs-kv-row">
                      <span className="bs-kv-label">Legal entity</span>
                      <div className="bs-kv-value">
                        <AutoTextarea
                          value={kit.legalEntity}
                          onChange={(event) => setField('legalEntity', event.target.value)}
                          placeholder="Legal entity name and location"
                          ariaLabel="Legal entity"
                        />
                      </div>
                    </div>
                    <div className="bs-kv-row">
                      <span className="bs-kv-label">Mission</span>
                      <div className="bs-kv-value">
                        <AutoTextarea
                          value={kit.mission}
                          onChange={(event) => setField('mission', event.target.value)}
                          placeholder="Core brand mission"
                          ariaLabel="Brand mission"
                        />
                      </div>
                    </div>
                    <div className="bs-kv-row">
                      <span className="bs-kv-label">Headline</span>
                      <div className="bs-kv-value">
                        <input
                          type="text"
                          value={kit.headline}
                          onChange={(event) => setField('headline', event.target.value)}
                          placeholder="Primary headline"
                          aria-label="Primary headline"
                          className="bs-inline-text"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bs-section">
                  <div className="bs-section-head">
                    <h3 className="bs-section-title">Category</h3>
                  </div>
                  <AutoTextarea
                    value={kit.category}
                    onChange={(event) => setField('category', event.target.value)}
                    placeholder="Industry or product category…"
                    ariaLabel="Brand category"
                  />
                </div>

                <div className="bs-section">
                  <div className="bs-section-head">
                    <h3 className="bs-section-title">Positioning</h3>
                  </div>
                  <AutoTextarea
                    value={kit.positioning}
                    onChange={(event) => setField('positioning', event.target.value)}
                    placeholder="How the brand positions itself in the market…"
                    ariaLabel="Brand positioning"
                  />
                </div>

                <div className="bs-section">
                  <div className="bs-section-head">
                    <h3 className="bs-section-title">Contact</h3>
                  </div>
                  <div className="bs-kv-list">
                    {[
                      ['phone', 'WhatsApp', '+62 …', (v) => (v ? `https://wa.me/${v.replace(/\D/g, '')}` : null)],
                      ['email', 'Email', 'support@brand.com', (v) => (v ? `mailto:${v}` : null)],
                      ['website', 'Site', 'https://brand.com', (v) => (/^https?:\/\//i.test(v) ? v : null)],
                      ['app', 'App', 'https://app.brand.com', (v) => (/^https?:\/\//i.test(v) ? v : null)],
                      ['instagram', 'Instagram', '@brand', null],
                      ['tiktok', 'TikTok', '@brand', null],
                      ['youtube', 'YouTube', '@brand', null],
                      ['address', 'Address', 'Full office address', null],
                    ].map(([key, label, placeholder, hrefFn]) => {
                      const href = hrefFn ? hrefFn(kit[key]) : null;
                      return (
                        <div key={key} className="bs-kv-row">
                          <span className="bs-kv-label">{label}</span>
                          <div className="bs-kv-value">
                            {key === 'address' ? (
                              <AutoTextarea
                                value={kit[key]}
                                onChange={(event) => setField(key, event.target.value)}
                                placeholder={placeholder}
                                ariaLabel={label}
                              />
                            ) : (
                              <input
                                type="text"
                                value={kit[key]}
                                onChange={(event) => setField(key, event.target.value)}
                                placeholder={placeholder}
                                aria-label={label}
                                className="bs-inline-text"
                              />
                            )}
                          </div>
                          {href && (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bs-kv-action"
                              title={`Open ${label}`}
                              aria-label={`Open ${label}`}
                            >
                              <ExternalLink size={13} />
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* 2. BRAND KIT CARD (6 INLINE-EXPANDABLE ROWS) */}
          {isCardVisible('brand-kit') && (
            <section
              ref={(el) => { cardRefs.current['brand-kit'] = el; }}
              id="brand-page-brand-kit"
              data-tour="brandkit-colors"
              className="bs-card"
            >
              <div className="bs-card-body">
                <div className="bs-card-head">
                  <h2 className="bs-card-title">Brand Kit</h2>
                </div>
                <p className="bs-card-subtitle">
                  {kit.brandName || 'Brand'}&apos;s logo, colors, fonts, language, and name and slogans. Click any row to edit inline.
                </p>

                <div className="bs-bk-list">
                  {brandKitSummaryRows.map((row) => {
                    const isOpen = openBrandKitRow === row.id;
                    return (
                      <div key={row.id} className={`bs-bk-item${isOpen ? ' is-open' : ''}`}>
                        <button
                          type="button"
                          className="bs-bk-row"
                          aria-expanded={isOpen}
                          onClick={() => setOpenBrandKitRow(isOpen ? null : row.id)}
                        >
                          {row.tile}
                          <div className="bs-bk-content">
                            <span className="bs-bk-title">{row.title}</span>
                            <span className="bs-bk-desc">{row.desc}</span>
                          </div>
                          <ChevronRight size={15} className="bs-row-chevron" aria-hidden="true" />
                        </button>

                        {isOpen && (
                          <div className="bs-bk-editor">
                            {row.id === 'logo' && (
                              <>
                                <AutoTextarea
                                  value={kit.logoNote}
                                  onChange={(event) => setField('logoNote', event.target.value)}
                                  placeholder="Logo and wordmark usage guidelines…"
                                  ariaLabel="Logo guidelines"
                                />
                                <div className="flex flex-wrap items-center gap-3 text-xs text-[#6E6E7A]">
                                  <label className="bs-btn-add" style={{ cursor: 'pointer' }}>
                                    <span>{kit.logoDataUrl ? 'Replace logo image' : 'Upload logo'}</span>
                                    <input
                                      type="file"
                                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                                      className="hidden"
                                      onChange={(event) => {
                                        const file = event.target.files?.[0];
                                        if (!file) return;
                                        if (file.size > 240000) {
                                          setStatusError('Maximum logo file size is 240KB.');
                                          return;
                                        }
                                        const reader = new FileReader();
                                        reader.onload = () => {
                                          if (typeof reader.result === 'string') {
                                            setField('logoDataUrl', reader.result);
                                          }
                                        };
                                        reader.readAsDataURL(file);
                                        event.target.value = '';
                                      }}
                                    />
                                  </label>
                                  {kit.logoDataUrl && (
                                    <button
                                      type="button"
                                      className="bs-btn-add"
                                      onClick={() => setField('logoDataUrl', '')}
                                    >
                                      Reset to default logo
                                    </button>
                                  )}
                                  <span className="inline-flex items-center gap-2">
                                    <span>Header banner color:</span>
                                    <input
                                      type="color"
                                      value={kit.bannerColor || '#D4FF64'}
                                      onChange={(event) => setField('bannerColor', event.target.value.toUpperCase())}
                                      className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
                                      aria-label="Banner color"
                                    />
                                    <code className="font-mono text-[11.5px]">{kit.bannerColor}</code>
                                  </span>
                                </div>
                              </>
                            )}

                            {row.id === 'colors' && (
                              <>
                                <div className="bs-swatch-grid">
                                  {kit.colors.map((color, idx) => (
                                    <div key={idx} className="bs-swatch-item">
                                      <input
                                        type="color"
                                        value={color.hex}
                                        aria-label={`Choose color ${color.name || idx + 1}`}
                                        onChange={(event) =>
                                          setField(
                                            'colors',
                                            kit.colors.map((item, i) =>
                                              i === idx ? { ...item, hex: event.target.value.toUpperCase() } : item
                                            )
                                          )
                                        }
                                      />
                                      <div className="bs-swatch-fields">
                                        <input
                                          type="text"
                                          value={color.name}
                                          placeholder="Color name"
                                          aria-label={`Color name ${idx + 1}`}
                                          onChange={(event) =>
                                            setField(
                                              'colors',
                                              kit.colors.map((item, i) =>
                                                i === idx ? { ...item, name: event.target.value } : item
                                              )
                                            )
                                          }
                                          className="bs-swatch-name-input"
                                        />
                                        <button
                                          type="button"
                                          className="bs-swatch-hex-btn"
                                          onClick={() => copyText(`hex-${idx}`, color.hex)}
                                          title="Copy HEX code"
                                        >
                                          {copiedKey === `hex-${idx}` ? 'Copied!' : color.hex}
                                        </button>
                                      </div>
                                      <button
                                        type="button"
                                        className="bs-swatch-remove"
                                        onClick={() => setField('colors', kit.colors.filter((_, i) => i !== idx))}
                                        aria-label={`Remove color ${color.name}`}
                                      >
                                        <X size={12} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                                <div>
                                  <button
                                    type="button"
                                    className="bs-btn-add"
                                    onClick={() =>
                                      setField('colors', [...kit.colors, { name: 'New accent', hex: '#5D50F6' }])
                                    }
                                  >
                                    <Plus size={13} />
                                    <span>Add color</span>
                                  </button>
                                </div>
                              </>
                            )}

                            {row.id === 'typography' && (
                              <>
                                <EditableBulletList
                                  items={kit.fonts}
                                  onChange={(next) => setField('fonts', next)}
                                  placeholder="e.g. Clash Display — heading"
                                  itemLabel="Font"
                                />
                                <div>
                                  <button
                                    type="button"
                                    className="bs-section-add-mini"
                                    onClick={() => setField('fonts', [...kit.fonts, ''])}
                                  >
                                    <Plus size={12} /> Add font
                                  </button>
                                </div>
                              </>
                            )}

                            {row.id === 'pronunciation' && (
                              <input
                                type="text"
                                value={kit.pronunciation}
                                onChange={(event) => setField('pronunciation', event.target.value)}
                                placeholder="e.g. NEK-so KLIP"
                                aria-label="Brand pronunciation"
                                className="bs-inline-text"
                              />
                            )}

                            {row.id === 'language' && (
                              <AutoTextarea
                                value={kit.language}
                                onChange={(event) => setField('language', event.target.value)}
                                placeholder="Language, voice style, and target region…"
                                ariaLabel="Brand language"
                              />
                            )}

                            {row.id === 'slogans' && (
                              <>
                                <div className="bs-kv-row" style={{ paddingLeft: 0 }}>
                                  <span className="bs-kv-label">Headline</span>
                                  <div className="bs-kv-value">
                                    <input
                                      type="text"
                                      value={kit.headline}
                                      onChange={(event) => setField('headline', event.target.value)}
                                      placeholder="Primary headline"
                                      aria-label="Primary headline"
                                      className="bs-inline-text"
                                    />
                                  </div>
                                </div>
                                <EditableBulletList
                                  items={kit.slogans}
                                  onChange={(next) => setField('slogans', next)}
                                  placeholder="Add a brand slogan…"
                                  itemLabel="Slogan"
                                />
                                <div>
                                  <button
                                    type="button"
                                    className="bs-section-add-mini"
                                    onClick={() => setField('slogans', [...kit.slogans, ''])}
                                  >
                                    <Plus size={12} /> Add slogan
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {/* 3. AUDIENCE CARD */}
          {isCardVisible('audience') && (
            <section
              ref={(el) => { cardRefs.current.audience = el; }}
              id="brand-page-audience"
              data-tour="brandkit-sections"
              className="bs-card"
            >
              <div className="bs-card-body">
                <div className="bs-card-head">
                  <h2 className="bs-card-title">Audience</h2>
                  <button
                    type="button"
                    className="bs-btn-add"
                    onClick={() => {
                      const nextIdx = kit.audience.length;
                      setField('audience', [...kit.audience, '']);
                      setFocusTarget({ section: 'audience', index: nextIdx });
                    }}
                  >
                    <Plus size={13} strokeWidth={2.2} />
                    <span>Add</span>
                  </button>
                </div>
                <p className="bs-card-subtitle">
                  Who {kit.brandName || 'your brand'}&apos;s ads speak to: segments, pain points, and what to lead with.
                </p>

                <div className="bs-section">
                  <div className="bs-section-head">
                    <h3 className="bs-section-title">
                      Target segments <span className="bs-section-count">{kit.audience.length}</span>
                    </h3>
                  </div>
                  <EditableBulletList
                    items={kit.audience}
                    onChange={(next) => setField('audience', next)}
                    placeholder="e.g. TikTok Shop sellers — need high-volume product videos; lead with AI UGC Video."
                    itemLabel="Audience segment"
                    focusIndex={focusTarget.section === 'audience' ? focusTarget.index : null}
                    onFocusHandled={() => setFocusTarget({ section: null, index: null })}
                  />

                  {parsedProducts.length > 0 && (
                    <div className="bs-chip-strip">
                      <span className="bs-chip-strip-label">Lead products:</span>
                      {parsedProducts.map((prod) => (
                        <button
                          key={prod.id}
                          type="button"
                          className="bs-product-chip"
                          onClick={() => jumpToProduct(prod.index)}
                        >
                          <Sparkles size={11} />
                          <span>{prod.name || `Product ${prod.index + 1}`}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* 4. MESSAGING CARD */}
          {isCardVisible('messaging') && (
            <section
              ref={(el) => { cardRefs.current.messaging = el; }}
              id="brand-page-messaging"
              className="bs-card"
            >
              <div className="bs-card-body">
                <div className="bs-card-head">
                  <h2 className="bs-card-title">Messaging</h2>
                  <button
                    type="button"
                    className="bs-btn-add"
                    onClick={() => {
                      const nextIdx = kit.sellingPoints.length;
                      setField('sellingPoints', [...kit.sellingPoints, '']);
                      setFocusTarget({ section: 'sellingPoints', index: nextIdx });
                    }}
                  >
                    <Plus size={13} strokeWidth={2.2} />
                    <span>Add</span>
                  </button>
                </div>
                <p className="bs-card-subtitle">
                  Selling points, tone, claims to avoid, disclaimers, and glossary for ads and scripts.
                </p>

                <div className="bs-section">
                  <div className="bs-section-head">
                    <h3 className="bs-section-title">Selling points</h3>
                    <button
                      type="button"
                      className="bs-section-add-mini"
                      onClick={() => {
                        const nextIdx = kit.sellingPoints.length;
                        setField('sellingPoints', [...kit.sellingPoints, '']);
                        setFocusTarget({ section: 'sellingPoints', index: nextIdx });
                      }}
                    >
                      <Plus size={12} /> Add
                    </button>
                  </div>
                  <EditableBulletList
                    items={kit.sellingPoints}
                    onChange={(next) => setField('sellingPoints', next)}
                    placeholder="Add a key selling point…"
                    itemLabel="Selling point"
                    focusIndex={
                      focusTarget.section === 'sellingPoints' || focusTarget.section === 'overview-positioning'
                        ? focusTarget.index
                        : null
                    }
                    onFocusHandled={() => setFocusTarget({ section: null, index: null })}
                  />
                </div>

                <div className="bs-section">
                  <div className="bs-section-head">
                    <h3 className="bs-section-title">Tone</h3>
                  </div>
                  <AutoTextarea
                    value={kit.tone}
                    onChange={(event) => setField('tone', event.target.value)}
                    placeholder="Communication style and brand voice personality…"
                    ariaLabel="Tone of voice"
                  />
                </div>

                <div className="bs-section">
                  <div className="bs-section-head">
                    <h3 className="bs-section-title">Claims to avoid</h3>
                    <button
                      type="button"
                      className="bs-section-add-mini"
                      onClick={() => {
                        const nextIdx = kit.claimsToAvoid.length;
                        setField('claimsToAvoid', [...kit.claimsToAvoid, '']);
                        setFocusTarget({ section: 'claimsToAvoid', index: nextIdx });
                      }}
                    >
                      <Plus size={12} /> Add
                    </button>
                  </div>
                  <EditableBulletList
                    items={kit.claimsToAvoid}
                    onChange={(next) => setField('claimsToAvoid', next)}
                    placeholder="Prohibited claims or items requiring approval…"
                    itemLabel="Claim to avoid"
                    focusIndex={focusTarget.section === 'claimsToAvoid' ? focusTarget.index : null}
                    onFocusHandled={() => setFocusTarget({ section: null, index: null })}
                  />
                </div>

                <div className="bs-section">
                  <div className="bs-section-head">
                    <h3 className="bs-section-title">Disclaimers</h3>
                  </div>
                  <AutoTextarea
                    value={kit.disclaimer}
                    onChange={(event) => setField('disclaimer', event.target.value)}
                    placeholder="Required disclaimers for ads and AI-generated content…"
                    ariaLabel="Disclaimer"
                  />
                </div>

                <div className="bs-section">
                  <div className="bs-section-head">
                    <h3 className="bs-section-title">Glossary</h3>
                    <button
                      type="button"
                      className="bs-section-add-mini"
                      onClick={() => {
                        const nextIdx = kit.glossary.length;
                        setField('glossary', [...kit.glossary, '']);
                        setFocusTarget({ section: 'glossary', index: nextIdx });
                      }}
                    >
                      <Plus size={12} /> Add
                    </button>
                  </div>
                  <EditableBulletList
                    items={kit.glossary}
                    onChange={(next) => setField('glossary', next)}
                    placeholder="Product terms or required brand vocabulary…"
                    itemLabel="Glossary"
                    focusIndex={focusTarget.section === 'glossary' ? focusTarget.index : null}
                    onFocusHandled={() => setFocusTarget({ section: null, index: null })}
                  />
                </div>
              </div>
            </section>
          )}

          {/* 5. COMPETITORS CARD */}
          {isCardVisible('competitors') && (
            <section
              ref={(el) => { cardRefs.current.competitors = el; }}
              id="brand-page-competitors"
              className="bs-card"
            >
              <div className="bs-card-body">
                <div className="bs-card-head">
                  <h2 className="bs-card-title">Competitors</h2>
                  <button
                    type="button"
                    className="bs-btn-add"
                    onClick={() => {
                      const nextIdx = kit.competitors.length;
                      setField('competitors', [...kit.competitors, '']);
                      setFocusTarget({ section: 'competitors', index: nextIdx });
                    }}
                  >
                    <Plus size={13} strokeWidth={2.2} />
                    <span>Add</span>
                  </button>
                </div>
                <p className="bs-card-subtitle">
                  Landscape of alternatives {kit.brandName || 'your brand'} competes with.
                </p>

                <div className="bs-section">
                  <div className="bs-section-head">
                    <h3 className="bs-section-title">Landscape</h3>
                  </div>
                  <EditableBulletList
                    items={kit.competitors}
                    onChange={(next) => setField('competitors', next)}
                    placeholder="Competitor or alternative name…"
                    itemLabel="Competitor"
                    focusIndex={focusTarget.section === 'competitors' ? focusTarget.index : null}
                    onFocusHandled={() => setFocusTarget({ section: null, index: null })}
                  />
                </div>

                <div className="bs-section">
                  <div className="bs-section-head">
                    <h3 className="bs-section-title">Compare against</h3>
                  </div>
                  <AutoTextarea
                    value={kit.compareAgainst}
                    onChange={(event) => setField('compareAgainst', event.target.value)}
                    placeholder="Key differentiators against competitors…"
                    ariaLabel="Competitor comparison"
                  />
                </div>
              </div>
            </section>
          )}

          {/* 6. PRODUCTS CARD */}
          {isCardVisible('products') && (
            <section
              ref={(el) => { cardRefs.current.products = el; }}
              id="brand-page-products"
              className="bs-card"
            >
              <div className="bs-card-body">
                <div className="bs-card-head">
                  <h2 className="bs-card-title">Products</h2>
                  <a className="bs-btn-add" href="/studio/products">Manage products</a>
                </div>

                <div className="bs-section">
                  <div className="bs-section-head">
                    <h3 className="bs-section-title">Lead with</h3>
                  </div>
                  <AutoTextarea
                    value={kit.leadWith}
                    onChange={(event) => setField('leadWith', event.target.value)}
                    placeholder="Featured products to prioritize per audience segment…"
                    ariaLabel="Product recommendation rules"
                  />
                </div>

                <div className="bs-section">
                  <div className="bs-section-head">
                    <h3 className="bs-section-title">
                      All products <span className="bs-section-count">{parsedProducts.length}</span>
                    </h3>
                  </div>

                  {parsedProducts.length === 0 ? (
                    <div className="bs-empty-state">
                      {catalogError || 'No products in this workspace yet.'}
                    </div>
                  ) : (
                    <div className="bs-entity-box">
                      {parsedProducts.map((prod) => (
                        <div
                          key={prod.id}
                          className={`bs-product-row${flashProductIdx === prod.index ? ' is-flash' : ''}`}
                        >
                          <div className="bs-product-thumb">
                            {prod.thumb ? (
                              <img src={prod.thumb} alt={prod.name || 'Product thumbnail'} width={38} height={38} />
                            ) : (
                              <span>{prod.letter}</span>
                            )}
                          </div>
                          <div className="bs-product-fields">
                            <strong>{prod.name}</strong>
                            <p>{prod.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* 7. AVATARS CARD */}
          {isCardVisible('avatars') && (
            <section
              ref={(el) => { cardRefs.current.avatars = el; }}
              id="brand-page-avatars"
              className="bs-card"
            >
              <div className="bs-card-body">
                <div className="bs-card-head">
                  <h2 className="bs-card-title">Avatars</h2>
                  <button type="button" className="bs-btn-add" onClick={addAvatarRow}>
                    <Plus size={13} strokeWidth={2.2} />
                    <span>Add</span>
                  </button>
                </div>
                <p className="bs-card-subtitle">The avatars this brand uses in ads.</p>

                {kit.avatars.length === 0 ? (
                  <div className="bs-empty-state">
                    The avatars you use with AI Director show up here.
                  </div>
                ) : (
                  <div className="bs-entity-box">
                    {kit.avatars.map((avatar, idx) => (
                      <div key={avatar.id || idx} className="bs-entry-row">
                        <div className="bs-product-thumb">
                          <span>{(avatar.name || 'A').charAt(0).toUpperCase()}</span>
                        </div>
                        <div className="bs-product-fields">
                          <input
                            ref={(node) => { avatarInputRefs.current[idx] = node; }}
                            type="text"
                            value={avatar.name}
                            onChange={(event) =>
                              setField(
                                'avatars',
                                kit.avatars.map((item, i) => (i === idx ? { ...item, name: event.target.value } : item))
                              )
                            }
                            placeholder="Character / avatar name (e.g. Rina — UGC Host)"
                            aria-label={`Avatar name ${idx + 1}`}
                            className="bs-product-name-input"
                          />
                          <AutoTextarea
                            value={avatar.description}
                            onChange={(event) =>
                              setField(
                                'avatars',
                                kit.avatars.map((item, i) =>
                                  i === idx ? { ...item, description: event.target.value } : item
                                )
                              )
                            }
                            placeholder="Visual style, wardrobe, or persona notes…"
                            ariaLabel={`Avatar description ${idx + 1}`}
                            className="bs-product-desc-input"
                          />
                        </div>
                        <button
                          type="button"
                          className="bs-row-remove"
                          onClick={() => setField('avatars', kit.avatars.filter((_, i) => i !== idx))}
                          aria-label={`Remove avatar ${idx + 1}`}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* 8. VOICES CARD */}
          {isCardVisible('voices') && (
            <section
              ref={(el) => { cardRefs.current.voices = el; }}
              id="brand-page-voices"
              className="bs-card"
            >
              <div className="bs-card-body">
                <div className="bs-card-head">
                  <h2 className="bs-card-title">Voices</h2>
                  <button type="button" className="bs-btn-add" onClick={addVoiceRow}>
                    <Plus size={13} strokeWidth={2.2} />
                    <span>Add</span>
                  </button>
                </div>
                <p className="bs-card-subtitle">The voices this brand uses in ads.</p>

                {kit.voices.length === 0 ? (
                  <div className="bs-empty-state">
                    The voices you use with AI Director show up here.
                  </div>
                ) : (
                  <div className="bs-entity-box">
                    {kit.voices.map((voice, idx) => (
                      <div key={voice.id || idx} className="bs-entry-row">
                        <div className="bs-product-thumb">
                          <Volume2 size={17} strokeWidth={1.8} />
                        </div>
                        <div className="bs-product-fields">
                          <input
                            ref={(node) => { voiceInputRefs.current[idx] = node; }}
                            type="text"
                            value={voice.name}
                            onChange={(event) =>
                              setField(
                                'voices',
                                kit.voices.map((item, i) => (i === idx ? { ...item, name: event.target.value } : item))
                              )
                            }
                            placeholder="Voice preset name (e.g. Dimas — Warm & Energetic)"
                            aria-label={`Voice name ${idx + 1}`}
                            className="bs-product-name-input"
                          />
                          <AutoTextarea
                            value={voice.description}
                            onChange={(event) =>
                              setField(
                                'voices',
                                kit.voices.map((item, i) =>
                                  i === idx ? { ...item, description: event.target.value } : item
                                )
                              )
                            }
                            placeholder="Accent, speaking pace, and voiceover feel…"
                            ariaLabel={`Voice description ${idx + 1}`}
                            className="bs-product-desc-input"
                          />
                        </div>
                        <button
                          type="button"
                          className="bs-row-remove"
                          onClick={() => setField('voices', kit.voices.filter((_, i) => i !== idx))}
                          aria-label={`Remove voice ${idx + 1}`}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* 9. OFFERS AND PRICING CARD */}
          {isCardVisible('offers-and-pricing') && (
            <section
              ref={(el) => { cardRefs.current['offers-and-pricing'] = el; }}
              id="brand-page-offers-and-pricing"
              className="bs-card"
            >
              <div className="bs-card-body">
                <div className="bs-card-head">
                  <h2 className="bs-card-title">Offers and pricing</h2>
                  <button
                    type="button"
                    className="bs-btn-add"
                    onClick={() => {
                      const nextIdx = kit.plans.length;
                      setField('plans', [...kit.plans, '']);
                      setFocusTarget({ section: 'plans', index: nextIdx });
                    }}
                  >
                    <Plus size={13} strokeWidth={2.2} />
                    <span>Add</span>
                  </button>
                </div>
                <p className="bs-card-subtitle">
                  Active plans, billing terms, top-ups, and promotional offers.
                </p>

                <div className="bs-section">
                  <div className="bs-section-head">
                    <h3 className="bs-section-title">Plans</h3>
                  </div>
                  <EditableBulletList
                    items={kit.plans}
                    onChange={(next) => setField('plans', next)}
                    placeholder="e.g. Creator — 2,800 credits/month"
                    itemLabel="Pricing plan"
                    focusIndex={focusTarget.section === 'plans' ? focusTarget.index : null}
                    onFocusHandled={() => setFocusTarget({ section: null, index: null })}
                  />
                </div>

                <div className="bs-section">
                  <div className="bs-section-head">
                    <h3 className="bs-section-title">Current deals</h3>
                    <button
                      type="button"
                      className="bs-section-add-mini"
                      onClick={() => {
                        const nextIdx = kit.deals.length;
                        setField('deals', [...kit.deals, '']);
                        setFocusTarget({ section: 'deals', index: nextIdx });
                      }}
                    >
                      <Plus size={12} /> Add
                    </button>
                  </div>
                  <EditableBulletList
                    items={kit.deals}
                    onChange={(next) => setField('deals', next)}
                    placeholder="Active promotions or annual offers…"
                    itemLabel="Promotion"
                    focusIndex={focusTarget.section === 'deals' ? focusTarget.index : null}
                    onFocusHandled={() => setFocusTarget({ section: null, index: null })}
                  />
                </div>
              </div>
            </section>
          )}

          {/* 10. CUSTOM PAGES (ADDED INLINE VIA + ADD PAGE) */}
          {(kit.customPages || []).map((page, pageIdx) =>
            isCardVisible(page.id) ? (
              <section
                key={page.id}
                ref={(el) => { cardRefs.current[page.id] = el; }}
                id={`brand-page-${page.id}`}
                className="bs-card"
              >
                <div className="bs-card-body">
                  <div className="bs-card-head">
                    <div className="min-w-0 flex-1">
                      <input
                        ref={(node) => { customTitleRefs.current[page.id] = node; }}
                        type="text"
                        value={page.title}
                        onChange={(event) =>
                          setField(
                            'customPages',
                            kit.customPages.map((p, i) => (i === pageIdx ? { ...p, title: event.target.value } : p))
                          )
                        }
                        placeholder="Page title…"
                        aria-label="Custom page title"
                        className="bs-card-title-input"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        className="bs-btn-add"
                        onClick={() => {
                          const nextItems = [...(page.items || []), ''];
                          setField(
                            'customPages',
                            kit.customPages.map((p, i) => (i === pageIdx ? { ...p, items: nextItems } : p))
                          );
                          setFocusTarget({ section: page.id, index: nextItems.length - 1 });
                        }}
                      >
                        <Plus size={13} strokeWidth={2.2} />
                        <span>Add</span>
                      </button>
                      <button
                        type="button"
                        className="bs-btn-add"
                        style={{ padding: '0 8px', color: '#DC2626' }}
                        onClick={() =>
                          setField('customPages', kit.customPages.filter((_, i) => i !== pageIdx))
                        }
                        aria-label={`Delete page ${page.title}`}
                        title="Delete page"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <AutoTextarea
                    value={page.subtitle || ''}
                    onChange={(event) =>
                      setField(
                        'customPages',
                        kit.customPages.map((p, i) => (i === pageIdx ? { ...p, subtitle: event.target.value } : p))
                      )
                    }
                    placeholder="Add a short summary for this page…"
                    ariaLabel="Custom page subtitle"
                    className="bs-inline-textarea is-subtitle"
                  />

                  <div className="bs-section">
                    <EditableBulletList
                      items={page.items || []}
                      onChange={(nextItems) =>
                        setField(
                          'customPages',
                          kit.customPages.map((p, i) => (i === pageIdx ? { ...p, items: nextItems } : p))
                        )
                      }
                      placeholder="Write brand notes or guidelines…"
                      itemLabel="Note"
                      focusIndex={focusTarget.section === page.id ? focusTarget.index : null}
                      onFocusHandled={() => setFocusTarget({ section: null, index: null })}
                    />
                  </div>
                </div>
              </section>
            ) : null
          )}
        </main>
      </div>

      {/* FLOATING PURPLE AI DIRECTOR BRIEF BUTTON */}
      <div className="bs-fab-wrap" ref={fabWrapRef} data-tour="brandkit-actions">
        {briefOpen && (
          <div className="bs-fab-popover" role="region" aria-label="AI Director Brand Brief">
            <div className="bs-fab-pop-head">
              <h3>AI Director Brief</h3>
              <button
                type="button"
                onClick={() => setBriefOpen(false)}
                aria-label="Close brief panel"
                className="bs-tree-back"
              >
                <X size={13} />
              </button>
            </div>
            <pre className="bs-fab-brief">{directorBrief || 'Fill in your Brand Kit profile first to generate a brief.'}</pre>
            <div className="bs-fab-actions">
              <button
                type="button"
                className="bs-fab-btn-secondary"
                onClick={() => copyText('brief', directorBrief)}
              >
                <span className="inline-flex items-center justify-center gap-1.5">
                  {copiedKey === 'brief' ? <Check size={13} /> : <Copy size={13} />}
                  {copiedKey === 'brief' ? 'Copied' : 'Copy Brief'}
                </span>
              </button>
              <button
                type="button"
                className="bs-fab-btn-primary"
                onClick={() => {
                  setBriefOpen(false);
                  onOpenDirector?.(directorBrief);
                }}
              >
                Start in AI Director
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          className="bs-fab"
          onClick={() => setBriefOpen((v) => !v)}
          aria-expanded={briefOpen}
          aria-label="Preview AI Director Brand Brief"
          title="AI Director Brand Brief"
        >
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="10.8" cy="10.8" r="6.4" stroke="#FFFFFF" strokeWidth="2.1" />
            <path d="M8.5 11.7c.7.9 1.5 1.3 2.3 1.3s1.6-.4 2.3-1.3" stroke="#FFFFFF" strokeWidth="1.65" strokeLinecap="round" />
            <path d="M15.6 15.6L20 20" stroke="#FFFFFF" strokeWidth="2.3" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
