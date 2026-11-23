'use client';

// The Director's workspace: Shot / Scene / Timeline modes over the project board,
// replaced by an artifact panel (script, brief, assets, ...) when one is opened.

import { useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Clapperboard,
  Download,
  Film,
  History,
  ListVideo,
  Maximize2,
  Minus,
  Music,
  PanelRightClose,
  Pause,
  Play,
  Plus,
  Scissors,
  SlidersHorizontal,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  AssetsView,
  AudioView,
  Badge,
  BriefView,
  ConceptsView,
  Field,
  HistoryView,
  LockButton,
  RATIOS,
  RESOLUTIONS,
  ResearchView,
  ScriptView,
  SmallButton,
  VIDEO_MODELS,
  assetUrl,
  fmtCredits,
  inputClass,
  mediaStatus,
} from './BoardViews.js';
import ShotPanel, { CaptionTab, MediaTab, MusicTab, VoiceoverTab } from './ShotPanel.js';

export const PANELS = {
  script: { title: 'Script', View: ScriptView },
  brief: { title: 'Brief', View: BriefView },
  assets: { title: 'Story Assets', View: AssetsView },
  concepts: { title: 'Concepts', View: ConceptsView },
  research: { title: 'Research', View: ResearchView },
  audio: { title: 'Audio: Voiceover & Music', View: AudioView },
  history: { title: 'Version History', View: HistoryView },
};

const MODES = [
  { id: 'scene', label: 'Scene', Icon: Clapperboard },
  { id: 'shot', label: 'Shot', Icon: Film },
  { id: 'timeline', label: 'Timeline', Icon: ListVideo },
];

