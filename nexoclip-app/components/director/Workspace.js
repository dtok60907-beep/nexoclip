'use client';

// The Director's workspace: Shot / Scene / Timeline modes over the project board,
// replaced by an artifact panel (script, brief, assets, ...) when one is opened.

import { useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AssetsView, AudioView, Badge, BriefView, ConceptsView, HistoryView, LockButton, ResearchView, ScriptView,
  assetUrl, inputClass, mediaStatus, SmallButton, Field,
} from './BoardViews.js';
import ShotPanel from './ShotPanel.js';

export const PANELS = {
  script: { title: 'Naskah', View: ScriptView },
  brief: { title: 'Brief', View: BriefView },
  assets: { title: 'Aset cerita', View: AssetsView },
  concepts: { title: 'Konsep', View: ConceptsView },
  research: { title: 'Riset', View: ResearchView },
  audio: { title: 'Audio: voiceover & musik', View: AudioView },
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

// Full screen for a preview box (the box itself, so its own controls and playback keep working).
function FullscreenButton({ target }) {
  return (
    <button type="button" title="Layar penuh" aria-label="Layar penuh"
      onClick={() => { const node = target.current; if (document.fullscreenElement) document.exitFullscreen?.(); else node?.requestFullscreen?.(); }}
      className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-md bg-black/60 text-white/80 hover:bg-black/80 hover:text-white">
      <Icon d="M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5" />
    </button>
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

// Extend (a continuation shot made from this clip) and edit (change something in this clip). Both use
// Seedance 2.5 on the existing video and cost credits; the estimate appears in the chat to approve.
function ClipActions({ board, shot, video, onEdit, onRequest, onSelect, busy }) {
  const [open, setOpen] = useState(null); // 'extend' | 'edit' | 'add' | null
  const [text, setText] = useState('');
  const [seconds, setSeconds] = useState(5);
  useEffect(() => { setOpen(null); setText(''); }, [shot.id]);
  const hasClip = !!video?.asset_id && video?.status === 'succeeded';
  const submit = async () => {
    if (open === 'add') {
      if (!text.trim()) return;
      const before = new Set(board.shots.map((s) => s.id));
      const res = await onEdit('add_shot', { after: shot.id, description: text.trim(), duration_seconds: seconds, element_ids: shot.element_ids });
      if (res) {
        setOpen(null); setText('');
        let n = board.shots.length + 1;
        while (before.has(`shot_${n}`)) n += 1;
        onSelect(`shot_${n}`);
      }
    } else if (open === 'extend') {
      const base = shot.id.slice(0, 34);
      let n = 2;
      while (board.shots.some((s) => s.id === `${base}_ext${n}`)) n += 1;
      if (await onEdit('extend_shot', { id: shot.id, video_prompt: text.trim(), duration_seconds: seconds })) {
        setOpen(null); setText('');
        onSelect(`${base}_ext${n}`);
      }
    } else if (text.trim() && await onEdit('update_shot', { id: shot.id, edit_instruction: text.trim() })) {
      setOpen(null); setText('');
      await onRequest([`edit:${shot.id}`], true);
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <SmallButton disabled={busy} onClick={() => setOpen(open === 'extend' ? null : 'extend')}
          title="Tambah shot lanjutan setelah shot ini; videonya menyambung mulus dari klip ini">Perpanjang</SmallButton>
        <SmallButton disabled={busy || !hasClip} onClick={() => { setOpen(open === 'edit' ? null : 'edit'); setText(shot.edit_instruction || ''); }}
          title={hasClip ? 'Ubah sebagian isi video ini tanpa membuat ulang dari awal' : 'Generate videonya dulu'}>Edit video</SmallButton>
        <SmallButton disabled={busy} onClick={() => { setOpen(open === 'add' ? null : 'add'); setText(''); }}
          title="Tambah shot baru setelah shot ini">+ Shot baru</SmallButton>
      </div>
      {open && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] p-2">
          <input autoFocus className="min-w-[220px] flex-1 rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-[12px] text-white outline-none focus:border-white/30"
            placeholder={open === 'extend' ? 'Lanjutannya ngapain? (kosong = lanjutkan gerakan yang sama)'
              : open === 'add' ? 'Shot barunya apa? mis. "close up gelas es teh di meja"' : 'Mau diubah apa? mis. "bajunya jadi merah"'}
            value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
          {open !== 'edit' && (
            <select value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}
              className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-[12px] text-white">
              {[4, 5, 6, 8, 10, 12, 15].map((n) => <option key={n} value={n}>{n} dtk</option>)}
            </select>
          )}
          <SmallButton tone="accent" disabled={busy || (open !== 'extend' && !text.trim())} onClick={submit}>
            {open === 'extend' ? 'Tambah shot lanjutan' : open === 'add' ? 'Tambah shot' : 'Hitung biaya edit'}
          </SmallButton>
          <span className="w-full text-[10px] text-white/35">
            {open === 'extend' ? 'Shot baru muncul setelah shot ini. Generate videonya setelah klip ini jadi (pakai kredit).'
              : open === 'add' ? 'Prompt frame dan video diisi dari deskripsi ini; rapikan lewat Edit atau minta Director.'
              : 'Hasil edit jadi take baru; take lama tetap bisa dipilih.'}
          </span>
        </div>
      )}
    </div>
  );
}

// Cut the start / end of a finished clip in the final video only (free, the clip is not regenerated).
function TrimControl({ shot, video, onEdit, busy }) {
  const [start, setStart] = useState(shot.trim_start || 0);
  const [end, setEnd] = useState(shot.trim_end || 0);
  useEffect(() => { setStart(shot.trim_start || 0); setEnd(shot.trim_end || 0); }, [shot.id, shot.trim_start, shot.trim_end]);
  if (!(video?.asset_id && video?.status === 'succeeded')) return null;
  const dirty = Number(start) !== (shot.trim_start || 0) || Number(end) !== (shot.trim_end || 0);
  const box = 'w-16 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[12px] text-white outline-none focus:border-white/30';
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/45">
      <span>Trim</span>
      <label className="flex items-center gap-1">awal <input type="number" min={0} step={0.5} className={box} value={start} onChange={(e) => setStart(e.target.value)} /> dtk</label>
      <label className="flex items-center gap-1">akhir <input type="number" min={0} step={0.5} className={box} value={end} onChange={(e) => setEnd(e.target.value)} /> dtk</label>
      {dirty && <SmallButton tone="accent" disabled={busy} onClick={() => onEdit('update_shot', { id: shot.id, trim_start: Number(start) || 0, trim_end: Number(end) || 0 })}>Simpan trim</SmallButton>}
      <span className="text-[10px] text-white/30">Hanya memotong di video final, gratis.</span>
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
      <p className="text-[10px] text-white/35">Sebut aset dengan @id, mis. {board.elements.slice(0, 2).map((e) => `@${e.id}`).join(' ') || '@maya'}: otomatis jadi gambar referensinya.</p>
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

function ShotMode({ board, numbered, groups, selected, onSelect, workspaceId, onEdit, onRequest, busy, onOpenAssets, tab, onTab }) {
  const [editing, setEditing] = useState(false);
  const previewBox = useRef(null);
  useEffect(() => { setEditing(false); }, [selected?.shot.id]);
  if (!selected) {
    return <div className="flex h-full items-center justify-center text-[12px] text-white/35">Belum ada shot. Minta Director menyusun shot list.</div>;
  }
  const { shot, label } = selected;
  const continuation = !board.media[`frame:${shot.id}`] && shot.extends ? board.shots.find((s) => s.id === shot.extends) : null;
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
        <div ref={previewBox} className="relative flex min-h-[220px] flex-1 items-center justify-center overflow-hidden rounded-xl border border-white/[0.06] bg-black/60 [&:fullscreen_img]:h-full [&:fullscreen_img]:w-full [&:fullscreen_img]:object-contain [&:fullscreen_video]:h-full [&:fullscreen_video]:w-full">
          <ShotPreview board={board} shot={shot} workspaceId={workspaceId} />
          <FullscreenButton target={previewBox} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!continuation && (
            <SmallButton disabled={busy} onClick={() => onRequest([`frame:${shot.id}`], !!frame?.asset_id && !frame?.stale)}>
              {frame?.asset_id ? 'Generate ulang frame' : 'Generate frame'}
            </SmallButton>
          )}
          <SmallButton tone="accent" disabled={busy} onClick={() => onRequest([`video:${shot.id}`], !!video?.asset_id && !video?.stale)}>
            {video?.asset_id ? 'Generate ulang video' : 'Generate video'}
          </SmallButton>
          <span className="text-[10px] text-white/35">{continuation ? `Lanjutan dari ${continuation.title}` : `Frame: ${mediaStatus(frame).label}`} · Video: {mediaStatus(video).label}</span>
        </div>
        <TrimControl shot={shot} video={video} onEdit={onEdit} busy={busy} />
        <ClipActions board={board} shot={shot} video={video} onEdit={onEdit} onRequest={onRequest} onSelect={onSelect} busy={busy} />
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
              {shot.vo_text && (
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2 text-[11px]">
                  <p className="text-white/70"><span className="text-white/35">VO (mulai {shot.vo_offset ?? 0.3} dtk): </span>{shot.vo_text}</p>
                  {board.media[`vo:${shot.id}`]?.asset_id && (
                    <audio src={assetUrl(board.media[`vo:${shot.id}`].asset_id, workspaceId)} controls className="mt-1.5 h-8 w-full" />
                  )}
                </div>
              )}
              {frame?.error && <p className="text-[11px] text-red-300/80">Frame: {frame.error}</p>}
              {video?.error && <p className="text-[11px] text-red-300/80">Video: {video.error}</p>}
            </div>
          )}
        </div>
        <ShotPanel board={board} shot={shot} label={label} workspaceId={workspaceId} onEdit={onEdit} onRequest={onRequest}
          onSelect={onSelect} busy={busy} tab={tab} onTab={onTab} />
        <CharactersAndWorld board={board} workspaceId={workspaceId} onOpenAssets={onOpenAssets} highlight={shot.element_ids} />
        <p className="text-[10px] text-white/25">{numbered.length} shot · {numbered.reduce((t, n) => t + n.shot.duration_seconds, 0)} detik</p>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------- scene mode

