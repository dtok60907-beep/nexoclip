'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowUp,
  Brain,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clapperboard,
  CloudUpload,
  Compass,
  Copy,
  CreditCard,
  ExternalLink,
  FileSearch,
  FileText,
  Folder,
  Image as ImageIcon,
  Layers,
  Lightbulb,
  Link2,
  Loader2,
  MessageSquare,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Plus,
  Repeat,
  Rocket,
  Search,
  SearchCheck,
  SlidersHorizontal,
  Sparkles,
  SwatchBook,
  Target,
  Trash2,
  UserCheck,
  Workflow,
  X,
  Zap,
} from 'lucide-react';
import ArtifactViewer from './ArtifactViewer.js';
import BrandContextMenu from './BrandContextMenu.js';
import InlineMentionInput from './InlineMentionInput.js';
import MarketingMarkdown from './MarketingMarkdown.js';
import {
  ApprovalActionCard,
  ClarifyingQuestionsBlock,
  ConceptOptionsGrid,
  InlineCampaignCard,
  InlineResearchCard,
  RoutinesPanel,
  StoryboardCard,
} from './MarketingChatBlocks.js';

const DEFAULT_AUTO_LLM = 'dola-seed-2-1-turbo-260628';
const DEFAULT_AUTO_VIDEO = 'seedance-2.5';