const fmtTime = (seconds) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** Shots grouped by scene, in board order, with "1.1"-style numbers. */
export function groupShots(board) {
  const scenes = board.scenes?.length ? board.scenes : [{ id: null, title: 'Scene 1', description: '' }];
  const groups = scenes.map((scene, index) => ({
    scene,
    number: index + 1,
    shots: board.shots.filter((s) => (board.scenes?.length ? s.scene_id === scene.id : true)),
  }));
  const orphans = board.scenes?.length ? board.shots.filter((s) => !board.scenes.some((sc) => sc.id === s.scene_id)) : [];
  if (orphans.length) groups.push({ scene: { id: '__none', title: 'No scene', description: '' }, number: groups.length + 1, shots: orphans });
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

/**
 * What to generate so these shots get their video. Shots that are all still missing inside a scene video block go as
 * that one scene video (one Seedance generation, the shots' frames as keyframes); the rest go one by one, so a shot
 * that is already fine is never paid for again.
 */
export function videoPlan(board, shotIds) {
  const ids = new Set(shotIds);
  const media = (key) => board.media[key];
  const blocks = (board.scene_blocks || []).filter((b) => b.shots.every((id) => ids.has(id)));
  // running or already waiting in a request: generating again would make it twice
  const busy = (m) => m?.status === 'running' || m?.in_request;
  const running = shotIds.some((id) => busy(media(`video:${id}`))) || blocks.some((b) => busy(media(b.key)));
  const missing = shotIds.filter((id) => media(`video:${id}`) && (!media(`video:${id}`).asset_id || media(`video:${id}`).stale));
  const whole = blocks.filter((b) => b.shots.every((id) => missing.includes(id)));
  const inWhole = new Set(whole.flatMap((b) => b.shots));
  const keys = [...whole.map((b) => b.key), ...missing.filter((id) => !inWhole.has(id)).map((id) => `video:${id}`)];
  // Redoing a finished scene: its scene videos again, plus the shots that are not in one (not the user's uploads).
  const inBlock = new Set(blocks.flatMap((b) => b.shots));
  const redo = [
    ...blocks.map((b) => b.key),
    ...shotIds.filter((id) => !inBlock.has(id) && media(`video:${id}`) && !media(`video:${id}`).uploaded).map((id) => `video:${id}`),
  ];
  return { keys, missing, running, redo };
}

const RATIO_CLASS = {
  '16:9': 'aspect-video',
  '9:16': 'aspect-[9/16]',
  '1:1': 'aspect-square',
  '4:3': 'aspect-[4/3]',
  '3:4': 'aspect-[3/4]',
  '21:9': 'aspect-[21/9]',
};
const PORTRAIT = new Set(['aspect-[9/16]', 'aspect-[3/4]']);

const hasMedia = (board, prefixes) =>
  Object.keys(board.media).some((k) => prefixes.some((p) => k.startsWith(p)) && board.media[k]?.asset_id && !board.media[k]?.uploaded);

/** All project-level technical settings tucked into one calm popover instead of crowding the toolbar. */
function ProjectSettingsPopover({ board, videoModel, prices, busy, onEdit, onOpenHistory }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const updateField = (field, next, warnMessage) => {
    if (next === board.brief[field]) return;
    if (warnMessage && !window.confirm(`${warnMessage} Continue?`)) return;
    onEdit('update_brief', { [field]: next });
  };

  const ratio = board.brief.aspect_ratio || RATIOS[0];
  const resolution = board.brief.resolution || videoModel.resolutions[0];

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Video settings, aspect ratio, resolution, audio, and version history"
        className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-[12px] font-medium transition disabled:opacity-45 ${
          open
            ? 'border-[#DDD7FE] bg-[#F2F0FF] text-[#4C38D6]'
            : 'border-[#E6E7F0] bg-white text-[#3A3B4C] hover:border-[#C7CAD9] hover:bg-[#F7F8FA] hover:text-[#14141F]'
        }`}
      >
        <SlidersHorizontal size={13} strokeWidth={2} aria-hidden="true" />
        <span>
          {ratio} · {resolution}
        </span>
        <ChevronDown
          size={12}
          strokeWidth={2.2}
          aria-hidden="true"
          className={`text-[#8A8B9C] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Board Settings"
          className="dr-popover absolute right-0 top-full z-40 mt-2 w-[300px] space-y-4 rounded-2xl border border-[#E6E7F0] bg-white p-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#14141F]">Production Settings</span>
            <span className="rounded-md bg-[#F3F4F8] px-2 py-0.5 font-mono text-[11px] font-medium text-[#5E5E72]">
              v{board.version}
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-[11.5px] font-medium text-[#5E5E72]">Aspect Ratio</label>
              <div className="grid grid-cols-3 gap-1.5">
                {RATIOS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      updateField(
                        'aspect_ratio',
                        r,
                        hasMedia(board, ['frame:', 'video:', 'scene:'])
                          ? 'Existing shot images and videos will be marked for regeneration with the new aspect ratio.'
                          : ''
                      )
                    }
                    className={`rounded-lg border py-1.5 text-[12px] font-medium transition ${
                      ratio === r
                        ? 'border-[#5B45F2] bg-[#F2F0FF] text-[#4C38D6]'
                        : 'border-[#E8E9F0] bg-[#FAFAFD] text-[#4C4D61] hover:border-[#C7CAD9] hover:bg-white'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="dr-board-model" className="mb-1.5 block text-[11.5px] font-medium text-[#5E5E72]">
                Video Model
              </label>
              <select
                id="dr-board-model"
                value={board.brief.video_model || 'seedance-2.5'}
                disabled={busy}
                onChange={(e) =>
                  updateField(
                    'video_model',
                    e.target.value,
                    hasMedia(board, ['video:', 'scene:'])
                      ? 'Existing videos will be marked for regeneration with the new model.'
                      : ''
                  )
                }
                className={inputClass}
              >
                {Object.keys(VIDEO_MODELS).map((m) => (
                  <option key={m} value={m}>
                    {VIDEO_MODELS[m].label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="dr-board-res" className="mb-1.5 block text-[11.5px] font-medium text-[#5E5E72]">
                Resolution
              </label>
              <select
                id="dr-board-res"
                value={resolution}
                disabled={busy}
                onChange={(e) =>
                  updateField(
                    'resolution',
                    e.target.value,
                    hasMedia(board, ['video:', 'scene:'])
                      ? 'Existing videos will be marked for regeneration with the new resolution.'
                      : ''
                  )
                }
                className={inputClass}
              >
                {videoModel.resolutions.map((r) => (
                  <option key={r} value={r}>
                    {prices[r] ? `${r} · ~${fmtCredits(Math.round(prices[r]))} cr/sec` : r}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-[#EFEFF5] bg-[#FAFAFD] px-3 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-[#14141F]">
                  {board.brief.generate_audio ? (
                    <Volume2 size={13.5} className="text-[#147A49]" aria-hidden="true" />
                  ) : (
                    <VolumeX size={13.5} className="text-[#8A8B9C]" aria-hidden="true" />
                  )}
                  <span>Native clip audio</span>
                </div>
                <p className="mt-0.5 text-[11px] text-[#7A7B90]">Automatic ambience &amp; sound effects.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={!!board.brief.generate_audio}
                disabled={busy}
                onClick={() => {
                  const hasVideos = Object.keys(board.media).some((k) => k.startsWith('video:') && board.media[k]?.asset_id);
                  if (
                    hasVideos &&
                    !window.confirm('Existing videos will be marked for regeneration with the new audio setting. Continue?')
                  ) {
                    return;
                  }
                  onEdit('update_brief', { generate_audio: !board.brief.generate_audio });
                }}
                className={`relative h-6 w-10 flex-none rounded-full transition ${
                  board.brief.generate_audio ? 'bg-[#5B45F2]' : 'bg-[#D6D8E4]'
                }`}
              >
                <span
                  className={`block h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(20,20,31,0.18)] transition-transform ${
                    board.brief.generate_audio ? 'translate-x-[19px]' : 'translate-x-[3px]'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="border-t border-[#F0F0F6] pt-3">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenHistory();
              }}
              className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-[12.5px] font-medium text-[#3A3B4C] transition hover:bg-[#F5F6FA] hover:text-[#14141F]"
            >
              <span className="inline-flex items-center gap-2">
                <History size={14} strokeWidth={2} className="text-[#6E6F82]" aria-hidden="true" />
                <span>Board version history</span>
              </span>
              <span className="font-mono text-[11.5px] text-[#7A7B90]">v{board.version} →</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Thumb({ board, shot, workspaceId, className = '', strip = false }) {
  const frame = board.media[`frame:${shot.id}`];
  const video = board.media[`video:${shot.id}`];
  const src = assetUrl(frame?.asset_id, workspaceId, true);
  const clip = !src && video?.status === 'succeeded' ? assetUrl(video.asset_id, workspaceId) : null;
  return (
    <div className={`relative overflow-hidden bg-[#11141C] ${className}`}>
      {src && strip ? (
        // Filmstrip: the whole frame, repeated along the shot at the track's height, so nothing is cut off.
        <div
          role="img"
          aria-label={shot.title}
          className="h-full w-full bg-[#11141C]"
          style={{
            backgroundImage: `url("${src}")`,
            backgroundRepeat: 'repeat-x',
            backgroundSize: 'auto 100%',
            backgroundPosition: 'left top',
          }}
        />
      ) : src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={shot.title}
          draggable={false}
          className="pointer-events-none h-full w-full select-none object-cover"
          loading="lazy"
        />
      ) : clip && strip ? (
        // No frame: a few stills of the clip itself (same URL, loaded once) fill the strip.
        <div className="flex h-full w-full overflow-hidden bg-[#11141C]">
          {[0.5, 2, 4, 6].map((t) => (
            <video
              key={t}
              src={`${clip}#t=${t}`}
              muted
              playsInline
              preload="metadata"
              draggable={false}
              className="pointer-events-none aspect-video h-full flex-none object-cover object-top"
            />
          ))}
        </div>
      ) : clip ? (
        // No frame: its first moments stand in as the thumbnail.
        <video
          src={`${clip}#t=0.5`}
          muted
          playsInline
          preload="metadata"
          draggable={false}
          className="pointer-events-none h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-3 text-center leading-snug">
          <span className="line-clamp-2 text-[11px] font-medium text-white/75">{shot.title}</span>
          <span className="text-[10px] text-white/40">No image yet</span>
        </div>
      )}
      {video?.asset_id && (
        <span className="absolute bottom-1.5 left-1.5 inline-flex h-5 w-5 items-center justify-center rounded-md bg-black/70 text-white backdrop-blur-sm">
          <Play size={10} fill="currentColor" aria-hidden="true" />
        </span>
      )}
      {(frame?.status === 'running' || video?.status === 'running') && (
        <span className="absolute inset-0 animate-pulse bg-[#5B45F2]/20" />
      )}
    </div>
  );
}

// Full screen for a preview box (the box itself, so its own controls and playback keep working).
function FullscreenButton({ target }) {
  return (
    <button
      type="button"
      title="Fullscreen"
      aria-label="Fullscreen"
      onClick={() => {
        const node = target.current;
        if (document.fullscreenElement) document.exitFullscreen?.();
        else node?.requestFullscreen?.();
      }}
      className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-lg border border-white/15 bg-black/60 text-white/85 backdrop-blur-sm transition hover:bg-black/80 hover:text-white"
    >
      <Maximize2 size={14} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}

function ShotPreview({ board, shot, workspaceId, className = '' }) {
  const frame = board.media[`frame:${shot.id}`];
  const video = board.media[`video:${shot.id}`];
  const videoSrc = assetUrl(video?.asset_id, workspaceId);
  const frameSrc = assetUrl(frame?.asset_id, workspaceId);
  if (videoSrc) {
    return (
      <video
        key={videoSrc}
        src={videoSrc}
        poster={frameSrc || undefined}
        controls
        className={`max-h-full max-w-full bg-black ${className}`}
      />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  if (frameSrc) return <img src={frameSrc} alt={shot.title} className={`max-h-full max-w-full object-contain ${className}`} />;
  const busy = frame?.status === 'running' || video?.status === 'running';
  return (
    <div className={`flex h-full w-full max-w-[640px] flex-col items-center justify-center gap-2.5 px-8 text-center ${className}`}>
      <span className={`text-[13.5px] font-medium ${busy ? 'animate-pulse text-amber-300' : 'text-white/75'}`}>
        {busy ? 'Generating…' : 'No image or video for this shot yet.'}
      </span>
      <p className="line-clamp-4 text-[12.5px] leading-relaxed text-white/45">{shot.frame_prompt}</p>
    </div>
  );
}

// Extend (a continuation shot made from this clip) and edit (change something in this clip). Both use
// Seedance 2.5 on the existing video and cost credits; the estimate appears in the chat to approve.
function ClipActions({ board, shot, video, onEdit, onRequest, onSelect, busy }) {
  const [open, setOpen] = useState(null); // 'extend' | 'edit' | 'add' | null
  const [text, setText] = useState('');
  const [seconds, setSeconds] = useState(5);
  useEffect(() => {
    setOpen(null);
    setText('');
  }, [shot.id]);
  const hasClip = !!video?.asset_id && video?.status === 'succeeded';
  const submit = async () => {
    if (open === 'add') {
      if (!text.trim()) return;
      const before = new Set(board.shots.map((s) => s.id));
      const res = await onEdit('add_shot', { after: shot.id, description: text.trim(), duration_seconds: seconds, element_ids: shot.element_ids });
      if (res) {
        setOpen(null);
        setText('');
        let n = board.shots.length + 1;
        while (before.has(`shot_${n}`)) n += 1;
        onSelect(`shot_${n}`);
      }
    } else if (open === 'extend') {
      const base = shot.id.slice(0, 34);
      let n = 2;
      while (board.shots.some((s) => s.id === `${base}_ext${n}`)) n += 1;
      if (await onEdit('extend_shot', { id: shot.id, video_prompt: text.trim(), duration_seconds: seconds })) {
        setOpen(null);
        setText('');
        onSelect(`${base}_ext${n}`);
      }
    } else if (text.trim() && (await onEdit('update_shot', { id: shot.id, edit_instruction: text.trim() }))) {
      setOpen(null);
      setText('');
      await onRequest([`edit:${shot.id}`], true);
    }
  };
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <SmallButton
          tone={open === 'extend' ? 'soft' : 'default'}
          disabled={busy}
          onClick={() => setOpen(open === 'extend' ? null : 'extend')}
          title="Add a continuation shot after this one; its video continues seamlessly from this clip"
        >
          Extend
        </SmallButton>
        <SmallButton
          tone={open === 'edit' ? 'soft' : 'default'}
          disabled={busy || !hasClip}
          onClick={() => {
            setOpen(open === 'edit' ? null : 'edit');
            setText(shot.edit_instruction || '');
          }}
          title={hasClip ? 'Modify part of this video without regenerating from scratch' : 'Generate the video first'}
        >
          Edit video
        </SmallButton>
        <SmallButton
          tone={open === 'add' ? 'soft' : 'default'}
          disabled={busy}
          onClick={() => {
            setOpen(open === 'add' ? null : 'add');
            setText('');
          }}
          title="Add a new shot after this one"
        >
          + New shot
        </SmallButton>
      </div>
      {open && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#E5E6F0] bg-white p-3 shadow-[0_2px_8px_rgba(20,20,31,0.04)]">
          <input
            autoFocus
            className={`${inputClass} min-w-[220px] flex-1 py-2`}
            placeholder={
              open === 'extend'
                ? 'What happens next? (leave blank to continue the same motion)'
                : open === 'add'
                ? 'What is the new shot? e.g. "close-up of iced tea glass on table"'
                : 'What should change? e.g. "change the shirt to red"'
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />
          {open !== 'edit' && (
            <select
              value={seconds}
              onChange={(e) => setSeconds(Number(e.target.value))}
              className="rounded-xl border border-[#D8DAE6] bg-white px-2.5 py-2 text-[12.5px] font-medium text-[#14141F] outline-none focus:border-[#5B45F2]"
            >
              {[4, 5, 6, 8, 10, 12, 15].map((n) => (
                <option key={n} value={n}>
                  {n} sec
                </option>
              ))}
            </select>
          )}
          <SmallButton tone="accent" disabled={busy || (open !== 'extend' && !text.trim())} onClick={submit}>
            {open === 'extend' ? 'Add continuation shot' : open === 'add' ? 'Add shot' : 'Estimate edit cost'}
          </SmallButton>
          <span className="w-full text-[11.5px] text-[#7A7B90]">
            {open === 'extend'
              ? 'The new shot appears after this one. Generate its video after this clip is ready (uses credits).'
              : open === 'add'
              ? 'Frame and video prompts are filled from this description; refine via Edit or ask the Director.'
              : 'The edited result becomes a new take; older takes can still be selected.'}
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
  useEffect(() => {
    setStart(shot.trim_start || 0);
    setEnd(shot.trim_end || 0);
  }, [shot.id, shot.trim_start, shot.trim_end]);
  if (!(video?.asset_id && video?.status === 'succeeded')) return null;
  const dirty = Number(start) !== (shot.trim_start || 0) || Number(end) !== (shot.trim_end || 0);
  const box =
    'w-16 rounded-lg border border-[#D8DAE6] bg-white px-2 py-1 text-[12.5px] text-[#14141F] outline-none focus:border-[#5B45F2]';
  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-[#ECECF4] bg-white px-3.5 py-2 text-[12px] text-[#4C4D61]">
      <span className="font-semibold text-[#14141F]">Trim</span>
      <label className="flex items-center gap-1.5">
        <span>start</span>
        <input type="number" min={0} step={0.5} className={box} value={start} onChange={(e) => setStart(e.target.value)} />
        <span>sec</span>
      </label>
      <label className="flex items-center gap-1.5">
        <span>end</span>
        <input type="number" min={0} step={0.5} className={box} value={end} onChange={(e) => setEnd(e.target.value)} />
        <span>sec</span>
      </label>
      {dirty && (
        <SmallButton
          tone="accent"
          disabled={busy}
          onClick={() => onEdit('update_shot', { id: shot.id, trim_start: Number(start) || 0, trim_end: Number(end) || 0 })}
        >
          Save trim
        </SmallButton>
      )}
      <span className="text-[11.5px] text-[#7A7B90]">Trims in the final video only, free.</span>
    </div>
  );
}

// ---------------------------------------------------------------- side: characters & world

function CharactersAndWorld({ board, workspaceId, onOpenAssets, highlight = [], embedded = false, compact = false }) {
  const groups = [
    ['character', 'Characters'],
    ['location', 'Locations'],
    ['prop', 'Props'],
  ];

  const body = (
    <div className={compact ? 'grid grid-cols-1 gap-3 sm:grid-cols-3' : 'space-y-3.5'}>
      {groups.map(([kind, label]) => {
        const items = board.elements.filter((e) => e.kind === kind);
        return (
          <div key={kind}>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#7A7B90]">{label}</div>
            {items.length ? (
              <div className="grid grid-cols-3 gap-2">
                {items.map((item) => {
                  const media = board.media[`element:${item.id}`];
                  const src = assetUrl(media?.asset_id, workspaceId, true);
                  const isHighlighted = highlight.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={onOpenAssets}
                      title={item.name}
                      className={`overflow-hidden rounded-lg border transition ${
                        isHighlighted
                          ? 'border-[#5B45F2] ring-2 ring-[#5B45F2]/25'
                          : 'border-[#E6E7F0] hover:border-[#B9AEFC]'
                      }`}
                    >
                      <div className="aspect-video bg-[#11141C]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {src ? (
                          <img src={src} alt={item.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center px-1 text-center text-[9.5px] font-medium text-white/70">
                            {item.name}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-[12px] text-[#A0A1B4]">None yet</div>
            )}
          </div>
        );
      })}
    </div>
  );

  if (embedded) {
    return (
      <div className="space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] text-[#5E5E72]">Assets used in this shot are highlighted in purple.</p>
          <button
            type="button"
            onClick={onOpenAssets}
            className="flex-none text-[12px] font-medium text-[#5B45F2] transition hover:text-[#4C38D6]"
          >
            Manage all →
          </button>
        </div>
        {body}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#E8E9F0] bg-white p-4 shadow-[0_1px_3px_rgba(20,20,31,0.03)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-[#14141F]">Assets &amp; Characters</span>
        <button
          type="button"
          onClick={onOpenAssets}
          className="text-[12px] font-medium text-[#5B45F2] transition hover:text-[#4C38D6]"
        >
          Manage all →
        </button>
      </div>
      {body}
    </div>
  );
}

// ---------------------------------------------------------------- shot mode

function ShotEditor({ board, shot, onEdit, busy, onDone }) {
  const [draft, setDraft] = useState(shot);
  const save = async () => {
    const ok = await onEdit('update_shot', {
      id: shot.id,
      title: draft.title,
      description: draft.description,
      duration_seconds: Number(draft.duration_seconds),
      frame_prompt: draft.frame_prompt,
      video_prompt: draft.video_prompt,
      element_ids: draft.element_ids,
      ...(board.scenes?.length ? { scene_id: draft.scene_id } : {}),
    });
    if (ok) onDone();
  };
  const toggle = (id) =>
    setDraft({
      ...draft,
      element_ids: draft.element_ids.includes(id) ? draft.element_ids.filter((e) => e !== id) : [...draft.element_ids, id],
    });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_88px] gap-2.5">
        <Field label="Title">
          <input className={inputClass} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        </Field>
        <Field label="Seconds">
          <input
            type="number"
            min={4}
            max={30}
            className={inputClass}
            value={draft.duration_seconds}
            onChange={(e) => setDraft({ ...draft, duration_seconds: e.target.value })}
          />
        </Field>
      </div>
      {board.scenes?.length > 0 && (
        <Field label="Scene">
          <select className={inputClass} value={draft.scene_id || ''} onChange={(e) => setDraft({ ...draft, scene_id: e.target.value })}>
            {board.scenes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Description">
        <textarea rows={2} className={inputClass} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
      </Field>
      <p className="text-[11.5px] leading-snug text-[#7A7B90]">
        Mention assets with @id, e.g. {board.elements.slice(0, 2).map((e) => `@${e.id}`).join(' ') || '@maya'}: automatically used as reference images.
      </p>
      <Field label="Frame prompt">
        <textarea rows={3} className={inputClass} value={draft.frame_prompt} onChange={(e) => setDraft({ ...draft, frame_prompt: e.target.value })} />
      </Field>
      <Field label="Video prompt">
        <textarea rows={3} className={inputClass} value={draft.video_prompt} onChange={(e) => setDraft({ ...draft, video_prompt: e.target.value })} />
      </Field>
      {board.elements.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {board.elements.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => toggle(e.id)}
              className={`rounded-lg border px-2.5 py-1 text-[11.5px] font-medium transition ${
                draft.element_ids.includes(e.id)
                  ? 'border-[#DDD7FE] bg-[#F2F0FF] text-[#4C38D6]'
                  : 'border-[#E6E7F0] bg-[#F8F8FC] text-[#5E5E72] hover:text-[#14141F]'
              }`}
            >
              {e.name}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <SmallButton tone="accent" onClick={save} disabled={busy}>
          Save
        </SmallButton>
        <SmallButton onClick={onDone}>Cancel</SmallButton>
      </div>
    </div>
  );
}

function ShotStrip({ board, groups, selectedId, onSelect, workspaceId }) {
  return (
    <div className="flex gap-2 overflow-x-auto rounded-2xl border border-[#EAEAEF] bg-white p-1.5 shadow-[0_1px_2px_rgba(20,20,31,0.025)]">
      {groups.map((group) => (
        <div
          key={group.scene.id ?? 'all'}
          className="flex flex-none items-center gap-1 rounded-xl bg-[#F6F7FB] p-1"
          title={group.scene.title}
        >
          <span className="px-1.5 text-[10.5px] font-semibold text-[#6E6F82]">S{group.number}</span>
          {group.shots.length ? (
            group.shots.map(({ shot, label }) => (
              <button
                key={shot.id}
                type="button"
                onClick={() => onSelect(shot.id)}
                title={`Shot ${label} · ${shot.title}`}
                className={`overflow-hidden rounded-lg border-2 transition ${
                  selectedId === shot.id
                    ? 'border-[#5B45F2] shadow-[0_0_0_2px_rgba(91,69,242,0.16)]'
                    : 'border-transparent hover:border-[#C5C7D8]'
                }`}
              >
                <Thumb board={board} shot={shot} workspaceId={workspaceId} className="h-[44px] w-[78px]" />
              </button>
            ))
          ) : (
            <span className="px-2 text-[11px] text-[#8A8B9F]">empty</span>
          )}
        </div>
      ))}
    </div>
  );
}

const INSPECTOR_TABS = [
  ['detail', 'Details'],
  ['media', 'Media'],
  ['audio', 'Audio'],
  ['assets', 'Assets'],
];

const AUDIO_SUBTABS = [
  ['voiceover', 'Voiceover'],
  ['music', 'Music'],
  ['caption', 'Caption'],
];

function ShotMode({ board, numbered, groups, selected, onSelect, workspaceId, onEdit, onRequest, busy, onOpenAssets, tab, onTab }) {
  const [editing, setEditing] = useState(false);
  const [clipToolsOpen, setClipToolsOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState('detail');
  const [audioSubTab, setAudioSubTab] = useState('voiceover');
  const previewBox = useRef(null);

  useEffect(() => {
    setEditing(false);
  }, [selected?.shot.id]);

  // Sync external tab jumps (e.g. from Timeline actions) into the unified inspector.
  useEffect(() => {
    if (tab === 'music' || tab === 'voiceover' || tab === 'caption') {
      setAudioSubTab(tab);
    }
  }, [tab]);

  if (!selected) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-[#D6D8E4] bg-white text-[13.5px] text-[#5E5E72]">
        No shots yet. Ask the Director to create a shot list.
      </div>
    );
  }

  const { shot, label } = selected;
  const continuation = !board.media[`frame:${shot.id}`] && shot.extends ? board.shots.find((s) => s.id === shot.extends) : null;
  const frame = board.media[`frame:${shot.id}`];
  const video = board.media[`video:${shot.id}`];

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 lg:flex-row">
      {/* Left: sleek filmstrip + generous cinema stage + single calm action bar */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <ShotStrip board={board} groups={groups} selectedId={shot.id} onSelect={onSelect} workspaceId={workspaceId} />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex-none rounded-lg bg-[#F2F0FF] px-2 py-0.5 text-[11px] font-semibold text-[#4C38D6]">
              SHOT {label}
            </span>
            <h2 className="truncate text-[14.5px] font-semibold text-[#14141F]">{shot.title}</h2>
          </div>
          <div className="flex flex-none items-center gap-2">
            <Badge>{shot.duration_seconds}s</Badge>
            <LockButton
              locked={shot.locked}
              disabled={busy}
              onToggle={() => onEdit('set_lock', { target: `shot:${shot.id}`, locked: !shot.locked })}
            />
          </div>
        </div>

        <div
          ref={previewBox}
          className="dr-cinema-stage relative flex min-h-[260px] flex-1 items-center justify-center overflow-hidden rounded-2xl shadow-[0_10px_30px_rgba(15,17,28,0.12)] [&:fullscreen_img]:h-full [&:fullscreen_img]:w-full [&:fullscreen_img]:object-contain [&:fullscreen_video]:h-full [&:fullscreen_video]:w-full"
        >
          <ShotPreview board={board} shot={shot} workspaceId={workspaceId} />
          <FullscreenButton target={previewBox} />
        </div>

        {/* Single calm control row under cinema stage */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-[#EAEAEF] bg-white px-3.5 py-2.5 shadow-[0_1px_2px_rgba(20,20,31,0.025)]">
          <div className="flex flex-wrap items-center gap-2">
            {!continuation && frame && (
              <SmallButton
                disabled={busy || frame?.in_request}
                onClick={() => onRequest([`frame:${shot.id}`], !!frame?.asset_id && !frame?.stale)}
              >
                {frame?.asset_id ? 'Regenerate frame' : 'Generate frame'}
              </SmallButton>
            )}
            <SmallButton
              tone="accent"
              disabled={busy || video?.in_request}
              onClick={() => onRequest([`video:${shot.id}`], !!video?.asset_id && !video?.stale)}
            >
              {video?.asset_id ? 'Regenerate video' : 'Generate video'}
            </SmallButton>
            <span className="text-[12px] text-[#6E6F82]">
              {continuation ? `Continues ${continuation.title} · ` : frame ? `Frame ${mediaStatus(frame).label.toLowerCase()} · ` : ''}
              Video {mediaStatus(video).label.toLowerCase()}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setClipToolsOpen((v) => !v)}
            aria-expanded={clipToolsOpen}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition ${
              clipToolsOpen
                ? 'border-[#DDD7FE] bg-[#F2F0FF] text-[#4C38D6]'
                : 'border-[#E6E7F0] bg-[#FAFAFD] text-[#4C4D61] hover:border-[#C7CAD9] hover:bg-white hover:text-[#14141F]'
            }`}
          >
            <Scissors size={13} strokeWidth={2} aria-hidden="true" />
            <span>Edit clip</span>
          </button>
        </div>

        {clipToolsOpen && (
          <div className="space-y-2.5 rounded-2xl border border-[#EAEAEF] bg-white p-3.5 shadow-[0_2px_10px_rgba(20,20,31,0.03)]">
            <TrimControl shot={shot} video={video} onEdit={onEdit} busy={busy} />
            <ClipActions board={board} shot={shot} video={video} onEdit={onEdit} onRequest={onRequest} onSelect={onSelect} busy={busy} />
          </div>
        )}
      </div>

      {/* Right: One unified, calm 4-tab Inspector card */}
      <aside className="flex w-full flex-none flex-col overflow-hidden rounded-2xl border border-[#E8E9F0] bg-white shadow-[0_1px_3px_rgba(20,20,31,0.03)] lg:w-[340px]">
        <div className="border-b border-[#F0F0F6] p-3">
          <div className="grid grid-cols-4 gap-1 rounded-xl bg-[#F4F5F9] p-1">
            {INSPECTOR_TABS.map(([id, name]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setInspectorTab(id);
                  if (id === 'media') onTab('media');
                }}
                className={`rounded-lg py-1.5 text-[12px] font-medium transition ${
                  inspectorTab === id
                    ? 'bg-white text-[#4C38D6] shadow-[0_1px_2px_rgba(20,20,31,0.06)]'
                    : 'text-[#5E5E72] hover:text-[#14141F]'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {inspectorTab === 'detail' && (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-[#14141F]">Shot Description</span>
                <SmallButton onClick={() => setEditing((v) => !v)} disabled={busy}>
                  {editing ? 'Cancel' : 'Edit shot'}
                </SmallButton>
              </div>
              {editing ? (
                <ShotEditor key={shot.id} board={board} shot={shot} onEdit={onEdit} busy={busy} onDone={() => setEditing(false)} />
              ) : (
                <div className="space-y-3 text-[13px] leading-relaxed">
                  <p className="text-[#323344]">{shot.description || 'No description yet.'}</p>
                  <details className="rounded-xl border border-[#EFEFF5] bg-[#FAFAFD] px-3 py-2 text-[12px] text-[#5E5E72]">
                    <summary className="cursor-pointer font-medium text-[#4C4D61] hover:text-[#14141F]">View visual prompts</summary>
                    <p className="mt-2 leading-relaxed">
                      <span className="font-semibold text-[#3A3B4C]">Frame: </span>
                      {shot.frame_prompt}
                    </p>
                    <p className="mt-1.5 leading-relaxed">
                      <span className="font-semibold text-[#3A3B4C]">Video: </span>
                      {shot.video_prompt}
                    </p>
                  </details>
                  {shot.vo_text && (
                    <div className="rounded-xl border border-[#DFDAFE] bg-[#F6F4FF] p-3 text-[12.5px]">
                      <p className="text-[#2D2E3F]">
                        <span className="font-semibold text-[#4C38D6]">VO (starts at {shot.vo_offset ?? 0.3}s): </span>
                        {shot.vo_text}
                      </p>
                      {board.media[`vo:${shot.id}`]?.asset_id && (
                        <audio src={assetUrl(board.media[`vo:${shot.id}`].asset_id, workspaceId)} controls className="mt-2 h-9 w-full" />
                      )}
                    </div>
                  )}
                  {frame?.error && <p className="text-[12px] text-[#C01048]">Frame: {frame.error}</p>}
                  {video?.error && <p className="text-[12px] text-[#C01048]">Video: {video.error}</p>}
                </div>
              )}
            </div>
          )}

          {inspectorTab === 'media' && (
            <MediaTab
              board={board}
              shot={shot}
              workspaceId={workspaceId}
              onEdit={onEdit}
              onRequest={onRequest}
              onSelect={onSelect}
              busy={busy}
              startAdding={tab === 'add' ? 'after' : null}
            />
          )}

          {inspectorTab === 'audio' && (
            <div className="space-y-3.5">
              <div className="inline-flex w-full gap-1 rounded-xl bg-[#F4F5F9] p-1">
                {AUDIO_SUBTABS.map(([id, name]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setAudioSubTab(id);
                      onTab(id);
                    }}
                    className={`flex-1 rounded-lg py-1 text-[11.5px] font-medium transition ${
                      audioSubTab === id ? 'bg-white text-[#14141F] shadow-xs' : 'text-[#6E6F82] hover:text-[#14141F]'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
              {audioSubTab === 'voiceover' && (
                <VoiceoverTab board={board} shot={shot} workspaceId={workspaceId} onEdit={onEdit} onRequest={onRequest} busy={busy} />
              )}
              {audioSubTab === 'music' && (
                <MusicTab board={board} workspaceId={workspaceId} onEdit={onEdit} onRequest={onRequest} busy={busy} />
              )}
              {audioSubTab === 'caption' && <CaptionTab shot={shot} onEdit={onEdit} busy={busy} />}
            </div>
          )}

          {inspectorTab === 'assets' && (
            <CharactersAndWorld
              board={board}
              workspaceId={workspaceId}
              onOpenAssets={onOpenAssets}
              highlight={shot.element_ids}
              embedded
            />
          )}
        </div>

        <div className="border-t border-[#F0F0F6] px-4 py-2.5 text-[11.5px] text-[#8A8B9C]">
          {numbered.length} {numbered.length === 1 ? 'shot' : 'shots'} · total {numbered.reduce((t, n) => t + n.shot.duration_seconds, 0)}s
        </div>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------- scene mode

function SceneHeader({ group, board, busy, onEdit, onRequest }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(group.scene.title || '');
  useEffect(() => {
    if (!editing) setTitle(group.scene.title || '');
  }, [group.scene.title, editing]);
  const real = !!group.scene.id; // shots without a scene come as one unnamed group
  const save = async () => {
    if (title.trim() && title.trim() !== group.scene.title && !(await onEdit('update_scene', { id: group.scene.id, title: title.trim() }))) return;
    setEditing(false);
  };
  return (
    <div className="group/scene mb-3.5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="flex-none text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5B45F2]">
            Scene {group.number}
          </span>
          {group.scene.time && <span className="text-[11.5px] text-[#8A8B9C]">· {group.scene.time}</span>}
        </div>
        {editing ? (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') setEditing(false);
            }}
            className="mt-1 w-full max-w-[440px] rounded-lg border border-[#5B45F2] bg-white px-2.5 py-1 text-[14px] font-semibold text-[#14141F] outline-none ring-4 ring-[#5B45F2]/10"
          />
        ) : (
          <>
            <button
              type="button"
              disabled={!real || busy}
              onClick={() => setEditing(true)}
              title={real ? [group.scene.lighting && `Lighting: ${group.scene.lighting}`, 'Click to rename'].filter(Boolean).join('\n') : undefined}
              className="mt-0.5 block max-w-full truncate text-left text-[14.5px] font-semibold text-[#14141F] transition hover:text-[#4C38D6] disabled:hover:text-[#14141F]"
            >
              {group.scene.title}
            </button>
            {group.scene.description && (
              <p className="mt-0.5 line-clamp-1 text-[12.5px] text-[#6E6F82]">{group.scene.description}</p>
            )}
          </>
        )}
      </div>

      {!editing && (
        <div className="flex flex-none items-center gap-1.5">
          {group.shots.length > 0 && <SceneVideoButton group={group} board={board} busy={busy} onRequest={onRequest} />}
          {real && (
            <button
              type="button"
              disabled={busy}
              title="Delete scene (its shots move to the previous scene)"
              aria-label={`Delete scene ${group.scene.title}`}
              onClick={() => {
                if (window.confirm(`Delete scene "${group.scene.title}"? Shots inside will move to the previous scene.`)) {
                  onEdit('remove_scene', { id: group.scene.id });
                }
              }}
              className="grid h-7 w-7 flex-none place-items-center rounded-lg text-[#8A8B9C] opacity-0 transition hover:bg-[#FFF1F3] hover:text-[#C01048] focus-visible:opacity-100 group-hover/scene:opacity-100 disabled:opacity-30"
            >
              <X size={14} strokeWidth={2.2} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** The scene's one video button: makes whatever its shots still miss (as a scene video when it can), or redoes it. */
function SceneVideoButton({ group, board, busy, onRequest }) {
  const ids = group.shots.map((item) => item.shot.id);
  const plan = videoPlan(board, ids);
  const seconds = group.shots.reduce((t, item) => t + item.shot.duration_seconds, 0);
  const partial = plan.missing.length > 0 && plan.missing.length < ids.length;
  const label = plan.running
    ? 'Generating video…'
    : partial
    ? `Generate ${plan.missing.length} remaining ${plan.missing.length === 1 ? 'shot' : 'shots'}`
    : plan.missing.length
    ? `Generate video · ${seconds}s`
    : 'Regenerate videos';
  const title = plan.running
    ? 'Video for this scene is currently being generated.'
    : plan.missing.length
    ? 'Shots in this scene are generated together as one video (using shot frames as keyframes), then split per shot. Credit estimate appears in chat before generating.'
    : 'Regenerate all videos in this scene. For a single shot, open the shot and click Regenerate video.';
  const fresh = plan.missing.length > 0;
  return (
    <button
      type="button"
      disabled={busy || plan.running || !(fresh ? plan.keys : plan.redo).length}
      title={title}
      onClick={() => onRequest(fresh ? plan.keys : plan.redo, !fresh)}
      className={`inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] font-semibold transition disabled:opacity-45 ${
        fresh
          ? 'bg-[#5B45F2] text-white shadow-[0_1px_4px_rgba(91,69,242,0.24)] hover:bg-[#4731D8]'
          : 'border border-[#D8DAE6] bg-white text-[#4C4D61] hover:border-[#BFC2D4] hover:bg-[#F5F6FA] hover:text-[#14141F]'
      }`}
    >
      {fresh && !plan.running && <Play size={11} fill="currentColor" aria-hidden="true" />}
      <span>{label}</span>
    </button>
  );
}

/** What a shot has so far: a finished clip, only its still frame, or nothing yet (or something being made). */
function shotState(board, shot) {
  const frame = board.media[`frame:${shot.id}`];
  const video = board.media[`video:${shot.id}`];
  if (frame?.status === 'running' || video?.status === 'running') {
    return { label: 'Generating…', tone: 'bg-[#FFF3D6] text-[#965507] border border-[#F7D794]' };
  }
  if (video?.asset_id) {
    return {
      label: video.stale ? 'Needs regenerate' : 'Video ready',
      tone: video.stale
        ? 'bg-[#FFF3D6] text-[#965507] border border-[#F7D794]'
        : 'bg-[#5B45F2] text-white shadow-sm',
    };
  }
  if (frame?.asset_id) {
    return { label: 'Frame ready', tone: 'bg-white/95 text-[#14141F] shadow-sm' };
  }
  return { label: 'Not generated', tone: 'bg-black/65 text-white/90 backdrop-blur-sm' };
}

function SceneShotCard({ board, item, workspaceId, ratio, picked, onToggle, onPick, wide }) {
  const { shot, label } = item;
  const [hover, setHover] = useState(false);
  const video = board.media[`video:${shot.id}`];
  const clip = video?.asset_id ? assetUrl(video.asset_id, workspaceId) : null;
  const state = shotState(board, shot);
  const size = PORTRAIT.has(ratio) ? 'h-[212px] w-full' : `${ratio} w-full`;
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`group relative ${wide ? 'w-full' : 'w-[244px] flex-none'} overflow-hidden rounded-xl border bg-white text-left transition ${
        picked
          ? 'border-[#5B45F2] ring-2 ring-[#5B45F2]/20'
          : 'border-[#E6E7F0] shadow-[0_1px_2px_rgba(20,20,31,0.03)] hover:border-[#BFC2D8] hover:shadow-[0_4px_14px_rgba(20,20,31,0.06)]'
      }`}
    >
      <button type="button" onClick={() => onPick(shot.id)} className="block w-full text-left">
        <div className="relative">
          <Thumb board={board} shot={shot} workspaceId={workspaceId} className={size} />
          {/* A shot with a clip plays it (muted) while the pointer is on the card. */}
          {hover && clip && (
            <video
              src={clip}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              draggable={false}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            />
          )}
          <span className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${state.tone}`}>
            {state.label}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <span className="truncate text-[12.5px] text-[#2D2E3F]">
            <span className="mr-1.5 font-semibold text-[#14141F]">SHOT {label}</span>
            {shot.title}
          </span>
          <span className="flex-none rounded-md bg-[#F3F4F8] px-1.5 py-0.5 text-[11px] font-medium text-[#5E5E72]">
            {shot.duration_seconds}s
          </span>
        </div>
      </button>
      <label
        title="Select this shot"
        onClick={(e) => e.stopPropagation()}
        className={`absolute left-2 top-2 grid h-5 w-5 cursor-pointer place-items-center rounded-md border transition ${
          picked
            ? 'border-[#5B45F2] bg-[#5B45F2] text-white opacity-100'
            : 'border-white/70 bg-black/50 text-white opacity-0 backdrop-blur-sm group-hover:opacity-100'
        }`}
      >
        <input type="checkbox" checked={picked} onChange={() => onToggle(shot.id)} className="sr-only" />
        {picked && <Check size={12} strokeWidth={3} aria-hidden="true" />}
      </label>
    </div>
  );
}

function SceneMode({ board, groups, numbered, workspaceId, onPick, onOpenAssets, onEdit, onRequest, busy }) {
  const [layout, setLayout] = useState('scene'); // 'scene' | 'grid'
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [picked, setPicked] = useState([]);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const ids = new Set(board.shots.map((s) => s.id));
  const chosen = picked.filter((id) => ids.has(id));
  const toggle = (id) => setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  const ratio = RATIO_CLASS[board.brief.aspect_ratio] || 'aspect-video';
  const addScene = async () => {
    if (title.trim() && (await onEdit('add_scene', { title: title.trim() }))) {
      setTitle('');
      setAdding(false);
    }
  };
  const generate = () => onRequest(chosen.map((id) => `video:${id}`).filter((key) => board.media[key] && !board.media[key].uploaded));
  const move = async (sceneId) => {
    if (sceneId && (await onEdit('batch_shots', { ids: chosen, action: 'move_scene', scene_id: sceneId }))) setPicked([]);
  };
  const remove = async () => {
    if (!window.confirm(`Delete ${chosen.length} ${chosen.length === 1 ? 'shot' : 'shots'}? You can restore them from Version History.`)) return;
    if (await onEdit('batch_shots', { ids: chosen, action: 'remove' })) setPicked([]);
  };
  const empty = !board.shots.length && !board.scenes?.length;
  return (
    <div className="flex h-full min-h-0 flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-[#E6E7F0] bg-[#EFEFF5] p-0.5">
          {[
            ['scene', 'By scene'],
            ['grid', 'Grid'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setLayout(id)}
              className={`rounded-lg px-3 py-1 text-[12px] font-medium transition ${
                layout === id ? 'bg-white text-[#14141F] shadow-sm' : 'text-[#5E5E72] hover:text-[#14141F]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {adding ? (
          <span className="flex items-center gap-2">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="New scene name"
              onKeyDown={(e) => {
                if (e.key === 'Enter') addScene();
                if (e.key === 'Escape') setAdding(false);
              }}
              className="w-48 rounded-lg border border-[#5B45F2] bg-white px-2.5 py-1.5 text-[12.5px] text-[#14141F] outline-none ring-4 ring-[#5B45F2]/10"
            />
            <SmallButton tone="accent" disabled={busy || !title.trim()} onClick={addScene}>
              Add
            </SmallButton>
            <SmallButton onClick={() => setAdding(false)}>Cancel</SmallButton>
          </span>
        ) : (
          <SmallButton disabled={busy} onClick={() => setAdding(true)}>
            + Scene
          </SmallButton>
        )}

        <button
          type="button"
          onClick={() => setAssetsOpen((v) => !v)}
          aria-expanded={assetsOpen}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition ${
            assetsOpen
              ? 'border-[#DDD7FE] bg-[#F2F0FF] text-[#4C38D6]'
              : 'border-[#E6E7F0] bg-white text-[#4C4D61] hover:border-[#C7CAD9] hover:text-[#14141F]'
          }`}
        >
          <Users size={13} strokeWidth={2} aria-hidden="true" />
          <span>Assets &amp; Characters</span>
          {board.elements.length > 0 && (
            <span className={`rounded-full px-1.5 text-[10.5px] font-semibold ${assetsOpen ? 'bg-white/80 text-[#4C38D6]' : 'bg-[#F1F2F7] text-[#5E5E72]'}`}>
              {board.elements.length}
            </span>
          )}
        </button>

        {chosen.length > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-2 rounded-xl border border-[#DDD7FE] bg-[#F2F0FF] px-3 py-1.5">
            <span className="text-[12px] font-semibold text-[#4C38D6]">{chosen.length} {chosen.length === 1 ? 'shot' : 'shots'} selected</span>
            <SmallButton tone="accent" disabled={busy} onClick={generate}>
              Generate video
            </SmallButton>
            {board.scenes?.length > 0 && (
              <select
                disabled={busy}
                value=""
                onChange={(e) => move(e.target.value)}
                className="rounded-lg border border-[#DDD7FE] bg-white px-2.5 py-1 text-[12px] font-medium text-[#2D2E3F] outline-none"
              >
                <option value="">Move to scene…</option>
                {board.scenes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            )}
            <SmallButton tone="danger" disabled={busy} onClick={remove}>
              Delete
            </SmallButton>
            <button
              type="button"
              onClick={() => setPicked([])}
              className="px-1.5 text-[12px] font-medium text-[#5E5E72] hover:text-[#14141F]"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {assetsOpen && <CharactersAndWorld board={board} workspaceId={workspaceId} onOpenAssets={onOpenAssets} compact />}

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {empty ? (
          <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[#D6D8E4] bg-white px-6 text-center">
            <p className="text-[14px] font-semibold text-[#14141F]">No scenes or shots yet</p>
            <p className="text-[13px] text-[#5E5E72]">Chat with AI Director on the left to start building your storyboard.</p>
          </div>
        ) : layout === 'grid' ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-3.5">
            {numbered.map((item) => (
              <SceneShotCard
                key={item.shot.id}
                board={board}
                item={item}
                workspaceId={workspaceId}
                ratio={ratio}
                wide
                picked={chosen.includes(item.shot.id)}
                onToggle={toggle}
                onPick={onPick}
              />
            ))}
          </div>
        ) : (
          groups.map((group) => (
            <section
              key={group.scene.id ?? 'all'}
              className="rounded-2xl border border-[#EAEAEF] bg-white p-4 shadow-[0_1px_2px_rgba(20,20,31,0.025)]"
            >
              <SceneHeader group={group} board={board} busy={busy} onEdit={onEdit} onRequest={onRequest} />
              <div className="flex gap-3 overflow-x-auto pb-1.5">
                {group.shots.map((item) => (
                  <SceneShotCard
                    key={item.shot.id}
                    board={board}
                    item={item}
                    workspaceId={workspaceId}
                    ratio={ratio}
                    picked={chosen.includes(item.shot.id)}
                    onToggle={toggle}
                    onPick={onPick}
                  />
                ))}
                {!group.shots.length && (
                  <span className="py-8 text-[12.5px] text-[#84859A]">No shots in this scene yet.</span>
                )}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- timeline mode

/** One shot on the timeline track: click to preview, drag to reorder, × to delete. */
function SortableShot({ item, width, active, board, workspaceId, disabled, onSelect, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.shot.id, disabled });
  return (
    <div
      ref={setNodeRef}
      style={{ width, transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 20 : undefined }}
      className={`group relative h-full flex-none border-r border-black/80 ${isDragging ? 'opacity-85 shadow-xl' : ''}`}
    >
      <button
        type="button"
        onClick={onSelect}
        title={`Shot ${item.label} · ${item.shot.title} — click to preview, drag to reorder`}
        className={`relative block h-full w-full overflow-hidden ${disabled ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'} ${
          active ? 'ring-2 ring-inset ring-[#5B45F2]' : ''
        }`}
        {...attributes}
        {...listeners}
      >
        <Thumb board={board} shot={item.shot} workspaceId={workspaceId} className="h-full w-full" strip />
        <span
          className={`absolute left-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
            active ? 'bg-[#5B45F2] text-white' : 'bg-black/70 text-white'
          }`}
        >
          {item.label}
        </span>
      </button>
      {!disabled && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete shot ${item.label}`}
          title="Delete shot"
          className="absolute right-1.5 top-1.5 hidden h-5 w-5 place-items-center rounded-full bg-black/75 text-white transition hover:bg-[#C01048] group-hover:grid"
        >
          <X size={11} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

/** The latest finished render, shown as the "Final video" view and track of the timeline. */
function latestRender(board) {
  return [...(board.renders || [])].reverse().find((r) => r.status === 'done' && r.asset_id) || null;
}

// The extra tracks under the clips on the timeline, like OpenArt's: voiceover lines, the music bed and captions.
function Lane({ label, color, children, empty, onAdd }) {
  return (
    <div className="relative h-8 rounded-lg border border-[#ECECF4] bg-[#F7F8FC]">
      {/* Over the first second of the track: lets clicks through so a block starting at 0 can still be grabbed. */}
      <span
        className={`pointer-events-none sticky left-0 z-30 inline-flex h-full w-[58px] items-center rounded-l-lg border-r border-[#E6E7F0] bg-white/95 px-2 text-[10px] font-semibold uppercase tracking-wide backdrop-blur-sm ${color}`}
      >
        {label}
      </span>
      {children}
      {empty && (
        <button
          type="button"
          onClick={onAdd}
          className="absolute left-[68px] top-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-[#7A7B90] transition hover:bg-[#EAEBF3] hover:text-[#14141F]"
        >
          + Add
        </button>
      )}
    </div>
  );
}

const LANE_LABEL = 58; // px of the sticky lane label; text of a block starting under it is pushed past it
const SNAP = 0.1; // seconds

// Length of an audio file, read from its metadata in the browser (null until known).
const durationCache = new Map();
function useClipDuration(src) {
  const [seconds, setSeconds] = useState(() => (src ? durationCache.get(src) ?? null : null));
  useEffect(() => {
    if (!src) {
      setSeconds(null);
      return undefined;
    }
    if (durationCache.has(src)) {
      setSeconds(durationCache.get(src));
      return undefined;
    }
    const audio = new Audio();
    audio.preload = 'metadata';
    const done = () => {
      if (Number.isFinite(audio.duration)) {
        durationCache.set(src, audio.duration);
        setSeconds(audio.duration);
      }
    };
    audio.addEventListener('loadedmetadata', done);
    audio.src = src;
    return () => audio.removeEventListener('loadedmetadata', done);
  }, [src]);
  return seconds;
}

// A block on a track: drag it to move, drag an edge to cut its start or end. onCommit(mode, deltaSeconds) when let go;
// a plain click opens it; ✕ (onRemove) takes it off the timeline.
function LaneBlock({ start, length, zoom, tone, title, onClick, onCommit, onRemove, disabled, children }) {
  const [drag, setDrag] = useState(null); // {mode, x0, dx}
  const begin = (mode) => (event) => {
    if (disabled || event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ mode, x0: event.clientX, dx: 0 });
  };
  const move = (event) => {
    if (drag) setDrag({ ...drag, dx: event.clientX - drag.x0 });
  };
  const end = () => {
    if (!drag) return;
    const seconds = Math.round(drag.dx / zoom / SNAP) * SNAP;
    setDrag(null);
    if (Math.abs(drag.dx) < 3) onClick?.();
    else if (seconds) onCommit?.(drag.mode, seconds);
  };
  const d = drag ? drag.dx / zoom : 0;
  const shownStart = start + (drag && drag.mode !== 'right' ? d : 0);
  const shownLength = Math.max(0.2, length + (drag?.mode === 'left' ? -d : drag?.mode === 'right' ? d : 0));
  const left = shownStart * zoom;
  return (
    <div
      title={title}
      onPointerDown={begin('move')}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={() => setDrag(null)}
      style={{ left, width: Math.max(22, shownLength * zoom), paddingLeft: Math.max(8, LANE_LABEL - left + 6) }}
      className={`absolute bottom-1 top-1 select-none overflow-hidden rounded-md pr-2 text-left text-[11px] font-medium leading-[22px] ${
        disabled ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
      } ${drag ? 'z-20 ring-2 ring-[#5B45F2]' : ''} ${tone}`}
    >
      <span className={`pointer-events-none block truncate ${onRemove && !disabled ? 'pr-4' : ''}`}>{children}</span>
      {!disabled && (
        <>
          <span onPointerDown={begin('left')} className="absolute bottom-0 left-0 top-0 w-1.5 cursor-ew-resize bg-black/0 hover:bg-black/15" />
          <span onPointerDown={begin('right')} className="absolute bottom-0 right-0 top-0 w-1.5 cursor-ew-resize bg-black/0 hover:bg-black/15" />
          {onRemove && (
            <button
              type="button"
              title="Remove from timeline"
              aria-label="Remove from timeline"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="absolute right-1 top-1/2 grid h-4 w-4 -translate-y-1/2 place-items-center rounded text-current opacity-65 hover:bg-black/10 hover:opacity-100"
            >
              <X size={10} strokeWidth={2.5} />
            </button>
          )}
        </>
      )}
    </div>
  );
}

const clamp = (value, low, high) => Math.min(Math.max(value, low), Math.max(low, high));
const r2 = (value) => Math.round(value * 100) / 100;

// The shot's voiceover line: starts vo_offset seconds into the shot; its edges cut the generated clip.
function VoBlock({ item, shotStart, zoom, board, workspaceId, busy, onEdit, onOpen }) {
  const { shot } = item;
  const media = board.media[`vo:${shot.id}`];
  const ready = media?.status === 'succeeded';
  const clip = useClipDuration(ready ? assetUrl(media.asset_id, workspaceId) : null);
  const offset = shot.vo_offset ?? 0.3;
  const trimStart = shot.vo_trim_start || 0;
  const trimEnd = shot.vo_trim_end || 0;
  const full = clip ?? Math.max(0.8, shot.vo_text.length / 13);
  const length = Math.max(0.3, full - trimStart - trimEnd);
  const commit = (mode, d) => {
    if (mode === 'move') return onEdit('update_shot', { id: shot.id, vo_offset: r2(clamp(offset + d, 0, shot.duration_seconds - 0.1)) });
    if (mode === 'left') {
      const cut = clamp(d, -Math.min(trimStart, offset), length - 0.3);
      return onEdit('update_shot', { id: shot.id, vo_trim_start: r2(trimStart + cut), vo_offset: r2(offset + cut) });
    }
    return onEdit('update_shot', { id: shot.id, vo_trim_end: r2(clamp(trimEnd - d, 0, full - trimStart - 0.3)) });
  };
  return (
    <LaneBlock
      start={shotStart + offset}
      length={length}
      zoom={zoom}
      disabled={busy || shot.locked}
      tone={
        ready
          ? 'border border-[#C9BEFC] bg-[#ECE8FE] text-[#4228B5] hover:bg-[#E2DCFD]'
          : 'border border-dashed border-[#B9AEFC] bg-[#F5F3FF] text-[#5B45F2] hover:bg-[#ECE8FE]'
      }
      title={`Shot ${item.label} VO${ready ? '' : ' (not generated yet)'}: ${shot.vo_text}. Drag to move, drag edges to trim.`}
      onClick={onOpen}
      onCommit={commit}
      onRemove={() => {
        if (window.confirm(`Remove VO for shot ${item.label} from timeline?`)) onEdit('update_shot', { id: shot.id, vo_text: '' });
      }}
    >
      {shot.vo_text}
    </LaneBlock>
  );
}

// The shot's caption: shown from caption_start to caption_end seconds into the shot.
function CaptionBlock({ item, shotStart, zoom, busy, onEdit, onOpen }) {
  const { shot } = item;
  const from = shot.caption_start || 0;
  const to = shot.caption_end ?? shot.duration_seconds;
  const commit = (mode, d) => {
    if (mode === 'move') {
      const shift = clamp(d, -from, shot.duration_seconds - to);
      return onEdit('update_shot', { id: shot.id, caption_start: r2(from + shift), caption_end: r2(to + shift) });
    }
    if (mode === 'left') return onEdit('update_shot', { id: shot.id, caption_start: r2(clamp(from + d, 0, to - 0.3)), caption_end: r2(to) });
    return onEdit('update_shot', { id: shot.id, caption_start: r2(from), caption_end: r2(clamp(to + d, from + 0.3, shot.duration_seconds)) });
  };
  return (
    <LaneBlock
      start={shotStart + from}
      length={to - from}
      zoom={zoom}
      disabled={busy || shot.locked}
      tone="border border-[#F5CF86] bg-[#FEF3C7] text-[#8F4F06] hover:bg-[#FDE8A7]"
      title={`Shot ${item.label} caption: ${shot.caption}. Drag to move, drag edges to adjust timing.`}
      onClick={onOpen}
      onCommit={commit}
      onRemove={() => {
        if (window.confirm(`Remove caption for shot ${item.label} from timeline?`)) onEdit('update_shot', { id: shot.id, caption: '' });
      }}
    >
      {shot.caption}
    </LaneBlock>
  );
}

// The music bed: starts at music.start in the video, music.trim_start seconds into the track, stops at music.end.
function musicWindow(music, trackSeconds, total) {
  const start = music.start || 0;
  const trim = music.trim_start || 0;
  const natural = Math.min(total, start + Math.max(0.5, trackSeconds - trim));
  const end = music.end != null ? Math.min(music.end, natural) : natural;
  return { start, trim, end, natural };
}

function MusicBlock({ board, workspaceId, zoom, total, busy, onEdit, onOpen }) {
  const music = board.audio.music;
  const media = board.media['audio:music'];
  const ready = media?.status === 'succeeded';
  const track = useClipDuration(ready ? assetUrl(media.asset_id, workspaceId) : null) ?? (music.duration_seconds || total);
  const { start, trim, end } = musicWindow(music, track, total);
  const commit = (mode, d) => {
    if (mode === 'move') {
      const shift = clamp(d, -start, total - end);
      return onEdit('set_audio', { music_start: r2(start + shift), music_end: music.end != null ? r2(end + shift) : null });
    }
    if (mode === 'left') {
      const cut = clamp(d, -Math.min(start, trim), end - start - 0.5);
      return onEdit('set_audio', { music_start: r2(start + cut), music_trim_start: r2(trim + cut) });
    }
    return onEdit('set_audio', { music_end: r2(clamp(end + d, start + 0.5, Math.min(total, start + track - trim))) });
  };
  return (
    <LaneBlock
      start={start}
      length={end - start}
      zoom={zoom}
      disabled={busy}
      tone={
        ready
          ? 'border border-[#A9D5FA] bg-[#E0F2FE] text-[#0D548A] hover:bg-[#CEE9FD]'
          : 'border border-dashed border-[#9ACAF5] bg-[#EFF8FF] text-[#1764A3] hover:bg-[#E0F2FE]'
      }
      title={`Music: ${music.prompt}. Drag to move, drag edges to trim.`}
      onClick={onOpen}
      onCommit={commit}
      onRemove={() => {
        if (window.confirm('Remove music from timeline?')) onEdit('set_audio', { music_prompt: '' });
      }}
    >
      <span className="inline-flex items-center gap-1">
        <Music size={10} aria-hidden="true" />
        <span>{music.prompt}</span>
      </span>
    </LaneBlock>
  );
}

function TimelineMode({ board, numbered, workspaceId, selectedId, onSelect, onRender, rendering, onEdit, onRequest, busy, tab, onTab }) {
  const finalRender = latestRender(board);
  const finalSrc = finalRender && assetUrl(finalRender.asset_id, workspaceId);
  const [view, setView] = useState(finalRender ? 'final' : 'shots');
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const openInspectorTab = (nextTab) => {
    onTab(nextTab);
    setInspectorOpen(true);
  };
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
    return numbered.map((n) => {
      const start = t;
      t += n.shot.duration_seconds;
      return start;
    });
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
  const playerBox = useRef(null);
  const current = numbered[index];
  const videoOf = (item) => (item ? assetUrl(board.media[`video:${item.shot.id}`]?.asset_id, workspaceId) : null);
  const currentVideo = videoOf(current);
  const currentFrame = current && assetUrl(board.media[`frame:${current.shot.id}`]?.asset_id, workspaceId);
  // Two players take turns (shot i plays in slot i % 2): the next shot's clip is already loading in the other one, so
  // a cut is a swap instead of a fresh load (no black flash, no poster, no size jump).
  const slotRefs = [useRef(null), useRef(null)];
  const activeSlot = index % 2;
  const slotSrc = [null, null];
  slotSrc[activeSlot] = currentVideo;
  slotSrc[1 - activeSlot] = videoOf(numbered[index + 1]);
  const videoRef = slotRefs[activeSlot];
  const trimStart = Number(current?.shot.trim_start || 0);
  const trimEnd = Number(current?.shot.trim_end || 0);
  const nextShot = () => {
    setOffset(0);
    if (index + 1 < numbered.length) setIndex(index + 1);
    else setPlaying(false);
  };
  // A shot starts at its trim and ends before its cut end, as in the render.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentVideo) return undefined;
    const start = () => {
      if (Math.abs(video.currentTime - trimStart) > 0.05) video.currentTime = trimStart;
    };
    if (video.readyState >= 1) start();
    else video.addEventListener('loadedmetadata', start, { once: true });
    return () => video.removeEventListener('loadedmetadata', start);
  }, [index, currentVideo]); // eslint-disable-line react-hooks/exhaustive-deps
  const onSlotTime = (slot) => (event) => {
    if (slot !== activeSlot) return;
    const video = event.currentTarget;
    setOffset(Math.max(0, video.currentTime - trimStart));
    if (playing && trimEnd > 0 && Number.isFinite(video.duration) && video.currentTime >= video.duration - trimEnd) {
      video.pause();
      nextShot();
    }
  };

  useEffect(() => {
    if (current) onSelect(current.shot.id);
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps
  const shotKey = numbered.map((n) => n.shot.id).join(',');
  useEffect(() => {
    const at = numbered.findIndex((n) => n.shot.id === selectedId);
    if (at >= 0 && at !== index) setIndex(at);
    else if (index >= numbered.length) setIndex(Math.max(0, numbered.length - 1));
  }, [shotKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reordering: shown at once, saved as a board edit (a new version, so it can be undone from history).
  const [dragOrder, setDragOrder] = useState(null);
  useEffect(() => {
    setDragOrder(null);
  }, [shotKey]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), // a plain click still selects
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
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
    if (!window.confirm(`Delete shot ${item.label} "${item.shot.title}"? You can restore it from Version History.`)) return;
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
        if (index + 1 < numbered.length) setIndex(index + 1);
        else setPlaying(false);
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
    const other = slotRefs[1 - activeSlot].current;
    if (other) {
      other.pause();
      other.muted = true;
    } // the waiting player stays silent and still
    if (!video) return;
    video.muted = false;
    video.volume = voiced ? 0.45 : 1;
    if (playing) video.play().catch(() => {});
    else video.pause();
  }, [playing, index, currentVideo, voiced]); // eslint-disable-line react-hooks/exhaustive-deps
  // The music follows the playhead within its window on the track (start, cut start, end), checked 4x a second.
  const tick = Math.floor(offset * 4);
  useEffect(() => {
    const music = musicRef.current;
    if (!music) return;
    music.volume = voiced ? 0.3 : 0.7;
    const bed = board.audio?.music || {};
    const { start, trim, end } = musicWindow(bed, Number.isFinite(music.duration) ? music.duration : bed.duration_seconds || total, total);
    const at = (starts[index] || 0) + offset;
    if (!playing || at < start || at >= end) {
      music.pause();
      return;
    }
    const target = trim + (at - start);
    if (Math.abs(music.currentTime - target) > 0.4) music.currentTime = target;
    music.play().catch(() => {});
  }, [playing, index, musicSrc, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  // The shot's voiceover line from its offset, with its cut start and end.
  useEffect(() => {
    const vo = voRef.current;
    if (!vo) return undefined;
    if (!playing || !voSrc) {
      vo.pause();
      return undefined;
    }
    const { vo_offset: voOffset = 0.3, vo_trim_start: cutStart = 0, vo_trim_end: cutEnd = 0 } = current.shot;
    const stopAtEnd = () => {
      if (Number.isFinite(vo.duration) && vo.currentTime >= vo.duration - (cutEnd || 0)) vo.pause();
    };
    vo.addEventListener('timeupdate', stopAtEnd);
    const wait = (voOffset ?? 0.3) - offset;
    let timer;
    if (wait <= 0) {
      vo.currentTime = (cutStart || 0) - wait;
      vo.play().catch(() => {});
    } else {
      vo.currentTime = cutStart || 0;
      timer = setTimeout(() => vo.play().catch(() => {}), wait * 1000);
    }
    return () => {
      clearTimeout(timer);
      vo.removeEventListener('timeupdate', stopAtEnd);
    };
  }, [playing, index, voSrc]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!numbered.length && !finalSrc) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-[#D6D8E4] bg-white text-[13.5px] text-[#5E5E72]">
        Timeline is empty. No shots yet.
      </div>
    );
  }

  const seek = (i) => {
    setIndex(i);
    setOffset(0);
  };
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
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex rounded-xl border border-[#E6E7F0] bg-[#EFEFF5] p-0.5">
            {[
              ['shots', 'Shot sequence'],
              ['final', finalRender ? `Final video · ${fmtTime(finalDuration)}` : 'Final video'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                disabled={id === 'final' && !finalSrc}
                className={`rounded-lg px-3 py-1 text-[12px] font-medium transition disabled:opacity-40 ${
                  view === id && (id === 'shots' || finalSrc)
                    ? 'bg-white text-[#14141F] shadow-sm'
                    : 'text-[#5E5E72] hover:text-[#14141F]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {!finalRender && (
            <span className="text-[12px] text-[#7A7B90]">Click Export anytime to render the final video.</span>
          )}
          {stale && view === 'final' && (
            <Badge tone="amber">Board has changed since the last render.</Badge>
          )}
        </div>

        {!showFinal && current && (
          <button
            type="button"
            onClick={() => setInspectorOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition ${
              inspectorOpen
                ? 'border-[#DDD7FE] bg-[#F2F0FF] text-[#4C38D6]'
                : 'border-[#E6E7F0] bg-white text-[#4C4D61] hover:border-[#C7CAD9] hover:text-[#14141F]'
            }`}
          >
            <SlidersHorizontal size={13} strokeWidth={2} aria-hidden="true" />
            <span>{inspectorOpen ? 'Close inspector' : `Edit Shot ${current.label}`}</span>
          </button>
        )}
      </div>

      {showFinal ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
          <div className="dr-cinema-stage flex min-h-[220px] min-w-0 flex-1 items-center justify-center overflow-hidden rounded-2xl shadow-[0_8px_28px_rgba(15,17,28,0.12)]">
            <video
              ref={finalRef}
              key={finalSrc}
              src={finalSrc}
              controls
              playsInline
              preload="metadata"
              className="max-h-full max-w-full"
              onTimeUpdate={(e) => setFinalTime(e.currentTarget.currentTime)}
            />
          </div>
          <aside className="w-full flex-none overflow-y-auto rounded-2xl border border-[#E8E9F0] bg-white p-4 shadow-[0_1px_3px_rgba(20,20,31,0.03)] lg:w-[320px]">
            {playingShot && (
              <div className="mb-4 border-b border-[#EFEFF5] pb-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[#5B45F2]">Now playing</div>
                <div className="mt-1 text-[13.5px] font-semibold text-[#14141F]">
                  Shot {playingShot.label} · {playingShot.shot.title}
                </div>
                <div className="mt-2.5 overflow-hidden rounded-xl">
                  <Thumb board={board} shot={playingShot.shot} workspaceId={workspaceId} className="aspect-video w-full" />
                </div>
                <p className="mt-2.5 line-clamp-3 text-[12.5px] leading-relaxed text-[#5E5E72]">{playingShot.shot.description}</p>
                <p className="mt-1.5 text-[11.5px] text-[#7A7B90]">
                  {fmtTime(playingSeg.start)}–{fmtTime(playingSeg.start + playingSeg.duration)} ·{' '}
                  {playingSeg.source === 'video' ? 'video' : 'still frame (no video yet)'}
                </p>
              </div>
            )}
            <div className="text-[13.5px] font-semibold text-[#14141F]">Final video details</div>
            <dl className="mt-2.5 space-y-2 text-[12.5px] text-[#5E5E72]">
              <div className="flex justify-between">
                <dt>Duration</dt>
                <dd className="font-medium text-[#14141F]">{fmtTime(finalDuration)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Dimensions</dt>
                <dd className="font-medium text-[#14141F]">
                  {finalRender.width}×{finalRender.height} · {finalRender.aspect_ratio}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>File</dt>
                <dd className="font-medium text-[#14141F]">{((finalRender.size_bytes || 0) / (1024 * 1024)).toFixed(1)} MB</dd>
              </div>
              <div className="flex justify-between">
                <dt>Shots</dt>
                <dd className="font-medium text-[#14141F]">{finalRender.shots?.length || 0}</dd>
              </div>
            </dl>
            {skippedShots.length > 0 && (
              <div className="mt-3 rounded-xl border border-[#EFEFF5] bg-[#FAFAFD] p-3">
                <p className="text-[11.5px] font-medium text-[#5E5E72]">Not included in video (no image yet):</p>
                <ul className="mt-1 space-y-0.5">
                  {skippedShots.map((n) => (
                    <li key={n.shot.id} className="truncate text-[11.5px] text-[#7A7B90]">
                      {n.label} · {n.shot.title}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <a
                href={`${finalSrc}&download=1`}
                download
                className="flex-1 rounded-xl bg-[#5B45F2] py-2 text-center text-[12.5px] font-semibold text-white shadow-[0_2px_8px_rgba(91,69,242,0.22)] transition hover:bg-[#4731D8]"
              >
                Download
              </a>
              <button
                type="button"
                onClick={onRender}
                disabled={rendering}
                className="flex-1 rounded-xl border border-[#D8DAE6] bg-white py-2 text-[12.5px] font-medium text-[#2D2E3F] transition hover:bg-[#F5F6FA] disabled:opacity-45"
              >
                {rendering ? 'Rendering…' : 'Re-render'}
              </button>
            </div>
          </aside>
        </div>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
            <div
              ref={playerBox}
              className="dr-cinema-stage relative flex min-h-[220px] min-w-0 flex-1 items-center justify-center overflow-hidden rounded-2xl shadow-[0_8px_28px_rgba(15,17,28,0.12)] [&:fullscreen_img]:h-full [&:fullscreen_img]:w-full [&:fullscreen_img]:object-contain [&:fullscreen_video]:h-full [&:fullscreen_video]:w-full"
            >
              <FullscreenButton target={playerBox} />
              {current?.shot.caption &&
                offset >= (current.shot.caption_start || 0) &&
                offset < (current.shot.caption_end ?? current.shot.duration_seconds) && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-[8%] z-10 flex justify-center px-6">
                    <span className="max-w-[84%] rounded-lg bg-black/70 px-3.5 py-1.5 text-center text-[clamp(13px,2.2vw,22px)] font-bold leading-snug text-white backdrop-blur-sm">
                      {current.shot.caption}
                    </span>
                  </div>
                )}
              {[0, 1].map(
                (slot) =>
                  slotSrc[slot] && (
                    <video
                      key={slot}
                      ref={slotRefs[slot]}
                      src={slotSrc[slot]}
                      preload="auto"
                      playsInline
                      muted={slot !== activeSlot}
                      className={`absolute inset-0 h-full w-full object-contain ${slot === activeSlot && currentVideo ? 'visible' : 'invisible'}`}
                      onTimeUpdate={onSlotTime(slot)}
                      onEnded={() => {
                        if (slot === activeSlot) nextShot();
                      }}
                    />
                  )
              )}
              {!current ? (
                <div className="text-[13px] text-white/60">No shots yet.</div>
              ) : currentVideo ? null : currentFrame ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={currentFrame} alt={current.shot.title} className="max-h-full max-w-full object-contain" />
              ) : (
                <div className="px-6 text-center text-[13px] text-white/70">
                  Shot {current.label} has no image yet. <span className="text-white/45">({current.shot.title})</span>
                </div>
              )}
            </div>
            {current && inspectorOpen && (
              <aside className="w-full flex-none overflow-y-auto lg:w-[320px]">
                <ShotPanel
                  board={board}
                  shot={current.shot}
                  label={current.label}
                  workspaceId={workspaceId}
                  onEdit={onEdit}
                  onRequest={onRequest}
                  onSelect={onSelect}
                  busy={busy}
                  tab={tab}
                  onTab={onTab}
                  onClose={() => setInspectorOpen(false)}
                />
                <p className="mt-2 px-1 text-[11.5px] text-[#8A8B9C]">
                  Starts at {fmtTime(starts[index])} · {current.shot.duration_seconds}s
                </p>
              </aside>
            )}
            {musicSrc && <audio ref={musicRef} src={musicSrc} preload="auto" className="hidden" />}
            {voSrc && <audio ref={voRef} key={voSrc} src={voSrc} preload="auto" className="hidden" />}
          </div>
        </>
      )}

      <div className="rounded-2xl border border-[#EAEAEF] bg-white p-3.5 shadow-[0_1px_2px_rgba(20,20,31,0.025)]">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            {!showFinal && current && (
              <button
                type="button"
                disabled={busy}
                onClick={() => openInspectorTab('add')}
                title={`Add a new shot after shot ${current.label}`}
                className="inline-flex items-center gap-1 rounded-lg border border-[#E5E6F0] bg-[#FAFAFD] px-2.5 py-1 text-[12px] font-medium text-[#3A3B4C] transition hover:border-[#C5C7D8] hover:bg-white hover:text-[#14141F] disabled:opacity-45"
              >
                <Plus size={13} strokeWidth={2.2} aria-hidden="true" />
                <span>Shot</span>
              </button>
            )}
          </div>

          {!showFinal && (
            <div className="flex items-center gap-3">
              <span className="font-mono text-[12.5px] font-semibold tabular-nums text-[#14141F]">{fmtTime(now)}</span>
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                aria-label={playing ? 'Pause' : 'Play'}
                className="grid h-8 w-8 place-items-center rounded-full bg-[#5B45F2] text-white shadow-[0_3px_10px_rgba(91,69,242,0.28)] transition hover:bg-[#4731D8]"
              >
                {playing ? (
                  <Pause size={14} fill="currentColor" aria-hidden="true" />
                ) : (
                  <Play size={14} fill="currentColor" className="ml-0.5" aria-hidden="true" />
                )}
              </button>
              <span className="font-mono text-[12.5px] tabular-nums text-[#8A8B9C]">{fmtTime(total)}</span>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <span className="text-[11.5px] font-medium text-[#8A8B9C]">Zoom</span>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(1, z / 1.5))}
              disabled={zoomLevel <= 1}
              aria-label="Zoom out"
              className="grid h-6 w-6 place-items-center rounded-md text-[#5E5E72] hover:bg-[#F3F4F8] disabled:opacity-35"
            >
              <Minus size={13} />
            </button>
            <input
              type="range"
              min={1}
              max={8}
              step={0.25}
              value={zoomLevel}
              onChange={(e) => setZoomLevel(Number(e.target.value))}
              aria-label="Timeline zoom"
              className="w-24 accent-[#5B45F2]"
            />
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(8, z * 1.5))}
              disabled={zoomLevel >= 8}
              aria-label="Zoom in"
              className="grid h-6 w-6 place-items-center rounded-md text-[#5E5E72] hover:bg-[#F3F4F8] disabled:opacity-35"
            >
              <Plus size={13} />
            </button>
            {zoomLevel > 1 && (
              <button
                type="button"
                onClick={() => setZoomLevel(1)}
                className="rounded-md px-2 py-0.5 text-[11.5px] font-medium text-[#5B45F2] hover:bg-[#F2F0FF]"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        <div ref={trackRef} className="relative overflow-x-auto overflow-y-hidden">
          <div className="relative" style={{ width: span * zoom }}>
            <div className="relative h-5 font-mono text-[10px] text-[#7A7B90]">
              {Array.from({ length: Math.floor(span / tickStep) + 1 }, (_, i) => i * tickStep)
                .filter((t) => t * zoom <= span * zoom - 32 || t === 0)
                .map((t) => (
                  <span
                    key={t}
                    className="absolute bottom-0 border-l border-[#D5D7E3] pl-1 leading-none"
                    style={{ left: t * zoom }}
                  >
                    {fmtTime(t)}
                  </span>
                ))}
            </div>
            {showFinal ? (
              <div className="mt-1.5 flex h-24 overflow-hidden rounded-xl bg-[#11141C]">
                {segments.map((sg) => {
                  const n = labelOf[sg.shot_id];
                  const active = sg === playingSeg;
                  return (
                    <button
                      key={sg.shot_id}
                      type="button"
                      onClick={() => seekFinal(sg)}
                      title={`Shot ${n?.label || ''} · ${n?.shot.title || sg.shot_id}`}
                      className={`relative h-full flex-none overflow-hidden border-r border-black/80 ${
                        active ? 'ring-2 ring-inset ring-[#5B45F2]' : ''
                      }`}
                      style={{ width: sg.duration * zoom }}
                    >
                      {n ? (
                        <Thumb board={board} shot={n.shot} workspaceId={workspaceId} className="h-full w-full" strip />
                      ) : (
                        <div className="h-full w-full bg-white/10" />
                      )}
                      <span
                        className={`absolute left-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                          active ? 'bg-[#5B45F2] text-white' : 'bg-black/70 text-white'
                        }`}
                      >
                        {n?.label || '?'}
                      </span>
                      {sg.source === 'frame' && (
                        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9.5px] text-white/85">
                          still frame
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={track.map((n) => n.shot.id)} strategy={horizontalListSortingStrategy}>
                  <div className="mt-1.5 flex h-24 overflow-hidden rounded-xl bg-[#11141C]">
                    {track.map((n) => (
                      <SortableShot
                        key={n.shot.id}
                        item={n}
                        width={n.shot.duration_seconds * zoom}
                        board={board}
                        workspaceId={workspaceId}
                        active={n.shot.id === current?.shot.id}
                        disabled={busy || !!n.shot.locked}
                        onSelect={() => seek(numbered.findIndex((x) => x.shot.id === n.shot.id))}
                        onDelete={() => deleteShot(n)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
            {!showFinal && (
              <div className="mt-1.5 space-y-1.5">
                <Lane
                  label="VO"
                  color="text-[#4C38D6]"
                  empty={!numbered.some((n) => n.shot.vo_text)}
                  onAdd={() => openInspectorTab('voiceover')}
                >
                  {numbered.map((n, i) =>
                    n.shot.vo_text ? (
                      <VoBlock
                        key={n.shot.id}
                        item={n}
                        shotStart={starts[i]}
                        zoom={zoom}
                        board={board}
                        workspaceId={workspaceId}
                        busy={busy}
                        onEdit={onEdit}
                        onOpen={() => {
                          seek(i);
                          openInspectorTab('voiceover');
                        }}
                      />
                    ) : null
                  )}
                </Lane>
                <Lane
                  label="Music"
                  color="text-[#0D548A]"
                  empty={!board.audio?.music?.prompt}
                  onAdd={() => openInspectorTab('music')}
                >
                  {board.audio?.music?.prompt && (
                    <MusicBlock
                      board={board}
                      workspaceId={workspaceId}
                      zoom={zoom}
                      total={total}
                      busy={busy}
                      onEdit={onEdit}
                      onOpen={() => openInspectorTab('music')}
                    />
                  )}
                </Lane>
                <Lane
                  label="Caption"
                  color="text-[#965507]"
                  empty={!numbered.some((n) => n.shot.caption)}
                  onAdd={() => openInspectorTab('caption')}
                >
                  {numbered.map((n, i) =>
                    n.shot.caption ? (
                      <CaptionBlock
                        key={n.shot.id}
                        item={n}
                        shotStart={starts[i]}
                        zoom={zoom}
                        busy={busy}
                        onEdit={onEdit}
                        onOpen={() => {
                          seek(i);
                          openInspectorTab('caption');
                        }}
                      />
                    ) : null
                  )}
                </Lane>
              </div>
            )}
            <div
              className="pointer-events-none absolute bottom-0 top-0 z-30 w-0.5 bg-[#5B45F2] shadow-[0_0_8px_rgba(91,69,242,0.55)]"
              style={{ left: Math.min(showFinal ? finalTime : now, span) * zoom - 1 }}
            />
          </div>
        </div>
        <p className="mt-2 text-[11.5px] text-[#8A8B9C]">
          {showFinal
            ? 'Click any shot on the track to jump to that part.'
            : 'Drag shots to reorder, or click a VO / Music / Caption block to edit.'}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- workspace

/** Export: render the final video with a resolution, frame rate and container, or download every asset as a ZIP. */
function ExportDialog({ board, rendering, onRender, assetsZipUrl, onClose }) {
  const [choice, setChoice] = useState({ resolution: board.brief.resolution || '720p', fps: 24, format: 'mp4' });
  const set = (patch) => setChoice((value) => ({ ...value, ...patch }));
  const pick = (label, field, options) => (
    <div className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-[#4C4D61]">{label}</span>
      <div className="flex rounded-xl border border-[#ECECF4] bg-[#F4F5F9] p-1">
        {options.map(([value, text]) => (
          <button
            key={value}
            type="button"
            onClick={() => set({ [field]: value })}
            className={`flex-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition ${
              choice[field] === value
                ? 'bg-white text-[#14141F] shadow-sm'
                : 'text-[#5E5E72] hover:text-[#14141F]'
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[#14141F]/45 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Export"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[400px] space-y-4 rounded-2xl border border-[#E6E7F0] bg-white p-6 shadow-[0_24px_64px_rgba(20,20,31,0.18)]"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-[#14141F]">Export video</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-[#7A7B90] transition hover:bg-[#F3F4F8] hover:text-[#14141F]"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        {pick('Resolution', 'resolution', RESOLUTIONS.map((r) => [r, r]))}
        {pick('Frame rate', 'fps', [
          [24, '24 fps'],
          [30, '30 fps'],
          [60, '60 fps'],
        ])}
        {pick('Format', 'format', [
          ['mp4', 'MP4'],
          ['mov', 'MOV'],
        ])}
        <p className="rounded-xl border border-[#EFEFF5] bg-[#F8F8FC] px-3.5 py-2.5 text-[12px] leading-relaxed text-[#5E5E72]">
          Free. Video is combined with VO, music, and captions. Rendering above clip resolution does not add detail; 60 fps duplicates frames because clips are generated at 24 fps.
        </p>
        <div className="space-y-2 pt-1">
          <button
            type="button"
            disabled={rendering}
            onClick={() => {
              onRender(choice);
              onClose();
            }}
            className="w-full rounded-xl bg-[#5B45F2] py-2.5 text-[13.5px] font-semibold text-white shadow-[0_2px_10px_rgba(91,69,242,0.25)] transition hover:bg-[#4731D8] disabled:opacity-45"
          >
            {rendering ? 'Rendering…' : 'Render video'}
          </button>
          <a
            href={assetsZipUrl}
            download
            className="block w-full rounded-xl border border-[#D8DAE6] bg-white py-2.5 text-center text-[12.5px] font-medium text-[#2D2E3F] transition hover:border-[#BFC2D4] hover:bg-[#F5F6FA]"
          >
            Download Assets (ZIP): images, per-shot videos, audio
          </a>
        </div>
      </div>
    </div>
  );
}

export default function Workspace({
  board,
  workspaceId,
  onEdit,
  onRequest,
  onChooseConcept,
  onConfirmScript,
  onChooseAudio,
  busy,
  panel,
  onOpenPanel,
  onClosePanel,
  loadVersions,
  onRestore,
  onRender,
  rendering,
  prices = {},
  assetsZipUrl,
  onCloseBoard,
}) {
  const [exportOpen, setExportOpen] = useState(false);
  const [mode, setMode] = useState('scene');
  const [selectedId, setSelectedId] = useState(null);
  const [shotTab, setShotTab] = useState('media'); // the shot panel's tab, shared by Shot and Timeline
  const { groups, numbered } = useMemo(() => groupShots(board), [board]);
  const selected = numbered.find((n) => n.shot.id === selectedId) || numbered[0] || null;

  const panelDef = panel && PANELS[panel];
  const videoModel = VIDEO_MODELS[board.brief.video_model] || VIDEO_MODELS['seedance-2.5'];
  const openAssets = () => onOpenPanel('assets');
  const ready = (key) => board.media[key]?.status === 'succeeded' && board.media[key]?.asset_id;
  const renderable = numbered.some((n) => ready(`video:${n.shot.id}`) || ready(`frame:${n.shot.id}`));
  // Every shot whose video is missing or outdated, in one request: one estimate to approve in the chat
  // (their missing frames are added by the Director).
  // The same as pressing every scene's button: each scene that is not running and still misses videos.
  const plans = groups.map((g) => videoPlan(board, g.shots.map((item) => item.shot.id))).filter((p) => !p.running && p.keys.length);
  const missing = plans.flatMap((p) => p.missing);
  // VO and music that are set but not made yet ride along; they are generated after the videos.
  const audioTodo = Object.keys(board.media).filter(
    (k) => (k.startsWith('vo:') || k === 'audio:music') && board.media[k].status !== 'running' && (!board.media[k].asset_id || board.media[k].stale)
  );
  const todo = [...plans.flatMap((p) => p.keys), ...(missing.length ? audioTodo : [])];

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F7F8FA]">
      <div className="flex items-center justify-between gap-3 border-b border-[#EAEAEF] bg-white px-4 py-2.5 md:px-5">
        <div className="flex flex-none items-center gap-1 rounded-xl border border-[#ECECF4] bg-[#F4F5F9] p-1">
          {MODES.map(({ id, label, Icon: ModeIcon }) => {
            const active = mode === id && !panelDef;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setMode(id);
                  onClosePanel();
                }}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition ${
                  active
                    ? 'bg-white text-[#14141F] shadow-[0_1px_3px_rgba(20,20,31,0.08)]'
                    : 'text-[#5E5E72] hover:text-[#14141F]'
                }`}
              >
                <ModeIcon size={14} strokeWidth={2} className={active ? 'text-[#5B45F2]' : 'text-[#7A7B90]'} aria-hidden="true" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* Calm right-hand toolbar: 1 Settings popover + clear primary CTA + Close Board */}
        <div className="flex flex-none items-center gap-2">
          <ProjectSettingsPopover
            board={board}
            videoModel={videoModel}
            prices={prices}
            busy={busy}
            onEdit={onEdit}
            onOpenHistory={() => onOpenPanel('history')}
          />

          {todo.length > 0 && (
            <button
              type="button"
              onClick={() => onRequest(todo)}
              disabled={busy}
              title="Generate all remaining videos. Credit estimate appears in chat before starting."
              className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#5B45F2] px-3.5 text-[12.5px] font-semibold text-white shadow-[0_2px_8px_rgba(91,69,242,0.24)] transition hover:bg-[#4731D8] disabled:opacity-45"
            >
              <Play size={11.5} fill="currentColor" aria-hidden="true" />
              <span>Generate all</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setExportOpen(true)}
            disabled={!renderable || rendering || busy}
            title={renderable ? 'Render final video or download all assets (free)' : 'No shots with frames or videos yet'}
            className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 text-[12.5px] font-semibold transition disabled:opacity-45 ${
              todo.length === 0 && renderable
                ? 'bg-[#5B45F2] text-white shadow-[0_2px_8px_rgba(91,69,242,0.24)] hover:bg-[#4731D8]'
                : 'border border-[#D8DAE6] bg-white text-[#14141F] hover:border-[#BFC2D4] hover:bg-[#F5F6FA]'
            }`}
          >
            <Download size={13} strokeWidth={2.2} aria-hidden="true" />
            <span>{rendering ? 'Rendering…' : 'Export'}</span>
          </button>

          {onCloseBoard && (
            <button
              type="button"
              onClick={onCloseBoard}
              title="Close Production Board (return to spacious chat view)"
              aria-label="Close Production Board"
              className="grid h-8 w-8 flex-none place-items-center rounded-lg text-[#6E6F82] transition hover:bg-[#F3F4F8] hover:text-[#14141F]"
            >
              <PanelRightClose size={16} strokeWidth={1.9} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {exportOpen && (
        <ExportDialog
          board={board}
          rendering={rendering}
          onRender={onRender}
          assetsZipUrl={assetsZipUrl}
          onClose={() => setExportOpen(false)}
        />
      )}

      <div className="min-h-0 flex-1 overflow-hidden p-4 md:p-5">
        {panelDef ? (
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-[#EAEAEF] bg-white shadow-[0_2px_10px_rgba(20,20,31,0.03)]">
            <div className="flex items-center justify-between gap-3 border-b border-[#EFEFF5] px-5 py-3.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <button
                  type="button"
                  onClick={onClosePanel}
                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#E6E7F0] bg-[#FAFAFD] px-2.5 text-[12px] font-medium text-[#4C4D61] transition hover:border-[#C7CAD9] hover:bg-white hover:text-[#14141F]"
                >
                  <ArrowLeft size={13} strokeWidth={2} aria-hidden="true" />
                  <span>Board</span>
                </button>
                <div className="truncate text-[15px] font-semibold tracking-[-0.01em] text-[#14141F]">
                  {panel === 'script' && board.script?.title ? board.script.title : panelDef.title}
                </div>
              </div>
              <button
                type="button"
                onClick={onClosePanel}
                aria-label="Close"
                className="grid h-8 w-8 flex-none place-items-center rounded-lg text-[#5E5E72] transition hover:bg-[#F3F4F8] hover:text-[#14141F]"
              >
                <X size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 md:px-8">
              <div className="mx-auto max-w-[900px]">
                <panelDef.View
                  board={board}
                  onEdit={onEdit}
                  onRequest={onRequest}
                  onChooseConcept={onChooseConcept}
                  onConfirmScript={onConfirmScript}
                  onChooseAudio={onChooseAudio}
                  busy={busy}
                  workspaceId={workspaceId}
                  loadVersions={loadVersions}
                  onRestore={onRestore}
                />
              </div>
            </div>
          </div>
        ) : mode === 'shot' ? (
          <ShotMode
            board={board}
            numbered={numbered}
            groups={groups}
            selected={selected}
            onSelect={setSelectedId}
            workspaceId={workspaceId}
            onEdit={onEdit}
            onRequest={onRequest}
            busy={busy}
            onOpenAssets={openAssets}
            tab={shotTab}
            onTab={setShotTab}
          />
        ) : mode === 'scene' ? (
          <SceneMode
            board={board}
            groups={groups}
            numbered={numbered}
            workspaceId={workspaceId}
            onOpenAssets={openAssets}
            onEdit={onEdit}
            onRequest={onRequest}
            busy={busy}
            onPick={(id) => {
              setSelectedId(id);
              setMode('shot');
            }}
          />
        ) : (
          <TimelineMode
            board={board}
            numbered={numbered}
            workspaceId={workspaceId}
            selectedId={selected?.shot.id}
            onSelect={setSelectedId}
            onRender={onRender}
            rendering={rendering || busy}
            onEdit={onEdit}
            onRequest={onRequest}
            busy={busy}
            tab={shotTab}
            onTab={setShotTab}
          />
        )}
      </div>
    </div>
  );
}