function SceneHeader({ group, busy, onEdit }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(group.scene.title || '');
  useEffect(() => { if (!editing) setTitle(group.scene.title || ''); }, [group.scene.title, editing]);
  const real = !!group.scene.id; // shots without a scene come as one unnamed group
  const save = async () => {
    if (title.trim() && title.trim() !== group.scene.title && !(await onEdit('update_scene', { id: group.scene.id, title: title.trim() }))) return;
    setEditing(false);
  };
  return (
    <div className="mb-2 flex items-center gap-2 text-[12px]">
      <span className="flex-none font-semibold text-white">SCENE {group.number}</span>
      <span className="text-white/20">|</span>
      {editing ? (
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={save}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          className="min-w-0 flex-1 rounded border border-white/15 bg-black/30 px-1.5 py-0.5 text-[12px] text-white outline-none" />
      ) : (
        <button type="button" disabled={!real || busy} onClick={() => setEditing(true)} title={real ? 'Klik untuk ganti nama' : undefined}
          className="min-w-0 truncate text-left text-white/70 hover:text-white disabled:hover:text-white/70">
          {group.scene.title}{group.scene.description && <span className="text-white/40"> — {group.scene.description}</span>}
        </button>
      )}
      {real && !editing && (
        <button type="button" disabled={busy} title="Hapus scene (shot-nya pindah ke scene sebelumnya)"
          onClick={() => { if (window.confirm(`Hapus scene "${group.scene.title}"? Shot di dalamnya pindah ke scene sebelumnya.`)) onEdit('remove_scene', { id: group.scene.id }); }}
          className="ml-auto flex-none rounded px-1.5 text-[11px] text-white/30 hover:bg-white/[0.06] hover:text-red-300">✕</button>
      )}
    </div>
  );
}

