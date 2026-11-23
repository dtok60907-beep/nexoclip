'use client';

// AI Director: collapsible secondary project sidebar + serene centered chat canvas +
// on-demand split Production Board (Scene / Shot / Timeline / Artifact panels).
// Talks only to /api/director/* (proxied to the OpenMontage director service).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  ChevronDown,
  Clapperboard,
  Compass,
  Copy,
  LayoutPanelLeft,
  ListFilter,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Search,
  SquarePen,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { fmtCredits } from './BoardViews.js';
import ChatTimeline, { Spinner, requestSummary } from './ChatView.js';
import Composer, { RUN_MODES } from './Composer.js';
import DirectorShowcase from './DirectorShowcase.js';
import Workspace from './Workspace.js';
import { NxDirectorSkeleton } from '../ui/nx-loading';

const API = '/api/director';

const HERO_TYPING_PROMPTS = [
  'Create a 15-second 9:16 F&B ad for an artisanal iced drink, featuring a crisp close-up pour shot…',
  '20-second 9:16 UGC video with a strong 3-second hook and close-up product demo…',
  '15-second 9:16 affiliate promo video with a problem-solution opening and fast cuts…',
  '20-second 3D animated teaser for a product launch with a smooth orbiting camera…',
];

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    credentials: 'include',
    cache: 'no-store',
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json', ...(options.headers || {}) } : options.headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.detail || payload?.error || `Request failed (${response.status})`;
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  return payload;
}

const readProjectFromUrl = () => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('project'));

