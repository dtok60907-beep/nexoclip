'use client';

// AI Director: chat with the agent on the left, the project board on the right.
// Talks only to /api/director/* (proxied to the OpenMontage director service).

import { useCallback, useEffect, useRef, useState } from 'react';
import { fmtCredits } from './BoardViews.js';
import ChatTimeline, { Spinner, requestSummary } from './ChatView.js';
import Composer from './Composer.js';
import Workspace from './Workspace.js';

const API = '/api/director';

const EXAMPLE_BRIEFS = [
  'Trailer rom-com 50 detik tentang 4 sahabat yang liburan terakhir di rumah pantai sebelum kuliah.',
  'Iklan TikTok 20 detik untuk kopi susu lokal, suasana pagi di Jakarta, hangat.',
  'Teaser 15 detik peluncuran sepatu lari, energik, potongan cepat.',
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
    const detail = payload?.detail || payload?.error || `Request gagal (${response.status})`;
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
      } catch { /* storage unavailable */ }
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
const CHAT_WIDTH_DEFAULT = 520;
const CHAT_WIDTH_MIN = 360;
const CHAT_WIDTH_MAX = 800;

/** Chat column width: draggable, remembered per browser. */
function useChatWidth() {
  const [width, setWidth] = useState(CHAT_WIDTH_DEFAULT);
  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(CHAT_WIDTH_KEY));
      if (saved) setWidth(Math.min(CHAT_WIDTH_MAX, Math.max(CHAT_WIDTH_MIN, saved)));
    } catch { /* storage unavailable */ }
  }, []);
  const save = (value) => {
    try { window.localStorage.setItem(CHAT_WIDTH_KEY, String(value)); } catch { /* storage unavailable */ }
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
  const reset = () => { setWidth(CHAT_WIDTH_DEFAULT); save(CHAT_WIDTH_DEFAULT); };
  return { width, startDrag, reset };
}

// The panel a newly shown chat card opens on the right (null = back to the shot views).
const CARD_PANEL = { brief: 'brief', concepts: 'concepts', script: 'script', assets: 'assets', research: 'research', audio: 'audio', shots: null };