function SceneShotCard({ board, item, workspaceId, ratio, picked, onToggle, onPick, wide }) {
  const { shot, label } = item;
  return (
    <div className={`group relative ${wide ? 'w-full' : 'w-[220px] flex-none'} overflow-hidden rounded-lg border text-left ${picked ? 'border-[#d4ff64]/70 ring-1 ring-[#d4ff64]/40' : 'border-white/[0.06] hover:border-white/20'}`}>
      <button type="button" onClick={() => onPick(shot.id)} className="block w-full text-left">
        <Thumb board={board} shot={shot} workspaceId={workspaceId} className={ratio === 'aspect-[9/16]' ? 'h-[200px] w-full' : `${ratio} w-full`} />
        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <span className="truncate text-[11px] text-white/80"><span className="mr-1 font-semibold">SHOT {label}</span>{shot.title}</span>
          <span className="flex-none text-[10px] text-white/35">{shot.duration_seconds}s</span>
        </div>
      </button>
      <label title="Pilih shot ini" onClick={(e) => e.stopPropagation()}
        className={`absolute left-1.5 top-1.5 grid h-5 w-5 cursor-pointer place-items-center rounded border bg-black/60 ${picked ? 'border-[#d4ff64] opacity-100' : 'border-white/40 opacity-0 group-hover:opacity-100'}`}>
        <input type="checkbox" checked={picked} onChange={() => onToggle(shot.id)} className="sr-only" />
        {picked && <span className="text-[11px] leading-none text-[#d4ff64]">✓</span>}
      </label>
    </div>
  );
}

