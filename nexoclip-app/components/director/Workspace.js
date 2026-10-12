'use client';

// The Director's workspace: Shot / Scene / Timeline modes over the project board,
// replaced by an artifact panel (script, brief, assets, ...) when one is opened.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AssetsView, Badge, BriefView, ConceptsView, HistoryView, LockButton, ResearchView, ScriptView,
  assetUrl, inputClass, mediaStatus, SmallButton, Field,
} from './BoardViews.js';

export const PANELS = {
  script: { title: 'Naskah', View: ScriptView },
  brief: { title: 'Brief', View: BriefView },
  assets: { title: 'Aset cerita', View: AssetsView },
  concepts: { title: 'Konsep', View: ConceptsView },
  research: { title: 'Riset', View: ResearchView },
  history: { title: 'Riwayat versi', View: HistoryView },
};

const MODES = [
  { id: 'scene', label: 'Scene', icon: 'M3 5h18v4H3z M3 11h18v8H3z M7 5l2 4 M12 5l2 4 M17 5l2 4' },
  { id: 'shot', label: 'Shot', icon: 'M4 6h16v12H4z M9 9l5 3-5 3z' },
  { id: 'timeline', label: 'Timeline', icon: 'M4 5v14 M9 8h11 M9 12h7 M9 16h9' },
];

function Icon({ d, size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.split(' M').map((part, i) => <path key={i} d={i ? `M${part}` : part} />)}
    </svg>
  );
}

const fmtTime = (seconds) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** Shots grouped by scene, in board order, with "1.1"-style numbers. */
export function groupShots(board) {
  const scenes = board.scenes?.length ? board.scenes : [{ id: null, title: 'Scene 1', description: '' }];
  const groups = scenes.map((scene, index) => ({
    scene, number: index + 1,
    shots: board.shots.filter((s) => (board.scenes?.length ? s.scene_id === scene.id : true)),
  }));
  const orphans = board.scenes?.length ? board.shots.filter((s) => !board.scenes.some((sc) => sc.id === s.scene_id)) : [];
  if (orphans.length) groups.push({ scene: { id: '__none', title: 'Tanpa scene', description: '' }, number: groups.length + 1, shots: orphans });
  const numbered = [];
  for (const group of groups) {
    group.shots = group.shots.map((shot, i) => {
      const item = { shot, label: `${group.number}.${i + 1}`, scene: group.scene };
      numbered.push(item);
      return item;
    });
  }
  return { groups, numbered };
}

const RATIO_CLASS = { '16:9': 'aspect-video', '9:16': 'aspect-[9/16]', '1:1': 'aspect-square' };