const LLM_MODEL_OPTIONS = [
  { id: 'dola-seed-2-1-turbo-260628', label: 'Seed 2.1 Turbo', badge: 'Auto', desc: 'Cepat, tajam & hemat — default rekomendasi.' },
  { id: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4', badge: 'Strategy', desc: 'Copywriting & creative strategy mendalam.' },
  { id: 'openai/gpt-4o', label: 'GPT-4o', badge: 'Balanced', desc: 'Seimbang untuk riset & ide campaign.' },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', badge: 'Research', desc: 'Analisis panjang & multi-dokumen.' },
];

const VIDEO_MODEL_OPTIONS = [
  { id: 'seedance-2.5', label: 'Seedance 2.5', badge: 'Auto', desc: 'Default terbaik untuk ad video & motion.' },
  { id: 'seedance-2.0-pro', label: 'Seedance 2.0 Pro', badge: 'Cinematic', desc: 'Multi-shot konsisten & lip-sync.' },
  { id: 'kling-3.0-pro', label: 'Kling 3.0 Pro', badge: 'Realism', desc: 'Gerakan natural & product showcase.' },
  { id: 'veo-3', label: 'Veo 3', badge: 'Audio+Video', desc: 'Video dengan native sound effects.' },
  { id: 'wan-2.6', label: 'Wan 2.6', badge: 'Fast', desc: 'Draft cepat & eksperimen angle.' },
];

const QUICK_ACTIONS = [
  {
    id: 'ugc-testimonial',
    label: 'UGC Testimonial',
    icon: UserCheck,
    prompt:
      'Create a 30-second natural smartphone UGC testimonial ad concept for my brand product — complete with 0–3s hook, pain point, storyboard, pre-production visual pack, and Canvas-ready Seedance 2.5 prompt.',
  },
  {
    id: 'launch-video',
    label: 'Launch Video',
    icon: Rocket,
    prompt:
      'Build a 7-day product launch campaign for TikTok & Instagram (teaser, pain-point UGC, demo, tutorial, FAQ, launch offer) complete with Canvas-ready visual prompts.',
  },
  {
    id: 'creative-insight',
    label: 'Creative Insight',
    icon: FileSearch,
    prompt:
      'Research winning content and ad trends in my product category (Meta Ads Library + TikTok + 0–3s hook transcripts), then save a Research Report with Creative Opportunities.',
  },
  {
    id: 'ad-clone',
    label: 'Ad Clone',
    icon: Copy,
    prompt:
      'Find long-running winning competitor video ads in Meta Ads Library, reverse-engineer their hook & visual structure, and adapt them into a fresh ad concept for my brand.',
  },
  {
    id: 'fresh-ideas',
    label: 'Fresh Ideas',
    icon: Lightbulb,
    prompt:
      'Give me 5 fresh, scroll-stopping ad ideas for TikTok and Reels based on My Brand and products, complete with angle, opening hook, and video format.',
  },
  {
    id: 'review-ads',
    label: 'Review Ads',
    icon: SearchCheck,
    prompt:
      'Audit my ad idea and copy against target audience, brand guardrails, and proven winning ad patterns — give sharp feedback plus 3 stronger hook rewrites.',
  },
  {
    id: 'competitor-analysis',
    label: 'Competitor Analysis',
    icon: Compass,
    prompt:
      'Analyze my top competitors’ active ads and content across Meta Ads Library & TikTok, uncover positioning gaps, and save a Creative Strategy to beat them.',
  },
  {
    id: 'image-ads',
    label: 'Image Ads',
    icon: ImageIcon,
    prompt:
      'Design 4 static Image Ad concepts (before-after, social proof, comparison, direct offer) complete with headline, sub-copy, CTA, and visual prompts.',
  },
  {
    id: 'hook-script',
    label: 'Hook & Script',
    icon: Clapperboard,
    prompt:
      'Write 10 scroll-stopping 0–3s hook variations (question, contrarian, problem-call, proof-first) plus 2 complete 20-second scripts matching my brand voice.',
  },
];

function PlatformIcon({ id }) {
  if (id === 'tiktok') {
    return (
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1 0-5.78c.3 0 .6.04.88.13V9.01a6.33 6.33 0 0 0-.88-.06 6.34 6.34 0 0 0 0 12.68 6.34 6.34 0 0 0 6.34-6.34V8.81a8.26 8.26 0 0 0 4.76 1.5V6.88a4.85 4.85 0 0 1-1-.19Z" />
      </svg>
    );
  }
  if (id === 'youtube') {
    return (
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#FF0000]" fill="currentColor" aria-hidden="true">
        <path d="M23.5 6.2a3.01 3.01 0 0 0-2.12-2.13C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.57A3.01 3.01 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3.01 3.01 0 0 0 2.12 2.13c1.88.57 9.38.57 9.38.57s7.5 0 9.38-.57a3.01 3.01 0 0 0 2.12-2.13A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.3 3.6-6.3 3.6Z" />
      </svg>
    );
  }
  if (id === 'instagram') {
    return (
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#E1306C]" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true">
        <rect x="2.5" y="2.5" width="19" height="19" rx="5" />
        <circle cx="12" cy="12" r="4.2" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (id === 'google-sheets') {
    return (
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#0F9D58]" fill="currentColor" aria-hidden="true">
        <path d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm7 1.5V9h5.5L13 3.5ZM7 12v2h4v-2H7Zm6 0v2h4v-2h-4Zm-6 4v2h4v-2H7Zm6 0v2h4v-2h-4Z" />
      </svg>
    );
  }
  if (id === 'dropbox') {
    return (
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#0061FF]" fill="currentColor" aria-hidden="true">
        <path d="M6.7 3 1.5 6.4 6.7 9.8 12 6.4 6.7 3Zm10.6 0L12 6.4l5.3 3.4 5.2-3.4L17.3 3ZM1.5 13.2l5.2 3.4L12 13.2 6.7 9.8 1.5 13.2Zm15.8-3.4L12 13.2l5.3 3.4 5.2-3.4-5.2-3.4ZM6.7 17.8 12 21.2l5.3-3.4-5.3-3.4-5.3 3.4Z" />
      </svg>
    );
  }
  // google-drive
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
      <path fill="#0066DA" d="M7.71 3.5 1.15 15l3.43 6 6.55-11.5L7.71 3.5Z" />
      <path fill="#00AC47" d="M22.85 15 16.29 3.5H9.43L16 15h6.85Z" />
      <path fill="#FFBA00" d="M4.58 21h13.71l3.43-6H8.01l-3.43 6Z" />
    </svg>
  );
}

const ACCOUNT_CHANNELS = [
  { id: 'tiktok', label: 'TikTok' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'meta', label: 'Meta Ads' },
];

const CONNECTOR_CHANNELS = [
  { id: 'google-drive', label: 'Google Drive' },
  { id: 'dropbox', label: 'Dropbox' },
  { id: 'google-sheets', label: 'Google Sheets' },
];

const INTEGRATE_CHANNELS = [
  { id: 'tiktok', label: 'TikTok' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'google-drive', label: 'Google Drive' },
  { id: 'dropbox', label: 'Dropbox' },
  { id: 'google-sheets', label: 'Google Sheets' },
];

function getWorkspaceId() {
  if (typeof window === 'undefined') return '';
  try {
    return window.sessionStorage.getItem('nexoclip_workspace_id') || '';
  } catch {
    return '';
  }
}

function activeThreadStorageKey() {
  const wsId = getWorkspaceId();
  return wsId ? `nexoclip_marketing_active_thread:${wsId}` : 'nexoclip_marketing_active_thread';
}

function saveActiveThreadId(id) {
  if (typeof window === 'undefined') return;
  try {
    if (id) window.sessionStorage.setItem(activeThreadStorageKey(), id);
    else window.sessionStorage.removeItem(activeThreadStorageKey());
  } catch {}
}

function readSavedThreadId() {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(activeThreadStorageKey()) || null;
  } catch {
    return null;
  }
}

async function mApi(path, options = {}) {
  const wsId = getWorkspaceId();
  const headers = {
    ...(wsId ? { 'x-workspace-id': wsId } : {}),
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(`/api/marketing${path}`, {
    credentials: 'include',
    cache: 'no-store',
    ...options,
    headers,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error || `Request failed (${res.status})`);
  return payload;
}

function ActivityTrace({ steps = [], defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!steps.length) return null;
  const activeStep = steps.find((s) => s.status === 'running');
  const isRunning = Boolean(activeStep);

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg py-0.5 text-[12px] font-medium text-[#7A7D8F] transition hover:text-[#282A35]"
      >
        {isRunning ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#5B45F2]" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 text-[#8C8FA1]" />
        )}
        <span>
          {isRunning ? activeStep.label : `Worked · ${steps.length} ${steps.length === 1 ? 'step' : 'steps'}`}
        </span>
        <ChevronRight
          className={`h-3 w-3 opacity-70 transition-transform ${open || isRunning ? 'rotate-90' : ''}`}
        />
      </button>

      {(open || isRunning) && (
        <div className="mt-1.5 space-y-1.5 border-l border-[#E7E7F0] pl-3">
          {steps.map((s) => (
            <div key={s.id} className="flex items-start gap-2 text-[12px]">
              {s.status === 'running' ? (
                <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-[#5B45F2]" />
              ) : s.status === 'error' ? (
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
              ) : (
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
              )}
              <div className="min-w-0 flex-1 text-[#525568]">
                <span className="font-medium text-[#282A35]">{s.label}</span>
                {s.detail && <span className="ml-1.5 text-[#8C8FA1]">— {s.detail}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UserBubbleContent({ content = '', contextRefs = [] }) {
  const raw = String(content || '');
  const refLabels = Array.isArray(contextRefs)
    ? contextRefs.map((r) => String(r?.path || r?.label || '').trim()).filter(Boolean)
    : [];
  const allTargets = [...new Set([...refLabels, 'My Brand'])].sort((a, b) => b.length - a.length);

  const tokens = useMemo(() => {
    if (!raw || !allTargets.length) return [{ kind: 'text', value: raw }];
    const escaped = allTargets.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const re = new RegExp(`@(${escaped})`, 'gi');
    const out = [];
    let last = 0;
    let m;
    while ((m = re.exec(raw)) !== null) {
      if (m.index > last) out.push({ kind: 'text', value: raw.slice(last, m.index) });
      out.push({ kind: 'mention', value: m[0] });
      last = m.index + m[0].length;
    }
    if (last < raw.length) out.push({ kind: 'text', value: raw.slice(last) });
    return out;
  }, [raw, allTargets.join('|')]);

  const inlineMatchedLower = new Set(
    tokens.filter((t) => t.kind === 'mention').map((t) => t.value.slice(1).toLowerCase()),
  );
  const orphanRefs = (contextRefs || []).filter(
    (r) => !inlineMatchedLower.has(String(r?.path || r?.label || '').toLowerCase()),
  );

  return (
    <>
      {orphanRefs.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {orphanRefs.map((ref, idx) => (
            <span
              key={ref.id || idx}
              className="inline-flex max-w-[240px] items-center rounded-[6px] border border-[#DDDDE6] bg-[#E5E5EC] px-1.5 py-[1px] text-[12px] font-medium text-[#282A35]"
            >
              <span className="truncate">@{ref.path || ref.label}</span>
            </span>
          ))}
        </div>
      )}
      <div className="whitespace-pre-wrap break-words">
        {tokens.map((tok, idx) =>
          tok.kind === 'mention' ? (
            <span
              key={idx}
              className="mx-0.5 inline-flex items-center rounded-[6px] border border-[#DDDDE6] bg-[#E5E5EC] px-1.5 py-[1px] align-baseline text-[12.5px] font-medium text-[#282A35]"
            >
              {tok.value}
            </span>
          ) : (
            <span key={idx}>{tok.value}</span>
          ),
        )}
      </div>
    </>
  );
}

export default function CreativeMarketingApp({ initialBrief = '', onHeroChange = null, onNavigate = null }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Workspace bootstrap data
  const [brandKit, setBrandKit] = useState({ configured: false });
  const [brandContextTree, setBrandContextTree] = useState({ configured: false, sections: [], products: [] });
  const [products, setProducts] = useState([]);
  const [memories, setMemories] = useState([]);
  const [integrations, setIntegrations] = useState([]);
  const [capabilities, setCapabilities] = useState({ scrapeAtlasReady: false, videoWatcherReady: false, llmReady: true });
  const [threads, setThreads] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [campaignsById, setCampaignsById] = useState({});
  const [artifacts, setArtifacts] = useState([]);
  const [routines, setRoutines] = useState([]);
  const [skillsMeta, setSkillsMeta] = useState([]);
  const [activeSkillId, setActiveSkillId] = useState(null);
  const [decidingApprovalId, setDecidingApprovalId] = useState(null);
  const [openingApprovalCanvasId, setOpeningApprovalCanvasId] = useState(null);

  // Active workspace UI state
  const [railOpen, setRailOpen] = useState(true);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [campaignsExpanded, setCampaignsExpanded] = useState(true);
  const [artifactsExpanded, setArtifactsExpanded] = useState(true);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [liveSteps, setLiveSteps] = useState([]);
  const [running, setRunning] = useState(false);

  // Composer controls
  const [input, setInput] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsMode, setSettingsMode] = useState('auto'); // 'auto' | 'advanced'
  const [llmModel, setLlmModel] = useState(DEFAULT_AUTO_LLM);
  const [videoModel, setVideoModel] = useState(DEFAULT_AUTO_VIDEO);
  const [brandEnabled, setBrandEnabled] = useState(true);
  const [brandFullExplicit, setBrandFullExplicit] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [selectedContextRefs, setSelectedContextRefs] = useState([]); // [{ id, label, path, content, productId }]
  const [inlineBrandMentioned, setInlineBrandMentioned] = useState(false);
  const [mentionMenu, setMentionMenu] = useState({ open: false, query: '', node: null, startOffset: 0, endOffset: 0 });
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState(null); // 'my-brand' | 'accounts' | 'connectors' | 'skills'
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [workspaceAssets, setWorkspaceAssets] = useState([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [assetSearch, setAssetSearch] = useState('');
  const [attachments, setAttachments] = useState([]); // [{ id, name, kind, url, previewUrl, textSnippet, source }]
  const [integrateBannerDismissed, setIntegrateBannerDismissed] = useState(false);

  // Right persistent artifact panel
  const [panel, setPanel] = useState(null);
  const [openingDeliverableId, setOpeningDeliverableId] = useState(null);

  const chatEndRef = useRef(null);
  const composerRef = useRef(null);
  const fileInputRef = useRef(null);
  const mentionStoreRef = useRef(new Map());
  const initialBriefConsumed = useRef(false);

  const isHero = messages.length === 0 && !running;
  useEffect(() => {
    onHeroChange?.(isHero);
  }, [isHero, onHeroChange]);

  const refreshBootstrap = useCallback(async () => {
    try {
      const data = await mApi('/bootstrap');
      setBrandKit(data.brandKit || { configured: false });
      setBrandContextTree(data.brandContextTree || { configured: false, sections: [], products: [] });
      setProducts(data.products || []);
      setMemories(data.memories || []);
      setIntegrations(data.integrations || []);
      setCapabilities(data.capabilities || {});
      setThreads(data.threads || []);
      setCampaigns(data.campaigns || []);
      setArtifacts(data.artifacts || []);
      setRoutines(data.routines || []);
      setSkillsMeta(data.skills || []);
      setError('');
    } catch (err) {
      setError(err.message || 'Gagal memuat AI Creative Marketing.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshBootstrap();
  }, [refreshBootstrap]);

  useEffect(() => {
    if (initialBrief && !initialBriefConsumed.current) {
      initialBriefConsumed.current = true;
      setInput(initialBrief);
      setTimeout(() => composerRef.current?.setPlainText(initialBrief), 30);
    }
  }, [initialBrief]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, liveSteps.length]);

  const openThread = useCallback(async (threadId) => {
    setActiveThreadId(threadId);
    saveActiveThreadId(threadId);
    setLiveSteps([]);
    setError('');
    try {
      const data = await mApi(`/threads/${threadId}`);
      const t = data.thread;
      setMessages(Array.isArray(t.messages_json) ? t.messages_json : []);
      setBrandEnabled(t.brand_context_enabled ?? true);
      setSelectedProductIds(Array.isArray(t.selected_product_ids) ? t.selected_product_ids : []);
      if (data.campaign?.id) {
        setCampaignsById((prev) => ({ ...prev, [data.campaign.id]: data.campaign }));
      }
      if (Array.isArray(data.artifacts) && data.artifacts.length) {
        setArtifacts((prev) => {
          const map = new Map(prev.map((a) => [a.id, a]));
          for (const a of data.artifacts) map.set(a.id, a);
          return Array.from(map.values());
        });
      }
      setPanel(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const restoredOnceRef = useRef(false);
  useEffect(() => {
    if (loading || restoredOnceRef.current || activeThreadId) return;
    restoredOnceRef.current = true;
    const savedId = readSavedThreadId();
    if (savedId && threads.some((t) => t.id === savedId)) {
      openThread(savedId);
    }
  }, [loading, threads, activeThreadId, openThread]);

  const startNewSession = useCallback(() => {
    setActiveThreadId(null);
    saveActiveThreadId(null);
    setMessages([]);
    setLiveSteps([]);
    setPanel(null);
    setError('');
    setTimeout(() => composerRef.current?.focus(), 30);
  }, []);

  const openCampaignById = useCallback(async (campaignId) => {
    try {
      const data = await mApi(`/campaigns/${campaignId}`);
      if (data.campaign) {
        setCampaignsById((prev) => ({ ...prev, [data.campaign.id]: data.campaign }));
      }
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const sendMessage = useCallback(
    async (overrideText = null) => {
      const snap = overrideText === null ? composerRef.current?.getSnapshot?.() : null;
      const baseText = String(overrideText ?? snap?.text ?? input).trim();
      const mentionIds = snap?.mentionIds || [];

      const inlineEntries = mentionIds
        .map((id) => mentionStoreRef.current.get(id))
        .filter(Boolean);
      const hasInlineFullBrand = mentionIds.includes('brand:full');
      const currentContextRefs = inlineEntries.filter((e) => e.kind === 'context');
      const currentAttachments = inlineEntries.filter((e) => e.kind === 'attachment');

      if ((!baseText && currentAttachments.length === 0 && currentContextRefs.length === 0) || running) return;

      const effectiveBrandEnabled = hasInlineFullBrand
        ? true
        : currentContextRefs.length > 0
          ? false
          : brandEnabled;

      const attachmentContext = currentAttachments.length
        ? `\n\n[Attached References]\n${currentAttachments
            .map((att, idx) => {
              const parts = [`${idx + 1}. ${att.name} (${att.fileKind || 'file'})`];
              if (att.url) parts.push(`URL: ${att.url}`);
              if (att.textSnippet) parts.push(`Excerpt: ${att.textSnippet}`);
              return parts.join(' — ');
            })
            .join('\n')}`
        : '';
      const visibleMessage = baseText || 'Tolong analisis konteks & referensi terlampir.';
      const textForAgent = `${visibleMessage}${attachmentContext}`;

      setInput('');
      setAttachments([]);
      setSelectedContextRefs([]);
      setInlineBrandMentioned(false);
      composerRef.current?.clear?.();
      setError('');
      setRunning(true);
      setLiveSteps([]);
      setContextMenuOpen(false);
      setActiveSubmenu(null);
      setSettingsOpen(false);
      setMentionMenu({ open: false, query: '', node: null, startOffset: 0, endOffset: 0 });

      const bubbleRefs = [
        ...(hasInlineFullBrand ? [{ id: 'brand:full', label: 'My Brand', path: 'My Brand' }] : []),
        ...currentContextRefs.map((r) => ({ id: r.id, label: r.label, path: r.path })),
        ...currentAttachments.map((a) => ({ id: a.id, label: a.name, path: a.name })),
      ];

      const optimisticUserMsg = {
        id: `tmp-u-${Date.now()}`,
        role: 'user',
        content: visibleMessage,
        ...(bubbleRefs.length ? { contextRefs: bubbleRefs } : {}),
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticUserMsg]);

      const activeLlm = settingsMode === 'auto' ? DEFAULT_AUTO_LLM : llmModel;
      const activeVideo = settingsMode === 'auto' ? DEFAULT_AUTO_VIDEO : videoModel;
      const currentSkillId = activeSkillId;
      setActiveSkillId(null);

      try {
        let tid = activeThreadId;
        if (!tid) {
          const created = await mApi('/threads', {
            method: 'POST',
            body: JSON.stringify({
              title: visibleMessage.slice(0, 64),
              mode: 'agent',
              brandContextEnabled: effectiveBrandEnabled,
              selectedProductIds,
            }),
          });
          tid = created.thread.id;
          setActiveThreadId(tid);
          saveActiveThreadId(tid);
          setThreads((prev) => [created.thread, ...prev]);
        }

        const mergedProductIds = [
          ...new Set([
            ...selectedProductIds,
            ...currentContextRefs.map((r) => r.productId).filter(Boolean),
          ]),
        ];
        const wsId = getWorkspaceId();
        const res = await fetch(`/api/marketing/threads/${tid}/message`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(wsId ? { 'x-workspace-id': wsId } : {}),
          },
          body: JSON.stringify({
            message: textForAgent,
            mode: 'agent',
            brandContextEnabled: effectiveBrandEnabled,
            selectedProductIds: mergedProductIds,
            contextRefs: currentContextRefs,
            llmModel: activeLlm,
            videoModel: activeVideo,
            skillId: currentSkillId,
          }),
        });

        if (!res.ok || !res.body) {
          const errPayload = await res.json().catch(() => ({}));
          throw new Error(errPayload?.error || `Request failed (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            const rawChunk = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 2);
            if (!rawChunk.startsWith('data:')) continue;
            let ev;
            try {
              ev = JSON.parse(rawChunk.slice(5).trim());
            } catch {
              continue;
            }
            if (ev.type === 'step' && ev.step) {
              setLiveSteps((prev) => {
                const i = prev.findIndex((s) => s.id === ev.step.id);
                if (i >= 0) {
                  const next = [...prev];
                  next[i] = { ...next[i], ...ev.step };
                  return next;
                }
                return [...prev, ev.step];
              });
            } else if (ev.type === 'title' && ev.title) {
              setThreads((prev) => prev.map((t) => (t.id === tid ? { ...t, title: ev.title } : t)));
            } else if (ev.type === 'artifact' && ev.artifact) {
              setArtifacts((prev) => [ev.artifact, ...prev.filter((a) => a.id !== ev.artifact.id)]);
            } else if (ev.type === 'campaign' && ev.campaign) {
              setCampaigns((prev) => [ev.campaign, ...prev.filter((c) => c.id !== ev.campaign.id)]);
              setCampaignsById((prev) => ({ ...prev, [ev.campaign.id]: ev.campaign }));
            } else if (ev.type === 'memory' && ev.memory) {
              setMemories((prev) => [ev.memory, ...prev.filter((m) => m.id !== ev.memory.id)]);
            } else if (ev.type === 'routine' && ev.routine) {
              setRoutines((prev) => [ev.routine, ...prev.filter((r) => r.id !== ev.routine.id)]);
            } else if (ev.type === 'brand_updated') {
              refreshBootstrap();
            } else if (ev.type === 'done' && ev.result) {
              setMessages(ev.result.messages || []);
              setLiveSteps([]);
            } else if (ev.type === 'error') {
              throw new Error(ev.error || 'Agent gagal memproses.');
            }
          }
        }
      } catch (err) {
        setError(err.message || 'Gagal menjalankan agent.');
        setLiveSteps([]);
      } finally {
        setRunning(false);
      }
    },
    [input, attachments, running, activeThreadId, settingsMode, llmModel, videoModel, activeSkillId, brandEnabled, selectedProductIds, selectedContextRefs, refreshBootstrap],
  );

  const handlePollApprovalStatus = useCallback(async (approvalId) => {
    try {
      const { approval } = await mApi(`/approvals/${approvalId}/status`);
      if (!approval) return;
      setMessages((prev) =>
        prev.map((m) =>
          Array.isArray(m.approvalRefs)
            ? {
                ...m,
                approvalRefs: m.approvalRefs.map((ref) => (ref.id === approval.id ? approval : ref)),
              }
            : m,
        ),
      );
    } catch {
      // silent transient poll retry
    }
  }, []);

  const handleDecideApproval = async (approvalId, decision) => {
    setDecidingApprovalId(approvalId);
    setError('');
    try {
      const { approval } = await mApi(`/approvals/${approvalId}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      if (approval) {
        setMessages((prev) =>
          prev.map((m) =>
            Array.isArray(m.approvalRefs)
              ? {
                  ...m,
                  approvalRefs: m.approvalRefs.map((ref) => (ref.id === approval.id ? approval : ref)),
                }
              : m,
          ),
        );
        if (
          approval.status === 'completed' &&
          ['generate_brand_avatar', 'generate_scene_kit', 'update_brand'].includes(approval.action_type)
        ) {
          refreshBootstrap();
        }
      }
    } catch (err) {
      setError(err.message || 'Gagal memproses approval.');
    } finally {
      setDecidingApprovalId(null);
    }
  };

  const handleCreateRoutine = async (payload) => {
    const { routine } = await mApi('/routines', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (routine) setRoutines((prev) => [routine, ...prev.filter((r) => r.id !== routine.id)]);
  };

  const handleToggleRoutine = async (routineId, enabled) => {
    const { routine } = await mApi(`/routines/${routineId}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    });
    if (routine) setRoutines((prev) => prev.map((r) => (r.id === routineId ? routine : r)));
  };

  const handleDeleteRoutine = async (routineId) => {
    await mApi(`/routines/${routineId}`, { method: 'DELETE' });
    setRoutines((prev) => prev.filter((r) => r.id !== routineId));
  };

  const handleRunRoutine = (rt) => {
    if (!rt?.prompt) return;
    startNewSession();
    setPanel(null);
    setTimeout(() => sendMessage(rt.prompt), 40);
  };

  const handleDeleteThread = async (threadId, e) => {
    e.stopPropagation();
    try {
      await mApi(`/threads/${threadId}`, { method: 'DELETE' });
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      if (activeThreadId === threadId) startNewSession();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleOpenApprovalInCanvas = async (approval) => {
    if (!approval?.id) return;
    setOpeningApprovalCanvasId(approval.id);
    setError('');
    try {
      const { seed } = await mApi(`/approvals/${approval.id}/canvas-seed`);
      const createRes = await fetch('/canvas/api/projects', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: seed.projectName || approval.title || 'AI Marketing Ad',
          description: String(seed.briefNote || approval.description || '').slice(0, 300),
          origin: 'canvas',
        }),
      });
      const project = await createRes.json().catch(() => null);
      if (!createRes.ok || !project?.id) {
        throw new Error(project?.error || 'Gagal membuat project di AI Video Canvas.');
      }
      const wsId = getWorkspaceId();
      const qs = new URLSearchParams({
        project: project.id,
        marketingApprovalSeed: approval.id,
        ...(wsId ? { marketingWorkspace: wsId } : {}),
      });
      window.open(`/studio/canvas?${qs.toString()}`, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err.message || 'Gagal membuka di AI Video Canvas.');
    } finally {
      setOpeningApprovalCanvasId(null);
    }
  };

  const handleOpenInCanvas = async (deliverable) => {
    setOpeningDeliverableId(deliverable.id);
    setError('');
    try {
      if (deliverable.canvas_project_id) {
        window.open(`/studio/canvas?project=${encodeURIComponent(deliverable.canvas_project_id)}`, '_blank', 'noopener,noreferrer');
        return;
      }
      const { seed } = await mApi(`/deliverables/${deliverable.id}/canvas-seed`);
      const createRes = await fetch('/canvas/api/projects', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: seed.projectName,
          description: seed.briefNote.slice(0, 300),
          origin: 'canvas',
        }),
      });
      const project = await createRes.json().catch(() => null);
      if (!createRes.ok || !project?.id) {
        throw new Error(project?.error || 'Gagal membuat project di AI Video Canvas.');
      }
      const updated = await mApi(`/deliverables/${deliverable.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          canvasProjectId: project.id,
          status: deliverable.status === 'idea' ? 'producing' : deliverable.status,
        }),
      });
      if (updated?.deliverable?.campaign_id) {
        const cid = updated.deliverable.campaign_id;
        setCampaignsById((prev) => {
          const cur = prev[cid];
          if (!cur) return prev;
          return {
            ...prev,
            [cid]: {
              ...cur,
              deliverables: (cur.deliverables || []).map((d) =>
                d.id === deliverable.id ? updated.deliverable : d,
              ),
            },
          };
        });
      }
      const wsId = getWorkspaceId();
      const qs = new URLSearchParams({
        project: project.id,
        marketingSeed: deliverable.id,
        ...(wsId ? { marketingWorkspace: wsId } : {}),
      });
      window.open(`/studio/canvas?${qs.toString()}`, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err.message || 'Gagal membuka di AI Video Canvas.');
    } finally {
      setOpeningDeliverableId(null);
    }
  };

  const handleUpdateDeliverableStatus = async (deliverableId, status) => {
    try {
      const { deliverable } = await mApi(`/deliverables/${deliverableId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      if (panel?.kind === 'campaign' && panel.data) {
        setPanel({
          kind: 'campaign',
          data: {
            ...panel.data,
            deliverables: (panel.data.deliverables || []).map((d) => (d.id === deliverableId ? deliverable : d)),
          },
        });
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAddMemory = async ({ category, content }) => {
    const { memory } = await mApi('/memories', {
      method: 'POST',
      body: JSON.stringify({ category, content }),
    });
    setMemories((prev) => [memory, ...prev.filter((m) => m.id !== memory.id)]);
  };

  const handleDeleteMemory = async (id) => {
    await mApi(`/memories?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    setMemories((prev) => prev.filter((m) => m.id !== id));
  };

  const toggleProduct = (id) => {
    setSelectedProductIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectedProductNames = useMemo(
    () => products.filter((p) => selectedProductIds.includes(p.id)).map((p) => p.name),
    [products, selectedProductIds],
  );

  const connectedProviders = useMemo(
    () => new Set((integrations || []).map((i) => String(i.provider || '').toLowerCase())),
    [integrations],
  );

  const openIntegrations = () => {
    setContextMenuOpen(false);
    setActiveSubmenu(null);
    if (onNavigate) onNavigate('accounts');
    else window.location.assign('/studio/accounts');
  };

  const openBrandKit = () => {
    setContextMenuOpen(false);
    setActiveSubmenu(null);
    if (onNavigate) onNavigate('brand-kit');
    else window.location.assign('/studio/brand-kit');
  };

  const openMediaLibraryPage = () => {
    setAssetPickerOpen(false);
    setContextMenuOpen(false);
    setActiveSubmenu(null);
    if (onNavigate) onNavigate('media');
    else window.location.assign('/studio/media');
  };

  const openAssetLibraryPicker = useCallback(async () => {
    setContextMenuOpen(false);
    setActiveSubmenu(null);
    setAssetPickerOpen(true);
    setLoadingAssets(true);
    try {
      const wsId = getWorkspaceId();
      const res = await fetch('/api/assets', {
        credentials: 'include',
        cache: 'no-store',
        headers: wsId ? { 'x-workspace-id': wsId } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.assets)) {
        setWorkspaceAssets(data.assets);
      }
    } catch {
      // keep existing list
    } finally {
      setLoadingAssets(false);
    }
  }, []);

  const handleAttachLocalFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    setContextMenuOpen(false);
    setActiveSubmenu(null);
    setMentionMenu({ open: false, query: '', node: null, startOffset: 0, endOffset: 0 });
    for (const file of files.slice(0, 6)) {
      const mime = file.type || '';
      const fileKind = mime.startsWith('image/')
        ? 'image'
        : mime.startsWith('video/')
          ? 'video'
          : mime.startsWith('audio/')
            ? 'audio'
            : 'file';
      const previewUrl = fileKind === 'image' ? URL.createObjectURL(file) : '';
      let textSnippet = '';
      if (/\.(txt|md|csv|json)$/i.test(file.name) && file.size <= 200_000) {
        try {
          textSnippet = (await file.text()).slice(0, 1200).trim();
        } catch {}
      }
      const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      mentionStoreRef.current.set(id, {
        id,
        kind: 'attachment',
        name: file.name,
        fileKind,
        url: '',
        previewUrl,
        textSnippet,
        source: 'local',
      });
      composerRef.current?.insertMention({ id, displayLabel: file.name, previewUrl });
    }
  };

  const toggleAssetAttachment = (asset) => {
    const id = `asset-${asset.id}`;
    const name = asset.filename || asset.prompt || 'Workspace Asset';
    const previewUrl = asset.type === 'image' ? asset.url || asset.r2_url || '' : '';
    mentionStoreRef.current.set(id, {
      id,
      kind: 'attachment',
      name,
      fileKind: asset.type || 'image',
      url: asset.url || asset.r2_url || '',
      previewUrl,
      textSnippet: '',
      source: 'library',
    });
    setAssetPickerOpen(false);
    setContextMenuOpen(false);
    setActiveSubmenu(null);
    setTimeout(() => {
      composerRef.current?.insertMention({ id, displayLabel: name, previewUrl });
    }, 20);
  };

  const selectedContextRefIds = useMemo(
    () => new Set(selectedContextRefs.map((r) => r.id)),
    [selectedContextRefs],
  );

  const handleEditorSnapshotChange = useCallback(({ text, mentionIds }) => {
    setInput(text);
    const entries = (mentionIds || [])
      .map((id) => mentionStoreRef.current.get(id))
      .filter(Boolean);
    setInlineBrandMentioned((mentionIds || []).includes('brand:full'));
    setSelectedContextRefs(entries.filter((e) => e.kind === 'context'));
    setAttachments(entries.filter((e) => e.kind === 'attachment'));
  }, []);

  const handleEditorMentionQuery = useCallback((info) => {
    if (info?.open) {
      setMentionMenu(info);
      setContextMenuOpen(false);
      setActiveSubmenu(null);
    } else {
      setMentionMenu((prev) =>
        prev.open ? { open: false, query: '', node: null, startOffset: 0, endOffset: 0 } : prev,
      );
    }
  }, []);

  const closeAllComposerPopups = useCallback(() => {
    setMentionMenu({ open: false, query: '', node: null, startOffset: 0, endOffset: 0 });
    setContextMenuOpen(false);
    setActiveSubmenu(null);
    setSettingsOpen(false);
  }, []);

  const handleSelectContextRef = (item) => {
    if (!item?.id) return;
    const displayLabel = item.path || item.label;
    mentionStoreRef.current.set(item.id, {
      id: item.id,
      kind: 'context',
      label: item.label,
      path: displayLabel,
      content: item.content || '',
      productId: item.productId || null,
    });
    const replaceInfo = mentionMenu.open ? mentionMenu : null;
    closeAllComposerPopups();
    composerRef.current?.insertMention({ id: item.id, displayLabel }, replaceInfo);
  };

  const handleToggleFullBrand = () => {
    const id = 'brand:full';
    const displayLabel = 'My Brand';
    mentionStoreRef.current.set(id, { id, kind: 'brand_full', label: displayLabel, path: displayLabel });
    const replaceInfo = mentionMenu.open ? mentionMenu : null;
    closeAllComposerPopups();
    composerRef.current?.insertMention({ id, displayLabel }, replaceInfo);
  };

  const renderComposer = (variant = 'hero') => {
    const isHeroBox = variant === 'hero';
    return (
      <div className="mx-auto w-full max-w-[700px]">
        {/* Stacked Integrate Top Shelf (exact reference style: TikTok, YouTube, IG, GSheets, GDrive) */}
        {!integrateBannerDismissed && (
          <div className="mx-2 flex items-center justify-between gap-3 rounded-t-[20px] border border-b-0 border-violet-200/80 bg-gradient-to-r from-[#F4F1FF] via-[#F7F6FF] to-[#EEF0FF] px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex -space-x-1.5">
                {INTEGRATE_CHANNELS.map((ch) => {
                  const isConnected = connectedProviders.has(ch.id);
                  return (
                    <span
                      key={ch.id}
                      title={`${ch.label}${isConnected ? ' (Connected)' : ''}`}
                      className="relative flex h-6 w-6 items-center justify-center rounded-full border border-white bg-white text-zinc-900 shadow-xs"
                    >
                      <PlatformIcon id={ch.id} />
                      {isConnected && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-white bg-emerald-500" />
                      )}
                    </span>
                  );
                })}
              </div>
              <span className="truncate text-[12.5px] text-[#55576B]">
                <strong className="font-semibold text-[#171821]">Integrate</strong> TikTok, YouTube, IG, Drive, Dropbox &amp; Sheets
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={openIntegrations}
                className="text-[12.5px] font-semibold text-[#171821] transition hover:text-[#5B45F2]"
              >
                Connect
              </button>
              <button
                type="button"
                onClick={() => setIntegrateBannerDismissed(true)}
                className="rounded-md p-0.5 text-zinc-400 transition hover:bg-white/70 hover:text-zinc-700"
                aria-label="Tutup banner integrasi"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Main Floating White Composer Card */}
        <div
          className={`relative rounded-[22px] border border-[#E4E4EE] bg-white transition focus-within:border-[#5B45F2]/60 focus-within:ring-4 focus-within:ring-[#5B45F2]/10 ${
            isHeroBox ? 'p-3.5 shadow-[0_14px_40px_-14px_rgba(24,24,48,0.10)]' : 'p-2.5 shadow-sm'
          }`}
        >
          {/* @ Mention Hierarchical My Brand & Products Context Popover */}
          {mentionMenu.open && (
            <>
              <div className="fixed inset-0 z-20" onClick={closeAllComposerPopups} />
              <div className="absolute bottom-full left-0 z-30 mb-2">
                <BrandContextMenu
                  tree={brandContextTree}
                  query={mentionMenu.query}
                  brandFullActive={inlineBrandMentioned}
                  selectedRefIds={selectedContextRefIds}
                  onToggleFullBrand={handleToggleFullBrand}
                  onSelectRef={handleSelectContextRef}
                  onConnectAccount={() => {
                    closeAllComposerPopups();
                    openIntegrations();
                  }}
                  onOpenBrandKit={() => {
                    closeAllComposerPopups();
                    openBrandKit();
                  }}
                />
              </div>
            </>
          )}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*,audio/*,.pdf,.txt,.csv,.md,.json"
            onChange={handleAttachLocalFiles}
            className="hidden"
          />

          <InlineMentionInput
            ref={composerRef}
            minHeightClass={isHeroBox ? 'min-h-[76px]' : 'min-h-[48px]'}
            mentionMenuOpen={mentionMenu.open}
            onChangeSnapshot={handleEditorSnapshotChange}
            onMentionQuery={handleEditorMentionQuery}
            onCloseMention={closeAllComposerPopups}
            onSubmit={() => sendMessage()}
            placeholder={
              brandKit.configured
                ? `Ask Ad Agent for ${brandKit.brandName}… (type @ to mention brand context)`
                : 'Describe your ad, campaign, or marketing goal… (type @ to mention context)'
            }
          />

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 pt-1">
            {/* Left controls: clean + Menu only (all selected contexts/files live inline inside the text input!) */}
            <div className="relative flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setMentionMenu({ open: false, query: '', node: null, startOffset: 0, endOffset: 0 });
                  setContextMenuOpen((v) => {
                    if (v) setActiveSubmenu(null);
                    return !v;
                  });
                }}
                className={`flex h-8 w-8 items-center justify-center rounded-xl border transition ${
                  contextMenuOpen
                    ? 'border-[#D5D5E0] bg-[#F1F1F5] text-[#171821]'
                    : 'border-[#E6E6F0] bg-white text-zinc-600 hover:border-[#D5D5E0] hover:bg-[#F5F5F8] hover:text-[#171821]'
                }`}
                title="Attach files, Asset Library, My Brand, Accounts, Connectors & Skills"
                aria-expanded={contextMenuOpen}
              >
                <Plus className="h-4 w-4" />
              </button>

              {contextMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => {
                      setContextMenuOpen(false);
                      setActiveSubmenu(null);
                    }}
                  />
                  <div className="absolute bottom-full left-0 z-30 mb-2 flex items-end gap-2">
                    {/* Main + Popover Card matching reference */}
                    <div className="w-[228px] rounded-[20px] border border-[#EBEBF2] bg-white p-1.5 shadow-[0_14px_38px_-10px_rgba(24,24,48,0.16)]">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        onMouseEnter={() => setActiveSubmenu(null)}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] font-medium text-[#282A35] transition hover:bg-[#F5F5FA]"
                      >
                        <CloudUpload className="h-4 w-4 shrink-0 text-[#525568]" strokeWidth={1.75} />
                        <span>Attach files</span>
                      </button>

                      <button
                        type="button"
                        onClick={openAssetLibraryPicker}
                        onMouseEnter={() => setActiveSubmenu(null)}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] font-medium text-[#282A35] transition hover:bg-[#F5F5FA]"
                      >
                        <Folder className="h-4 w-4 shrink-0 text-[#525568]" strokeWidth={1.75} />
                        <span>Asset Library</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveSubmenu((cur) => (cur === 'my-brand' ? null : 'my-brand'))}
                        onMouseEnter={() => setActiveSubmenu('my-brand')}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] font-medium transition ${
                          activeSubmenu === 'my-brand'
                            ? 'bg-[#F4F3FF] text-[#5B45F2]'
                            : 'text-[#282A35] hover:bg-[#F5F5FA]'
                        }`}
                      >
                        <SwatchBook className="h-4 w-4 shrink-0 text-current opacity-80" strokeWidth={1.75} />
                        <span className="flex-1">My Brand</span>
                        {brandEnabled && brandKit.configured && (
                          <span className="h-1.5 w-1.5 rounded-full bg-[#5B45F2]" />
                        )}
                      </button>

                      <div className="my-1.5 border-t border-[#EFEFF5]" />

                      <button
                        type="button"
                        onClick={() => setActiveSubmenu((cur) => (cur === 'accounts' ? null : 'accounts'))}
                        onMouseEnter={() => setActiveSubmenu('accounts')}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] font-medium transition ${
                          activeSubmenu === 'accounts'
                            ? 'bg-[#F4F3FF] text-[#5B45F2]'
                            : 'text-[#282A35] hover:bg-[#F5F5FA]'
                        }`}
                      >
                        <CreditCard className="h-4 w-4 shrink-0 text-current opacity-80" strokeWidth={1.75} />
                        <span className="flex-1">Accounts</span>
                        {integrations.length > 0 && (
                          <span className="text-[11px] text-zinc-400">{integrations.length}</span>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveSubmenu((cur) => (cur === 'connectors' ? null : 'connectors'))}
                        onMouseEnter={() => setActiveSubmenu('connectors')}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] font-medium transition ${
                          activeSubmenu === 'connectors'
                            ? 'bg-[#F4F3FF] text-[#5B45F2]'
                            : 'text-[#282A35] hover:bg-[#F5F5FA]'
                        }`}
                      >
                        <Link2 className="h-4 w-4 shrink-0 text-current opacity-80" strokeWidth={1.75} />
                        <span className="flex-1">Connectors</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveSubmenu((cur) => (cur === 'skills' ? null : 'skills'))}
                        onMouseEnter={() => setActiveSubmenu('skills')}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] font-medium transition ${
                          activeSubmenu === 'skills'
                            ? 'bg-[#F4F3FF] text-[#5B45F2]'
                            : 'text-[#282A35] hover:bg-[#F5F5FA]'
                        }`}
                      >
                        <Zap className="h-4 w-4 shrink-0 text-current opacity-80" strokeWidth={1.75} />
                        <span className="flex-1">Skills</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
                      </button>
                    </div>

                    {/* Cascading Submenu Card */}
                    {activeSubmenu === 'my-brand' && (
                      <BrandContextMenu
                        tree={brandContextTree}
                        brandFullActive={inlineBrandMentioned}
                        selectedRefIds={selectedContextRefIds}
                        onToggleFullBrand={handleToggleFullBrand}
                        onSelectRef={handleSelectContextRef}
                        onConnectAccount={openIntegrations}
                        onOpenBrandKit={openBrandKit}
                      />
                    )}

                    {activeSubmenu === 'accounts' && (
                      <div className="w-[248px] rounded-[20px] border border-[#EBEBF2] bg-white p-1.5 shadow-[0_14px_38px_-10px_rgba(24,24,48,0.16)]">
                        <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                          Social &amp; Ad Accounts
                        </div>
                        {ACCOUNT_CHANNELS.map((ch) => {
                          const matched = integrations.find(
                            (acc) => String(acc.provider || '').toLowerCase() === ch.id,
                          );
                          const isConnected = Boolean(matched);
                          return (
                            <button
                              key={ch.id}
                              type="button"
                              onClick={openIntegrations}
                              className="flex w-full items-center justify-between gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] text-[#282A35] transition hover:bg-[#F5F5FA]"
                            >
                              <span className="flex min-w-0 items-center gap-2.5">
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-zinc-100 bg-white">
                                  {ch.id === 'meta' ? (
                                    <Target className="h-3.5 w-3.5 text-[#1877F2]" />
                                  ) : (
                                    <PlatformIcon id={ch.id} />
                                  )}
                                </span>
                                <span className="truncate font-medium">
                                  {matched?.account_name || ch.label}
                                </span>
                              </span>
                              <span
                                className={`shrink-0 text-[11px] font-semibold ${
                                  isConnected ? 'text-emerald-600' : 'text-[#5B45F2]'
                                }`}
                              >
                                {isConnected ? 'Connected' : 'Connect'}
                              </span>
                            </button>
                          );
                        })}
                        <div className="mt-1 border-t border-[#EFEFF5] pt-1.5">
                          <button
                            type="button"
                            onClick={openIntegrations}
                            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#F4F3FF] px-3 py-2 text-xs font-semibold text-[#5B45F2] transition hover:bg-violet-100"
                          >
                            <span>Manage Accounts</span>
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    )}

                    {activeSubmenu === 'connectors' && (
                      <div className="w-[244px] rounded-[20px] border border-[#EBEBF2] bg-white p-1.5 shadow-[0_14px_38px_-10px_rgba(24,24,48,0.16)]">
                        <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                          Connectors
                        </div>
                        {CONNECTOR_CHANNELS.map((ch) => {
                          const isConnected = connectedProviders.has(ch.id);
                          return (
                            <button
                              key={ch.id}
                              type="button"
                              onClick={openIntegrations}
                              className="flex w-full items-center justify-between gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] text-[#282A35] transition hover:bg-[#F5F5FA]"
                            >
                              <span className="flex items-center gap-2.5">
                                <span className="flex h-6 w-6 items-center justify-center rounded-lg border border-zinc-100 bg-white">
                                  <PlatformIcon id={ch.id} />
                                </span>
                                <span className="font-medium">{ch.label}</span>
                              </span>
                              <span
                                className={`text-[11px] font-semibold ${
                                  isConnected ? 'text-emerald-600' : 'text-[#5B45F2]'
                                }`}
                              >
                                {isConnected ? 'Connected' : 'Connect'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {activeSubmenu === 'skills' && (
                      <div className="max-h-[340px] w-[272px] overflow-y-auto rounded-[20px] border border-[#EBEBF2] bg-white p-1.5 shadow-[0_14px_38px_-10px_rgba(24,24,48,0.16)]">
                        <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                          Marketing Skills
                        </div>
                        {QUICK_ACTIONS.map((skill) => {
                          const Icon = skill.icon;
                          const meta = skillsMeta.find((m) => m.id === skill.id);
                          return (
                            <button
                              key={skill.id}
                              type="button"
                              onClick={() => {
                                setActiveSkillId(skill.id);
                                closeAllComposerPopups();
                                composerRef.current?.setPlainText(skill.prompt);
                              }}
                              className="flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium text-[#282A35] transition hover:bg-[#F5F5FA] hover:text-[#171821]"
                            >
                              <span className="flex min-w-0 items-center gap-2.5">
                                <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                                <span className="truncate">{skill.label}</span>
                              </span>
                              {meta?.badge && (
                                <span className="shrink-0 rounded bg-[#F1F1F5] px-1.5 py-0.5 text-[10px] font-medium text-[#6B6E80]">
                                  {meta.badge}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Right controls: Auto / Advanced Model Settings + Send */}
            <div className="relative flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setContextMenuOpen(false);
                  setActiveSubmenu(null);
                  setMentionMenu({ open: false, query: '', node: null, startOffset: 0, endOffset: 0 });
                  setSettingsOpen((v) => !v);
                }}
                className={`inline-flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-[12px] font-medium transition ${
                  settingsOpen
                    ? 'border-[#D5D5E0] bg-[#F1F1F5] text-[#171821]'
                    : 'border-[#E6E6F0] bg-white text-[#525568] hover:border-[#D5D5E0] hover:bg-[#F5F5F8] hover:text-[#171821]'
                }`}
                title="Model Settings (Auto / Advanced)"
                aria-expanded={settingsOpen}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>{settingsMode === 'auto' ? 'Auto' : 'Advanced'}</span>
              </button>

              {settingsOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setSettingsOpen(false)} />
                  <div className="absolute bottom-full right-0 z-30 mb-2 w-[300px] rounded-[20px] border border-[#E6E6F0] bg-white p-3 shadow-[0_14px_38px_-10px_rgba(24,24,48,0.16)]">
                    {/* Auto vs Advanced switcher */}
                    <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-[#F2F2F6] p-1">
                      <button
                        type="button"
                        onClick={() => {
                          setSettingsMode('auto');
                          setLlmModel(DEFAULT_AUTO_LLM);
                          setVideoModel(DEFAULT_AUTO_VIDEO);
                        }}
                        className={`rounded-lg py-1.5 text-[12px] font-semibold transition ${
                          settingsMode === 'auto'
                            ? 'bg-white text-[#171821] shadow-xs'
                            : 'text-[#6B6E80] hover:text-[#171821]'
                        }`}
                      >
                        Auto
                      </button>
                      <button
                        type="button"
                        onClick={() => setSettingsMode('advanced')}
                        className={`rounded-lg py-1.5 text-[12px] font-semibold transition ${
                          settingsMode === 'advanced'
                            ? 'bg-white text-[#171821] shadow-xs'
                            : 'text-[#6B6E80] hover:text-[#171821]'
                        }`}
                      >
                        Advanced
                      </button>
                    </div>

                    {settingsMode === 'auto' ? (
                      <div className="space-y-2 rounded-xl border border-[#EFEFF5] bg-[#FAFAFC] p-3 text-[12px]">
                        <div className="flex items-center justify-between">
                          <span className="text-[#7A7D8F]">LLM Model</span>
                          <span className="font-semibold text-[#171821]">Seed 2.1 Turbo</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[#7A7D8F]">Video Model</span>
                          <span className="font-semibold text-[#171821]">Seedance 2.5</span>
                        </div>
                        <p className="pt-1 text-[11px] leading-relaxed text-[#8C8FA1]">
                          Mode otomatis memakai kombinasi tercepat &amp; terbaik (Seed + Seedance 2.5). Pilih <strong>Advanced</strong> untuk ganti model manual.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[#8C8FA1]">
                            LLM Model
                          </label>
                          <div className="space-y-1">
                            {LLM_MODEL_OPTIONS.map((opt) => {
                              const active = llmModel === opt.id;
                              return (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() => setLlmModel(opt.id)}
                                  className={`flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left transition ${
                                    active
                                      ? 'bg-[#F1F1F5] text-[#171821]'
                                      : 'text-[#3F4150] hover:bg-[#F7F7FA]'
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 text-[12.5px] font-medium">
                                      <span>{opt.label}</span>
                                      <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-[#7A7D8F] ring-1 ring-[#E6E6EF]">
                                        {opt.badge}
                                      </span>
                                    </div>
                                    <div className="truncate text-[10.5px] text-[#8C8FA1]">{opt.desc}</div>
                                  </div>
                                  {active && <Check className="h-3.5 w-3.5 shrink-0 text-[#171821]" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="border-t border-[#EFEFF5] pt-2.5">
                          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[#8C8FA1]">
                            Video Model
                          </label>
                          <div className="max-h-40 space-y-1 overflow-y-auto">
                            {VIDEO_MODEL_OPTIONS.map((opt) => {
                              const active = videoModel === opt.id;
                              return (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() => setVideoModel(opt.id)}
                                  className={`flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-left transition ${
                                    active
                                      ? 'bg-[#F1F1F5] text-[#171821]'
                                      : 'text-[#3F4150] hover:bg-[#F7F7FA]'
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 text-[12.5px] font-medium">
                                      <span>{opt.label}</span>
                                      <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-[#7A7D8F] ring-1 ring-[#E6E6EF]">
                                        {opt.badge}
                                      </span>
                                    </div>
                                    <div className="truncate text-[10.5px] text-[#8C8FA1]">{opt.desc}</div>
                                  </div>
                                  {active && <Check className="h-3.5 w-3.5 shrink-0 text-[#171821]" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              <button
                type="button"
                disabled={(!input.trim() && attachments.length === 0) || running}
                onClick={() => sendMessage()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#5B45F2] text-white shadow-sm shadow-[#5B45F2]/25 transition hover:bg-[#4934DC] disabled:opacity-40"
                title="Kirim"
              >
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const sidebarQ = sidebarSearch.trim().toLowerCase();
  const filteredThreads = useMemo(
    () =>
      !sidebarQ
        ? threads
        : threads.filter((t) => String(t.title || '').toLowerCase().includes(sidebarQ)),
    [threads, sidebarQ],
  );
  const filteredCampaigns = useMemo(
    () =>
      !sidebarQ
        ? campaigns
        : campaigns.filter((c) => String(c.title || '').toLowerCase().includes(sidebarQ)),
    [campaigns, sidebarQ],
  );
  const filteredArtifacts = useMemo(
    () =>
      !sidebarQ
        ? artifacts
        : artifacts.filter(
            (a) =>
              String(a.title || '').toLowerCase().includes(sidebarQ) ||
              String(a.type || '').toLowerCase().includes(sidebarQ),
          ),
    [artifacts, sidebarQ],
  );

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#FAFAFC]">
        <div className="flex items-center gap-2.5 rounded-2xl border border-violet-100 bg-white px-5 py-3 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin text-[#5B45F2]" />
          <span className="text-sm font-medium text-zinc-700">Memuat AI Creative Marketing…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#FAFAFC] text-zinc-900">
      {/* LEFT FLOATING TREE SIDEBAR (exact My Brand .bs-tree style) */}
      {railOpen && (
        <aside className="bs-tree" style={{ width: 232 }} aria-label="AI Creative Marketing navigation">
          <div className="bs-tree-header">
            <button
              type="button"
              className="bs-tree-back"
              onClick={() => (onNavigate ? onNavigate('home') : setRailOpen(false))}
              aria-label="Back to Studio Home"
              title="Back to Studio"
            >
              <ArrowLeft size={14} strokeWidth={2} />
            </button>
            <h1 className="bs-tree-title flex-1">Marketing</h1>
            <button
              type="button"
              onClick={() => setRailOpen(false)}
              className="bs-tree-back"
              title="Sembunyikan sidebar"
              aria-label="Hide sidebar"
            >
              <PanelLeftClose size={13.5} strokeWidth={1.9} />
            </button>
          </div>

          <div className="bs-tree-search-wrap">
            <span className="bs-tree-search-icon" aria-hidden="true">
              <Search size={13.5} strokeWidth={2} />
            </span>
            <input
              type="search"
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              placeholder="Search chats..."
              aria-label="Search marketing chats"
              className="bs-tree-search"
            />
            {sidebarSearch && (
              <button
                type="button"
                className="bs-tree-search-clear"
                onClick={() => setSidebarSearch('')}
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <nav className="bs-tree-nav" aria-label="Marketing workspace">
            <button
              type="button"
              onClick={startNewSession}
              className={`bs-tree-item${!activeThreadId && !panel ? ' is-active' : ''}`}
            >
              <Plus size={15} strokeWidth={2} />
              <span className="bs-tree-item-label">New chat</span>
            </button>

            <div className="bs-tree-divider" role="separator" />

            <button type="button" onClick={openBrandKit} className="bs-tree-item">
              <SwatchBook size={15} strokeWidth={1.8} />
              <span className="bs-tree-item-label">My Brand</span>
            </button>

            <button type="button" onClick={openIntegrations} className="bs-tree-item">
              <Link2 size={15} strokeWidth={1.8} />
              <span className="bs-tree-item-label">Connectors</span>
              {integrations.length > 0 && <span className="bs-tree-item-count">{integrations.length}</span>}
            </button>

            <button
              type="button"
              onClick={() => setPanel({ kind: 'routines', data: null })}
              className={`bs-tree-item${panel?.kind === 'routines' ? ' is-active' : ''}`}
            >
              <Repeat size={15} strokeWidth={1.8} />
              <span className="bs-tree-item-label">Routines</span>
              {routines.length > 0 && <span className="bs-tree-item-count">{routines.length}</span>}
            </button>

            <button
              type="button"
              onClick={() => setPanel({ kind: 'memory', data: null })}
              className={`bs-tree-item${panel?.kind === 'memory' ? ' is-active' : ''}`}
            >
              <Brain size={15} strokeWidth={1.8} />
              <span className="bs-tree-item-label">Brand Memory</span>
              {memories.length > 0 && <span className="bs-tree-item-count">{memories.length}</span>}
            </button>

            <div className="bs-tree-divider" role="separator" />

            {/* Campaigns & Artifacts render cleanly inline inside chat — no extra sidebar tree or side panel */}

            <div className="bs-tree-divider" role="separator" />

            {/* Recents */}
            <div className="px-2 pb-1 pt-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-[#9A9DB0]">
              Recents
            </div>
            {filteredThreads.length === 0 ? (
              <p className="px-2 py-3 text-[12px] text-[#9A9DB0]">
                {sidebarQ ? 'No matching chats.' : 'No conversations yet.'}
              </p>
            ) : (
              <div className="space-y-0.5">
                {filteredThreads.map((t) => {
                  const isActive = activeThreadId === t.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() => openThread(t.id)}
                      className={`group flex cursor-pointer items-center justify-between gap-1.5 rounded-[8px] px-2 py-1.5 text-left transition ${
                        isActive
                          ? 'bg-[#EFEFF4] font-medium text-[#171821]'
                          : 'text-[#4B4E5F] hover:bg-[#F4F4F8] hover:text-[#171821]'
                      }`}
                    >
                      <MessageSquare size={13.5} strokeWidth={1.75} className="shrink-0 opacity-55" />
                      <span className="min-w-0 flex-1 truncate text-[12.5px]">{t.title}</span>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteThread(t.id, e)}
                        className="rounded p-0.5 text-zinc-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                        title="Hapus sesi"
                        aria-label={`Hapus ${t.title}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </nav>

          <div className="bs-tree-footer">
            <button type="button" className="bs-tree-footer-btn" onClick={startNewSession}>
              <Plus size={14} strokeWidth={2} />
              <span>New conversation</span>
            </button>
          </div>
        </aside>
      )}

      {/* CENTER WORKSPACE */}
      <main
        className="flex min-w-0 flex-1 flex-col"
        style={
          isHero
            ? {
                backgroundColor: '#FAFAFC',
                backgroundImage: 'radial-gradient(#DCDCE8 1.15px, transparent 1.15px)',
                backgroundSize: '20px 20px',
              }
            : { backgroundColor: '#FFFFFF' }
        }
      >
        {/* Minimalist Top Bar */}
        <header className="flex items-center justify-between gap-3 border-b border-[#EFEFF4] bg-white/90 px-4 py-2.5 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2">
            {!railOpen && (
              <button
                type="button"
                onClick={() => setRailOpen(true)}
                className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-100"
                title="Buka sidebar"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            )}
            <span className="truncate text-sm font-semibold text-[#171821]">AI Creative Marketing</span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium md:inline-flex ${
                capabilities.scrapeAtlasReady
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-zinc-200 bg-zinc-50 text-zinc-500'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  capabilities.scrapeAtlasReady ? 'bg-emerald-500' : 'bg-zinc-400'
                }`}
              />
              {capabilities.scrapeAtlasReady ? 'Live Research' : 'Research Offline'}
            </span>
          </div>
        </header>

        {error && (
          <div className="mx-4 mt-3 flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs text-red-700">
            <span>{error}</span>
            <button type="button" onClick={() => setError('')} className="font-semibold underline">
              Tutup
            </button>
          </div>
        )}

        {/* HERO (CLEAN HOME-STYLE) vs ACTIVE CHAT */}
        {isHero ? (
          <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-5 py-10">
            <div className="mb-7 text-center">
              <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[#171821] sm:text-[34px]">
                Research. Create. Publish. Grow.
              </h1>
              <p className="mt-1.5 text-[14px] text-[#76798C]">
                {brandKit.configured
                  ? `Ready to power creative marketing for ${brandKit.brandName}.`
                  : 'Describe your marketing goal or pick a quick workflow below.'}
              </p>
            </div>

            {renderComposer('hero')}

            {/* Clean Home-style Quick-Action Pills */}
            <div className="mt-6 flex max-w-[740px] flex-wrap items-center justify-center gap-2">
              {QUICK_ACTIONS.map((act) => {
                const Icon = act.icon;
                return (
                  <button
                    key={act.id}
                    type="button"
                    onClick={() => {
                      setActiveSkillId(act.id);
                      composerRef.current?.setPlainText(act.prompt);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E5EF] bg-white px-3.5 py-2 text-[12.5px] font-medium text-[#2A2C38] shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition hover:-translate-y-0.5 hover:border-[#5B45F2]/50 hover:bg-violet-50/50 hover:text-[#5B45F2]"
                  >
                    <Icon className="h-3.5 w-3.5 text-[#7B7E91]" />
                    <span>{act.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto bg-white px-4 py-7">
              <div className="mx-auto max-w-[740px] space-y-8 pb-6">
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {m.role === 'user' ? (
                      <div className="max-w-[82%] rounded-2xl rounded-br-md bg-[#EFEFFE] px-4 py-3 text-[14px] leading-relaxed text-[#1C1E2B]">
                        <UserBubbleContent content={m.content} contextRefs={m.contextRefs} />
                      </div>
                    ) : (
                      <div className="w-full min-w-0">
                        <ActivityTrace steps={m.activities || []} />

                        <MarketingMarkdown content={m.content} />

                        {m.storyboard && <StoryboardCard storyboard={m.storyboard} />}

                        {Array.isArray(m.creativeOptions) && m.creativeOptions.length > 0 && (
                          <ConceptOptionsGrid
                            options={m.creativeOptions}
                            disabled={running}
                            onSelect={(prompt) => sendMessage(prompt)}
                          />
                        )}

                        {Array.isArray(m.artifactRefs) &&
                          m.artifactRefs.map((ref) => {
                            const fullArt = artifacts.find((a) => a.id === ref.id);
                            if (!fullArt || fullArt.type !== 'research_report') return null;
                            return (
                              <InlineResearchCard
                                key={ref.id}
                                artifact={fullArt}
                                disabled={running}
                                onPromptAction={(prompt) => sendMessage(prompt)}
                              />
                            );
                          })}

                        {Array.isArray(m.campaignRefs) &&
                          m.campaignRefs.map((ref) => {
                            const fullCamp = campaignsById[ref.id];
                            if (fullCamp) {
                              return (
                                <InlineCampaignCard
                                  key={ref.id}
                                  campaign={fullCamp}
                                  openingDeliverableId={openingDeliverableId}
                                  onOpenInCanvas={handleOpenInCanvas}
                                />
                              );
                            }
                            return (
                              <div key={ref.id} className="mt-3">
                                <button
                                  type="button"
                                  onClick={() => openCampaignById(ref.id)}
                                  className="inline-flex items-center gap-2 rounded-xl border border-[#E4E3F7] bg-[#F5F4FF] px-3.5 py-2 text-xs font-semibold text-[#5B45F2] transition hover:bg-[#ECEBFF]"
                                >
                                  <CalendarDays className="h-3.5 w-3.5" />
                                  <span>
                                    Muat Campaign: {ref.title} ({ref.deliverableCount} deliverables)
                                  </span>
                                  <Workflow className="h-3.5 w-3.5 opacity-80" />
                                </button>
                              </div>
                            );
                          })}

                        {Array.isArray(m.approvalRefs) && m.approvalRefs.length > 0 && (
                          <div className="space-y-2.5">
                            {m.approvalRefs.map((appr) => (
                              <ApprovalActionCard
                                key={appr.id}
                                approval={appr}
                                busy={decidingApprovalId === appr.id}
                                openingCanvas={openingApprovalCanvasId === appr.id}
                                onDecide={handleDecideApproval}
                                onPollStatus={handlePollApprovalStatus}
                                onOpenInCanvas={handleOpenApprovalInCanvas}
                              />
                            ))}
                          </div>
                        )}

                        {Array.isArray(m.clarifyingQuestions) && m.clarifyingQuestions.length > 0 && (
                          <ClarifyingQuestionsBlock
                            questions={m.clarifyingQuestions}
                            disabled={running}
                            onSelectOption={(opt) => sendMessage(opt)}
                          />
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {running && (
                  <div className="py-1">
                    <ActivityTrace
                      defaultOpen
                      steps={
                        liveSteps.length
                          ? liveSteps
                          : [{ id: 'init', label: 'Menyiapkan AI Creative Marketing…', status: 'running' }]
                      }
                    />
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>
            </div>

            <div className="bg-gradient-to-t from-white via-white to-white/80 px-4 pb-3 pt-2">
              {renderComposer('chat')}
            </div>
          </>
        )}
      </main>

      {/* LIGHTWEIGHT SLIDE-OVER MODAL (only when explicitly opening Routines / Brand Memory / Campaign from sidebar) */}
      {panel && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/20 backdrop-blur-[1px]" onClick={() => setPanel(null)}>
          <div className="h-full w-full max-w-[440px] bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {panel.kind === 'routines' ? (
              <RoutinesPanel
                routines={routines}
                onClose={() => setPanel(null)}
                onCreateRoutine={handleCreateRoutine}
                onToggleRoutine={handleToggleRoutine}
                onDeleteRoutine={handleDeleteRoutine}
                onRunRoutine={handleRunRoutine}
              />
            ) : (
              <ArtifactViewer
                panel={panel}
                memories={memories}
                onClose={() => setPanel(null)}
                onPromptAction={(prompt) => {
                  setPanel(null);
                  sendMessage(prompt);
                }}
                onOpenInCanvas={handleOpenInCanvas}
                openingDeliverableId={openingDeliverableId}
                onUpdateDeliverableStatus={handleUpdateDeliverableStatus}
                onAddMemory={handleAddMemory}
                onDeleteMemory={handleDeleteMemory}
              />
            )}
          </div>
        </div>
      )}

      {/* ASSET LIBRARY PICKER MODAL */}
      {assetPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]">
          <div className="flex max-h-[82vh] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border border-[#E6E6F0] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#EFEFF4] px-5 py-3.5">
              <div className="flex items-center gap-2">
                <Folder className="h-4 w-4 text-[#5B45F2]" />
                <h3 className="text-sm font-semibold text-[#171821]">Asset Library</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openMediaLibraryPage}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-[#5B45F2] hover:bg-violet-50"
                >
                  Open full library <ExternalLink className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setAssetPickerOpen(false)}
                  className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="border-b border-[#F2F2F7] px-5 py-2.5">
              <input
                type="search"
                value={assetSearch}
                onChange={(e) => setAssetSearch(e.target.value)}
                placeholder="Cari gambar, video, atau audio di workspace…"
                className="w-full rounded-xl border border-[#E5E5EE] bg-[#FAFAFC] px-3 py-2 text-xs text-[#171821] outline-none focus:border-[#5B45F2] focus:bg-white"
              />
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {loadingAssets ? (
                <div className="flex items-center justify-center py-12 text-xs text-zinc-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-[#5B45F2]" />
                  Memuat asset workspace…
                </div>
              ) : (() => {
                const q = assetSearch.trim().toLowerCase();
                const filtered = workspaceAssets.filter((a) =>
                  !q ? true : String(a.filename || a.prompt || '').toLowerCase().includes(q),
                );
                if (!filtered.length) {
                  return (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-xs text-zinc-400">
                      <Folder className="mb-2 h-6 w-6 text-zinc-300" />
                      <p>Belum ada asset yang cocok di workspace.</p>
                      <button
                        type="button"
                        onClick={() => {
                          setAssetPickerOpen(false);
                          fileInputRef.current?.click();
                        }}
                        className="mt-3 rounded-xl bg-[#5B45F2] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#4934DC]"
                      >
                        Upload dari komputer
                      </button>
                    </div>
                  );
                }
                return (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {filtered.slice(0, 36).map((asset) => {
                      const selected = attachments.some((a) => a.id === `asset-${asset.id}`);
                      const src = asset.url || asset.r2_url || '';
                      return (
                        <button
                          key={asset.id}
                          type="button"
                          onClick={() => toggleAssetAttachment(asset)}
                          className={`group relative flex flex-col overflow-hidden rounded-xl border text-left transition ${
                            selected
                              ? 'border-[#5B45F2] bg-violet-50/40 ring-2 ring-[#5B45F2]/20'
                              : 'border-[#EAEAF2] bg-white hover:border-[#5B45F2]/50'
                          }`}
                        >
                          <div className="flex h-28 w-full items-center justify-center overflow-hidden bg-[#F4F4F9]">
                            {asset.type === 'image' && src ? (
                              <img src={src} alt={asset.filename || 'Asset'} className="h-full w-full object-cover" />
                            ) : asset.type === 'video' && src ? (
                              <video src={src} muted className="h-full w-full object-cover" />
                            ) : (
                              <FileText className="h-6 w-6 text-zinc-400" />
                            )}
                          </div>
                          <div className="px-2.5 py-2">
                            <div className="truncate text-[11.5px] font-medium text-[#171821]">
                              {asset.filename || asset.prompt || 'Untitled asset'}
                            </div>
                            <div className="mt-0.5 text-[10px] uppercase text-zinc-400">{asset.type || 'file'}</div>
                          </div>
                          {selected && (
                            <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#5B45F2] text-white shadow">
                              <Check className="h-3 w-3" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            <div className="flex items-center justify-between border-t border-[#EFEFF4] bg-[#FAFAFC] px-5 py-3">
              <span className="text-xs text-zinc-500">{attachments.length} file/asset terlampir</span>
              <button
                type="button"
                onClick={() => setAssetPickerOpen(false)}
                className="rounded-xl bg-[#5B45F2] px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-[#4934DC]"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