function ConfirmDialog({ title, body, confirmLabel = 'Konfirmasi', busy, onConfirm, onCancel }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm" onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}
        className="w-full max-w-[420px] rounded-2xl border border-white/10 bg-[#11151b] p-5 shadow-[0_30px_80px_#000a]">
        <h2 className="text-[15px] font-semibold text-white">{title}</h2>
        {body && <div className="mt-2 text-[13px] leading-relaxed text-white/60">{body}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-[9px] border border-white/15 px-3.5 py-2 text-[12px] text-white/70 hover:border-white/30">Batal</button>
          <button type="button" onClick={onConfirm} disabled={busy} autoFocus
            className="flex items-center gap-2 rounded-[9px] bg-[#d4ff64] px-3.5 py-2 text-[12px] font-bold text-[#10130a] hover:bg-[#e0ff8c] disabled:opacity-50">
            {busy && <Spinner />} {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export const TOP_UP_URL = '/studio/billing';

function NewProject({ initialBrief, onCreated }) {
  const [brief, setBrief] = useState(initialBrief || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [runMode, setRunMode] = useState('guide');
  const [workspaceId, setWorkspaceId] = useState(null);
  useEffect(() => { loadWorkspaceId().then(setWorkspaceId); }, []);

  const submit = async (text, { attachments, mentions }) => {
    if (busy) return false;
    setBusy(true);
    setError('');
    try {
      const { project_id: projectId } = await api('/projects', {
        method: 'POST', body: JSON.stringify({ brief: text, run_mode: runMode, attachments, mentions }),
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
    <div className="flex h-full items-center justify-center overflow-y-auto px-4 py-10">
      <div className="w-full max-w-[680px] text-center">
        <p className="flex items-center justify-center gap-2 text-[9px] font-semibold tracking-[1.8px] text-white/50">
          <span className="h-[5px] w-[5px] rounded-full bg-[#d4ff64] shadow-[0_0_10px_#d4ff6480]" /> AI DIRECTOR
        </p>
        <h1 className="mt-3 text-[clamp(26px,3vw,38px)] font-semibold tracking-[-1.4px] text-white">Ceritakan video yang mau kamu buat.</h1>
        <p className="mx-auto mt-3 max-w-[540px] text-[13px] leading-relaxed text-white/50">
          Ngobrol aja seperti ke sutradara. Director menyusun brief, naskah, karakter, shot, dan audio. Pilih <strong className="text-white/70">Pandu aku</strong> untuk menyetujui tiap langkah, atau <strong className="text-white/70">Langsung jadi</strong> supaya Director jalan sendiri sampai video final.
        </p>
        <div className="mt-6 text-left">
          <Composer value={brief} onChange={setBrief} onSubmit={submit} sending={busy} workspaceId={workspaceId} large rows={4}
            placeholder="Mau bikin video apa? Boleh singkat. Lampirkan foto produk, karakter, atau video referensi kalau ada…"
            runMode={runMode} onRunMode={setRunMode} />
          <p className="mt-2 px-1 text-[10px] text-white/35">Chat memakai sedikit kredit untuk AI. Butuh minimal 100 kredit untuk memulai project. Ctrl/⌘ + Enter untuk kirim.</p>
        </div>
        {error && (
          <p className="mt-3 text-[12px] text-red-300">
            {error}{/kredit/i.test(error) && <> <a href={TOP_UP_URL} target="_blank" rel="noreferrer" className="underline">Top up kredit</a></>}
          </p>
        )}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {EXAMPLE_BRIEFS.map((idea) => (
            <button
              key={idea}
              type="button"
              onClick={() => setBrief(idea)}
              className="max-w-full truncate rounded-full border border-white/[0.06] bg-[#11151b] px-3 py-1.5 text-[10px] text-white/60 hover:border-white/20 hover:text-white"
            >
              {idea}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProjectSwitcher({ projects, currentId, onSelect, onNew }) {
  const [open, setOpen] = useState(false);
  const current = projects.find((project) => project.project_id === currentId);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-2 text-left hover:border-white/15"
        aria-expanded={open}
        aria-label="Ganti project"
      >
        <span className="grid h-6 w-6 flex-none place-items-center rounded-md bg-[#d4ff64]/10 text-[10px] font-bold text-[#d4ff64]">
          {(current?.title || 'P').slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block truncate text-[12px] font-semibold text-white/90">{current?.title || 'Project baru'}</strong>
          <small className="block text-[10px] text-white/40">{projects.length} project</small>
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/40"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-[50vh] overflow-y-auto rounded-xl border border-white/10 bg-[#0e1117] p-1 shadow-[0_18px_50px_#0009]">
          <button
            type="button"
            onClick={() => { setOpen(false); onNew(); }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] text-[#d4ff64] hover:bg-white/[0.05]"
          >
            + Project baru
          </button>
          {projects.map((project) => (
            <button
              key={project.project_id}
              type="button"
              onClick={() => { setOpen(false); onSelect(project.project_id); }}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] hover:bg-white/[0.05] ${
                project.project_id === currentId ? 'text-white' : 'text-white/65'
              }`}
            >
              <span className="truncate">{project.title}</span>
              {project.needs_approval && <span className="flex-none text-[10px] text-[#d4ff64]/80">perlu approve</span>}
              {project.busy && <Spinner />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectWorkspace({ projectId, projects, onSelectProject, onNewProject, onProjectsChanged }) {
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

  useEffect(() => { loadWorkspaceId().then(setWorkspaceId); }, []);

  const lastSeenId = useRef(null); // newest chat entry already on screen; cards newer than it auto-open

  const refresh = useCallback(async () => {
    try {
      const next = await api(`/projects/${encodeURIComponent(projectId)}`);
      setView(next);
      setLoadError('');
      const newestId = next.chat.reduce((max, entry) => Math.max(max, entry.id || 0), 0);
      if (lastSeenId.current !== null) {
        const fresh = next.chat.filter((entry) => entry.kind === 'card' && entry.id > lastSeenId.current).map((entry) => entry.meta?.card);
        if (fresh.length) {
          // A concept choice waits on the user, so it wins; otherwise show the latest card.
          const pick = fresh.includes('concepts') && !next.board.concepts?.chosen ? 'concepts' : fresh[fresh.length - 1];
          if (pick in CARD_PANEL) {
            setPanel(CARD_PANEL[pick]);
            setMobilePane('board');
          }
        }
      }
      lastSeenId.current = Math.max(lastSeenId.current || 0, newestId);
    } catch (err) {
      setLoadError(err.message);
    }
  }, [projectId]);

  useEffect(() => { setView(null); refresh(); }, [refresh]);

  // Live updates: the service's SSE feed says "something changed"; we refetch.
  useEffect(() => {
    let source;
    let timer;
    try {
      source = new EventSource(`${API}/projects/${encodeURIComponent(projectId)}/events`);
      source.onmessage = (event) => {
        let data;
        try { data = JSON.parse(event.data); } catch { return; }
        if (data?.type === 'draft') { setDraft(data.text || ''); return; }
        if (data?.type !== 'change') return;
        clearTimeout(timer);
        timer = setTimeout(() => { refresh(); onProjectsChanged(); }, 250);
      };
    } catch { /* polling below still covers it */ }
    return () => { clearTimeout(timer); source?.close(); };
  }, [projectId, refresh, onProjectsChanged]);

  const agentRunning = view?.agent?.status === 'running';
  useEffect(() => { if (!agentRunning) setDraft(''); }, [agentRunning]);
  const generationRunning = view?.generation?.status === 'running';
  const renderRunning = view?.render?.status === 'running';
  // Fallback polling while something runs, in case the event stream is buffered.
  useEffect(() => {
    if (!agentRunning && !generationRunning && !renderRunning) return undefined;
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [agentRunning, generationRunning, renderRunning, refresh]);

  const chatLength = view?.chat?.length || 0;
  useEffect(() => { chatEnd.current?.scrollIntoView({ block: 'end' }); }, [chatLength, agentRunning]);

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
      await api(`/projects/${encodeURIComponent(projectId)}/messages`, { method: 'POST', body: JSON.stringify({ text, attachments, mentions }) });
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
  const setRunMode = (runMode) => runAction(() => api(`/projects/${encodeURIComponent(projectId)}/settings`, {
    method: 'POST', body: JSON.stringify({ run_mode: runMode }),
  }));
  // The credit gate's "Lanjutkan": approve the held request again once the balance covers it.
  const continueRequest = (request) => runAction(() => api(`/projects/${encodeURIComponent(projectId)}/requests/${request.id}/approve`, { method: 'POST' }));

  const approve = (request) => {
    const what = requestSummary(request.estimate);
    if (!window.confirm(`Generate ${what} dan memotong sekitar ${fmtCredits(request.estimate.credits)} kredit. Lanjut?`)) return;
    runAction(() => api(`/projects/${encodeURIComponent(projectId)}/requests/${request.id}/approve`, { method: 'POST' }));
  };
  const reject = (request) => runAction(() => api(`/projects/${encodeURIComponent(projectId)}/requests/${request.id}/reject`, { method: 'POST' }));
  const retry = () => runAction(() => api(`/projects/${encodeURIComponent(projectId)}/retry`, { method: 'POST' }));
  // Free: joins the finished shots into one MP4; its card in the chat shows progress and the download.
  const startRender = () => runAction(async () => {
    await api(`/projects/${encodeURIComponent(projectId)}/renders`, { method: 'POST' });
    setMobilePane('chat');
  });

  // Direct edits from the board; resolves true when saved so the editor can close.
  const onEdit = useCallback(async (tool, args) => {
    setActionBusy(true);
    setActionError('');
    try {
      await api(`/projects/${encodeURIComponent(projectId)}/edit`, { method: 'POST', body: JSON.stringify({ tool, args }) });
      await refresh();
      return true;
    } catch (err) {
      setActionError(err.message);
      return false;
    } finally {
      setActionBusy(false);
    }
  }, [projectId, refresh]);

  const onRequest = useCallback(async (items, force = false) => {
    setActionBusy(true);
    setActionError('');
    try {
      await api(`/projects/${encodeURIComponent(projectId)}/requests`, { method: 'POST', body: JSON.stringify({ items, force }) });
      await refresh();
      setMobilePane('chat'); // the estimate card to approve appears in the chat
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionBusy(false);
    }
  }, [projectId, refresh]);

  const openPanel = (id) => { setPanel(id); setMobilePane('board'); };

  // Picking one of the Director's audio suggestions applies it (and asks to generate it once the videos exist);
  // null = no separate voiceover / music.
  const chooseAudio = async (option) => {
    if (!(await onEdit('choose_audio_option', { id: option ? option.id : 'none' }))) return;
    // Audio is laid over the finished clips: before the videos exist the choice is only saved, and "Generate semua"
    // picks the audio up together with the videos (it runs after them).
    const { shots, media } = view.board;
    const videosDone = shots.length > 0 && shots.every((s) => media[`video:${s.id}`]?.asset_id);
    const items = option ? [...(option.voiceover_lines || []).map((l) => `vo:${l.shot_id}`), ...(option.music_prompt ? ['audio:music'] : [])] : [];
    if (items.length && videosDone) await onRequest(items);
  };

  // Picking a concept: confirm, record it, then tell the Director so it carries on right away.
  const [confirm, setConfirm] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const chooseConcept = (option) => setConfirm({
    title: `Pakai konsep “${option.title}”?`,
    body: <><p>{option.logline}</p><p className="mt-2 text-white/40">Director akan langsung melanjutkan dengan konsep ini.</p></>,
    run: async () => {
      if (!(await onEdit('choose_concept', { id: option.id }))) return;
      await api(`/projects/${encodeURIComponent(projectId)}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text: `Aku pilih konsep “${option.title}”. Lanjutkan dengan konsep ini.` }),
      });
      setMobilePane('chat');
      await refresh();
    },
  });
  // Confirming the script: save pending edits, lock it as approved, then let the Director carry on.
  const confirmScript = (draft, dirty, clearDirty) => setConfirm({
    title: 'Konfirmasi naskah?',
    body: <p>Naskah dikunci supaya tidak berubah, lalu Director langsung lanjut menyusun aset, scene, dan shot dari naskah ini.</p>,
    run: async () => {
      if (dirty && !(await onEdit('write_script', draft))) return;
      clearDirty();
      if (!(await onEdit('set_lock', { target: 'script', locked: true }))) return;
      await api(`/projects/${encodeURIComponent(projectId)}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text: 'Naskah sudah aku konfirmasi. Lanjutkan pakai naskah ini.' }),
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
    if (!window.confirm(`Kembalikan board ke versi ${version}? Perubahan sesudahnya tetap tersimpan di riwayat.`)) return;
    runAction(() => api(`/projects/${encodeURIComponent(projectId)}/restore`, { method: 'POST', body: JSON.stringify({ version }) }));
  };

  if (loadError && !view) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-red-300">{loadError}</p>
        <button type="button" onClick={onNewProject} className="text-[12px] text-[#d4ff64]">Buat project baru</button>
      </div>
    );
  }
  if (!view) {
    return <div className="flex h-full items-center justify-center gap-2 text-sm text-white/40"><Spinner /> Memuat project…</div>;
  }

  const board = view.board;
  const canSend = !agentRunning && !sending;

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <div className="flex border-b border-white/[0.06] md:hidden">
        {[['chat', 'Chat'], ['board', 'Board']].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMobilePane(id)}
            className={`flex-1 py-2.5 text-[12px] ${mobilePane === id ? 'border-b-2 border-[#d4ff64] text-white' : 'text-white/45'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Chat (width set by the drag handle on desktop) */}
      <section style={{ '--chat-width': `${chatWidth.width}px` }}
        className={`${mobilePane === 'chat' ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col md:flex md:w-[var(--chat-width)] md:flex-none`}>
        <div className="border-b border-white/[0.06] p-3">
          <ProjectSwitcher projects={projects} currentId={projectId} onSelect={onSelectProject} onNew={onNewProject} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          <ChatTimeline chat={view.chat} board={board} workspaceId={workspaceId} busy={actionBusy}
            generationRunning={generationRunning} renderRunning={renderRunning} agentRunning={agentRunning}
            onApprove={approve} onReject={reject} onOpenPanel={openPanel} onRender={startRender}
            draft={agentRunning ? draft : ''} onContinue={continueRequest} />
          {view.agent?.status === 'error' && (
            <button type="button" onClick={retry} disabled={actionBusy} className="mt-3 rounded-lg border border-white/15 px-3 py-1.5 text-[11px] text-white/80 hover:border-white/30 disabled:opacity-50">
              Coba lagi
            </button>
          )}
          <div ref={chatEnd} />
        </div>
        <div className="space-y-2 border-t border-white/[0.06] p-3">
          {generationRunning && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-300/15 bg-amber-300/[0.05] px-3 py-2 text-[11px] text-amber-200/80">
              <Spinner /> Gambar/video sedang dibuat. Kamu tetap bisa ngobrol.
            </div>
          )}
          {actionError && <p className="text-[11px] text-red-300">{actionError}</p>}
          <Composer value={message} onChange={setMessage} onSubmit={sendMessage} disabled={!canSend} sending={sending}
            workspaceId={workspaceId} board={board} runMode={view.run_mode || 'guide'} onRunMode={setRunMode}
            placeholder={agentRunning ? 'Tunggu Director selesai…' : 'Ngobrol, @sebut shot/aset, lampirkan gambar atau video…'} />
          <div className="flex items-center justify-between px-1 text-[10px] text-white/30">
            <span title={`Biaya model AI: $${Number(view.llm_cost_usd || 0).toFixed(3)}`}>
              Kredit project ini: chat AI {fmtCredits(view.llm_credits || 0)} · generate {fmtCredits(view.generation_credits || 0)}
            </span>
            {/* Required by AGPL-3.0 §13: the Director service is built on OpenMontage. */}
            <a href={`${API}/source`} className="hover:text-white/60" title="AI Director dibangun di atas OpenMontage (AGPL-3.0)">Kode sumber (AGPL-3.0)</a>
          </div>
        </div>
      </section>

      <div role="separator" aria-orientation="vertical" aria-label="Ubah lebar chat" title="Seret untuk mengubah lebar chat"
        onPointerDown={chatWidth.startDrag} onDoubleClick={chatWidth.reset}
        className="hidden w-1.5 flex-none cursor-col-resize border-l border-white/[0.06] transition-colors hover:bg-[#d4ff64]/30 md:block" />

      {/* Workspace */}
      <section className={`${mobilePane === 'board' ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 flex-col md:flex`}>
        {actionError && <p className="px-4 pt-2 text-[12px] text-red-300">{actionError}</p>}
        <div className="min-h-0 flex-1">
          <Workspace board={board} workspaceId={workspaceId} onEdit={onEdit} onRequest={onRequest} onChooseConcept={chooseConcept} onConfirmScript={confirmScript} busy={actionBusy || agentRunning}
            panel={panel} onOpenPanel={setPanel} onClosePanel={() => setPanel(null)} loadVersions={loadVersions} onRestore={onRestore}
            onRender={startRender} rendering={renderRunning} onChooseAudio={chooseAudio} prices={view.video_credits_per_second} />
        </div>
      </section>
      {confirm && (
        <ConfirmDialog title={confirm.title} body={confirm.body} busy={confirming}
          onConfirm={runConfirm} onCancel={() => { if (!confirming) setConfirm(null); }} />
      )}
    </div>
  );
}

export default function DirectorApp({ initialBrief = '' }) {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [ready, setReady] = useState(false);
  const [serviceError, setServiceError] = useState('');

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
      else if (!initialBrief && list?.length) setProjectId(list[0].project_id);
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [loadProjects, initialBrief]);

  const selectProject = useCallback((id) => {
    setProjectId(id);
    writeProjectToUrl(id);
  }, []);

  const newProject = useCallback(() => {
    setProjectId(null);
    writeProjectToUrl(null);
  }, []);

  const created = useCallback(async (id) => {
    await loadProjects();
    selectProject(id);
  }, [loadProjects, selectProject]);

  if (!ready) {
    return <div className="flex h-full items-center justify-center gap-2 bg-[#07090e] text-sm text-white/40"><Spinner /> Memuat AI Director…</div>;
  }
  if (serviceError && !projects.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#07090e] px-6 text-center">
        <p className="text-sm text-white/70">AI Director belum bisa dihubungi.</p>
        <p className="text-[12px] text-white/40">{serviceError}</p>
        <button type="button" onClick={() => loadProjects()} className="rounded-lg border border-white/15 px-3 py-1.5 text-[12px] text-white/80">Coba lagi</button>
      </div>
    );
  }

  return (
    <div className="director-ui h-full min-h-0 bg-[#07090e] text-white">
      {projectId ? (
        <ProjectWorkspace
          key={projectId}
          projectId={projectId}
          projects={projects}
          onSelectProject={selectProject}
          onNewProject={newProject}
          onProjectsChanged={loadProjects}
        />
      ) : (
        <div className="relative h-full">
          {projects.length > 0 && (
            <div className="absolute left-3 top-3 z-10 w-[260px]">
              <ProjectSwitcher projects={projects} currentId={null} onSelect={selectProject} onNew={newProject} />
            </div>
          )}
          <NewProject initialBrief={initialBrief} onCreated={created} />
        </div>
      )}
    </div>
  );
}
