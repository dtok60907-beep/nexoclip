'use client';

// The Director's workspace: Shot / Scene / Timeline modes over the project board,
// replaced by an artifact panel (script, brief, assets, ...) when one is opened.

import { useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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

function Thumb({ board, shot, workspaceId, className = '', strip = false }) {
  const frame = board.media[`frame:${shot.id}`];
  const video = board.media[`video:${shot.id}`];
  const src = assetUrl(frame?.asset_id, workspaceId, true);
  const clip = !src && video?.status === 'succeeded' ? assetUrl(video.asset_id, workspaceId) : null;
  return (
    <div className={`relative overflow-hidden bg-black/50 ${className}`}>
      {src && strip ? (
        // Filmstrip: the whole frame, repeated along the shot at the track's height, so nothing is cut off.
        <div role="img" aria-label={shot.title} className="h-full w-full bg-[#0b0d10]"
          style={{ backgroundImage: `url("${src}")`, backgroundRepeat: 'repeat-x', backgroundSize: 'auto 100%', backgroundPosition: 'left top' }} />
      ) : src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={shot.title} draggable={false} className="pointer-events-none h-full w-full select-none object-cover" loading="lazy" />
      ) : clip && strip ? (
        // No frame: a few stills of the clip itself (same URL, loaded once) fill the strip.
        <div className="flex h-full w-full overflow-hidden bg-[#0b0d10]">
          {[0.5, 2, 4, 6].map((t) => (
            <video key={t} src={`${clip}#t=${t}`} muted playsInline preload="metadata" draggable={false}
              className="pointer-events-none aspect-video h-full flex-none object-cover object-top" />
          ))}
        </div>
      ) : clip ? (
        // No frame: its first moments stand in as the thumbnail.
        <video src={`${clip}#t=0.5`} muted playsInline preload="metadata" draggable={false}
          className="pointer-events-none h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 border border-dashed border-white/15 px-2 text-center leading-tight">
          <span className="line-clamp-2 text-[9px] text-white/45">{shot.title}</span>
          <span className="text-[8.5px] text-white/25">Belum ada gambar</span>
        </div>
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

/** One shot on the timeline track: click to preview, drag to reorder, × to delete. */
function SortableShot({ item, width, active, board, workspaceId, disabled, onSelect, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.shot.id, disabled });
  return (
    <div ref={setNodeRef} style={{ width, transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 20 : undefined }}
      className={`group relative h-full flex-none border-r border-black ${isDragging ? 'opacity-80 shadow-[0_8px_24px_#000a]' : ''}`}>
      <button type="button" onClick={onSelect} title={`Shot ${item.label} · ${item.shot.title} — klik untuk lihat, seret untuk pindah`}
        className={`relative block h-full w-full overflow-hidden ${disabled ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'} ${active ? 'ring-2 ring-inset ring-[#d4ff64]' : ''}`}
        {...attributes} {...listeners}>
        <Thumb board={board} shot={item.shot} workspaceId={workspaceId} className="h-full w-full" strip />
        <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[9px] text-white">{item.label}</span>
      </button>
      {!disabled && (
        <button type="button" onClick={onDelete} aria-label={`Hapus shot ${item.label}`} title="Hapus shot"
          className="absolute right-1 top-1 hidden h-5 w-5 place-items-center rounded-full bg-black/75 text-[11px] text-white/80 hover:bg-red-500 hover:text-white group-hover:grid">
          ✕
        </button>
      )}
    </div>
  );
}

/** The latest finished render, shown as the "Video final" view and track of the timeline. */
function latestRender(board) {
  return [...(board.renders || [])].reverse().find((r) => r.status === 'done' && r.asset_id) || null;
}

function TimelineMode({ board, numbered, workspaceId, selectedId, onSelect, onRender, rendering, onEdit, busy }) {
  const finalRender = latestRender(board);
  const finalSrc = finalRender && assetUrl(finalRender.asset_id, workspaceId);
  const [view, setView] = useState(finalRender ? 'final' : 'shots');
  const finalRef = useRef(null);
  const [finalTime, setFinalTime] = useState(0);
  const showFinal = view === 'final' && !!finalSrc;
  const labelOf = useMemo(() => Object.fromEntries(numbered.map((n) => [n.shot.id, n])), [numbered]);
  const segments = useMemo(() => {
    if (!finalRender) return [];
    if (finalRender.segments?.length) return finalRender.segments;
    let t = 0; // renders made before positions were recorded: planned durations
    return (finalRender.shots || []).map((id) => {
      const d = labelOf[id]?.shot.duration_seconds || 0;
      const seg = { shot_id: id, source: board.media[`video:${id}`]?.status === 'succeeded' ? 'video' : 'frame', start: t, duration: d };
      t += d;
      return seg;
    });
  }, [finalRender, labelOf, board.media]);
  const skippedShots = finalRender ? numbered.filter((n) => !segments.some((sg) => sg.shot_id === n.shot.id)) : [];
  const starts = useMemo(() => {
    let t = 0;
    return numbered.map((n) => { const start = t; t += n.shot.duration_seconds; return start; });
  }, [numbered]);
  const total = numbered.reduce((t, n) => t + n.shot.duration_seconds, 0);
  const [index, setIndex] = useState(() => Math.max(0, numbered.findIndex((n) => n.shot.id === selectedId)));
  const [playing, setPlaying] = useState(false);
  const [offset, setOffset] = useState(0); // seconds into the current shot
  const [zoomLevel, setZoomLevel] = useState(1); // 1 = the whole timeline fits the width
  const trackRef = useRef(null);
  const [trackWidth, setTrackWidth] = useState(0);
  useEffect(() => {
    const node = trackRef.current;
    if (!node) return undefined;
    const observer = new ResizeObserver(([entry]) => setTrackWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, [numbered.length, view]);
  const videoRef = useRef(null);
  const current = numbered[index];
  const currentVideo = current && assetUrl(board.media[`video:${current.shot.id}`]?.asset_id, workspaceId);
  const currentFrame = current && assetUrl(board.media[`frame:${current.shot.id}`]?.asset_id, workspaceId);

  useEffect(() => { if (current) onSelect(current.shot.id); }, [index]); // eslint-disable-line react-hooks/exhaustive-deps
  const shotKey = numbered.map((n) => n.shot.id).join(',');
  useEffect(() => {
    const at = numbered.findIndex((n) => n.shot.id === selectedId);
    if (at >= 0 && at !== index) setIndex(at);
    else if (index >= numbered.length) setIndex(Math.max(0, numbered.length - 1));
  }, [shotKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reordering: shown at once, saved as a board edit (a new version, so it can be undone from history).
  const [dragOrder, setDragOrder] = useState(null);
  useEffect(() => { setDragOrder(null); }, [shotKey]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), // a plain click still selects
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const track = dragOrder ? dragOrder.map((id) => numbered.find((n) => n.shot.id === id)).filter(Boolean) : numbered;
  const onDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const ids = track.map((n) => n.shot.id);
    const to = ids.indexOf(over.id);
    setDragOrder(arrayMove(ids, ids.indexOf(active.id), to));
    if (!(await onEdit('move_shot', { id: active.id, to_index: to }))) setDragOrder(null);
  };
  const deleteShot = (item) => {
    if (!window.confirm(`Hapus shot ${item.label} "${item.shot.title}"? Bisa dikembalikan dari Riwayat versi.`)) return;
    onEdit('remove_shot', { id: item.shot.id });
  };

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

  if (!numbered.length && !finalSrc) return <div className="flex h-full items-center justify-center text-[12px] text-white/35">Timeline kosong. Belum ada shot.</div>;

  const seek = (i) => { setIndex(i); setOffset(0); };
  // A clip can run longer than its shot's planned duration; keep the playhead on that shot.
  const now = (starts[index] || 0) + Math.min(offset, current?.shot.duration_seconds || 0);

  const finalDuration = Number(finalRender?.duration_seconds) || 0;
  const playingSeg = segments.find((sg) => finalTime >= sg.start && finalTime < sg.start + sg.duration) || segments[segments.length - 1];
  const playingShot = playingSeg && labelOf[playingSeg.shot_id];
  const seekFinal = (seg) => {
    const video = finalRef.current;
    if (!video) return;
    video.currentTime = seg.start + 0.01;
    setFinalTime(seg.start);
    video.play().catch(() => {});
  };
  const span = Math.max(showFinal ? finalDuration : total, 1);
  const zoom = trackWidth ? (trackWidth / span) * zoomLevel : 14; // px per second
  const tickStep = [1, 2, 3, 5, 10, 15, 30, 60, 120].find((step) => step * zoom >= 56) || 300;
  const stale = finalRender && finalRender.board_version != null && finalRender.board_version !== board.version;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5">
          {[['shots', 'Urutan shot'], ['final', finalRender ? `Video final · ${fmtTime(finalDuration)}` : 'Video final']].map(([id, label]) => (
            <button key={id} type="button" onClick={() => setView(id)} disabled={id === 'final' && !finalSrc}
              className={`rounded-md px-3 py-1 text-[11.5px] font-medium disabled:opacity-35 ${view === id && (id === 'shots' || finalSrc) ? 'bg-white/[0.1] text-white' : 'text-white/55 hover:text-white'}`}>
              {label}
            </button>
          ))}
        </div>
        {!finalRender && <span className="text-[10.5px] text-white/35">Belum ada video final. Klik Export untuk merender.</span>}
        {stale && view === 'final' && <span className="text-[10.5px] text-amber-200/70">Board sudah berubah sejak render ini. Export lagi untuk versi terbaru.</span>}
      </div>
      {showFinal ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
          <div className="flex min-h-[220px] min-w-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-white/[0.06] bg-black">
            <video ref={finalRef} key={finalSrc} src={finalSrc} controls playsInline preload="metadata" className="max-h-full max-w-full"
              onTimeUpdate={(e) => setFinalTime(e.currentTarget.currentTime)} />
          </div>
          <aside className="w-full flex-none overflow-y-auto rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 lg:w-[290px]">
            {playingShot && (
              <div className="mb-3 border-b border-white/[0.06] pb-3">
                <div className="text-[10px] uppercase tracking-wide text-[#d4ff64]/80">Sedang diputar</div>
                <div className="mt-1 text-[12px] font-semibold text-white/90">Shot {playingShot.label} · {playingShot.shot.title}</div>
                <div className="mt-2 overflow-hidden rounded-md"><Thumb board={board} shot={playingShot.shot} workspaceId={workspaceId} className="aspect-video w-full" /></div>
                <p className="mt-2 line-clamp-3 text-[11px] text-white/50">{playingShot.shot.description}</p>
                <p className="mt-1.5 text-[10px] text-white/35">
                  {fmtTime(playingSeg.start)}–{fmtTime(playingSeg.start + playingSeg.duration)} · {playingSeg.source === 'video' ? 'video' : 'frame diam (belum ada video)'}
                </p>
              </div>
            )}
            <div className="text-[12px] font-semibold text-white/85">Video final</div>
            <dl className="mt-2 space-y-1 text-[11px] text-white/55">
              <div className="flex justify-between"><dt>Durasi</dt><dd className="text-white/80">{fmtTime(finalDuration)}</dd></div>
              <div className="flex justify-between"><dt>Ukuran</dt><dd className="text-white/80">{finalRender.width}×{finalRender.height} · {finalRender.aspect_ratio}</dd></div>
              <div className="flex justify-between"><dt>File</dt><dd className="text-white/80">{((finalRender.size_bytes || 0) / (1024 * 1024)).toFixed(1)} MB</dd></div>
              <div className="flex justify-between"><dt>Shot</dt><dd className="text-white/80">{finalRender.shots?.length || 0}</dd></div>
            </dl>
            {skippedShots.length > 0 && (
              <div className="mt-2">
                <p className="text-[10.5px] text-white/40">Tidak masuk video (belum ada gambar):</p>
                <ul className="mt-1 space-y-0.5">
                  {skippedShots.map((n) => <li key={n.shot.id} className="truncate text-[10.5px] text-white/55">{n.label} · {n.shot.title}</li>)}
                </ul>
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <a href={`${finalSrc}&download=1`} download className="flex-1 rounded-lg bg-[#d4ff64] py-1.5 text-center text-[12px] font-semibold text-[#10130a] hover:brightness-110">Download</a>
              <button type="button" onClick={onRender} disabled={rendering} className="flex-1 rounded-lg border border-white/[0.12] py-1.5 text-[12px] text-white/80 hover:border-white/25 disabled:opacity-40">
                {rendering ? 'Merender…' : 'Render ulang'}
              </button>
            </div>
          </aside>
        </div>
      ) : (
      <>
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <div className="flex min-h-[220px] min-w-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-white/[0.06] bg-black">
          {!current ? <div className="text-[12px] text-white/35">Belum ada shot.</div> : currentVideo ? (
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
        {current && <aside className="w-full flex-none rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 lg:w-[290px]">
          <div className="text-[12px] font-semibold text-white/85">Shot {current.label}</div>
          <div className="mt-2 overflow-hidden rounded-md"><Thumb board={board} shot={current.shot} workspaceId={workspaceId} className="aspect-video w-full" /></div>
          <p className="mt-2 text-[12px] text-white/70">{current.shot.title}</p>
          <p className="mt-1 text-[11px] text-white/45">{current.shot.description}</p>
          <p className="mt-2 text-[10px] text-white/30">Mulai {fmtTime(starts[index])} · {current.shot.duration_seconds} detik</p>
        </aside>}
      </div>
      <div className="flex items-center justify-center gap-4">
        <span className="font-mono text-[12px] text-white/80">{fmtTime(now)}</span>
        <button type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}
          className="grid h-9 w-9 place-items-center rounded-full bg-white text-black">
          {playing ? <Icon d="M8 5v14 M16 5v14" /> : <Icon d="M7 5l12 7-12 7z" />}
        </button>
        <span className="font-mono text-[12px] text-white/40">{fmtTime(total)}</span>
      </div>
      </>
      )}
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-2">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-[10px] text-white/35">Zoom</span>
          <button type="button" onClick={() => setZoomLevel((z) => Math.max(1, z / 1.5))} disabled={zoomLevel <= 1} aria-label="Perkecil"
            className="grid h-5 w-5 place-items-center rounded text-[12px] text-white/60 hover:bg-white/[0.08] disabled:opacity-30">−</button>
          <input type="range" min={1} max={8} step={0.25} value={zoomLevel} onChange={(e) => setZoomLevel(Number(e.target.value))}
            aria-label="Zoom timeline" className="w-28 accent-[#d4ff64]" />
          <button type="button" onClick={() => setZoomLevel((z) => Math.min(8, z * 1.5))} disabled={zoomLevel >= 8} aria-label="Perbesar"
            className="grid h-5 w-5 place-items-center rounded text-[12px] text-white/60 hover:bg-white/[0.08] disabled:opacity-30">+</button>
          {zoomLevel > 1 && (
            <button type="button" onClick={() => setZoomLevel(1)} className="rounded px-1.5 text-[10px] text-white/45 hover:text-white">Pas layar</button>
          )}
        </div>
        <div ref={trackRef} className="relative overflow-x-auto overflow-y-hidden">
          <div className="relative" style={{ width: span * zoom }}>
            <div className="relative h-4 text-[9px] text-white/30">
              {Array.from({ length: Math.floor(span / tickStep) + 1 }, (_, i) => i * tickStep)
                .filter((t) => t * zoom <= span * zoom - 30 || t === 0)
                .map((t) => (
                  <span key={t} className="absolute bottom-0 border-l border-white/20 pl-1 leading-none" style={{ left: t * zoom }}>{fmtTime(t)}</span>
                ))}
            </div>
            {showFinal ? (
              <div className="mt-1 flex h-24">
                {segments.map((sg) => {
                  const n = labelOf[sg.shot_id];
                  const active = sg === playingSeg;
                  return (
                    <button key={sg.shot_id} type="button" onClick={() => seekFinal(sg)} title={`Shot ${n?.label || ''} · ${n?.shot.title || sg.shot_id}`}
                      className={`relative h-full flex-none overflow-hidden border-r border-black ${active ? 'ring-2 ring-inset ring-[#d4ff64]' : ''}`}
                      style={{ width: sg.duration * zoom }}>
                      {n ? <Thumb board={board} shot={n.shot} workspaceId={workspaceId} className="h-full w-full" strip /> : <div className="h-full w-full bg-white/5" />}
                      <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[9px] text-white">{n?.label || '?'}</span>
                      {sg.source === 'frame' && <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[8.5px] text-white/70">frame diam</span>}
                    </button>
                  );
                })}
              </div>
            ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={track.map((n) => n.shot.id)} strategy={horizontalListSortingStrategy}>
                <div className="mt-1 flex h-24">
                  {track.map((n) => (
                    <SortableShot key={n.shot.id} item={n} width={n.shot.duration_seconds * zoom} board={board} workspaceId={workspaceId}
                      active={n.shot.id === current?.shot.id} disabled={busy || !!n.shot.locked}
                      onSelect={() => seek(numbered.findIndex((x) => x.shot.id === n.shot.id))} onDelete={() => deleteShot(n)} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            )}
            <div className="pointer-events-none absolute bottom-0 top-0 z-30 w-0.5 bg-[#d4ff64] shadow-[0_0_6px_#d4ff64]"
              style={{ left: Math.min(showFinal ? finalTime : now, span) * zoom - 1 }} />
          </div>
        </div>
        <p className="mt-1 text-[10px] text-white/30">{showFinal
          ? 'Isi video final per shot, sesuai durasi aslinya. Klik shot untuk lompat ke bagian itu.'
          : 'Klik shot untuk melihatnya, seret ke kiri/kanan untuk mengubah urutan, ✕ untuk menghapus. Klik Export untuk menggabungkan jadi MP4.'}</p>
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
          <TimelineMode board={board} numbered={numbered} workspaceId={workspaceId} selectedId={selected?.shot.id} onSelect={setSelectedId}
            onRender={onRender} rendering={rendering || busy} onEdit={onEdit} busy={busy} />
        )}
      </div>
    </div>
  );
}