function Thumb({ board, shot, workspaceId, className = '' }) {
  const frame = board.media[`frame:${shot.id}`];
  const video = board.media[`video:${shot.id}`];
  const src = assetUrl(frame?.asset_id, workspaceId, true);
  return (
    <div className={`relative overflow-hidden bg-black/50 ${className}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={shot.title} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center px-2 text-center text-[9px] leading-tight text-white/25">{shot.title}</div>
      )}
      {video?.asset_id && <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[9px] text-white">▶</span>}
      {(frame?.status === 'running' || video?.status === 'running') && <span className="absolute inset-0 animate-pulse bg-amber-300/10" />}
    </div>
  );
}

function ShotPreview({ board, shot, workspaceId, className = '' }) {
  const frame = board.media[`frame:${shot.id}`];
  const video = board.media[`video:${shot.id}`];
  const videoSrc = assetUrl(video?.asset_id, workspaceId);
  const frameSrc = assetUrl(frame?.asset_id, workspaceId);
  if (videoSrc) return <video key={videoSrc} src={videoSrc} poster={frameSrc || undefined} controls className={`max-h-full max-w-full bg-black ${className}`} />;
  // eslint-disable-next-line @next/next/no-img-element
  if (frameSrc) return <img src={frameSrc} alt={shot.title} className={`max-h-full max-w-full object-contain ${className}`} />;
  const busy = frame?.status === 'running' || video?.status === 'running';
  return (
    <div className={`flex h-full w-full max-w-[720px] flex-col items-center justify-center gap-2 px-6 text-center ${className}`}>
      <span className={`text-[12px] ${busy ? 'animate-pulse text-amber-300/80' : 'text-white/35'}`}>{busy ? 'Sedang dibuat…' : 'Belum ada gambar atau video untuk shot ini.'}</span>
      <p className="line-clamp-4 text-[11px] text-white/25">{shot.frame_prompt}</p>
    </div>
  );
}

// ---------------------------------------------------------------- side: characters & world

function CharactersAndWorld({ board, workspaceId, onOpenAssets, highlight = [] }) {
  const groups = [['character', 'Karakter'], ['location', 'Lokasi'], ['prop', 'Properti']];
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <button type="button" onClick={onOpenAssets} className="mb-2 flex w-full items-center justify-between text-left">
        <span className="text-[12px] font-semibold text-white/85">Characters &amp; World</span>
        <span className="text-[10px] text-[#d4ff64]/70">Lihat semua →</span>
      </button>
      {groups.map(([kind, label]) => {
        const items = board.elements.filter((e) => e.kind === kind);
        return (
          <div key={kind} className="mb-2">
            <div className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-white/35">{label}</div>
            {items.length ? (
              <div className="grid grid-cols-3 gap-1.5">
                {items.map((item) => {
                  const media = board.media[`element:${item.id}`];
                  const src = assetUrl(media?.asset_id, workspaceId, true);
                  return (
                    <button key={item.id} type="button" onClick={onOpenAssets} title={item.name}
                      className={`overflow-hidden rounded-md border ${highlight.includes(item.id) ? 'border-[#d4ff64]/50' : 'border-white/[0.06]'}`}>
                      <div className="aspect-video bg-black/40">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {src ? <img src={src} alt={item.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center px-1 text-[8px] text-white/30">{item.name}</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : <div className="text-[10px] text-white/20">—</div>}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- shot mode

function ShotEditor({ board, shot, onEdit, busy, onDone }) {
  const [draft, setDraft] = useState(shot);
  const save = async () => {
    const ok = await onEdit('update_shot', {
      id: shot.id, title: draft.title, description: draft.description, duration_seconds: Number(draft.duration_seconds),
      frame_prompt: draft.frame_prompt, video_prompt: draft.video_prompt, element_ids: draft.element_ids,
      ...(board.scenes?.length ? { scene_id: draft.scene_id } : {}),
    });
    if (ok) onDone();
  };
  const toggle = (id) => setDraft({ ...draft, element_ids: draft.element_ids.includes(id) ? draft.element_ids.filter((e) => e !== id) : [...draft.element_ids, id] });
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-[1fr_90px] gap-2">
        <Field label="Judul"><input className={inputClass} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
        <Field label="Detik"><input type="number" min={4} max={15} className={inputClass} value={draft.duration_seconds} onChange={(e) => setDraft({ ...draft, duration_seconds: e.target.value })} /></Field>
      </div>
      {board.scenes?.length > 0 && (
        <Field label="Scene">
          <select className={inputClass} value={draft.scene_id || ''} onChange={(e) => setDraft({ ...draft, scene_id: e.target.value })}>
            {board.scenes.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </Field>
      )}
      <Field label="Deskripsi"><textarea rows={2} className={inputClass} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
      <Field label="Prompt frame"><textarea rows={3} className={inputClass} value={draft.frame_prompt} onChange={(e) => setDraft({ ...draft, frame_prompt: e.target.value })} /></Field>
      <Field label="Prompt video"><textarea rows={3} className={inputClass} value={draft.video_prompt} onChange={(e) => setDraft({ ...draft, video_prompt: e.target.value })} /></Field>
      {board.elements.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {board.elements.map((e) => (
            <button key={e.id} type="button" onClick={() => toggle(e.id)}
              className={`rounded-md px-1.5 py-0.5 text-[10px] ${draft.element_ids.includes(e.id) ? 'bg-[#d4ff64]/15 text-[#e4f5bd]' : 'bg-white/[0.04] text-white/40'}`}>
              {e.name}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2"><SmallButton tone="accent" onClick={save} disabled={busy}>Simpan</SmallButton><SmallButton onClick={onDone}>Batal</SmallButton></div>
    </div>
  );
}

function ShotStrip({ board, groups, selectedId, onSelect, workspaceId }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {groups.map((group) => (
        <div key={group.scene.id ?? 'all'} className="flex flex-none items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-1.5" title={group.scene.title}>
          <span className="px-1 text-[10px] font-semibold text-white/45">S{group.number}</span>
          {group.shots.length ? group.shots.map(({ shot, label }) => (
            <button key={shot.id} type="button" onClick={() => onSelect(shot.id)} title={`Shot ${label} · ${shot.title}`}
              className={`overflow-hidden rounded-md border-2 ${selectedId === shot.id ? 'border-[#d4ff64]' : 'border-transparent hover:border-white/20'}`}>
              <Thumb board={board} shot={shot} workspaceId={workspaceId} className="h-[54px] w-[96px]" />
            </button>
          )) : <span className="px-2 text-[10px] text-white/25">kosong</span>}
        </div>
      ))}
    </div>
  );
}

function ShotMode({ board, numbered, groups, selected, onSelect, workspaceId, onEdit, onRequest, busy, onOpenAssets }) {
  const [editing, setEditing] = useState(false);
  useEffect(() => { setEditing(false); }, [selected?.shot.id]);
  if (!selected) {
    return <div className="flex h-full items-center justify-center text-[12px] text-white/35">Belum ada shot. Minta Director menyusun shot list.</div>;
  }
  const { shot, label } = selected;
  const frame = board.media[`frame:${shot.id}`];
  const video = board.media[`video:${shot.id}`];
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <ShotStrip board={board} groups={groups} selectedId={shot.id} onSelect={onSelect} workspaceId={workspaceId} />
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 truncate text-[13px] text-white/85"><span className="mr-2 font-semibold text-white">SHOT {label}</span>{shot.title}</div>
          <div className="flex flex-none items-center gap-1.5">
            <span className="text-[11px] text-white/40">{shot.duration_seconds} dtk</span>
            <SmallButton onClick={() => setEditing((v) => !v)} disabled={busy}>{editing ? 'Tutup edit' : 'Edit'}</SmallButton>
            <LockButton locked={shot.locked} disabled={busy} onToggle={() => onEdit('set_lock', { target: `shot:${shot.id}`, locked: !shot.locked })} />
          </div>
        </div>
        <div className="flex min-h-[220px] flex-1 items-center justify-center overflow-hidden rounded-xl border border-white/[0.06] bg-black/60">
          <ShotPreview board={board} shot={shot} workspaceId={workspaceId} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SmallButton disabled={busy} onClick={() => onRequest([`frame:${shot.id}`], !!frame?.asset_id && !frame?.stale)}>
            {frame?.asset_id ? 'Generate ulang frame' : 'Generate frame'}
          </SmallButton>
          <SmallButton tone="accent" disabled={busy} onClick={() => onRequest([`video:${shot.id}`], !!video?.asset_id && !video?.stale)}>
            {video?.asset_id ? 'Generate ulang video' : 'Generate video'}
          </SmallButton>
          <span className="text-[10px] text-white/35">Frame: {mediaStatus(frame).label} · Video: {mediaStatus(video).label}</span>
        </div>
      </div>
      <aside className="flex w-full flex-none flex-col gap-3 overflow-y-auto lg:w-[290px]">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
          <div className="mb-2 text-[12px] font-semibold text-white/85">Current Shot</div>
          {editing ? (
            <ShotEditor key={shot.id} board={board} shot={shot} onEdit={onEdit} busy={busy} onDone={() => setEditing(false)} />
          ) : (
            <div className="space-y-2 text-[12px]">
              <p className="text-white/75">{shot.description}</p>
              <details className="text-[11px] text-white/45">
                <summary className="cursor-pointer text-white/40 hover:text-white/70">Prompt</summary>
                <p className="mt-1.5"><span className="text-white/30">Frame: </span>{shot.frame_prompt}</p>
                <p className="mt-1.5"><span className="text-white/30">Video: </span>{shot.video_prompt}</p>
              </details>
              {frame?.error && <p className="text-[11px] text-red-300/80">Frame: {frame.error}</p>}
              {video?.error && <p className="text-[11px] text-red-300/80">Video: {video.error}</p>}
            </div>
          )}
        </div>
        <CharactersAndWorld board={board} workspaceId={workspaceId} onOpenAssets={onOpenAssets} highlight={shot.element_ids} />
        <p className="text-[10px] text-white/25">{numbered.length} shot · {numbered.reduce((t, n) => t + n.shot.duration_seconds, 0)} detik</p>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------- scene mode

function SceneMode({ board, groups, workspaceId, onPick, onOpenAssets }) {
  if (!board.shots.length && !board.scenes?.length) return <div className="flex h-full items-center justify-center text-[12px] text-white/35">Belum ada scene atau shot.</div>;
  const ratio = RATIO_CLASS[board.brief.aspect_ratio] || 'aspect-video';
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
      <div className="min-h-0 min-w-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {groups.map((group) => (
          <section key={group.scene.id ?? 'all'} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <div className="mb-2 text-[12px]">
              <span className="font-semibold text-white">SCENE {group.number}</span>
              <span className="mx-2 text-white/20">|</span>
              <span className="text-white/70">{group.scene.title}</span>
              {group.scene.description && <span className="text-white/40"> — {group.scene.description}</span>}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {group.shots.map(({ shot, label }) => (
                <button key={shot.id} type="button" onClick={() => onPick(shot.id)}
                  className="w-[220px] flex-none overflow-hidden rounded-lg border border-white/[0.06] text-left hover:border-white/20">
                  <Thumb board={board} shot={shot} workspaceId={workspaceId} className={ratio === 'aspect-[9/16]' ? 'h-[200px] w-full' : `${ratio} w-full`} />
                  <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                    <span className="truncate text-[11px] text-white/80"><span className="mr-1 font-semibold">SHOT {label}</span>{shot.title}</span>
                    <span className="flex-none text-[10px] text-white/35">{shot.duration_seconds}s</span>
                  </div>
                </button>
              ))}
              {!group.shots.length && <span className="py-6 text-[11px] text-white/25">Belum ada shot di scene ini.</span>}
            </div>
          </section>
        ))}
      </div>
      <aside className="w-full flex-none overflow-y-auto lg:w-[290px]">
        <CharactersAndWorld board={board} workspaceId={workspaceId} onOpenAssets={onOpenAssets} />
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------- timeline mode

function TimelineMode({ board, numbered, workspaceId, selectedId, onSelect }) {
  const starts = useMemo(() => {
    let t = 0;
    return numbered.map((n) => { const start = t; t += n.shot.duration_seconds; return start; });
  }, [numbered]);
  const total = numbered.reduce((t, n) => t + n.shot.duration_seconds, 0);
  const [index, setIndex] = useState(() => Math.max(0, numbered.findIndex((n) => n.shot.id === selectedId)));
  const [playing, setPlaying] = useState(false);
  const [offset, setOffset] = useState(0); // seconds into the current shot
  const [zoom, setZoom] = useState(14); // px per second
  const videoRef = useRef(null);
  const current = numbered[index];
  const currentVideo = current && assetUrl(board.media[`video:${current.shot.id}`]?.asset_id, workspaceId);
  const currentFrame = current && assetUrl(board.media[`frame:${current.shot.id}`]?.asset_id, workspaceId);

  useEffect(() => { if (current) onSelect(current.shot.id); }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  // Shots without a video are shown as their still frame for their duration.
  useEffect(() => {
    if (!playing || !current || currentVideo) return undefined;
    const started = performance.now() - offset * 1000;
    const timer = setInterval(() => {
      const elapsed = (performance.now() - started) / 1000;
      if (elapsed >= current.shot.duration_seconds) {
        clearInterval(timer);
        setOffset(0);
        if (index + 1 < numbered.length) setIndex(index + 1); else setPlaying(false);
      } else {
        setOffset(elapsed);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [playing, index, currentVideo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) video.play().catch(() => {}); else video.pause();
  }, [playing, index, currentVideo]);

  if (!numbered.length) return <div className="flex h-full items-center justify-center text-[12px] text-white/35">Timeline kosong. Belum ada shot.</div>;

  const seek = (i) => { setIndex(i); setOffset(0); };
  const now = (starts[index] || 0) + offset;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <div className="flex min-h-[220px] min-w-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-white/[0.06] bg-black">
          {currentVideo ? (
            <video ref={videoRef} key={currentVideo} src={currentVideo} poster={currentFrame || undefined} className="max-h-full max-w-full"
              onTimeUpdate={(e) => setOffset(e.currentTarget.currentTime)}
              onEnded={() => { setOffset(0); if (index + 1 < numbered.length) setIndex(index + 1); else setPlaying(false); }} />
          ) : currentFrame ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentFrame} alt={current.shot.title} className="max-h-full max-w-full object-contain" />
          ) : (
            <div className="px-6 text-center text-[12px] text-white/35">Shot {current.label} belum punya gambar. <span className="text-white/20">({current.shot.title})</span></div>
          )}
        </div>
        <aside className="w-full flex-none rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 lg:w-[290px]">
          <div className="text-[12px] font-semibold text-white/85">Shot {current.label}</div>
          <div className="mt-2 overflow-hidden rounded-md"><Thumb board={board} shot={current.shot} workspaceId={workspaceId} className="aspect-video w-full" /></div>
          <p className="mt-2 text-[12px] text-white/70">{current.shot.title}</p>
          <p className="mt-1 text-[11px] text-white/45">{current.shot.description}</p>
          <p className="mt-2 text-[10px] text-white/30">Mulai {fmtTime(starts[index])} · {current.shot.duration_seconds} detik</p>
        </aside>
      </div>
      <div className="flex items-center justify-center gap-4">
        <span className="font-mono text-[12px] text-white/80">{fmtTime(now)}</span>
        <button type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}
          className="grid h-9 w-9 place-items-center rounded-full bg-white text-black">
          {playing ? <Icon d="M8 5v14 M16 5v14" /> : <Icon d="M7 5l12 7-12 7z" />}
        </button>
        <span className="font-mono text-[12px] text-white/40">{fmtTime(total)}</span>
      </div>
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-2">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-[10px] text-white/35">Zoom</span>
          <input type="range" min={6} max={40} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-28 accent-[#d4ff64]" />
        </div>
        <div className="relative overflow-x-auto">
          <div className="relative" style={{ width: total * zoom + 20 }}>
            <div className="flex h-4 items-end text-[9px] text-white/30">
              {Array.from({ length: Math.ceil(total / 3) + 1 }, (_, i) => (
                <span key={i} className="absolute" style={{ left: i * 3 * zoom }}>|{fmtTime(i * 3)}</span>
              ))}
            </div>
            <div className="mt-1 flex h-14">
              {numbered.map((n, i) => (
                <button key={n.shot.id} type="button" onClick={() => seek(i)} title={`Shot ${n.label} · ${n.shot.title}`}
                  className={`relative h-full flex-none overflow-hidden border-r border-black ${i === index ? 'ring-2 ring-inset ring-[#d4ff64]' : ''}`}
                  style={{ width: n.shot.duration_seconds * zoom }}>
                  <Thumb board={board} shot={n.shot} workspaceId={workspaceId} className="h-full w-full" />
                  <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[9px] text-white">{n.label}</span>
                </button>
              ))}
            </div>
            <div className="pointer-events-none absolute bottom-0 top-0 w-0.5 bg-[#d4ff64]" style={{ left: now * zoom }} />
          </div>
        </div>
        <p className="mt-1 text-[10px] text-white/30">Preview urutan shot. Klik Export untuk menggabungkannya jadi satu MP4.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- workspace

export default function Workspace({ board, workspaceId, onEdit, onRequest, onChooseConcept, onConfirmScript, busy, panel, onOpenPanel, onClosePanel, loadVersions, onRestore, onRender, rendering }) {
  const [mode, setMode] = useState('scene');
  const [selectedId, setSelectedId] = useState(null);
  const { groups, numbered } = useMemo(() => groupShots(board), [board]);
  const selected = numbered.find((n) => n.shot.id === selectedId) || numbered[0] || null;

  const panelDef = panel && PANELS[panel];
  const openAssets = () => onOpenPanel('assets');
  const ready = (key) => board.media[key]?.status === 'succeeded' && board.media[key]?.asset_id;
  const renderable = numbered.some((n) => ready(`video:${n.shot.id}`) || ready(`frame:${n.shot.id}`));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 overflow-x-auto border-b border-white/[0.06] px-3 py-2.5">
        {MODES.map((m) => (
          <button key={m.id} type="button" onClick={() => { setMode(m.id); onClosePanel(); }}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] font-medium ${
              mode === m.id && !panelDef ? 'bg-[#d4ff64] text-[#10130a]' : 'text-white/60 hover:bg-white/[0.05] hover:text-white'
            }`}>
            <Icon d={m.icon} /> {m.label}
          </button>
        ))}
        {/* Only the three views; brief, script, assets etc. open from their cards in the chat. */}
        <div className="ml-auto flex flex-none items-center gap-1.5">
          <Badge>{board.brief.aspect_ratio}</Badge>
          <button type="button" onClick={() => onOpenPanel('history')} title="Riwayat versi" className="rounded-md hover:opacity-80">
            <Badge>v{board.version}</Badge>
          </button>
          <button type="button" onClick={onRender} disabled={!renderable || rendering || busy}
            title={renderable ? 'Gabungkan semua shot jadi satu MP4 (gratis)' : 'Belum ada shot dengan frame atau video'}
            className="ml-1 flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-white/85 hover:border-white/25 disabled:opacity-40">
            <Icon d="M12 4v11 M7 10l5 5 5-5 M5 20h14" /> {rendering ? 'Merender…' : 'Export'}
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden p-3 md:p-4">
        {panelDef ? (
          <div className="flex h-full min-h-0 flex-col rounded-xl border border-white/[0.07] bg-[#0b0e13]">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
              <div className="text-[13px] font-semibold text-white">{panel === 'script' && board.script?.title ? board.script.title : panelDef.title}</div>
              <button type="button" onClick={onClosePanel} aria-label="Tutup" className="grid h-7 w-7 place-items-center rounded-md text-white/50 hover:bg-white/[0.06] hover:text-white">✕</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
              <div className="mx-auto max-w-[920px]">
                <panelDef.View board={board} onEdit={onEdit} onRequest={onRequest} onChooseConcept={onChooseConcept} onConfirmScript={onConfirmScript} busy={busy} workspaceId={workspaceId}
                  loadVersions={loadVersions} onRestore={onRestore} />
              </div>
            </div>
          </div>
        ) : mode === 'shot' ? (
          <ShotMode board={board} numbered={numbered} groups={groups} selected={selected} onSelect={setSelectedId}
            workspaceId={workspaceId} onEdit={onEdit} onRequest={onRequest} busy={busy} onOpenAssets={openAssets} />
        ) : mode === 'scene' ? (
          <SceneMode board={board} groups={groups} workspaceId={workspaceId} onOpenAssets={openAssets}
            onPick={(id) => { setSelectedId(id); setMode('shot'); }} />
        ) : (
          <TimelineMode board={board} numbered={numbered} workspaceId={workspaceId} selectedId={selected?.shot.id} onSelect={setSelectedId} />
        )}
      </div>
    </div>
  );
}