// Generated media are nexoclip assets; their download URL needs the user's workspace.
let workspacePromise = null;
function loadWorkspaceId() {
  if (!workspacePromise) {
    workspacePromise = (async () => {
      try {
        const stored = window.sessionStorage.getItem('nexoclip_workspace_id');
        if (stored) return stored;
      } catch {
        /* storage unavailable */
      }
      const response = await fetch('/api/workspaces', { credentials: 'include', cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      return payload.workspaces?.[0]?.id || null;
    })().catch(() => null);
  }
  return workspacePromise;
}

const writeProjectToUrl = (projectId) => {
  const url = new URL(window.location.href);
  if (projectId) url.searchParams.set('project', projectId);
  else url.searchParams.delete('project');
  window.history.replaceState(null, '', url.pathname + url.search);
};

const CHAT_WIDTH_KEY = 'director_chat_width';
const CHAT_WIDTH_DEFAULT = 460;
const CHAT_WIDTH_MIN = 360;
const CHAT_WIDTH_MAX = 720;

/** Chat column width when split with the Production Board: draggable, remembered per browser. */
function useChatWidth() {
  const [width, setWidth] = useState(CHAT_WIDTH_DEFAULT);
  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(CHAT_WIDTH_KEY));
      if (saved) setWidth(Math.min(CHAT_WIDTH_MAX, Math.max(CHAT_WIDTH_MIN, saved)));
    } catch {
      /* storage unavailable */
    }
  }, []);
  const save = (value) => {
    try {
      window.localStorage.setItem(CHAT_WIDTH_KEY, String(value));
    } catch {
      /* storage unavailable */
    }
  };
  const startDrag = (event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    let latest = startWidth;
    const move = (e) => {
      latest = Math.min(CHAT_WIDTH_MAX, Math.max(CHAT_WIDTH_MIN, startWidth + e.clientX - startX));
      setWidth(latest);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      save(latest);
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const reset = () => {
    setWidth(CHAT_WIDTH_DEFAULT);
    save(CHAT_WIDTH_DEFAULT);
  };
  return { width, startDrag, reset };
}

// The panel a newly shown chat card opens on the right (null = back to the shot views).
const CARD_PANEL = { brief: 'brief', concepts: 'concepts', script: 'script', assets: 'assets', research: 'research', audio: 'audio', shots: null };

function ConfirmDialog({ title, body, confirmLabel = 'Confirm', busy, onConfirm, onCancel }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#14141F]/45 px-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-[440px] rounded-2xl border border-[#E6E7F0] bg-white p-6 shadow-[0_24px_64px_rgba(20,20,31,0.18)]"
      >
        <h2 className="text-[16.5px] font-semibold tracking-[-0.01em] text-[#14141F]">{title}</h2>
        {body && <div className="mt-2.5 text-[13.5px] leading-relaxed text-[#4C4D61]">{body}</div>}
        <div className="mt-6 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-[#D8DAE6] bg-white px-4 py-2 text-[13px] font-medium text-[#4C4D61] transition hover:border-[#BFC2D4] hover:bg-[#F5F6FA] hover:text-[#14141F]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            autoFocus
            className="inline-flex items-center gap-2 rounded-xl bg-[#5B45F2] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_2px_8px_rgba(91,69,242,0.25)] transition hover:bg-[#4731D8] disabled:opacity-50"
          >
            {busy && <Spinner />} {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export const TOP_UP_URL = '/studio/billing';

// ---------------------------------------------------------------- Secondary Sidebar (AI Director)

function DirectorSidebar({
  projects,
  currentId,
  agentStatus,
  boardOpen,
  onToggleBoard,
  onSelect,
  onNew,
  onChanged,
  open,
  onCollapse,
  mobileOpen,
  onCloseMobile,
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filterApproval, setFilterApproval] = useState(false);
  const [recentsOpen, setRecentsOpen] = useState(true);
  const [menuId, setMenuId] = useState(null);
  const [working, setWorking] = useState(false);
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (!menuId) return undefined;
    const onPointerDown = (event) => {
      if (!event.target.closest?.('[data-project-menu]')) setMenuId(null);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setMenuId(null);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (filterApproval && !p.needs_approval) return false;
      if (q && !(p.title || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [projects, query, filterApproval]);

  const approvalCount = useMemo(() => projects.filter((p) => p.needs_approval).length, [projects]);

  const act = async (run) => {
    setWorking(true);
    try {
      await run();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setWorking(false);
    }
  };

  const renameProject = (project) => {
    setMenuId(null);
    const title = window.prompt('Project name', project.title || '');
    if (!title?.trim() || title.trim() === project.title) return;
    act(async () => {
      await api(`/projects/${encodeURIComponent(project.project_id)}/settings`, {
        method: 'POST',
        body: JSON.stringify({ title: title.trim() }),
      });
      await onChanged();
    });
  };

  const duplicateProject = (project) => {
    setMenuId(null);
    act(async () => {
      const { project_id: copy } = await api(`/projects/${encodeURIComponent(project.project_id)}/duplicate`, { method: 'POST' });
      await onChanged();
      onSelect(copy);
      onCloseMobile();
    });
  };

  const deleteProject = (project) => {
    setMenuId(null);
    if (
      !window.confirm(
        `Delete project "${project.title}"? Its chat, board, and history will be removed. Generated images and videos remain in your asset library.`
      )
    ) {
      return;
    }
    act(async () => {
      await api(`/projects/${encodeURIComponent(project.project_id)}/delete`, { method: 'POST' });
      const list = await onChanged();
      if (project.project_id === currentId) {
        const next = (list || []).find((item) => item.project_id !== project.project_id);
        if (next) onSelect(next.project_id);
        else onNew();
      }
    });
  };

  const statusText =
    agentStatus === 'running'
      ? 'Working…'
      : agentStatus === 'approval'
      ? 'Needs approval'
      : 'Ready';

  if (!open && !mobileOpen) {
    return <div className="dr-sidebar-collapsed hidden" aria-hidden="true" />;
  }

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#14141F]/30 backdrop-blur-[2px] md:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}
      <aside
        aria-label="AI Director navigation"
        className={`dr-sidebar${mobileOpen ? ' is-mobile-open' : ''}${!open ? ' md:hidden' : ''}`}
      >
        {/* Top agent identity pill + collapse */}
        <div className="flex items-center gap-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-[#F2F0FF] px-2.5 py-1.5">
            <span className="grid h-6 w-6 flex-none place-items-center rounded-lg bg-[#5B45F2] text-white shadow-[0_2px_6px_rgba(91,69,242,0.28)]">
              <Clapperboard size={13} strokeWidth={2.2} aria-hidden="true" />
            </span>
            <span className="min-w-0 truncate text-[11.5px] font-bold tracking-[0.02em] text-[#4C38D6]">
              DIRECTOR
            </span>
            <span className="truncate text-[11px] font-medium text-[#6A5CE8]">{statusText}</span>
          </div>
          <button
            type="button"
            onClick={onCollapse}
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
            className="hidden h-7 w-7 flex-none place-items-center rounded-lg text-[#8A8B9C] transition hover:bg-[#F3F4F8] hover:text-[#14141F] md:grid"
          >
            <PanelLeftClose size={15} strokeWidth={1.9} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onCloseMobile}
            title="Close project list"
            aria-label="Close project list"
            className="grid h-7 w-7 flex-none place-items-center rounded-lg text-[#8A8B9C] transition hover:bg-[#F3F4F8] hover:text-[#14141F] md:hidden"
          >
            <X size={15} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        {/* + New action pill + quiet filter & search icons */}
        <div className="mt-3 flex items-center justify-between gap-1.5 px-0.5">
          <button
            type="button"
            onClick={() => {
              onNew();
              onCloseMobile();
            }}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition ${
              !currentId
                ? 'bg-[#EAEAF2] text-[#14141F]'
                : 'bg-[#F4F4F7] text-[#2C2D3A] hover:bg-[#EAEAF2] hover:text-[#14141F]'
            }`}
          >
            <Plus size={14} strokeWidth={2.2} aria-hidden="true" />
            <span>New</span>
          </button>

          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setFilterApproval((v) => !v)}
              title={filterApproval ? 'Show all projects' : 'Filter projects needing approval'}
              aria-pressed={filterApproval}
              className={`relative grid h-7 w-7 place-items-center rounded-lg transition ${
                filterApproval
                  ? 'bg-[#F2F0FF] text-[#5B45F2]'
                  : 'text-[#8A8B9C] hover:bg-[#F3F4F8] hover:text-[#14141F]'
              }`}
            >
              <ListFilter size={14} strokeWidth={1.9} aria-hidden="true" />
              {approvalCount > 0 && !filterApproval && (
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#D97706]" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setSearchOpen((v) => {
                  if (v) setQuery('');
                  return !v;
                });
              }}
              title="Search projects"
              aria-pressed={searchOpen}
              className={`grid h-7 w-7 place-items-center rounded-lg transition ${
                searchOpen
                  ? 'bg-[#F2F0FF] text-[#5B45F2]'
                  : 'text-[#8A8B9C] hover:bg-[#F3F4F8] hover:text-[#14141F]'
              }`}
            >
              <Search size={14} strokeWidth={1.9} aria-hidden="true" />
            </button>
          </div>
        </div>

        {searchOpen && (
          <div className="mt-2 px-0.5">
            <div className="relative flex items-center">
              <Search size={13} className="pointer-events-none absolute left-2.5 text-[#8A8B9C]" aria-hidden="true" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects…"
                aria-label="Search AI Director projects"
                className="w-full rounded-lg border border-[#E6E7F0] bg-[#FAFAFD] py-1.5 pl-8 pr-7 text-[12.5px] text-[#14141F] outline-none placeholder:text-[#9A9BAC] focus:border-[#5B45F2] focus:bg-white"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2 text-[#8A8B9C] hover:text-[#14141F]"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Quick shortcut to Production Board when inside a project */}
        {currentId && (
          <div className="mt-3 space-y-0.5 px-0.5">
            <button
              type="button"
              onClick={() => {
                onToggleBoard();
                onCloseMobile();
              }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] font-medium transition ${
                boardOpen
                  ? 'bg-[#F2F0FF] text-[#4C38D6]'
                  : 'text-[#2D2E3F] hover:bg-[#F3F4F8] hover:text-[#14141F]'
              }`}
            >
              <LayoutPanelLeft
                size={15}
                strokeWidth={1.85}
                className={`flex-none ${boardOpen ? 'text-[#5B45F2]' : 'text-[#6E6F82]'}`}
                aria-hidden="true"
              />
              <span className="flex-1 truncate">Production Board</span>
              {boardOpen && (
                <span className="h-1.5 w-1.5 flex-none rounded-full bg-[#5B45F2]" aria-hidden="true" />
              )}
            </button>
          </div>
        )}

        {/* Recents list */}
        <div data-tour="director-project-switcher" className="mt-4 flex min-h-0 flex-1 flex-col">
          <button
            type="button"
            onClick={() => setRecentsOpen((v) => !v)}
            className="flex items-center gap-1 px-2.5 py-1 text-[11.5px] font-medium text-[#8A8B9C] transition hover:text-[#2C2D3A]"
          >
            <span>Recents</span>
            <ChevronDown
              size={12}
              strokeWidth={2}
              className={`transition-transform ${recentsOpen ? '' : '-rotate-90'}`}
              aria-hidden="true"
            />
          </button>

          {recentsOpen && (
            <div className="mt-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-0.5 pb-2">
              {filtered.length === 0 ? (
                <p className="px-2 py-2 text-[12px] text-[#9A9BAC]">
                  {projects.length === 0
                    ? 'No projects yet.'
                    : filterApproval
                    ? 'Nothing awaiting approval.'
                    : 'No matching projects.'}
                </p>
              ) : (
                filtered.map((project) => {
                  const active = project.project_id === currentId;
                  const menuOpen = menuId === project.project_id;
                  return (
                    <div
                      key={project.project_id}
                      data-project-menu
                      className={`group relative flex items-center rounded-lg transition ${
                        active ? 'bg-[#F1F1F6]' : 'hover:bg-[#F5F5F9]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(project.project_id);
                          onCloseMobile();
                        }}
                        className={`flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-[13px] ${
                          active ? 'font-medium text-[#14141F]' : 'text-[#3A3B4C] group-hover:text-[#14141F]'
                        }`}
                      >
                        <span className="truncate">{project.title || 'Untitled'}</span>
                        {project.busy && <Spinner />}
                        {!project.busy && project.needs_approval && (
                          <span
                            title="Awaiting approval"
                            className="h-1.5 w-1.5 flex-none rounded-full bg-[#D97706]"
                          />
                        )}
                      </button>

                      <button
                        type="button"
                        disabled={working}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuId(menuOpen ? null : project.project_id);
                        }}
                        aria-label={`Options for ${project.title}`}
                        className={`mr-1 grid h-6 w-6 flex-none place-items-center rounded-md text-[#8A8B9C] transition hover:bg-white hover:text-[#14141F] ${
                          menuOpen ? 'opacity-100 bg-white text-[#14141F]' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                        }`}
                      >
                        <MoreHorizontal size={14} />
                      </button>

                      {menuOpen && (
                        <div className="absolute right-1 top-full z-40 mt-1 w-36 overflow-hidden rounded-xl border border-[#E6E6EE] bg-white p-1 shadow-[0_12px_30px_rgba(20,20,31,0.12)]">
                          <button
                            type="button"
                            onClick={() => renameProject(project)}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] font-medium text-[#323344] transition hover:bg-[#F4F4F8] hover:text-[#14141F]"
                          >
                            <Pencil size={12.5} aria-hidden="true" />
                            <span>Rename</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => duplicateProject(project)}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] font-medium text-[#323344] transition hover:bg-[#F4F4F8] hover:text-[#14141F]"
                          >
                            <Copy size={12.5} aria-hidden="true" />
                            <span>Duplicate</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteProject(project)}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] font-medium text-[#C01048] transition hover:bg-[#FFF1F3]"
                          >
                            <Trash2 size={12.5} aria-hidden="true" />
                            <span>Delete</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

// ---------------------------------------------------------------- New Project (Home-matching DotGrid Hero + Showcase Rail)

function NewProject({ initialBrief, onCreated, sidebarOpen, onOpenSidebar, onOpenMobileSidebar }) {
  const prefersReducedMotion = useReducedMotion();
  const [brief, setBrief] = useState(initialBrief || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [runMode, setRunMode] = useState('guide');
  const [llm, setLlm] = useState('seed');
  const [workspaceId, setWorkspaceId] = useState(null);
  const scrollRef = useRef(null);
  const composerInputRef = useRef(null);

  useEffect(() => {
    loadWorkspaceId().then(setWorkspaceId);
  }, []);

  const handleRecreateFromShowcase = useCallback(
    (fullPrompt) => {
      if (!fullPrompt) return;
      setBrief(fullPrompt);
      window.requestAnimationFrame(() => {
        if (scrollRef.current && scrollRef.current.scrollTop > 16) {
          scrollRef.current.scrollTo({
            top: 0,
            behavior: prefersReducedMotion ? 'auto' : 'smooth',
          });
        }
        const el = composerInputRef.current;
        if (el) {
          el.focus({ preventScroll: true });
          el.setSelectionRange(fullPrompt.length, fullPrompt.length);
        }
      });
    },
    [prefersReducedMotion],
  );

  const submit = async (text, { attachments, mentions }) => {
    if (busy) return false;
    setBusy(true);
    setError('');
    try {
      const { project_id: projectId } = await api('/projects', {
        method: 'POST',
        body: JSON.stringify({ brief: text, run_mode: runMode, llm, attachments, mentions }),
      });
      onCreated(projectId);
      return true;
    } catch (err) {
      setError(err.message);
      setBusy(false);
      return false;
    }
  };

  return (
    <div className="dr-hero-stage relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Quiet top bar for sidebar expand / mobile drawer */}
      <div className="relative z-10 flex h-12 flex-none items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenMobileSidebar}
            aria-label="Open project list"
            className="dr-hero-icon-btn md:hidden"
          >
            <PanelLeftOpen size={17} strokeWidth={1.9} />
          </button>
          {!sidebarOpen && (
            <button
              type="button"
              onClick={onOpenSidebar}
              title="Open AI Director sidebar"
              aria-label="Open AI Director sidebar"
              className="dr-hero-icon-btn hidden md:grid"
            >
              <PanelLeftOpen size={17} strokeWidth={1.9} />
            </button>
          )}
        </div>
        <div />
      </div>

      <div ref={scrollRef} className="dr-hero-scroll relative z-10">
        <section className="dr-hero-center" aria-labelledby="dr-hero-heading">
          {/* Home-identical segmented mode tabs */}
          <div className="dr-hero-tabs" role="tablist" aria-label="AI Director run mode">
            {RUN_MODES.map(([id, label, hint]) => {
              const selected = runMode === id;
              const ModeIcon = id === 'guide' ? Compass : Zap;
              return (
                <motion.button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  title={hint}
                  whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
                  onClick={() => setRunMode(id)}
                  className={`dr-hero-tab${selected ? ' is-active' : ''}`}
                >
                  {selected && (
                    <motion.span
                      layoutId="dr-hero-tab-pill"
                      aria-hidden="true"
                      className="dr-hero-tab-pill"
                      transition={
                        prefersReducedMotion
                          ? { duration: 0 }
                          : { type: 'spring', stiffness: 420, damping: 32 }
                      }
                    />
                  )}
                  <span className="dr-hero-tab-inner">
                    <ModeIcon size={16} strokeWidth={2} aria-hidden="true" />
                    <span>{label}</span>
                  </span>
                </motion.button>
              );
            })}
          </div>

          <h1 id="dr-hero-heading" className="dr-hero-title">
            Tell us the video you want to create.
          </h1>

          <div data-tour="director-brief" className="w-full max-w-[704px]">
            <Composer
              value={brief}
              onChange={setBrief}
              onSubmit={submit}
              sending={busy}
              workspaceId={workspaceId}
              hero
              rows={3}
              textareaRef={composerInputRef}
              placeholder="What video do you want to make? Attach product photos, characters, or reference videos if you have them…"
              typingPrompts={HERO_TYPING_PROMPTS}
              llm={llm}
              onLlm={setLlm}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[12px] text-[#747387]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#F59E0B]" aria-hidden="true" />
              <span>Min. 100 credits to start</span>
            </span>
            <span className="text-[#D4D3E0]" aria-hidden="true">·</span>
            <span>{runMode === 'guide' ? 'Director pauses for your approval at each stage' : 'Runs automatically through to the final video'}</span>
          </div>

          {error && (
            <p className="mt-4 w-full max-w-[704px] rounded-2xl border border-[#FCCDD6] bg-[#FFF1F3] px-4 py-2.5 text-[13px] text-[#C01048]">
              {error}
              {/kredit|credit/i.test(error) && (
                <>
                  {' '}
                  <a href={TOP_UP_URL} target="_blank" rel="noreferrer" className="font-semibold underline">
                    Top up credits
                  </a>
                </>
              )}
            </p>
          )}
        </section>

        {/* Home-identical Video Showcase Rail + Portaled Modal */}
        <DirectorShowcase onRecreate={handleRecreateFromShowcase} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Active Project Workspace

function ProjectWorkspace({
  projectId,
  onNewProject,
  onProjectsChanged,
  sidebarOpen,
  onOpenSidebar,
  onOpenMobileSidebar,
  boardOpen,
  onSetBoardOpen,
  onStatusChange,
}) {
  const [view, setView] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [panel, setPanel] = useState(null);
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState(''); // the Director's reply as it streams in
  const [sending, setSending] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [mobilePane, setMobilePane] = useState('chat');
  const chatWidth = useChatWidth();
  const [workspaceId, setWorkspaceId] = useState(null);
  const chatEnd = useRef(null);

  useEffect(() => {
    setMobilePane(boardOpen ? 'board' : 'chat');
  }, [boardOpen]);

  useEffect(() => {
    loadWorkspaceId().then(setWorkspaceId);
  }, []);

  const lastSeenId = useRef(null); // newest chat entry already on screen; cards newer than it auto-open

  const refresh = useCallback(async () => {
    try {
      const next = await api(`/projects/${encodeURIComponent(projectId)}`);
      setView(next);
      setLoadError('');
      const newestId = next.chat.reduce((max, entry) => Math.max(max, entry.id || 0), 0);
      if (lastSeenId.current !== null) {
        const fresh = next.chat
          .filter((entry) => entry.kind === 'card' && entry.id > lastSeenId.current)
          .map((entry) => entry.meta?.card);
        if (fresh.length) {
          // A concept choice waits on the user, so it wins; otherwise show the latest card.
          const pick = fresh.includes('concepts') && !next.board.concepts?.chosen ? 'concepts' : fresh[fresh.length - 1];
          if (pick in CARD_PANEL) {
            setPanel(CARD_PANEL[pick]);
            onSetBoardOpen(true);
            setMobilePane('board');
          }
        }
      }
      lastSeenId.current = Math.max(lastSeenId.current || 0, newestId);
    } catch (err) {
      setLoadError(err.message);
    }
  }, [projectId, onSetBoardOpen]);

  useEffect(() => {
    setView(null);
    lastSeenId.current = null;
    refresh();
  }, [refresh]);

  // Live updates: the service's SSE feed says "something changed"; we refetch.
  useEffect(() => {
    let source;
    let timer;
    try {
      source = new EventSource(`${API}/projects/${encodeURIComponent(projectId)}/events`);
      source.onmessage = (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        if (data?.type === 'draft') {
          setDraft(data.text || '');
          return;
        }
        if (data?.type !== 'change') return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          refresh();
          onProjectsChanged();
        }, 250);
      };
    } catch {
      /* polling below still covers it */
    }
    return () => {
      clearTimeout(timer);
      source?.close();
    };
  }, [projectId, refresh, onProjectsChanged]);

  const agentRunning = view?.agent?.status === 'running';
  useEffect(() => {
    if (!agentRunning) setDraft('');
  }, [agentRunning]);
  const generationRunning = view?.generation?.status === 'running';
  const renderRunning = view?.render?.status === 'running';
  const hasPendingApproval = Boolean(
    view?.board?.requests?.some((r) => r.status === 'pending' && !r.auto) ||
      (view?.board?.concepts?.options?.length && !view?.board?.concepts?.chosen)
  );

  useEffect(() => {
    if (agentRunning) onStatusChange('running');
    else if (hasPendingApproval) onStatusChange('approval');
    else onStatusChange('idle');
  }, [agentRunning, hasPendingApproval, onStatusChange]);

  // Fallback polling while something runs, in case the event stream is buffered.
  useEffect(() => {
    if (!agentRunning && !generationRunning && !renderRunning) return undefined;
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [agentRunning, generationRunning, renderRunning, refresh]);

  const chatLength = view?.chat?.length || 0;
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: 'end' });
  }, [chatLength, agentRunning]);

  const runAction = async (fn) => {
    setActionBusy(true);
    setActionError('');
    try {
      await fn();
      await refresh();
      onProjectsChanged();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionBusy(false);
    }
  };

  const sendMessage = async (text, { attachments = [], mentions = [] } = {}) => {
    if (!text || sending) return false;
    setSending(true);
    setActionError('');
    try {
      await api(`/projects/${encodeURIComponent(projectId)}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text, attachments, mentions }),
      });
      setMessage('');
      await refresh();
      return true;
    } catch (err) {
      setActionError(err.message);
      return false;
    } finally {
      setSending(false);
    }
  };
  const setRunMode = (runMode) =>
    runAction(() =>
      api(`/projects/${encodeURIComponent(projectId)}/settings`, {
        method: 'POST',
        body: JSON.stringify({ run_mode: runMode }),
      })
    );
  const setLlm = (llm) =>
    runAction(() =>
      api(`/projects/${encodeURIComponent(projectId)}/settings`, {
        method: 'POST',
        body: JSON.stringify({ llm }),
      })
    );
  // The credit gate's "Lanjutkan": approve the held request again once the balance covers it.
  const continueRequest = (request) =>
    runAction(() => api(`/projects/${encodeURIComponent(projectId)}/requests/${request.id}/approve`, { method: 'POST' }));

  // skip: the optional items (voiceover, music) left unticked on the card; estimate: the card's total without them.
  const approve = (request, skip = [], estimate = request.estimate) => {
    const what = requestSummary(estimate);
    if (!window.confirm(`Generate ${what} and deduct approximately ${fmtCredits(estimate.credits)} credits. Continue?`)) return;
    runAction(() =>
      api(`/projects/${encodeURIComponent(projectId)}/requests/${request.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ skip }),
      })
    );
  };
  const reject = (request) =>
    runAction(() => api(`/projects/${encodeURIComponent(projectId)}/requests/${request.id}/reject`, { method: 'POST' }));
  const retry = () => runAction(() => api(`/projects/${encodeURIComponent(projectId)}/retry`, { method: 'POST' }));
  // Free: joins the finished shots into one MP4; its card in the chat shows progress and the download.
  const startRender = (options) =>
    runAction(async () => {
      const chosen =
        options && typeof options === 'object' && 'format' in options
          ? { resolution: options.resolution, fps: Number(options.fps), format: options.format }
          : null;
      await api(`/projects/${encodeURIComponent(projectId)}/renders`, {
        method: 'POST',
        ...(chosen ? { body: JSON.stringify(chosen) } : {}),
      });
      setMobilePane('chat');
    });

  // Direct edits from the board; resolves true when saved so the editor can close.
  const onEdit = useCallback(
    async (tool, args) => {
      setActionBusy(true);
      setActionError('');
      try {
        await api(`/projects/${encodeURIComponent(projectId)}/edit`, {
          method: 'POST',
          body: JSON.stringify({ tool, args }),
        });
        await refresh();
        return true;
      } catch (err) {
        setActionError(err.message);
        return false;
      } finally {
        setActionBusy(false);
      }
    },
    [projectId, refresh]
  );

  const requesting = useRef(false); // a double click sends one request, not two
  const onRequest = useCallback(
    async (items, force = false) => {
      if (requesting.current) return;
      requesting.current = true;
      setActionBusy(true);
      setActionError('');
      try {
        await api(`/projects/${encodeURIComponent(projectId)}/requests`, {
          method: 'POST',
          body: JSON.stringify({ items, force }),
        });
        await refresh();
        setMobilePane('chat'); // the estimate card to approve appears in the chat
      } catch (err) {
        setActionError(err.message);
      } finally {
        requesting.current = false;
        setActionBusy(false);
      }
    },
    [projectId, refresh]
  );

  const openPanel = (id) => {
    setPanel(id);
    onSetBoardOpen(true);
    setMobilePane('board');
  };

  const chooseAudio = async (option) => {
    if (!(await onEdit('choose_audio_option', { id: option ? option.id : 'none' }))) return;
    const { shots, media } = view.board;
    const videosDone = shots.length > 0 && shots.every((s) => media[`video:${s.id}`]?.asset_id);
    const items = option
      ? [...(option.voiceover_lines || []).map((l) => `vo:${l.shot_id}`), ...(option.music_prompt ? ['audio:music'] : [])]
      : [];
    if (items.length && videosDone) await onRequest(items);
  };

  // Picking a concept: confirm, record it, then tell the Director so it carries on right away.
  const [confirm, setConfirm] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const chooseConcept = (option) =>
    setConfirm({
      title: `Use concept “${option.title}”?`,
      body: (
        <>
          <p>{option.logline}</p>
          <p className="mt-2 text-[#7A7B90]">The Director will immediately continue with this concept.</p>
        </>
      ),
      run: async () => {
        if (!(await onEdit('choose_concept', { id: option.id }))) return;
        await api(`/projects/${encodeURIComponent(projectId)}/messages`, {
          method: 'POST',
          body: JSON.stringify({ text: `I chose the concept “${option.title}”. Continue with this concept.` }),
        });
        setMobilePane('chat');
        await refresh();
      },
    });
  // Confirming the script: save pending edits, lock it as approved, then let the Director carry on.
  const confirmScript = (draftScript, dirty, clearDirty) =>
    setConfirm({
      title: 'Confirm script?',
      body: (
        <p>
          The script will be locked so it does not change, and the Director will immediately continue creating assets, scenes, and shots from this script.
        </p>
      ),
      run: async () => {
        if (dirty && !(await onEdit('write_script', draftScript))) return;
        clearDirty();
        if (!(await onEdit('set_lock', { target: 'script', locked: true }))) return;
        await api(`/projects/${encodeURIComponent(projectId)}/messages`, {
          method: 'POST',
          body: JSON.stringify({ text: 'I have confirmed the script. Continue using this script.' }),
        });
        setMobilePane('chat');
        await refresh();
      },
    });

  const runConfirm = async () => {
    setConfirming(true);
    try {
      await confirm.run();
      setConfirm(null);
    } catch (err) {
      setActionError(err.message);
      setConfirm(null);
    } finally {
      setConfirming(false);
    }
  };

  const loadVersions = useCallback(() => api(`/projects/${encodeURIComponent(projectId)}/versions`), [projectId]);
  const onRestore = (version) => {
    if (!window.confirm(`Restore board to version ${version}? Subsequent changes will remain saved in history.`)) return;
    runAction(() =>
      api(`/projects/${encodeURIComponent(projectId)}/restore`, {
        method: 'POST',
        body: JSON.stringify({ version }),
      })
    );
  };

  if (loadError && !view) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 bg-white px-6 text-center">
        <p className="text-[14px] font-medium text-[#C01048]">{loadError}</p>
        <button
          type="button"
          onClick={onNewProject}
          className="rounded-xl bg-[#5B45F2] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[#4731D8]"
        >
          Create new project
        </button>
      </div>
    );
  }
  if (!view) {
    return (
      <div className="flex h-full flex-1 bg-white">
        <NxDirectorSkeleton variant="project" label="Loading project" surface="light" />
      </div>
    );
  }

  const board = view.board;
  const canSend = !agentRunning && !sending;
  const shotCount = board?.shots?.length || 0;
  const totalCredits = Number(view.llm_credits || 0) + Number(view.generation_credits || 0);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-white md:flex-row">
      {/* Mobile top bar: drawer + Chat / Board switch */}
      <div className="flex items-center gap-2 border-b border-[#EFEFF4] bg-white px-3 py-2 md:hidden">
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          aria-label="Open project list"
          className="grid h-8 w-8 flex-none place-items-center rounded-lg text-[#5E5E72] hover:bg-[#F3F4F8]"
        >
          <PanelLeftOpen size={17} strokeWidth={1.9} />
        </button>
        <div className="flex flex-1 rounded-xl bg-[#F4F4F8] p-0.5">
          {[
            ['chat', 'Chat'],
            ['board', shotCount ? `Board (${shotCount})` : 'Board'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setMobilePane(id);
                if (id === 'board') onSetBoardOpen(true);
              }}
              className={`flex-1 rounded-lg py-1.5 text-[12.5px] font-semibold transition ${
                mobilePane === id ? 'bg-white text-[#14141F] shadow-xs' : 'text-[#6E6F82]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Serene centered Chat Canvas (full-width when Board is closed; resizable split when Board is open) */}
      <section
        style={boardOpen ? { '--chat-width': `${chatWidth.width}px` } : undefined}
        className={`${mobilePane === 'chat' ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 flex-col bg-white md:flex ${
          boardOpen ? 'md:w-[var(--chat-width)] md:flex-none md:border-r md:border-[#EAEAEF]' : ''
        }`}
      >
        {/* Whisper-quiet top bar inside the chat canvas */}
        <div className="hidden h-12 flex-none items-center justify-between px-4 md:flex">
          <div className="flex min-w-0 items-center gap-2">
            {!sidebarOpen && (
              <button
                type="button"
                onClick={onOpenSidebar}
                title="Open AI Director sidebar"
                aria-label="Open AI Director sidebar"
                className="grid h-8 w-8 flex-none place-items-center rounded-lg text-[#6E6F82] transition hover:bg-[#F3F4F8] hover:text-[#14141F]"
              >
                <PanelLeftOpen size={16} strokeWidth={1.9} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-tour={!boardOpen ? 'director-board' : undefined}
              onClick={() => onSetBoardOpen((v) => !v)}
              title={boardOpen ? 'Close Production Board' : 'Open Production Board (Scene, Shot, Timeline)'}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition ${
                boardOpen
                  ? 'border-[#DDD7FE] bg-[#F2F0FF] text-[#4C38D6]'
                  : 'border-[#E6E7F0] bg-white text-[#4C4D61] hover:border-[#C7CAD9] hover:bg-[#F7F8FA] hover:text-[#14141F]'
              }`}
            >
              <LayoutPanelLeft size={13.5} strokeWidth={2} aria-hidden="true" />
              <span>Board</span>
              {shotCount > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10.5px] font-semibold ${
                    boardOpen ? 'bg-white/90 text-[#4C38D6]' : 'bg-[#F2F3F7] text-[#5E5E72]'
                  }`}
                >
                  {shotCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={onNewProject}
              title="New project"
              aria-label="New project"
              className="grid h-8 w-8 place-items-center rounded-full text-[#6E6F82] transition hover:bg-[#F3F4F8] hover:text-[#14141F]"
            >
              <SquarePen size={15} strokeWidth={1.9} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Scrollable centered conversation stream */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-2 pb-10">
          <div className="mx-auto w-full max-w-[680px]">
            <ChatTimeline
              chat={view.chat}
              board={board}
              workspaceId={workspaceId}
              busy={actionBusy}
              generationRunning={generationRunning}
              renderRunning={renderRunning}
              agentRunning={agentRunning}
              onApprove={approve}
              onReject={reject}
              onOpenPanel={openPanel}
              onRender={startRender}
              draft={agentRunning ? draft : ''}
              onContinue={continueRequest}
              projectTitle={view.title}
              runMode={view.run_mode || 'guide'}
              needsApproval={hasPendingApproval}
            />
            {view.agent?.status === 'error' && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={retry}
                  disabled={actionBusy}
                  className="rounded-xl border border-[#D8DAE6] bg-white px-3.5 py-2 text-[12.5px] font-medium text-[#2D2E3F] transition hover:bg-[#F5F6FA] disabled:opacity-45"
                >
                  Try again
                </button>
              </div>
            )}
            <div ref={chatEnd} className="h-4" />
          </div>
        </div>

        {/* Floating pill composer anchored cleanly at bottom center */}
        <div data-tour="director-chat" className="dr-composer-fade flex-none px-5 pb-3.5 pt-3">
          <div className="mx-auto w-full max-w-[680px] space-y-2">
            {generationRunning && (
              <div className="flex items-center gap-2 rounded-2xl border border-[#FCE0B0] bg-[#FFF8EB] px-3.5 py-2 text-[12px] font-medium text-[#A05C07]">
                <Spinner />
                <span>Generating images/videos. You can keep chatting.</span>
              </div>
            )}
            {actionError && (
              <p className="rounded-2xl border border-[#FCCDD6] bg-[#FFF1F3] px-3.5 py-2 text-[12px] text-[#C01048]">
                {actionError}
              </p>
            )}
            <Composer
              value={message}
              onChange={setMessage}
              onSubmit={sendMessage}
              disabled={!canSend}
              sending={sending}
              workspaceId={workspaceId}
              board={board}
              runMode={view.run_mode || 'guide'}
              onRunMode={setRunMode}
              llm={view.llm || 'seed'}
              onLlm={setLlm}
              rows={1}
              placeholder={agentRunning ? 'Waiting for Director to finish…' : 'Message AI Director, @mention a shot/asset…'}
              metaLeft={
                <span
                  className="inline-flex items-center gap-1.5"
                  title={`AI Chat ${fmtCredits(view.llm_credits || 0)} · Generation ${fmtCredits(view.generation_credits || 0)} · AI Model $${Number(view.llm_cost_usd || 0).toFixed(3)}`}
                >
                  <span className="h-2 w-2 rounded-full bg-[#F59E0B]" aria-hidden="true" />
                  <span>{fmtCredits(totalCredits)} cr</span>
                </span>
              }
            />
          </div>
        </div>
      </section>

      {/* Draggable resizer + Production Board (shown on demand on desktop, or via mobile tab) */}
      {boardOpen && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize chat width"
          title="Drag to resize chat width (double-click to reset)"
          onPointerDown={chatWidth.startDrag}
          onDoubleClick={chatWidth.reset}
          className="dr-resizer hidden md:block"
        />
      )}

      {(boardOpen || mobilePane === 'board') && (
        <section
          data-tour="director-board"
          className={`${mobilePane === 'board' ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 flex-col bg-[#F7F8FA] ${
            boardOpen ? 'md:flex' : 'md:hidden'
          }`}
        >
          {actionError && (
            <p className="border-b border-[#FCCDD6] bg-[#FFF1F3] px-5 py-2 text-[12.5px] text-[#C01048]">{actionError}</p>
          )}
          <div className="min-h-0 flex-1">
            <Workspace
              board={board}
              workspaceId={workspaceId}
              onEdit={onEdit}
              onRequest={onRequest}
              onChooseConcept={chooseConcept}
              onConfirmScript={confirmScript}
              busy={actionBusy || agentRunning}
              panel={panel}
              onOpenPanel={setPanel}
              onClosePanel={() => setPanel(null)}
              onCloseBoard={() => {
                onSetBoardOpen(false);
                setMobilePane('chat');
              }}
              loadVersions={loadVersions}
              onRestore={onRestore}
              onRender={startRender}
              rendering={renderRunning}
              onChooseAudio={chooseAudio}
              prices={view.video_credits_per_second}
              assetsZipUrl={`${API}/projects/${encodeURIComponent(projectId)}/assets.zip`}
            />
          </div>
        </section>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          body={confirm.body}
          busy={confirming}
          onConfirm={runConfirm}
          onCancel={() => {
            if (!confirming) setConfirm(null);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Root DirectorApp

export default function DirectorApp({ initialBrief = '', onHeroChange = null }) {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [ready, setReady] = useState(false);
  const [serviceError, setServiceError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [agentStatus, setAgentStatus] = useState('idle');

  const isHeroSurface = !ready || (!projectId && !(serviceError && !projects.length));
  useEffect(() => {
    onHeroChange?.(isHeroSurface);
  }, [isHeroSurface, onHeroChange]);
  useEffect(() => () => onHeroChange?.(true), [onHeroChange]);

  const loadProjects = useCallback(async () => {
    try {
      const list = await api('/projects');
      setProjects(list);
      setServiceError('');
      return list;
    } catch (err) {
      setServiceError(err.message);
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadProjects().then((list) => {
      if (cancelled) return;
      const fromUrl = readProjectFromUrl();
      if (fromUrl && list?.some((project) => project.project_id === fromUrl)) setProjectId(fromUrl);
      else if (!fromUrl && !new URLSearchParams(window.location.search).has('new') && !initialBrief && list?.length) setProjectId(list[0].project_id);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [loadProjects, initialBrief]);

  const selectProject = useCallback((id) => {
    setProjectId(id);
    setBoardOpen(false);
    writeProjectToUrl(id);
  }, []);

  const newProject = useCallback(() => {
    setProjectId(null);
    setBoardOpen(false);
    setAgentStatus('idle');
    writeProjectToUrl(null);
  }, []);

  const created = useCallback(
    async (id) => {
      await loadProjects();
      selectProject(id);
    },
    [loadProjects, selectProject]
  );

  if (!ready) {
    return <NxDirectorSkeleton variant="full" label="Loading AI Director" surface="light" />;
  }
  if (serviceError && !projects.length) {
    return (
      <div className="director-ui flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-[15px] font-semibold text-[#14141F]">AI Director is currently unreachable.</p>
        <p className="max-w-[420px] text-[13px] text-[#5E5E72]">{serviceError}</p>
        <button
          type="button"
          onClick={() => loadProjects()}
          className="mt-1 rounded-xl border border-[#D8DAE6] bg-white px-4 py-2 text-[13px] font-medium text-[#14141F] shadow-sm transition hover:bg-[#F5F6FA]"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="director-ui flex h-full min-h-0 w-full overflow-hidden bg-white">
      <DirectorSidebar
        projects={projects}
        currentId={projectId}
        agentStatus={agentStatus}
        boardOpen={boardOpen}
        onToggleBoard={() => setBoardOpen((v) => !v)}
        onSelect={selectProject}
        onNew={newProject}
        onChanged={loadProjects}
        open={sidebarOpen}
        onCollapse={() => setSidebarOpen(false)}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      {projectId ? (
        <ProjectWorkspace
          key={projectId}
          projectId={projectId}
          onNewProject={newProject}
          onProjectsChanged={loadProjects}
          sidebarOpen={sidebarOpen}
          onOpenSidebar={() => setSidebarOpen(true)}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
          boardOpen={boardOpen}
          onSetBoardOpen={setBoardOpen}
          onStatusChange={setAgentStatus}
        />
      ) : (
        <NewProject
          initialBrief={initialBrief}
          onCreated={created}
          sidebarOpen={sidebarOpen}
          onOpenSidebar={() => setSidebarOpen(true)}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
        />
      )}
    </div>
  );
}