function SceneMode({ board, groups, numbered, workspaceId, onPick, onOpenAssets, onEdit, onRequest, busy }) {
  const [layout, setLayout] = useState('scene'); // 'scene' | 'grid'
  const [picked, setPicked] = useState([]);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const ids = new Set(board.shots.map((s) => s.id));
  const chosen = picked.filter((id) => ids.has(id));
  const toggle = (id) => setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  const ratio = RATIO_CLASS[board.brief.aspect_ratio] || 'aspect-video';
  const addScene = async () => {
    if (title.trim() && await onEdit('add_scene', { title: title.trim() })) { setTitle(''); setAdding(false); }
  };
  const generate = () => onRequest(chosen.map((id) => `video:${id}`).filter((key) => board.media[key] && !board.media[key].uploaded));
  const move = async (sceneId) => { if (sceneId && await onEdit('batch_shots', { ids: chosen, action: 'move_scene', scene_id: sceneId })) setPicked([]); };
  const remove = async () => {
    if (!window.confirm(`Hapus ${chosen.length} shot? Bisa dikembalikan dari Riwayat versi.`)) return;
    if (await onEdit('batch_shots', { ids: chosen, action: 'remove' })) setPicked([]);
  };
  const empty = !board.shots.length && !board.scenes?.length;
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5">
            {[['scene', 'Per scene'], ['grid', 'Grid']].map(([id, label]) => (
              <button key={id} type="button" onClick={() => setLayout(id)}
                className={`rounded-md px-2.5 py-0.5 text-[11px] ${layout === id ? 'bg-white/[0.1] text-white' : 'text-white/50 hover:text-white'}`}>{label}</button>
            ))}
          </div>
          {adding ? (
            <span className="flex items-center gap-1.5">
              <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nama scene baru"
                onKeyDown={(e) => { if (e.key === 'Enter') addScene(); if (e.key === 'Escape') setAdding(false); }}
                className="w-44 rounded-md border border-white/15 bg-black/30 px-2 py-1 text-[11px] text-white outline-none" />
              <SmallButton tone="accent" disabled={busy || !title.trim()} onClick={addScene}>Tambah</SmallButton>
              <SmallButton onClick={() => setAdding(false)}>Batal</SmallButton>
            </span>
          ) : (
            <SmallButton disabled={busy} onClick={() => setAdding(true)}>+ Scene</SmallButton>
          )}
          {chosen.length > 0 && (
            <div className="ml-auto flex flex-wrap items-center gap-1.5 rounded-lg border border-[#d4ff64]/25 bg-[#d4ff64]/[0.05] px-2 py-1">
              <span className="text-[11px] text-[#e4f5bd]">{chosen.length} shot dipilih</span>
              <SmallButton tone="accent" disabled={busy} onClick={generate}>Generate video</SmallButton>
              {board.scenes?.length > 0 && (
                <select disabled={busy} value="" onChange={(e) => move(e.target.value)}
                  className="rounded-md border border-white/10 bg-[#0b0e13] px-1.5 py-1 text-[11px] text-white/80">
                  <option value="">Pindah ke scene…</option>
                  {board.scenes.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
              )}
              <SmallButton disabled={busy} onClick={remove}>Hapus</SmallButton>
              <button type="button" onClick={() => setPicked([])} className="px-1 text-[11px] text-white/40 hover:text-white">Batal pilih</button>
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {empty ? (
            <div className="flex h-full items-center justify-center text-[12px] text-white/35">Belum ada scene atau shot.</div>
          ) : layout === 'grid' ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
              {numbered.map((item) => (
                <SceneShotCard key={item.shot.id} board={board} item={item} workspaceId={workspaceId} ratio={ratio} wide
                  picked={chosen.includes(item.shot.id)} onToggle={toggle} onPick={onPick} />
              ))}
            </div>
          ) : groups.map((group) => (
            <section key={group.scene.id ?? 'all'} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
              <SceneHeader group={group} busy={busy} onEdit={onEdit} />
              <div className="flex gap-2 overflow-x-auto pb-1">
                {group.shots.map((item) => (
                  <SceneShotCard key={item.shot.id} board={board} item={item} workspaceId={workspaceId} ratio={ratio}
                    picked={chosen.includes(item.shot.id)} onToggle={toggle} onPick={onPick} />
                ))}
                {!group.shots.length && <span className="py-6 text-[11px] text-white/25">Belum ada shot di scene ini.</span>}
              </div>
            </section>
          ))}
        </div>
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

// The extra tracks under the clips on the timeline, like OpenArt's: voiceover lines, the music bed and captions.
function Lane({ label, color, children, empty, onAdd }) {
  return (
    <div className="relative h-7 rounded bg-white/[0.025]">
      <span className={`sticky left-0 z-10 inline-flex h-full w-[52px] items-center rounded-l bg-[#101318] px-1.5 text-[9px] font-semibold uppercase tracking-wide ${color}`}>{label}</span>
      {children}
      {empty && (
        <button type="button" onClick={onAdd} className="absolute left-16 top-1 rounded px-1.5 py-0.5 text-[10px] text-white/35 hover:bg-white/[0.06] hover:text-white/70">+ Tambah</button>
      )}
    </div>
  );
}

const LANE_LABEL = 52; // px of the sticky lane label; text of a block starting under it is pushed past it

function LaneBlock({ left, width, tone, title, onClick, children }) {
  return (
    <button type="button" onClick={onClick} title={title} style={{ left, width: Math.max(18, width), paddingLeft: Math.max(6, LANE_LABEL - left + 6) }}
      className={`absolute top-1 bottom-1 overflow-hidden rounded pr-1 text-left text-[9.5px] leading-[18px] text-white/90 ${tone}`}>
      <span className="block truncate">{children}</span>
    </button>
  );
}

function TimelineMode({ board, numbered, workspaceId, selectedId, onSelect, onRender, rendering, onEdit, onRequest, busy, tab, onTab }) {
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
  const playerBox = useRef(null);
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

  // Preview with the separate audio: the music bed follows the playhead, the shot's voiceover line starts at
  // its offset, and the clip and music step back under a voice (as in the render).
  const musicRef = useRef(null);
  const voRef = useRef(null);
  const musicSrc = assetUrl(board.media['audio:music']?.asset_id, workspaceId);
  const voSrc = current?.shot.vo_text ? assetUrl(board.media[`vo:${current.shot.id}`]?.asset_id, workspaceId) : null;
  const voiced = numbered.some((n) => n.shot.vo_text && board.media[`vo:${n.shot.id}`]?.asset_id);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = voiced ? 0.45 : 1;
    if (playing) video.play().catch(() => {}); else video.pause();
  }, [playing, index, currentVideo, voiced]);
  useEffect(() => {
    const music = musicRef.current;
    if (!music) return;
    music.volume = voiced ? 0.3 : 0.7;
    if (!playing) { music.pause(); return; }
    const at = (starts[index] || 0) + offset;
    if (Math.abs(music.currentTime - at) > 0.4) music.currentTime = at;
    music.play().catch(() => {});
  }, [playing, index, musicSrc]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const vo = voRef.current;
    if (!vo) return undefined;
    if (!playing || !voSrc) { vo.pause(); return undefined; }
    const wait = (current.shot.vo_offset ?? 0.3) - offset;
    if (wait <= 0) { vo.currentTime = -wait; vo.play().catch(() => {}); return undefined; }
    vo.currentTime = 0;
    const timer = setTimeout(() => vo.play().catch(() => {}), wait * 1000);
    return () => clearTimeout(timer);
  }, [playing, index, voSrc]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <div ref={playerBox} className="relative flex min-h-[220px] min-w-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-white/[0.06] bg-black [&:fullscreen_img]:h-full [&:fullscreen_img]:w-full [&:fullscreen_img]:object-contain [&:fullscreen_video]:h-full [&:fullscreen_video]:w-full">
          <FullscreenButton target={playerBox} />
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
        {current && <aside className="w-full flex-none overflow-y-auto lg:w-[290px]">
          <ShotPanel board={board} shot={current.shot} label={current.label} workspaceId={workspaceId} onEdit={onEdit} onRequest={onRequest}
            onSelect={onSelect} busy={busy} tab={tab} onTab={onTab} />
          <p className="mt-2 px-1 text-[10px] text-white/30">Mulai {fmtTime(starts[index])} · {current.shot.duration_seconds} detik</p>
        </aside>}
        {musicSrc && <audio ref={musicRef} src={musicSrc} preload="auto" className="hidden" />}
        {voSrc && <audio ref={voRef} key={voSrc} src={voSrc} preload="auto" className="hidden" />}
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
        <div className="mb-1 flex flex-wrap items-center gap-2">
          {!showFinal && current && (
            <div className="mr-2 flex flex-wrap gap-1">
              {[['add', '+ Shot'], ['music', '+ Musik'], ['voiceover', '+ Voiceover'], ['caption', '+ Caption']].map(([id, label]) => (
                <button key={id} type="button" disabled={busy} onClick={() => onTab(id)}
                  title={id === 'add' ? `Shot baru setelah shot ${current.label}` : id === 'music' ? 'Musik latar untuk seluruh video' : `Untuk shot ${current.label}`}
                  className="rounded-md border border-white/[0.1] px-2 py-0.5 text-[10.5px] text-white/75 hover:border-white/30 hover:text-white disabled:opacity-40">{label}</button>
              ))}
            </div>
          )}
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
            {!showFinal && (
              <div className="mt-1 space-y-1">
                <Lane label="VO" color="text-violet-200" empty={!numbered.some((n) => n.shot.vo_text)} onAdd={() => onTab('voiceover')}>
                  {numbered.map((n, i) => {
                    if (!n.shot.vo_text) return null;
                    const media = board.media[`vo:${n.shot.id}`];
                    const ready = media?.status === 'succeeded';
                    return (
                      <LaneBlock key={n.shot.id} left={(starts[i] + (n.shot.vo_offset ?? 0.3)) * zoom}
                        width={Math.max(0.8, n.shot.vo_text.length / 13) * zoom}
                        tone={ready ? 'bg-violet-500/60 hover:bg-violet-500/80' : 'border border-dashed border-violet-300/50 bg-violet-500/15 hover:bg-violet-500/30'}
                        title={`VO shot ${n.label}${ready ? '' : ' (belum di-generate)'}: ${n.shot.vo_text}`}
                        onClick={() => { seek(i); onTab('voiceover'); }}>{n.shot.vo_text}</LaneBlock>
                    );
                  })}
                </Lane>
                <Lane label="Musik" color="text-sky-200" empty={!board.audio?.music?.prompt} onAdd={() => onTab('music')}>
                  {board.audio?.music?.prompt && (
                    <LaneBlock left={0} width={Math.min(total, board.audio.music.duration_seconds || total) * zoom}
                      tone={board.media['audio:music']?.status === 'succeeded' ? 'bg-sky-500/50 hover:bg-sky-500/70' : 'border border-dashed border-sky-300/50 bg-sky-500/15 hover:bg-sky-500/30'}
                      title={`Musik: ${board.audio.music.prompt}`} onClick={() => onTab('music')}>♪ {board.audio.music.prompt}</LaneBlock>
                  )}
                </Lane>
                <Lane label="Caption" color="text-amber-200" empty={!numbered.some((n) => n.shot.caption)} onAdd={() => onTab('caption')}>
                  {numbered.map((n, i) => n.shot.caption ? (
                    <LaneBlock key={n.shot.id} left={starts[i] * zoom + 2} width={n.shot.duration_seconds * zoom - 4}
                      tone="bg-amber-500/45 hover:bg-amber-500/65" title={`Caption shot ${n.label}: ${n.shot.caption}`}
                      onClick={() => { seek(i); onTab('caption'); }}>{n.shot.caption}</LaneBlock>
                  ) : null)}
                </Lane>
              </div>
            )}
            <div className="pointer-events-none absolute bottom-0 top-0 z-30 w-0.5 bg-[#d4ff64] shadow-[0_0_6px_#d4ff64]"
              style={{ left: Math.min(showFinal ? finalTime : now, span) * zoom - 1 }} />
          </div>
        </div>
        <p className="mt-1 text-[10px] text-white/30">{showFinal
          ? 'Isi video final per shot, sesuai durasi aslinya. Klik shot untuk lompat ke bagian itu.'
          : 'Klik shot untuk melihatnya, seret untuk mengubah urutan, ✕ untuk menghapus. Klik blok VO, Musik, atau Caption untuk mengeditnya di panel kanan. Export menggabungkan semuanya jadi MP4.'}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- workspace

export default function Workspace({ board, workspaceId, onEdit, onRequest, onChooseConcept, onConfirmScript, busy, panel, onOpenPanel, onClosePanel, loadVersions, onRestore, onRender, rendering }) {
  const [mode, setMode] = useState('scene');
  const [selectedId, setSelectedId] = useState(null);
  const [shotTab, setShotTab] = useState('media'); // the shot panel's tab, shared by Shot and Timeline
  const { groups, numbered } = useMemo(() => groupShots(board), [board]);
  const selected = numbered.find((n) => n.shot.id === selectedId) || numbered[0] || null;

  const panelDef = panel && PANELS[panel];
  const openAssets = () => onOpenPanel('assets');
  const ready = (key) => board.media[key]?.status === 'succeeded' && board.media[key]?.asset_id;
  const renderable = numbered.some((n) => ready(`video:${n.shot.id}`) || ready(`frame:${n.shot.id}`));
  // Every shot whose video is missing or outdated, in one request: one estimate to approve in the chat
  // (their missing frames are added by the Director).
  const todo = numbered.map((n) => `video:${n.shot.id}`)
    .filter((key) => { const m = board.media[key]; return m?.status !== 'running' && (!m?.asset_id || m.stale); });

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
          <button type="button" disabled={busy}
            onClick={() => {
              const hasVideos = Object.keys(board.media).some((k) => k.startsWith('video:') && board.media[k]?.asset_id);
              if (hasVideos && !window.confirm('Video yang sudah ada akan ditandai perlu dibuat ulang dengan pengaturan audio baru. Lanjut?')) return;
              onEdit('update_brief', { generate_audio: !board.brief.generate_audio });
            }}
            title={board.brief.generate_audio ? 'Video dibuat dengan suara bawaan Seedance (ambience, efek). Klik untuk matikan.' : 'Video dibuat tanpa suara. Klik untuk menyalakan suara bawaan Seedance.'}
            className="rounded-md hover:opacity-80 disabled:opacity-40">
            <Badge tone={board.brief.generate_audio ? 'green' : 'default'}>{board.brief.generate_audio ? 'Audio on' : 'Audio off'}</Badge>
          </button>
          <Badge>{board.brief.aspect_ratio}</Badge>
          <button type="button" onClick={() => onOpenPanel('audio')} title="Voiceover dan musik terpisah (ElevenLabs)" className="rounded-md hover:opacity-80">
            <Badge tone={board.media['audio:voiceover']?.asset_id || board.media['audio:music']?.asset_id ? 'accent' : 'default'}>♪ VO & musik</Badge>
          </button>
          <button type="button" onClick={() => onOpenPanel('history')} title="Riwayat versi" className="rounded-md hover:opacity-80">
            <Badge>v{board.version}</Badge>
          </button>
          {todo.length > 0 && (
            <button type="button" onClick={() => onRequest(todo)} disabled={busy}
              title="Hitung estimasi kredit untuk semua shot yang belum punya video; generate setelah kamu approve di chat"
              className="ml-1 flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#d4ff64] px-3 py-1.5 text-[12px] font-medium text-[#10130a] hover:brightness-110 disabled:opacity-40">
              <Icon d="M5 3l14 9-14 9V3z" /> Generate semua ({todo.length})
            </button>
          )}
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
            workspaceId={workspaceId} onEdit={onEdit} onRequest={onRequest} busy={busy} onOpenAssets={openAssets} tab={shotTab} onTab={setShotTab} />
        ) : mode === 'scene' ? (
          <SceneMode board={board} groups={groups} numbered={numbered} workspaceId={workspaceId} onOpenAssets={openAssets}
            onEdit={onEdit} onRequest={onRequest} busy={busy} onPick={(id) => { setSelectedId(id); setMode('shot'); }} />
        ) : (
          <TimelineMode board={board} numbered={numbered} workspaceId={workspaceId} selectedId={selected?.shot.id} onSelect={setSelectedId}
            onRender={onRender} rendering={rendering || busy} onEdit={onEdit} onRequest={onRequest} busy={busy} tab={shotTab} onTab={setShotTab} />
        )}
      </div>
    </div>
  );
}
